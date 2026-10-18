import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProcessLog } from '../src/index.js';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'PROCESS-LOG.sample.md');

function logFile(...entries: string[]): string {
  return ['# PROCESS-LOG.md', '', '## Log', ...entries].join('\n');
}

describe('parseProcessLog on a malformed or tiny file', () => {
  it('returns no events and a warning for an empty file', () => {
    expect(parseProcessLog(' \n')).toEqual({
      value: [],
      warnings: [{ section: 'log', line: 1, message: 'The file is empty' }],
    });
  });

  it('returns no events and a warning when there is no Log section', () => {
    const result = parseProcessLog(
      '# PROCESS-LOG.md\n\n09:30 · TASK · F01.1 · Not under a heading',
    );

    expect(result.value).toEqual([]);
    expect(result.warnings).toEqual([
      { section: 'log', line: 1, message: 'Section "log" not found' },
    ]);
  });

  it('skips an unknown type with a warning and still parses the other lines', () => {
    const result = parseProcessLog(
      logFile(
        '09:00 · START · — · Begin',
        '09:10 · NOTE · F01 · Mystery',
        '09:20 · TASK · F01.1 · Done',
      ),
    );

    expect(result.value.map((event) => event.type)).toEqual(['START', 'TASK']);
    expect(result.warnings).toEqual([
      { section: 'log', line: 5, message: 'Unknown entry type "NOTE"' },
    ]);
  });

  it('warns about a line with too few fields', () => {
    const result = parseProcessLog(logFile('09:00 · TASK · F01.1'));

    expect(result.value).toEqual([]);
    expect(result.warnings.map((warning) => warning.message)).toEqual([
      'Entry needs "HH:MM · TYPE · ID · text"',
    ]);
  });

  it.each(['25:99', '9:05', '09:5', 'noon'])('warns about the bad time "%s"', (time) => {
    const result = parseProcessLog(logFile(`${time} · TASK · F01.1 · Done`));

    expect(result.value).toEqual([]);
    expect(result.warnings.map((warning) => warning.message)).toEqual([
      `"${time}" is not a time like 09:30`,
    ]);
  });

  it('warns about an entry with no text', () => {
    const result = parseProcessLog(logFile('09:00 · TASK · F01.1 ·  · 8a1c263'));

    expect(result.value).toEqual([]);
    expect(result.warnings.map((warning) => warning.message)).toEqual(['Entry has no text']);
  });

  it('warns about a prose line in the Log section and keeps the entries around it', () => {
    const result = parseProcessLog(
      logFile('09:00 · START · — · Begin', 'Some stray note', '', '09:05 · READ · — · Read'),
    );

    expect(result.value).toHaveLength(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.line).toBe(5);
  });

  it('makes no events from a commented-out block inside the Log section', () => {
    const result = parseProcessLog(
      logFile(
        '<!--',
        '09:12 · START · — · Example only',
        '-->',
        '<!-- 09:13 · TASK · F01.1 · Also an example -->',
        '09:30 · TASK · F01.1 · Real',
      ),
    );

    expect(result.warnings).toEqual([]);
    expect(result.value.map((event) => event.text)).toEqual(['Real']);
  });
});

describe('parseProcessLog fields', () => {
  it('reads time, type, id, text and line of an entry', () => {
    const { value } = parseProcessLog(logFile('09:30 · AI-FIX · F01.2 · Replaced an empty catch.'));

    expect(value).toEqual([
      {
        time: '09:30',
        type: 'AI-FIX',
        id: 'F01.2',
        text: 'Replaced an empty catch.',
        sha: null,
        line: 4,
      },
    ]);
  });

  it('reads a short SHA after the last separator and removes it from the text (A25)', () => {
    const { value } = parseProcessLog(logFile('09:30 · TASK · F01.1 · Built it · 8a1c263'));

    expect(value[0]).toMatchObject({ text: 'Built it', sha: '8a1c263' });
  });

  it('keeps a trailing word as text when it is not a hex SHA', () => {
    const { value } = parseProcessLog(
      logFile(
        '09:30 · TASK · F01.1 · Built it · deadbee1x',
        '09:31 · TASK · F01.2 · Fixed · abc12',
      ),
    );

    expect(value.map((event) => event.sha)).toEqual([null, null]);
    expect(value[0]?.text).toBe('Built it · deadbee1x');
  });

  it('keeps a separator inside the text', () => {
    const { value } = parseProcessLog(logFile('09:30 · DECISION · D1 · One · two · three'));

    expect(value[0]?.text).toBe('One · two · three');
  });

  it.each(['—', '–', '-'])('treats the id "%s" as no id', (mark) => {
    const { value } = parseProcessLog(logFile(`09:30 · START · ${mark} · Begin`));

    expect(value[0]?.id).toBeNull();
  });

  it('keeps a range id as written', () => {
    const { value } = parseProcessLog(logFile('09:30 · ASSUME · A1–A10 · Ten of them'));

    expect(value[0]?.id).toBe('A1–A10');
  });

  it('accepts the midnight and last-minute times', () => {
    const { value } = parseProcessLog(
      logFile('00:00 · START · — · Midnight', '23:59 · RETRO · — · Late'),
    );

    expect(value.map((event) => event.time)).toEqual(['00:00', '23:59']);
  });
});

describe('parseProcessLog on a real PROCESS-LOG.md', () => {
  it('parses every entry in the Log section without warnings and ignores the template example', async () => {
    const result = parseProcessLog(await readFile(FIXTURE, 'utf8'));

    expect(result.warnings).toEqual([]);
    expect(result.value).toHaveLength(36);
    expect(result.value.some((event) => event.text.includes('order intake API'))).toBe(false);
  });

  it('counts entries by type like a hand count of the file', async () => {
    const { value } = parseProcessLog(await readFile(FIXTURE, 'utf8'));

    const counts: Record<string, number> = {};
    for (const event of value) counts[event.type] = (counts[event.type] ?? 0) + 1;

    expect(counts).toEqual({
      RULE: 1,
      START: 1,
      READ: 1,
      DECISION: 7,
      ASSUME: 7,
      PLAN: 1,
      TASK: 14,
      REVIEW: 2,
      SHIP: 2,
    });
  });

  it('reads the first entry with no id and keeps the file order', async () => {
    const { value } = parseProcessLog(await readFile(FIXTURE, 'utf8'));

    expect(value[0]).toMatchObject({ time: '00:19', type: 'RULE', id: null });
    expect(value.at(-1)).toMatchObject({ type: 'TASK', id: 'F02.2' });
  });

  it('parses Windows line endings and a byte order mark like plain text', async () => {
    const text = await readFile(FIXTURE, 'utf8');

    const plain = parseProcessLog(text);
    const windows = parseProcessLog(String.fromCharCode(0xfeff) + text.replaceAll('\n', '\r\n'));

    expect(windows).toEqual(plain);
  });
});
