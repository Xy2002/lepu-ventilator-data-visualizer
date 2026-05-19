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

describe('App.css structure', () => {
  it('imports HeroUI styles and Geist font', () => {
    expect(css).toContain('@import "@heroui/styles"');
    expect(css).toContain('@fontsource-variable/geist');
  });

  it('does not contain component-specific CSS classes', () => {
    expect(ruleFor('.raw-browser')).toBe('');
    expect(ruleFor('.app-shell')).toBe('');
    expect(ruleFor('.top-bar')).toBe('');
    expect(ruleFor('.notice')).toBe('');
  });
});
