// 一次性探针:统计 DATA/DATAFILE 每晚 AI/HI 事件数、使用时长与折算每小时事件数
import fs from "node:fs";
import path from "node:path";

const base = path.join(process.cwd(), "DATA", "DATAFILE");
const days = fs.readdirSync(base).sort();
const rows = [];

for (const day of days) {
  const dir = path.join(base, day);
  if (!fs.statSync(dir).isDirectory()) continue;

  const read = (suffix) => {
    const p = path.join(dir, `${day}_${suffix}.edf`);
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p).subarray(512);
  };

  const ai = read("ai");
  const hi = read("hi");
  const ut = read("usetime");
  const cnt = (buf) => (buf ? Math.floor(buf.length / 16) : 0);

  let useSec = 0;
  if (ut) {
    for (let o = 0; o + 16 <= ut.length; o += 16) {
      const v1 = ut.readUInt32LE(o);
      const ts = ut.subarray(o + 8, o + 16);
      if (v1 > 0 && ts.some((x) => x !== 0)) useSec += v1;
    }
  }

  const hours = useSec / 3600;
  const total = cnt(ai) + cnt(hi);
  rows.push({
    day,
    ai: cnt(ai),
    hi: cnt(hi),
    total,
    hours: +hours.toFixed(2),
    perHour: hours > 0.5 ? +(total / hours).toFixed(1) : null,
  });
}

rows.sort((a, b) => b.total - a.total);
console.log("day        AI   HI  total  use(h)  events/h");
for (const r of rows.slice(0, 15)) {
  console.log(
    `${r.day}  ${String(r.ai).padStart(3)} ${String(r.hi).padStart(4)} ${String(r.total).padStart(6)} ${String(r.hours).padStart(7)}  ${r.perHour ?? "-"}`
  );
}

const totals = rows
  .map((r) => r.total)
  .filter((x) => x > 0)
  .sort((a, b) => a - b);
console.log("---");
console.log(
  `days with data: ${totals.length}; median total: ${totals[Math.floor(totals.length / 2)]}; max total: ${totals.at(-1)}`
);
