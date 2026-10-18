import { describe, expect, it } from 'vitest';
import { readSourceLines } from '../src/parser/markdown.js';

function fencedFlags(...lines: string[]): boolean[] {
  return readSourceLines(lines.join('\n')).lines.map((line) => line.inFence);
}

describe('readSourceLines fences', () => {
  it('marks the opener, the inner lines and the closer as fenced', () => {
    expect(fencedFlags('before', '```', 'inside', '```', 'after')).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
  });

  it('keeps a four-backtick fence open over a three-backtick line', () => {
    expect(fencedFlags('````', '```', 'still inside', '````', 'after')).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it('keeps a tilde fence open over a backtick fence line and the reverse', () => {
    expect(fencedFlags('~~~', '```', 'inside', '~~~', 'after')).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(fencedFlags('```', '~~~', 'inside', '```', 'after')).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it('does not close on a shorter fence but closes on a longer one', () => {
    expect(fencedFlags('````', '```', '`````', 'after')).toEqual([true, true, true, false]);
  });

  it('does not close on a fence line that has text after it', () => {
    expect(fencedFlags('```', '```js', 'inside', '```', 'after')).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it('allows spaces after the closing fence and indentation before it', () => {
    expect(fencedFlags('```', 'inside', '  ```  ', 'after')).toEqual([true, true, true, false]);
  });

  it('treats a backtick line whose info string has a backtick as inline code, not a fence', () => {
    expect(fencedFlags('```not `a` fence', 'plain')).toEqual([false, false]);
  });

  it('reports the line where an unclosed fence opened', () => {
    const { lines, unclosedFenceLine } = readSourceLines('text\n```\ncode\nmore code');

    expect(unclosedFenceLine).toBe(2);
    expect(lines.map((line) => line.inFence)).toEqual([false, true, true, true]);
  });

  it('reports no unclosed fence when every fence is closed', () => {
    expect(readSourceLines('```\ncode\n```').unclosedFenceLine).toBeNull();
  });
});
