import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  parseFeaturesFile,
  type FeaturesDocument,
  type ParseResult,
  type ParseWarning,
} from '../src/index.js';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'FEATURES.sample.md');

function featureFile(metadataLine: string): string {
  return [
    '## Features',
    '',
    '### F01 Sample',
    metadataLine,
    '',
    'Tasks:',
    '- [ ] F01.1 Do it',
  ].join('\n');
}

// Small test files lack the other sections, so each test looks only at the section it is about.
function warningsIn(result: ParseResult<FeaturesDocument>, section: string): ParseWarning[] {
  return result.warnings.filter((warning) => warning.section === section);
}

describe('parseFeaturesFile on a malformed or tiny file', () => {
  it('returns an empty document and a warning for an empty file', () => {
    const { value, warnings } = parseFeaturesFile('  \n');

    expect(value.features).toEqual([]);
    expect(warnings).toEqual([{ section: 'file', line: 1, message: 'The file is empty' }]);
  });

  it('warns about each section that is missing instead of throwing', () => {
    const { value, warnings } = parseFeaturesFile('# Just a title\n\nSome text.');

    expect(value.assumptions).toEqual([]);
    expect(warnings.map((warning) => warning.section)).toEqual([
      'header',
      'outline',
      'assumptions',
      'decisions',
      'features',
      'changeLog',
    ]);
  });

  it('turns an unknown status into Todo with a warning (A3)', () => {
    const { value, warnings } = parseFeaturesFile(
      featureFile('Priority: Must · Status: Blocked · Branch: b · Estimate: 10 min'),
    );

    expect(value.features[0]?.status).toBe('Todo');
    expect(warnings).toContainEqual({
      section: 'features',
      line: 4,
      message: 'Unknown status "Blocked", using Todo',
    });
  });

  it('gives a warning and an empty value for each metadata part that is missing (A4)', () => {
    const result = parseFeaturesFile(featureFile('Priority: Must · Branch: feature/x'));

    expect(result.value.features[0]).toMatchObject({
      status: 'Todo',
      estimateMinutes: null,
      branch: 'feature/x',
    });
    expect(warningsIn(result, 'features').map((warning) => warning.message)).toEqual([
      'Missing "Status"',
      'Missing "Estimate"',
    ]);
  });

  it('gives a warning when the estimate is not a number of minutes', () => {
    const result = parseFeaturesFile(
      featureFile('Priority: Must · Status: Todo · Branch: b · Estimate: soon'),
    );

    expect(result.value.features[0]?.estimateMinutes).toBeNull();
    expect(warningsIn(result, 'features').map((warning) => warning.message)).toEqual([
      'Estimate "soon" is not a number of minutes',
    ]);
  });

  it('accepts an estimate with or without the min suffix', () => {
    const withUnit = parseFeaturesFile(
      featureFile('Priority: Must · Status: Todo · Branch: b · Estimate: 25 min'),
    );
    const bare = parseFeaturesFile(
      featureFile('Priority: Must · Status: Todo · Branch: b · Estimate: 25'),
    );

    expect(withUnit.value.features[0]?.estimateMinutes).toBe(25);
    expect(bare.value.features[0]?.estimateMinutes).toBe(25);
  });

  it('warns about a feature without a metadata line and still keeps its tasks', () => {
    const result = parseFeaturesFile(
      ['## Features', '### F01 Bare', 'Tasks:', '- [x] F01.1 Done'].join('\n'),
    );

    expect(result.value.features[0]?.tasks).toEqual([{ id: 'F01.1', text: 'Done', ticked: true }]);
    expect(warningsIn(result, 'features')).toEqual([
      { section: 'features', line: 2, message: 'F01 has no "Priority: ..." metadata line' },
    ]);
  });

  it('skips a table row with the wrong number of cells and keeps the others', () => {
    const text = [
      '## Decisions',
      '| ID | Decision | Alternatives | Reason |',
      '|---|---|---|---|',
      '| D1 | One | none | because |',
      '| D2 | broken row |',
      '| D3 | Three | none | because |',
    ].join('\n');

    const result = parseFeaturesFile(text);

    expect(result.value.decisions.map((decision) => decision.id)).toEqual(['D1', 'D3']);
    expect(warningsIn(result, 'decisions')).toEqual([
      { section: 'decisions', line: 5, message: 'Table row has 2 cells, expected 4' },
    ]);
  });

  it('warns about a task without an ID and about a list item that is not a checkbox', () => {
    const text = [
      '## Features',
      '### F01 Sample',
      'Priority: Must · Status: Todo · Branch: b · Estimate: 5 min',
      'Acceptance criteria:',
      '- [] missing space',
      'Tasks:',
      '- [ ] no id here',
    ].join('\n');

    const result = parseFeaturesFile(text);

    expect(
      warningsIn(result, 'features').map((warning) => [warning.line, warning.message]),
    ).toEqual([
      [5, 'List item is not a "- [ ]" or "- [x]" checkbox'],
      [7, 'Task has no ID like "F01.2"'],
    ]);
  });

  it('warns about a heading under Features that is not a feature ID and keeps the other features', () => {
    const text = [
      '## Features',
      '### Notes',
      '### F01 Real',
      'Priority: Must · Status: Done · Branch: b · Estimate: 5 min',
    ].join('\n');

    const result = parseFeaturesFile(text);

    expect(result.value.features.map((feature) => feature.id)).toEqual(['F01']);
    expect(warningsIn(result, 'features')).toEqual([
      { section: 'features', line: 2, message: 'Skipped heading "Notes"' },
    ]);
  });

  it('ignores headings inside fenced code blocks', () => {
    const text = [
      '## Features',
      '```',
      '### F99 Not real',
      '```',
      '### F01 Real',
      'Priority: Must',
    ].join('\n');

    expect(parseFeaturesFile(text).value.features.map((feature) => feature.id)).toEqual(['F01']);
  });

  it('parses Windows line endings and a byte order mark like plain text', async () => {
    const text = await readFile(FIXTURE, 'utf8');

    const plain = parseFeaturesFile(text);
    const windows = parseFeaturesFile(String.fromCharCode(0xfeff) + text.replaceAll('\n', '\r\n'));

    expect(windows).toEqual(plain);
  });
});

describe('parseFeaturesFile on a real FEATURES.md', () => {
  let result: ParseResult<FeaturesDocument>;

  beforeAll(async () => {
    result = parseFeaturesFile(await readFile(FIXTURE, 'utf8'));
  });

  it('parses the sample without warnings', () => {
    expect(result.warnings).toEqual([]);
  });

  it('reads the header', () => {
    expect(result.value.header).toEqual({
      baseCommit: '8b83388',
      repoState: 'greenfield',
      model: 'Sonnet 5.5, low effort',
    });
  });

  it('keeps the solution outline as raw markdown', () => {
    expect(result.value.outline).toMatch(/^\*\*Domain\.\*\* A `Project` is/);
    expect(result.value.outline).toContain('**Variation points.** None in Phase 1.');
  });

  it('reads every assumption and flags the superseded one', () => {
    const { assumptions } = result.value;

    expect(assumptions).toHaveLength(21);
    expect(
      assumptions.filter((assumption) => assumption.superseded).map((assumption) => assumption.id),
    ).toEqual(['A12']);
    expect(assumptions[0]).toEqual({
      id: 'A1',
      text: 'Projects are stored in `apps/server/projects.json` (gitignored) as `{id, name, featuresPath}`. It is created empty on first run.',
      reason: 'The spec asks for a hand-editable file next to the server.',
      approved: '19 Oct',
      superseded: false,
    });
  });

  it('reads every decision with its alternatives and reason', () => {
    const { decisions } = result.value;

    expect(decisions).toHaveLength(6);
    expect(decisions[0]).toMatchObject({
      id: 'D1',
      alternatives: 'SQLite with Drizzle (CLAUDE.md default).',
    });
  });

  it('reads the change log rows', () => {
    expect(result.value.changeLog.map((entry) => entry.source)).toEqual([
      '/kickoff',
      '/review',
      '/review',
    ]);
  });

  it('reads every feature with its status, branch and estimate', () => {
    const summary = result.value.features.map((feature) => [
      feature.id,
      feature.status,
      feature.estimateMinutes,
    ]);

    expect(summary).toEqual([
      ['F00', 'Done', 25],
      ['F01', 'Done', 35],
      ['F02', 'Todo', 40],
      ['F03', 'Todo', 45],
      ['F04', 'Todo', 25],
      ['F05', 'Todo', 30],
    ]);
    expect(result.value.features[0]).toMatchObject({
      name: 'Foundation',
      priority: 'Must',
      branch: 'feature/F00-foundation',
    });
  });

  it('reads criteria and tasks with their ticked state', () => {
    const [foundation, , parser] = result.value.features;

    expect(foundation?.criteria).toHaveLength(7);
    expect(foundation?.criteria.every((criterion) => criterion.ticked)).toBe(true);
    expect(foundation?.tasks).toHaveLength(6);
    expect(foundation?.tasks[0]).toEqual({
      id: 'F00.1',
      text: 'Root scaffold and server foundation with /health test',
      ticked: true,
    });
    expect(parser?.criteria).toHaveLength(8);
    expect(parser?.tasks.map((task) => task.ticked)).toEqual([false, false, false]);
  });

  it('reads the approach paragraph of a feature', () => {
    const approach = result.value.features[0]?.approach ?? '';

    expect(approach).toMatch(/^only what the features use\./);
    expect(approach).toContain('`npm run dev` starts both.');
  });
});
