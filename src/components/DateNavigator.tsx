import { useMemo, useState } from 'react';
import { Button, CardRoot, CardContent, Checkbox, Input } from '@heroui/react';
import { filterDays } from '../data/dataset';
import type { DatasetIndex } from '../types';

interface DateNavigatorProps {
  dataset: DatasetIndex;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

export function DateNavigator({ dataset, selectedDate, onSelectDate }: DateNavigatorProps) {
  const [jumpDate, setJumpDate] = useState(selectedDate);
  const [missingOnly, setMissingOnly] = useState(false);
  const filteredDays = useMemo(
    () => filterDays(dataset, { missingFilesOnly: missingOnly }),
    [dataset, missingOnly],
  );
  const selectedIndex = dataset.days.indexOf(selectedDate);

  function move(offset: number) {
    const nextDate = dataset.days[selectedIndex + offset];
    if (nextDate) onSelectDate(nextDate);
  }

  return (
    <CardRoot className="lg:sticky lg:top-[88px] lg:self-start">
      <CardContent className="p-4">
        <h2 className="m-0 text-2xl font-semibold text-foreground leading-tight">日期导航</h2>
        <label className="grid gap-2 mt-4 text-sm font-medium text-muted">
          跳转日期
          <Input
            type="date"
            min={dataset.dateRange.start ?? undefined}
            max={dataset.dateRange.end ?? undefined}
            value={jumpDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setJumpDate(e.target.value)}
          />
        </label>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <Button size="sm" variant="outline" onPress={() => move(-1)} isDisabled={selectedIndex <= 0}>
            上一天
          </Button>
          <Button size="sm" variant="outline" onPress={() => move(1)} isDisabled={selectedIndex >= dataset.days.length - 1}>
            下一天
          </Button>
          <Button size="sm" variant="outline" onPress={() => dataset.days.includes(jumpDate) && onSelectDate(jumpDate)}>
            跳转
          </Button>
        </div>
        <div className="mt-3">
          <Checkbox
            isSelected={missingOnly}
            onChange={setMissingOnly}
          >
            只看缺失文件日期
          </Checkbox>
        </div>
        <div className="grid grid-cols-[repeat(15,1fr)] gap-1 mt-4" aria-label="日期热力图">
          {dataset.days.slice(-90).map((date) => (
            <Button
              key={date}
              isIconOnly
              size="sm"
              variant={date === selectedDate ? 'primary' : 'outline'}
              className="aspect-square min-w-0"
              onPress={() => onSelectDate(date)}
            />
          ))}
        </div>
        <div className="mt-4">
          <h3 className="m-0 text-xs font-medium text-muted uppercase tracking-wide font-mono">匹配结果</h3>
          <div className="flex flex-col gap-1 mt-2">
            {filteredDays.slice(0, 20).map((date) => (
              <Button
                key={date}
                variant="outline"
                size="sm"
                fullWidth
                className="flex justify-between"
                onPress={() => onSelectDate(date)}
              >
                <span className="font-mono text-xs font-medium">{date}</span>
                <span className="font-mono text-xs text-muted">HI {dataset.summariesByDay[date].eventCounts.hi ?? 0}</span>
              </Button>
            ))}
          </div>
          {filteredDays.length > 20 ? <p className="mt-2 text-sm text-muted">还有 {filteredDays.length - 20} 天未显示，请缩小筛选范围。</p> : null}
        </div>
      </CardContent>
    </CardRoot>
  );
}
