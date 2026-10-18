import type { ParseWarning } from './snapshot.js';

export interface SourceLine {
  readonly text: string;
  readonly number: number;
  readonly inFence: boolean;
}

export interface HeadingSection {
  readonly title: string;
  readonly number: number;
  readonly body: readonly SourceLine[];
}

export interface TableRow {
  readonly cells: readonly string[];
  readonly number: number;
}

const BYTE_ORDER_MARK = new RegExp(`^${String.fromCharCode(0xfeff)}`);
const FENCE_LINE = /^\s*(`{3,}|~{3,})(.*)$/;
const LINE_BREAK = /\r?\n/;
const TABLE_SEPARATOR_CELL = /^:?-+:?$/;

interface OpenFence {
  readonly marker: string;
  readonly line: number;
}

// A27: CommonMark fences. The closer repeats the opener's character, at least as long, with nothing after it.
export function readSourceLines(text: string): {
  lines: SourceLine[];
  unclosedFenceLine: number | null;
} {
  const lines: SourceLine[] = [];
  let openFence: OpenFence | undefined;
  const lineTexts = text.replace(BYTE_ORDER_MARK, '').split(LINE_BREAK);
  for (const [index, lineText] of lineTexts.entries()) {
    const number = index + 1;
    const fence = FENCE_LINE.exec(lineText);
    const marker = fence?.[1];
    const info = fence?.[2] ?? '';
    let inFence = openFence !== undefined;
    if (marker !== undefined && openFence === undefined && opensFence(marker, info)) {
      openFence = { marker, line: number };
      inFence = true;
    } else if (
      marker !== undefined &&
      openFence !== undefined &&
      closesFence(openFence.marker, marker, info)
    ) {
      openFence = undefined;
    }
    lines.push({ text: lineText, number, inFence });
  }
  return { lines, unclosedFenceLine: openFence?.line ?? null };
}

export function unclosedFenceWarnings(section: string, line: number | null): ParseWarning[] {
  return line === null ? [] : [{ section, line, message: 'Code fence is never closed' }];
}

function opensFence(marker: string, info: string): boolean {
  return marker.startsWith('~') || !info.includes('`');
}

function closesFence(openingMarker: string, marker: string, trailingText: string): boolean {
  const isSameKind = marker.startsWith(openingMarker.charAt(0));
  return isSameKind && marker.length >= openingMarker.length && trailingText.trim() === '';
}

export function splitByHeading(
  lines: readonly SourceLine[],
  level: number,
): { preamble: SourceLine[]; sections: HeadingSection[] } {
  const headingPrefix = `${'#'.repeat(level)} `;
  const preamble: SourceLine[] = [];
  const sections: { title: string; number: number; body: SourceLine[] }[] = [];
  for (const line of lines) {
    const isHeading = !line.inFence && line.text.startsWith(headingPrefix);
    if (isHeading) {
      sections.push({
        title: line.text.slice(headingPrefix.length).trim(),
        number: line.number,
        body: [],
      });
    } else {
      (sections.at(-1)?.body ?? preamble).push(line);
    }
  }
  return { preamble, sections };
}

export interface TableRead {
  readonly rows: readonly TableRow[];
  readonly missingSeparatorLine: number | null;
  readonly ignoredTableLines: readonly number[];
}

// A32: only the first block of consecutive pipe lines is read. Later blocks are reported, not read.
export function readTableRows(body: readonly SourceLine[]): TableRead {
  const [firstTable = [], ...laterTables] = groupConsecutiveLines(
    body.filter((line) => !line.inFence && line.text.trim().startsWith('|')),
  );
  const ignoredTableLines = laterTables.flatMap((table) =>
    table.slice(0, 1).map((line) => line.number),
  );
  const rows = firstTable.map((line) => ({
    cells: splitTableCells(line.text),
    number: line.number,
  }));
  const separatorIndex = rows.findIndex((row) =>
    row.cells.every((cell) => TABLE_SEPARATOR_CELL.test(cell)),
  );
  if (separatorIndex === -1) {
    return { rows: [], missingSeparatorLine: firstTable[0]?.number ?? null, ignoredTableLines };
  }
  return { rows: rows.slice(separatorIndex + 1), missingSeparatorLine: null, ignoredTableLines };
}

function groupConsecutiveLines(lines: readonly SourceLine[]): SourceLine[][] {
  const groups: SourceLine[][] = [];
  for (const line of lines) {
    const currentGroup = groups.at(-1);
    const previousLine = currentGroup?.at(-1);
    if (currentGroup && previousLine && line.number === previousLine.number + 1) {
      currentGroup.push(line);
    } else {
      groups.push([line]);
    }
  }
  return groups;
}

// A31: a pipe splits cells unless it is written as `\|`, which stays in the cell as a plain pipe.
function splitTableCells(lineText: string): string[] {
  const text = lineText.trim();
  const cells: string[] = [];
  let cell = '';
  let endedOnDelimiter = false;
  for (let index = 0; index < text.length; index++) {
    const character = text.charAt(index);
    endedOnDelimiter = false;
    if (character === '\\' && text.charAt(index + 1) === '|') {
      cell += '|';
      index++;
    } else if (character === '|') {
      cells.push(cell);
      cell = '';
      endedOnDelimiter = true;
    } else {
      cell += character;
    }
  }
  if (!endedOnDelimiter) cells.push(cell);
  return cells.slice(1).map((value) => value.trim());
}
