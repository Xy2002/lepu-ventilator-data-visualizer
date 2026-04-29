from pathlib import Path
import unittest

from read_ventilator_data import read_file


ROOT = Path(__file__).resolve().parent


class VentilatorReaderTests(unittest.TestCase):
    def test_reads_waveform_header_and_payload(self):
        flow = read_file(ROOT / "DATAFILE/20260429/20260429_flow.edf")
        pressure = read_file(ROOT / "DATAFILE/20260429/20260429_pressure.edf")

        self.assertEqual(flow.header.label, "flow")
        self.assertEqual(flow.header.header_bytes, 512)
        self.assertEqual(flow.header.sample_rate_hz, 80)
        self.assertEqual(flow.kind, "waveform_u8")
        self.assertEqual(len(flow.values), 283224)
        self.assertEqual(flow.values[:8], [20, 20, 20, 20, 19, 17, 15, 10])

        self.assertEqual(pressure.header.label, "pressure")
        self.assertEqual(pressure.kind, "waveform_u16le")
        self.assertEqual(len(pressure.values), 283224)
        self.assertEqual(pressure.values[:8], [1, 1, 1, 1, 1, 1, 1, 1])

    def test_reads_event_records(self):
        hi = read_file(ROOT / "DATAFILE/20260429/20260429_hi.edf")

        self.assertEqual(hi.header.label, "hi")
        self.assertEqual(hi.kind, "events16")
        self.assertEqual(len(hi.records), 8)
        self.assertEqual(hi.records[0]["value1"], 1)
        self.assertEqual(hi.records[0]["value2"], 15)
        self.assertEqual(hi.records[0]["timestamp"], "2026-04-29 03:04:41.22")

    def test_reads_mvtvbr_triples(self):
        mvtvbr = read_file(ROOT / "DATAFILE/20260429/20260429_mvtvbr.edf")

        self.assertEqual(mvtvbr.kind, "triples_u16le")
        self.assertEqual(mvtvbr.records[:4], [(0, 0, 0), (70, 7, 172), (342, 8, 861), (468, 14, 1322)])


if __name__ == "__main__":
    unittest.main()
