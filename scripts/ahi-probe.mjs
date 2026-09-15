// 一次性探针:统计 DATA/DATAFILE 每晚 AI/HI 事件数、使用时长与折算每小时事件数。
// 解析规则与 src/parser 对齐:事件记录 16 字节、value1 为 u32;
// usetime 仅在 value1 > 0 且 8 字节时间戳通过校验时计入使用时长
// (同 dataset.ts 的 buildUseSession);AI/HI 任一文件缺失的夜晚不算
// 总数与 events/h——应用对不完整的事件对同样抑制 AHI。
import fs from "node:fs";
import path from "node:path";

const base = path.join(process.cwd(), "DATA", "DATAFILE");

// 与 src/parser/edfTimestamp.ts 的 parseBinaryTimestamp 一致:
// 8 字节 = u16 年(LE) + 月 + 日 + 1 字节保留 + 时 + 分 + 秒
function parseBinaryTimestamp(raw) {
  if (raw.length !== 8) return null;
  const year = raw.readUInt16LE(0);
  const month = raw[2];
  const day = raw[3];
  const hour = raw[5];
  const minute = raw[6];
  const second = raw[7];
  if (
    year < 1900 ||
    year > 2200 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

const days = fs
  .readdirSync(base)
  .sort()
  .filter((d) => fs.statSync(path.join(base, d)).isDirectory());
const rows = [];

for (const day of days) {
  const dir = path.join(base, day);

  // 文件存在但短于 512 字节头 = 无效文件(应用判为 invalid、不产生
  // 事件计数),这里同样视为缺失而不是 0 事件的完整夜晚。
  // 通道语义以头部 label 为准(应用从 header.label 推断类型),
  // 文件名与头部不符时按缺失处理
  const read = (suffix) => {
    const p = path.join(dir, `${day}_${suffix}.edf`);
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p);
    if (raw.length < 512) return null;
    const label = raw.toString("latin1", 256, 272).trim();
    return label === suffix ? raw.subarray(512) : null;
  };

  const ai = read("ai");
  const hi = read("hi");
  const ut = read("usetime");
  const count16 = (buf) => Math.floor(buf.length / 16);

  let useSec = 0;
  if (ut) {
    for (let o = 0; o + 16 <= ut.length; o += 16) {
      // value1 为 u32(同 src/parser/edfParser.ts 的 getUint32):
      // u16 会把超过 65535 秒的时长截断取模
      const value1 = ut.readUInt32LE(o);
      const timestamp = parseBinaryTimestamp(ut.subarray(o + 8, o + 16));
      if (value1 > 0 && timestamp !== null) useSec += value1;
    }
  }

  const hours = useSec / 3600;
  const aiCount = ai === null ? null : count16(ai);
  const hiCount = hi === null ? null : count16(hi);
  const complete = aiCount !== null && hiCount !== null;
  const total = complete ? aiCount + hiCount : null;

  rows.push({
    day,
    ai: aiCount,
    hi: hiCount,
    total,
    hours: +hours.toFixed(2),
    // 与应用的 MIN_AHI_USE_HOURS 语义一致:满 30 分钟(含)即折算
    perHour: complete && hours >= 0.5 ? +(total / hours).toFixed(1) : null,
  });
}

rows.sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
console.log("day        AI   HI  total  use(h)  events/h");
for (const r of rows.slice(0, 15)) {
  const fmt = (v) => (v === null ? "-" : String(v));
  console.log(
    `${r.day}  ${fmt(r.ai).padStart(3)} ${fmt(r.hi).padStart(4)} ${fmt(r.total).padStart(6)} ${String(r.hours).padStart(7)}  ${r.perHour ?? "-"}`
  );
}

const totals = rows
  .map((r) => r.total)
  // 只排除不完整(无效/缺失)的夜晚:完整但 0 事件的夜晚是合法样本
  .filter((x) => x !== null)
  .sort((a, b) => a - b);
const median = (list) => {
  if (list.length === 0) return "-";
  const mid = Math.floor(list.length / 2);
  // 偶数个样本取中间两值的平均,奇数取正中
  return list.length % 2 === 1
    ? list[mid]
    : +((list[mid - 1] + list[mid]) / 2).toFixed(1);
};
console.log("---");
console.log(
  `complete days with data: ${totals.length}; median total: ${median(totals)}; max total: ${totals.at(-1) ?? "-"}`
);
