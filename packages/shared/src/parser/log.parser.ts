import {
  readSourceLines,
  splitByHeading,
  unclosedFenceWarnings,
  type SourceLine,
} from './markdown.js';
import { LOG_EVENT_TYPES, type LogEvent, type ParseResult, type ParseWarning } from './snapshot.js';

const LOG_SECTION_TITLE = 'log';
const COMMENT_OPEN = '<!--';
const COMMENT_CLOSE = '-->';
// A30: a middle dot with any whitespace around it. The first three fields are short, the rest is the text.
const ENTRY_FIELDS = /^(.*?)\s+·\s+(.*?)\s+·\s+(.*?)\s+·\s+(.*)$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TRAILING_SHA = /^(?:(.*?)\s+)?·\s+([0-9a-f]{7,40})$/;
const NO_ID_MARKS = new Set(['—', '–', '-']);

export function parseProcessLog(text: string): ParseResult<LogEvent[]> {
  if (text.trim() === '') {
    return { value: [], warnings: [warn(1, 'The file is empty')] };
  }
  const { lines, unclosedFenceLine } = readSourceLines(text);
  const warnings: ParseWarning[] = unclosedFenceWarnings('log', unclosedFenceLine);
  const { sections } = splitByHeading(lines, 2);
  const logSection = sections.find((section) => section.title.toLowerCase() === LOG_SECTION_TITLE);
  if (!logSection) {
    return { value: [], warnings: [...warnings, warn(1, 'Section "log" not found')] };
  }

  // A28: fenced lines are examples, not entries.
  const unfencedBody = logSection.body.filter((line) => !line.inFence);
  const { lines: entryLines, unclosedCommentLine } = removeComments(unfencedBody);
  if (unclosedCommentLine !== null) {
    warnings.push(warn(unclosedCommentLine, 'HTML comment is never closed'));
  }

  const events: LogEvent[] = [];
  for (const line of entryLines) {
    if (line.text.trim() === '') continue;
    const entry = parseEntry(line);
    if (typeof entry === 'string') warnings.push(warn(line.number, entry));
    else events.push(entry);
  }
  return { value: events, warnings };
}

// A29: only the commented span goes. An unclosed comment hides everything after it.
function removeComments(body: readonly SourceLine[]): {
  lines: SourceLine[];
  unclosedCommentLine: number | null;
} {
  const lines: SourceLine[] = [];
  let openedAtLine: number | null = null;
  for (const line of body) {
    let remaining = line.text;
    let kept = '';
    while (remaining !== '') {
      if (openedAtLine === null) {
        const openIndex = remaining.indexOf(COMMENT_OPEN);
        if (openIndex === -1) {
          kept += remaining;
          break;
        }
        kept += remaining.slice(0, openIndex);
        remaining = remaining.slice(openIndex + COMMENT_OPEN.length);
        openedAtLine = line.number;
      } else {
        const closeIndex = remaining.indexOf(COMMENT_CLOSE);
        if (closeIndex === -1) break;
        remaining = remaining.slice(closeIndex + COMMENT_CLOSE.length);
        openedAtLine = null;
      }
    }
    lines.push({ ...line, text: kept });
  }
  return { lines, unclosedCommentLine: openedAtLine };
}

// Returns the event, or the reason the line is not one.
function parseEntry(line: SourceLine): LogEvent | string {
  const fields = ENTRY_FIELDS.exec(line.text.trim());
  if (!fields) return 'Entry needs "HH:MM · TYPE · ID · text"';

  const [, time = '', typeName = '', idField = '', rawText = ''] = fields;
  if (!TIME.test(time)) return `"${time}" is not a time like 09:30`;
  const type = LOG_EVENT_TYPES.find((candidate) => candidate === typeName);
  if (!type) return `Unknown entry type "${typeName}"`;

  const { text, sha } = splitTrailingSha(rawText);
  if (text === '') return 'Entry has no text';
  return { time, type, id: readId(idField), text, sha, line: line.number };
}

function splitTrailingSha(text: string): { text: string; sha: string | null } {
  const match = TRAILING_SHA.exec(text);
  return match ? { text: match[1] ?? '', sha: match[2] ?? null } : { text, sha: null };
}

function readId(idField: string): string | null {
  return NO_ID_MARKS.has(idField) ? null : idField;
}

function warn(line: number, message: string): ParseWarning {
  return { section: 'log', line, message };
}
