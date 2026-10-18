import {
  readSourceLines,
  readTableRows,
  splitByHeading,
  unclosedFenceWarnings,
  type HeadingSection,
  type SourceLine,
  type TableRow,
} from './markdown.js';
import {
  FEATURE_STATUSES,
  type Assumption,
  type ChangeLogEntry,
  type Criterion,
  type Decision,
  type Feature,
  type FeaturesDocument,
  type FeatureStatus,
  type Header,
  type ParseResult,
  type ParseWarning,
  type Task,
} from './snapshot.js';

const FIELD_SEPARATOR = ' · ';
const FEATURE_HEADING = /^(F\d+)\s+(.+)$/;
const TASK_TEXT = /^(F\d+\.\d+):?\s+(.+)$/;
const CHECKBOX_ITEM = /^- \[([ xX])\]\s+(.+)$/;
const ESTIMATE = /^(\d+)(?:\s*min)?$/i;
const STRUCK_THROUGH = /^~~(.+)~~$/;
const STRUCK_SPAN = /~~[^~]+~~/;
const SUPERSEDED_BY = /superseded by (F\d+)/i;
const CHANGE_MARKER = /^(CR|Fix):\s*/i;
const AMENDS = /\s*\(?\s*\bamends\s+(F\d+)\s*\)?\s*$/i;
const FIX_TASK = /^fix:/i;
const CHANGE_REQUEST_TASK = /\(CR\)\s*$/i;
const DEFAULT_STATUS: FeatureStatus = 'Todo';

type SectionName =
  'file' | 'header' | 'outline' | 'assumptions' | 'decisions' | 'features' | 'changeLog';

const SECTION_TITLES = {
  outline: 'solution outline',
  assumptions: 'assumptions',
  decisions: 'decisions',
  features: 'features',
  changeLog: 'change log',
} as const;

export function parseFeaturesFile(text: string): ParseResult<FeaturesDocument> {
  if (text.trim() === '') {
    const emptyDocument: FeaturesDocument = {
      header: { baseCommit: '', repoState: '', model: '' },
      outline: '',
      assumptions: [],
      decisions: [],
      features: [],
      changeLog: [],
    };
    return { value: emptyDocument, warnings: [warn('file', 1, 'The file is empty')] };
  }

  const { lines, unclosedFenceLine } = readSourceLines(text);
  const { preamble, sections } = splitByHeading(lines, 2);
  const header = parseHeader(preamble);
  const outline = parseSection(sections, 'outline', parseOutline, '');
  const assumptions = parseSection(sections, 'assumptions', parseAssumptions, []);
  const decisions = parseSection(sections, 'decisions', parseDecisions, []);
  const features = parseSection(sections, 'features', parseFeatures, []);
  const changeLog = parseSection(sections, 'changeLog', parseChangeLog, []);

  return {
    value: {
      header: header.value,
      outline: outline.value,
      assumptions: assumptions.value,
      decisions: decisions.value,
      features: features.value,
      changeLog: changeLog.value,
    },
    warnings: [
      ...unclosedFenceWarnings('file', unclosedFenceLine),
      ...[header, outline, assumptions, decisions, features, changeLog].flatMap(
        (result) => result.warnings,
      ),
    ],
  };
}

function parseSection<Value>(
  sections: readonly HeadingSection[],
  name: keyof typeof SECTION_TITLES,
  parse: (body: readonly SourceLine[]) => ParseResult<Value>,
  valueWhenMissing: Value,
): ParseResult<Value> {
  const section = sections.find(
    (candidate) => candidate.title.toLowerCase() === SECTION_TITLES[name],
  );
  if (!section) {
    return {
      value: valueWhenMissing,
      warnings: [warn(name, 1, `Section "${SECTION_TITLES[name]}" not found`)],
    };
  }
  return parse(section.body);
}

function parseHeader(preamble: readonly SourceLine[]): ParseResult<Header> {
  const headerLine = preamble.find((line) => line.text.startsWith('Base commit:'));
  if (!headerLine) {
    const missing = warn('header', 1, 'Header line "Base commit: ... · Repo state: ..." not found');
    return { value: { baseCommit: '', repoState: '', model: '' }, warnings: [missing] };
  }
  const warnings: ParseWarning[] = [];
  const fields = readLabelledParts(headerLine.text);
  const value = {
    baseCommit: requireField(fields, 'Base commit', 'header', headerLine.number, warnings),
    repoState: requireField(fields, 'Repo state', 'header', headerLine.number, warnings),
    model: fields.get('Model') ?? '',
  };
  return { value, warnings };
}

function parseOutline(body: readonly SourceLine[]): ParseResult<string> {
  return {
    value: body
      .map((line) => line.text)
      .join('\n')
      .trim(),
    warnings: [],
  };
}

function parseAssumptions(body: readonly SourceLine[]): ParseResult<Assumption[]> {
  return parseTable(body, 'assumptions', 4, ([id = '', text = '', reason = '', approved = '']) => {
    const struckId = STRUCK_THROUGH.exec(id);
    return { id: struckId?.[1] ?? id, text, reason, approved, superseded: struckId !== null };
  });
}

function parseDecisions(body: readonly SourceLine[]): ParseResult<Decision[]> {
  return parseTable(
    body,
    'decisions',
    4,
    ([id = '', text = '', alternatives = '', reason = '']) => ({
      id,
      text,
      alternatives,
      reason,
    }),
  );
}

function parseChangeLog(body: readonly SourceLine[]): ParseResult<ChangeLogEntry[]> {
  return parseTable(body, 'changeLog', 3, ([time = '', change = '', source = '']) => ({
    time,
    change,
    source,
  }));
}

function parseTable<Row>(
  body: readonly SourceLine[],
  section: SectionName,
  columnCount: number,
  toRow: (cells: readonly string[]) => Row,
): ParseResult<Row[]> {
  const warnings: ParseWarning[] = [];
  const rows: Row[] = [];
  const table = readTableRows(body);
  if (table.missingSeparatorLine !== null) {
    warnings.push(
      warn(section, table.missingSeparatorLine, 'Table has no separator row like "|---|---|"'),
    );
  }
  for (const tableRow of table.rows) {
    if (tableRow.cells.length === columnCount) {
      rows.push(toRow(tableRow.cells));
    } else {
      warnings.push(rowWarning(section, tableRow, columnCount));
    }
  }
  for (const line of table.ignoredTableLines) {
    warnings.push(
      warn(section, line, 'Only the first table in a section is read, this one is ignored'),
    );
  }
  return { value: rows, warnings };
}

function rowWarning(section: SectionName, tableRow: TableRow, columnCount: number): ParseWarning {
  const message = `Table row has ${String(tableRow.cells.length)} cells, expected ${String(columnCount)}`;
  return warn(section, tableRow.number, message);
}

function parseFeatures(body: readonly SourceLine[]): ParseResult<Feature[]> {
  const { sections } = splitByHeading(body, 3);
  const features: Feature[] = [];
  const warnings: ParseWarning[] = [];
  const seenIds = new Set<string>();
  for (const section of sections) {
    const result = parseFeature(section);
    warnings.push(...result.warnings);
    if (!result.value) continue;
    // A23: a repeated ID is kept and warned about.
    if (seenIds.has(result.value.id)) {
      warnings.push(warn('features', section.number, `Duplicate feature ID ${result.value.id}`));
    }
    seenIds.add(result.value.id);
    features.push(result.value);
  }
  return { value: features, warnings };
}

function parseFeature(section: HeadingSection): {
  value: Feature | undefined;
  warnings: ParseWarning[];
} {
  const heading = FEATURE_HEADING.exec(section.title);
  if (!heading) {
    return {
      value: undefined,
      warnings: [warn('features', section.number, `Skipped heading "${section.title}"`)],
    };
  }
  const [, id = '', title = ''] = heading;
  const warnings: ParseWarning[] = [];
  const { name, kind, amends } = readFeatureTitle(id, title, section.number, warnings);
  const parts = readFeatureBody(section.body, warnings);
  if (!parts.metadata) {
    warnings.push(warn('features', section.number, `${id} has no "Priority: ..." metadata line`));
  }
  const metadata = parts.metadata
    ? readMetadata(parts.metadata.fields, parts.metadata.line, warnings)
    : { priority: '', status: DEFAULT_STATUS, branch: '', estimateMinutes: null };

  const feature: Feature = {
    id,
    name,
    kind,
    amends,
    ...metadata,
    approach: parts.approach,
    criteria: parts.criteria,
    tasks: parts.tasks,
  };
  return { value: feature, warnings };
}

function readFeatureTitle(
  id: string,
  title: string,
  line: number,
  warnings: ParseWarning[],
): Pick<Feature, 'name' | 'kind' | 'amends'> {
  const amends = AMENDS.exec(title)?.[1] ?? null;
  const withoutAmends = title.replace(AMENDS, '');
  const marker = CHANGE_MARKER.exec(withoutAmends)?.[1]?.toLowerCase();
  const kind = readFeatureKind(marker);
  const name = withoutAmends.replace(CHANGE_MARKER, '').trim();
  if (kind !== 'feature' && amends === null) {
    warnings.push(warn('features', line, `${id} is a ${kind} without "(amends F0X)"`));
  }
  if (name === '') {
    warnings.push(warn('features', line, `${id} has no name after its marker`));
    return { name: title, kind, amends };
  }
  return { name, kind, amends };
}

function readFeatureKind(marker: string | undefined): Feature['kind'] {
  if (marker === undefined) return 'feature';
  return marker === 'fix' ? 'fix' : 'change-request';
}

function readMetadata(
  fields: ReadonlyMap<string, string>,
  line: number,
  warnings: ParseWarning[],
): Pick<Feature, 'priority' | 'status' | 'branch' | 'estimateMinutes'> {
  return {
    priority: requireField(fields, 'Priority', 'features', line, warnings),
    status: readStatus(fields, line, warnings),
    branch: requireField(fields, 'Branch', 'features', line, warnings),
    estimateMinutes: readEstimate(fields, line, warnings),
  };
}

interface FeatureBodyParts {
  metadata: { fields: Map<string, string>; line: number } | undefined;
  approach: string;
  criteria: Criterion[];
  tasks: Task[];
}

type BodyMode = 'prose' | 'approach' | 'criteria' | 'tasks';

function readFeatureBody(body: readonly SourceLine[], warnings: ParseWarning[]): FeatureBodyParts {
  const parts: FeatureBodyParts = { metadata: undefined, approach: '', criteria: [], tasks: [] };
  const approachLines: string[] = [];
  let mode: BodyMode = 'prose';

  for (const line of body) {
    // A28: fenced lines are kept as approach text and otherwise ignored.
    if (line.inFence) {
      if (mode === 'approach') approachLines.push(line.text);
      continue;
    }
    const text = line.text.trim();
    if (text.startsWith('Priority:')) {
      parts.metadata = { fields: readLabelledParts(text), line: line.number };
      mode = 'prose';
    } else if (text.startsWith('Approach:')) {
      approachLines.push(text.slice('Approach:'.length).trim());
      mode = 'approach';
    } else if (text === 'Acceptance criteria:') {
      mode = 'criteria';
    } else if (text === 'Tasks:') {
      mode = 'tasks';
    } else if (mode === 'approach') {
      if (text === '') mode = 'prose';
      else approachLines.push(text);
    } else if (mode === 'criteria' || mode === 'tasks') {
      readChecklistLine(line, mode, parts, warnings);
    }
  }
  parts.approach = approachLines.join('\n');
  return parts;
}

function readChecklistLine(
  line: SourceLine,
  mode: 'criteria' | 'tasks',
  parts: FeatureBodyParts,
  warnings: ParseWarning[],
): void {
  const text = line.text.trim();
  if (!text.startsWith('-')) return;
  const checkbox = CHECKBOX_ITEM.exec(text);
  if (!checkbox) {
    warnings.push(warn('features', line.number, 'List item is not a "- [ ]" or "- [x]" checkbox'));
    return;
  }
  const [, mark = ' ', itemText = ''] = checkbox;
  const ticked = mark !== ' ';
  if (mode === 'criteria') {
    parts.criteria.push(readCriterion(itemText, ticked));
    return;
  }
  const task = TASK_TEXT.exec(itemText);
  if (!task) {
    warnings.push(warn('features', line.number, 'Task has no ID like "F01.2"'));
    return;
  }
  const [, id = '', taskText = ''] = task;
  parts.tasks.push({ id, text: taskText, ticked, kind: readTaskKind(taskText) });
}

function readCriterion(text: string, ticked: boolean): Criterion {
  const superseded = STRUCK_SPAN.test(text);
  const supersededBy = superseded ? (SUPERSEDED_BY.exec(text)?.[1] ?? null) : null;
  return { text, ticked, superseded, supersededBy };
}

function readTaskKind(taskText: string): Task['kind'] {
  if (FIX_TASK.test(taskText)) return 'fix';
  return CHANGE_REQUEST_TASK.test(taskText) ? 'change-request' : 'task';
}

function readStatus(
  fields: ReadonlyMap<string, string>,
  line: number,
  warnings: ParseWarning[],
): FeatureStatus {
  const status = requireField(fields, 'Status', 'features', line, warnings);
  if (status === '') return DEFAULT_STATUS;
  const known = FEATURE_STATUSES.find((candidate) => candidate === status);
  if (known) return known;
  // A3: an unknown status becomes Todo.
  warnings.push(warn('features', line, `Unknown status "${status}", using ${DEFAULT_STATUS}`));
  return DEFAULT_STATUS;
}

function readEstimate(
  fields: ReadonlyMap<string, string>,
  line: number,
  warnings: ParseWarning[],
): number | null {
  const estimate = requireField(fields, 'Estimate', 'features', line, warnings);
  if (estimate === '') return null;
  const match = ESTIMATE.exec(estimate);
  if (!match) {
    warnings.push(warn('features', line, `Estimate "${estimate}" is not a number of minutes`));
    return null;
  }
  return Number(match[1]);
}

function readLabelledParts(text: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const part of text.split(FIELD_SEPARATOR)) {
    const colonIndex = part.indexOf(':');
    if (colonIndex === -1) continue;
    fields.set(part.slice(0, colonIndex).trim(), part.slice(colonIndex + 1).trim());
  }
  return fields;
}

// A4: a part that is missing or empty gives a warning and an empty value.
function requireField(
  fields: ReadonlyMap<string, string>,
  label: string,
  section: SectionName,
  line: number,
  warnings: ParseWarning[],
): string {
  const value = fields.get(label) ?? '';
  if (value === '') warnings.push(warn(section, line, `Missing "${label}"`));
  return value;
}

function warn(section: SectionName, line: number, message: string): ParseWarning {
  return { section, line, message };
}
