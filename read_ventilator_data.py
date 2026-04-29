#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass
from pathlib import Path
import struct
from typing import Any


HEADER_BYTES = 512
WAVEFORM_SAMPLE_RATES = {"flow", "pressure", "real_pres", "real_flow"}
EVENT16_LABELS = {"ai", "hi", "ascp", "usetime"}


def _clean_ascii(raw: bytes) -> str:
    return raw.decode("ascii", errors="replace").strip()


def _parse_int(text: str) -> int | None:
    if not text:
        return None
    try:
        return int(text)
    except ValueError:
        return None


def _parse_timestamp(raw: bytes) -> str | None:
    if len(raw) != 8:
        return None

    year = struct.unpack("<H", raw[:2])[0]
    month, day, hour, minute, second, centisecond = raw[2:]
    if not (1900 <= year <= 2200 and 1 <= month <= 12 and 1 <= day <= 31):
        return None
    return f"{year:04d}-{month:02d}-{day:02d} {hour:02d}:{minute:02d}:{second:02d}.{centisecond:02d}"


def _unpack_values(payload: bytes, fmt: str) -> list[int]:
    size = struct.calcsize(fmt)
    usable = len(payload) - (len(payload) % size)
    return [item[0] for item in struct.iter_unpack(fmt, payload[:usable])]


def _unpack_events16(payload: bytes) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for offset in range(0, len(payload) - (len(payload) % 16), 16):
        record = payload[offset : offset + 16]
        value1, value2 = struct.unpack("<II", record[:8])
        records.append(
            {
                "value1": value1,
                "value2": value2,
                "timestamp": _parse_timestamp(record[8:16]),
            }
        )
    return records


def _unpack_triples(payload: bytes) -> list[tuple[int, int, int]]:
    return [
        item
        for item in struct.iter_unpack("<HHH", payload[: len(payload) - (len(payload) % 6)])
    ]


@dataclass(frozen=True)
class Header:
    version: str
    patient_id: str
    recording_id: str
    start_time: str | None
    end_time: str | None
    header_bytes: int
    firmware: str
    field236: str
    field244: str
    signal_count: int | None
    label: str
    physical_dimension: str
    physical_min: str
    physical_max: str
    digital_min: str
    digital_max: str
    samples_per_record: int | None

    @property
    def sample_rate_hz(self) -> int | None:
        value = _parse_int(self.field244)
        if self.label in WAVEFORM_SAMPLE_RATES and value:
            return value
        return None


@dataclass(frozen=True)
class VentilatorFile:
    path: Path
    header: Header
    kind: str
    payload_bytes: int
    values: list[int]
    records: list[Any]
    raw_payload: bytes


def parse_header(raw: bytes) -> Header:
    if len(raw) < HEADER_BYTES:
        raise ValueError(f"file is too short for a {HEADER_BYTES}-byte header")

    header_bytes = _parse_int(_clean_ascii(raw[184:192]))
    if header_bytes is None:
        header_bytes = HEADER_BYTES

    return Header(
        version=_clean_ascii(raw[0:8]),
        patient_id=_clean_ascii(raw[8:88]),
        recording_id=_clean_ascii(raw[88:168]),
        start_time=_parse_timestamp(raw[168:176]),
        end_time=_parse_timestamp(raw[176:184]),
        header_bytes=header_bytes,
        firmware=_clean_ascii(raw[192:236]),
        field236=_clean_ascii(raw[236:244]),
        field244=_clean_ascii(raw[244:252]),
        signal_count=_parse_int(_clean_ascii(raw[252:256])),
        label=_clean_ascii(raw[256:272]),
        physical_dimension=_clean_ascii(raw[352:360]),
        physical_min=_clean_ascii(raw[360:368]),
        physical_max=_clean_ascii(raw[368:376]),
        digital_min=_clean_ascii(raw[376:384]),
        digital_max=_clean_ascii(raw[384:392]),
        samples_per_record=_parse_int(_clean_ascii(raw[472:480])),
    )


def read_file(path: str | Path) -> VentilatorFile:
    path = Path(path)
    raw = path.read_bytes()
    header = parse_header(raw[:HEADER_BYTES])
    payload = raw[header.header_bytes :]
    label = header.label

    if label == "flow" or label == "difleak":
        kind = "waveform_u8"
        values = list(payload)
        records: list[Any] = []
    elif label in {"pressure", "real_pres"}:
        kind = "waveform_u16le"
        values = _unpack_values(payload, "<H")
        records = []
    elif label == "real_flow":
        kind = "waveform_i16le"
        values = _unpack_values(payload, "<h")
        records = []
    elif label == "mvtvbr":
        kind = "triples_u16le"
        values = []
        records = _unpack_triples(payload)
    elif label in EVENT16_LABELS:
        kind = "events16"
        values = []
        records = _unpack_events16(payload)
    elif label == "config":
        kind = "raw_config"
        values = []
        records = []
    else:
        kind = "raw"
        values = []
        records = []

    return VentilatorFile(
        path=path,
        header=header,
        kind=kind,
        payload_bytes=len(payload),
        values=values,
        records=records,
        raw_payload=payload,
    )


def iter_files(target: Path) -> list[Path]:
    if target.is_file():
        return [target]
    return sorted(p for p in target.rglob("*.edf") if p.is_file())


def summarize_file(item: VentilatorFile) -> str:
    header = item.header
    if item.values:
        preview = item.values[:8]
        count = len(item.values)
    elif item.records:
        preview = item.records[:3]
        count = len(item.records)
    else:
        preview = item.raw_payload[:16].hex(" ")
        count = item.payload_bytes

    sample_rate = f", sample_rate={header.sample_rate_hz}Hz" if header.sample_rate_hz else ""
    return (
        f"{item.path}: label={header.label!r}, kind={item.kind}, "
        f"start={header.start_time}, end={header.end_time}{sample_rate}, "
        f"payload={item.payload_bytes} bytes, count={count}, first={preview}"
    )


def export_csv(item: VentilatorFile, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    out = output_dir / f"{item.path.stem}.csv"
    rate = item.header.sample_rate_hz

    with out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        if item.values:
            if rate:
                writer.writerow(["index", "seconds", "value"])
                for index, value in enumerate(item.values):
                    writer.writerow([index, f"{index / rate:.6f}", value])
            else:
                writer.writerow(["index", "value"])
                for index, value in enumerate(item.values):
                    writer.writerow([index, value])
        elif item.kind == "triples_u16le":
            writer.writerow(["index", "value1", "value2", "value3"])
            for index, (value1, value2, value3) in enumerate(item.records):
                writer.writerow([index, value1, value2, value3])
        elif item.kind == "events16":
            writer.writerow(["index", "value1", "value2", "timestamp"])
            for index, record in enumerate(item.records):
                writer.writerow([index, record["value1"], record["value2"], record["timestamp"]])
        else:
            writer.writerow(["payload_hex"])
            writer.writerow([item.raw_payload.hex(" ")])

    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Read the ventilator vendor EDF-like files in DATAFILE.")
    parser.add_argument("target", nargs="?", default="DATAFILE", help="EDF file or directory to read")
    parser.add_argument("--csv", type=Path, help="directory to export decoded CSV files")
    args = parser.parse_args()

    for path in iter_files(Path(args.target)):
        item = read_file(path)
        print(summarize_file(item))
        if args.csv:
            print(f"  wrote {export_csv(item, args.csv)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
