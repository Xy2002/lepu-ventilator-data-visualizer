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

describe('RawFileBrowser layout CSS', () => {
  it('raw-browser scrolls internally with a constrained height', () => {
    expect(ruleFor('.raw-browser')).toContain('display: flex');
    expect(ruleFor('.raw-browser')).toContain('flex-direction: column');
    expect(ruleFor('.raw-browser')).toContain('height: clamp(');
    expect(ruleFor('.raw-file-list')).toContain('flex: 1');
    expect(ruleFor('.raw-file-list')).toContain('overflow: auto');
  });
});
