/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/App.css'), 'utf8');

function ruleFor(selector: string) {
  const declarations: string[] = [];
  const rulePattern = /(?<selectors>[^{}]+)\{(?<body>[^}]+)\}/gm;
  let match: RegExpExecArray | null;

  while ((match = rulePattern.exec(css))) {
    const selectors =
      match.groups?.selectors
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean) ?? [];

    if (selectors.includes(selector) && match.groups?.body) {
      declarations.push(match.groups.body);
    }
  }

  return declarations.join('\n');
}

describe('EventTable layout CSS', () => {
  it('keeps the event and raw-file panels aligned while their contents scroll internally', () => {
    expect(ruleFor('.event-table')).toContain('display: flex');
    expect(ruleFor('.event-table')).toContain('flex-direction: column');
    expect(ruleFor('.event-table')).toContain('height: clamp(');
    expect(ruleFor('.raw-browser')).toContain('display: flex');
    expect(ruleFor('.raw-browser')).toContain('flex-direction: column');
    expect(ruleFor('.raw-browser')).toContain('height: clamp(');
    expect(ruleFor('.table-scroll')).toContain('flex: 1');
    expect(ruleFor('.table-scroll')).toContain('overflow: auto');
    expect(ruleFor('.raw-file-list')).toContain('flex: 1');
    expect(ruleFor('.raw-file-list')).toContain('overflow: auto');
    expect(css).not.toMatch(/\.event-table\s+\.table-scroll\s*\{[\s\S]*?max-height:\s*none/);
  });
});
