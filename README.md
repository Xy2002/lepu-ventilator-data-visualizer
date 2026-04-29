# 呼吸机数据可视化

一个浏览器本地解析的呼吸机 EDF-like 数据可视化工具。原始数据不会上传到服务器。

## 开发

```bash
npm install
npm run dev
```

打开 Vite 输出的本地地址。

## 使用

1. 点击“选择 DATAFILE 文件夹”。
2. 选择包含 `20260427`、`20260428` 这类日期目录的 `DATAFILE`。
3. 用日期导航选择日期。
4. 查看摘要、波形、事件表和原始文件解析。
5. 对单个波形或事件文件导出 CSV。

如果浏览器不支持文件夹选择，可以使用“选择 EDF 文件”批量选择文件。

## 数据说明

这些 `.edf` 文件不是标准 EDF。应用按 512 字节 header 加厂商 payload 的格式解析。

已支持：

- `flow`: unsigned 8-bit waveform
- `pressure`: little-endian unsigned 16-bit waveform
- `real_pres`: little-endian unsigned 16-bit waveform
- `real_flow`: little-endian signed 16-bit waveform
- `ai`, `hi`, `ascp`, `usetime`: 16-byte event records
- `mvtvbr`: three unsigned 16-bit values per record
- `config`: raw payload preview
- `difleak`: unsigned 8-bit sequence
