import {
  readSourceLines,
  splitByHeading,
  unclosedFenceWarnings,
  type SourceLine,
} from './markdown.js';
import { LOG_EVENT_TYPES, type LogEvent, type ParseResult, type ParseWarning } from './snapshot.js';

const LOG_SECTION_TITLE = 'log';
const FIELD_SEPARATOR = ' · ';
const MIN_FIELDS = 4;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TRAILING_SHA = /^(.*) · ([0-9a-f]{7,40})$/;
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

  const events: LogEvent[] = [];
  // A28: fenced lines are examples, not entries.
  const unfencedBody = logSection.body.filter((line) => !line.inFence);
  for (const line of withoutComments(unfencedBody)) {
    if (line.text.trim() === '') continue;
    const entry = parseEntry(line);
    if (typeof entry === 'string') warnings.push(warn(line.number, entry));
    else events.push(entry);
  }
  return { value: events, warnings };
}

function withoutComments(body: readonly SourceLine[]): SourceLine[] {
  let inComment = false;
  return body.filter((line) => {
    const wasInComment = inComment;
    if (line.text.includes('<!--')) inComment = true;
    if (line.text.includes('-->')) inComment = false;
    return !wasInComment && !line.text.includes('<!--');
  });
}

// Returns the event, or the reason the line is not one.
function parseEntry(line: SourceLine): LogEvent | string {
  const fields = line.text.trim().split(FIELD_SEPARATOR);
  if (fields.length < MIN_FIELDS) {
    return 'Entry needs "HH:MM · TYPE · ID · text"';
  }
  const [time = '', typeName = '', idField = '', ...textFields] = fields;
  if (!TIME.test(time)) return `"${time}" is not a time like 09:30`;
  const type = LOG_EVENT_TYPES.find((candidate) => candidate === typeName);
  if (!type) return `Unknown entry type "${typeName}"`;

  const { text, sha } = splitTrailingSha(textFields.join(FIELD_SEPARATOR));
  if (text === '') return 'Entry has no text';
  return { time, type, id: readId(idField), text, sha, line: line.number };
}

function splitTrailingSha(text: string): { text: string; sha: string | null } {
  const match = TRAILING_SHA.exec(text);
  return match ? { text: match[1] ?? '', sha: match[2] ?? null } : { text, sha: null };
}

function readId(idField: string): string | null {
  const id = idField.trim();
  return id === '' || NO_ID_MARKS.has(id) ? null : id;
}

function warn(line: number, message: string): ParseWarning {
  return { section: 'log', line, message };
}
