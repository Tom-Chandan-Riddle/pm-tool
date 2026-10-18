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
const FENCE_MARKER = /^\s*(```|~~~)/;
const TABLE_SEPARATOR_CELL = /^:?-+:?$/;

export function readSourceLines(text: string): SourceLine[] {
  let inFence = false;
  return text
    .replace(BYTE_ORDER_MARK, '')
    .split(/\r?\n/)
    .map((lineText, index) => {
      const isFenceMarker = FENCE_MARKER.test(lineText);
      if (isFenceMarker) inFence = !inFence;
      return { text: lineText, number: index + 1, inFence: inFence || isFenceMarker };
    });
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

export function readTableRows(body: readonly SourceLine[]): TableRow[] {
  const rows = body
    .filter((line) => !line.inFence && line.text.trim().startsWith('|'))
    .map((line) => ({ cells: splitTableCells(line.text), number: line.number }));
  const separatorIndex = rows.findIndex((row) =>
    row.cells.every((cell) => TABLE_SEPARATOR_CELL.test(cell)),
  );
  return separatorIndex === -1 ? [] : rows.slice(separatorIndex + 1);
}

function splitTableCells(lineText: string): string[] {
  const inner = lineText.trim().replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map((cell) => cell.trim());
}
