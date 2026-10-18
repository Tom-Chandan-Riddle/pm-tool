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

    expect(result.value.features[0]?.tasks).toEqual([
      { id: 'F01.1', text: 'Done', ticked: true, kind: 'task' },
    ]);
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
      kind: 'task',
    });
    expect(foundation?.tasks[2]).toMatchObject({ id: 'F00.3', kind: 'fix' });
    expect(result.value.features.map((feature) => feature.kind)).toEqual(
      Array.from({ length: 6 }, () => 'feature'),
    );
    expect(parser?.criteria).toHaveLength(8);
    expect(parser?.tasks.map((task) => task.ticked)).toEqual([false, false, false]);
  });

  it('reads the approach paragraph of a feature', () => {
    const approach = result.value.features[0]?.approach ?? '';

    expect(approach).toMatch(/^only what the features use\./);
    expect(approach).toContain('`npm run dev` starts both.');
  });
});

const META = 'Priority: Must · Status: Todo · Branch: b · Estimate: 5 min';

describe('parseFeaturesFile on change requests, fixes and superseded criteria', () => {
  it('warns about a change request without amends and keeps the feature', () => {
    const result = parseFeaturesFile(`## Features\n### F06 CR: Add export\n${META}`);

    expect(result.value.features[0]).toMatchObject({
      kind: 'change-request',
      amends: null,
      name: 'Add export',
    });
    expect(warningsIn(result, 'features')).toEqual([
      { section: 'features', line: 2, message: 'F06 is a change-request without "(amends F0X)"' },
    ]);
  });

  it('warns about a fix without amends', () => {
    const result = parseFeaturesFile(`## Features\n### F07 Fix: Wrong total\n${META}`);

    expect(warningsIn(result, 'features').map((warning) => warning.message)).toEqual([
      'F07 is a fix without "(amends F0X)"',
    ]);
  });

  it('keeps the raw title and warns when nothing is left after the marker', () => {
    const result = parseFeaturesFile(`## Features\n### F06 CR: (amends F02)\n${META}`);

    expect(result.value.features[0]).toMatchObject({ name: 'CR: (amends F02)', amends: 'F02' });
    expect(warningsIn(result, 'features').map((warning) => warning.message)).toEqual([
      'F06 has no name after its marker',
    ]);
  });

  it('reads kind, amends and a clean name from CR and Fix headings in any case', () => {
    const text = [
      '## Features',
      `### F06 CR: Add export (amends F02)\n${META}`,
      `### F07 fix:  Wrong total  ( amends F01 )\n${META}`,
      `### F08 FIX: Parens (in name) (amends  F03)\n${META}`,
    ].join('\n');

    const { value } = parseFeaturesFile(text);

    expect(value.features.map((f) => [f.kind, f.amends, f.name])).toEqual([
      ['change-request', 'F02', 'Add export'],
      ['fix', 'F01', 'Wrong total'],
      ['fix', 'F03', 'Parens (in name)'],
    ]);
  });

  it('leaves an ordinary feature as a feature with no amends', () => {
    const { value } = parseFeaturesFile(`## Features\n### F01 Projects\n${META}`);

    expect(value.features[0]).toMatchObject({ kind: 'feature', amends: null, name: 'Projects' });
  });

  it('skips a malformed heading between two good features and keeps both', () => {
    const text = [
      '## Features',
      `### F01 First\n${META}\nTasks:\n- [ ] F01.1 One`,
      '### Stray notes',
      '- [ ] F99.1 not a feature task',
      `### F02 Second\n${META}\nTasks:\n- [x] F02.1 Two`,
    ].join('\n');

    const result = parseFeaturesFile(text);

    expect(result.value.features.map((feature) => [feature.id, feature.tasks.length])).toEqual([
      ['F01', 1],
      ['F02', 1],
    ]);
    expect(warningsIn(result, 'features').map((warning) => warning.message)).toEqual([
      'Skipped heading "Stray notes"',
    ]);
  });

  it('keeps both features with a repeated ID and warns about the second (A23)', () => {
    const text = `## Features\n### F01 First\n${META}\n### F01 Again\n${META}`;

    const result = parseFeaturesFile(text);

    expect(result.value.features.map((feature) => feature.name)).toEqual(['First', 'Again']);
    expect(warningsIn(result, 'features')).toEqual([
      { section: 'features', line: 4, message: 'Duplicate feature ID F01' },
    ]);
  });

  it('marks a task as a fix by its prefix and as a change request by its suffix', () => {
    const text = [
      `## Features\n### F01 Sample\n${META}\nTasks:`,
      '- [x] F01.1 Build it',
      '- [x] F01.2 fix: handle empty input',
      '- [ ] F01.3 Add a filter (CR)',
      '- [ ] F01.4 Document how to fix: nothing',
    ].join('\n');

    const tasks = parseFeaturesFile(text).value.features[0]?.tasks ?? [];

    expect(tasks.map((task) => task.kind)).toEqual(['task', 'fix', 'change-request', 'task']);
    expect(tasks[1]?.text).toBe('fix: handle empty input');
  });

  it('flags a struck criterion as superseded and reads the feature that replaced it', () => {
    const text = [
      `## Features\n### F01 Sample\n${META}\nAcceptance criteria:`,
      '- [x] Plain criterion',
      '- [x] ~~Old rule~~ superseded by F06',
      '- [ ] ~~Struck with no note~~',
      '- [ ] Mentions superseded by F09 but is not struck',
    ].join('\n');

    const criteria = parseFeaturesFile(text).value.features[0]?.criteria ?? [];

    expect(criteria.map((c) => [c.superseded, c.supersededBy, c.ticked])).toEqual([
      [false, null, true],
      [true, 'F06', true],
      [true, null, false],
      [false, null, false],
    ]);
  });
});

describe('parseFeaturesFile on fenced code', () => {
  it('does not let a fenced Tasks label, checkbox or Priority line change a feature', () => {
    const text = [
      '## Features',
      `### F01 Sample\n${META}`,
      'Approach: show a sample.',
      '```',
      'Tasks:',
      '- [ ] F09.1 not a task',
      'Priority: Wrong · Status: Done',
      '```',
      'Tasks:',
      '- [ ] F01.1 Real task',
    ].join('\n');

    const result = parseFeaturesFile(text);
    const feature = result.value.features[0];

    expect(feature?.tasks.map((task) => task.id)).toEqual(['F01.1']);
    expect(feature).toMatchObject({ priority: 'Must', status: 'Todo' });
    expect(warningsIn(result, 'features')).toEqual([]);
  });

  it('ignores a fenced checkbox under the criteria', () => {
    const text = [
      `## Features\n### F01 Sample\n${META}\nAcceptance criteria:`,
      '- [x] Real criterion',
      '```',
      '- [ ] in a code sample',
      '```',
    ].join('\n');

    const criteria = parseFeaturesFile(text).value.features[0]?.criteria ?? [];

    expect(criteria.map((criterion) => criterion.text)).toEqual(['Real criterion']);
  });

  it('keeps fenced lines as part of the approach text (A28)', () => {
    const text = [
      `## Features\n### F01 Sample\n${META}`,
      'Approach: shape of the call:',
      '```',
      'Tasks: not a label here',
      '```',
    ].join('\n');

    const approach = parseFeaturesFile(text).value.features[0]?.approach;

    expect(approach).toBe('shape of the call:\n```\nTasks: not a label here\n```');
  });

  it('ignores a feature heading inside a four-backtick fence that holds a three-backtick line', () => {
    const text = [
      '## Features',
      '````',
      '```',
      '### F99 Not real',
      '````',
      `### F01 Real\n${META}`,
    ].join('\n');

    expect(parseFeaturesFile(text).value.features.map((feature) => feature.id)).toEqual(['F01']);
  });

  it('warns at the opening line of a fence that is never closed', () => {
    const text = [`## Features\n### F01 Real\n${META}`, '```', '### F02 Hidden'].join('\n');

    const result = parseFeaturesFile(text);

    expect(result.value.features.map((feature) => feature.id)).toEqual(['F01']);
    expect(warningsIn(result, 'file')).toEqual([
      { section: 'file', line: 4, message: 'Code fence is never closed' },
    ]);
  });
});

describe('parseFeaturesFile on table edge cases', () => {
  const HEADER = ['| ID | Decision | Alternatives | Reason |', '|---|---|---|---|'];

  it('warns about a table with no separator row and reads no rows from it (A32)', () => {
    const text = ['## Decisions', '| D1 | One | none | because |', '| D2 | Two | none | because |'];

    const result = parseFeaturesFile(text.join('\n'));

    expect(result.value.decisions).toEqual([]);
    expect(warningsIn(result, 'decisions')).toEqual([
      { section: 'decisions', line: 2, message: 'Table has no separator row like "|---|---|"' },
    ]);
  });

  it('reads only the first table and warns once about a second one (A32)', () => {
    const text = [
      '## Decisions',
      ...HEADER,
      '| D1 | One | none | because |',
      '',
      '| Other | Header | Row | Here |',
      '|---|---|---|---|',
      '| x | y | z | w |',
    ];

    const result = parseFeaturesFile(text.join('\n'));

    expect(result.value.decisions.map((decision) => decision.id)).toEqual(['D1']);
    expect(warningsIn(result, 'decisions')).toEqual([
      {
        section: 'decisions',
        line: 6,
        message: 'Only the first table in a section is read, this one is ignored',
      },
    ]);
  });

  it('treats rows after a blank line as a later table and warns instead of dropping them silently', () => {
    const text = ['## Decisions', ...HEADER, '', '| D1 | One | none | because |'];

    const result = parseFeaturesFile(text.join('\n'));

    expect(result.value.decisions).toEqual([]);
    expect(warningsIn(result, 'decisions').map((warning) => warning.line)).toEqual([5]);
  });

  it('keeps an escaped pipe inside a cell as a plain pipe (A31)', () => {
    const text = ['## Decisions', ...HEADER, String.raw`| D1 | uses a\|b | none | because |`];

    const result = parseFeaturesFile(text.join('\n'));

    expect(result.value.decisions[0]).toMatchObject({ id: 'D1', text: 'uses a|b' });
    expect(warningsIn(result, 'decisions')).toEqual([]);
  });

  it('keeps an escaped pipe at the end of the last cell', () => {
    const text = ['## Decisions', ...HEADER, String.raw`| D1 | One | none | ends with \|`];

    const { value } = parseFeaturesFile(text.join('\n'));

    expect(value.decisions[0]?.reason).toBe('ends with |');
  });

  it('still reads aligned separators and rows with no trailing pipe', () => {
    const text = [
      '## Decisions',
      '| ID | Decision | Alternatives | Reason |',
      '|:---|:---:|---:|---|',
      '| D1 | One | none | because',
    ];

    expect(parseFeaturesFile(text.join('\n')).value.decisions.map((d) => d.id)).toEqual(['D1']);
  });

  it('ignores a table inside a code fence', () => {
    const text = ['## Decisions', '```', ...HEADER, '| D1 | One | none | because |', '```'];

    const result = parseFeaturesFile(text.join('\n'));

    expect(result.value.decisions).toEqual([]);
    expect(warningsIn(result, 'decisions')).toEqual([]);
  });
});

describe('parseFeaturesFile on feature body structure', () => {
  const FEATURE = `## Features\n### F01 Sample\n${META}`;

  it('keeps the first Priority line and warns about a second one (A34)', () => {
    const text = `${FEATURE}\nPriority: Should · Status: Done · Branch: other · Estimate: 99 min`;

    const result = parseFeaturesFile(text);

    expect(result.value.features[0]).toMatchObject({
      priority: 'Must',
      status: 'Todo',
      branch: 'b',
      estimateMinutes: 5,
    });
    expect(warningsIn(result, 'features')).toEqual([
      { section: 'features', line: 4, message: 'Duplicate "Priority:" metadata line' },
    ]);
  });

  it('does not let a line inside the approach that starts with Priority replace the metadata', () => {
    const text = `${FEATURE}\nApproach: first line\nPriority: bar continuing\nsecond line`;

    const result = parseFeaturesFile(text);

    expect(result.value.features[0]).toMatchObject({ priority: 'Must', status: 'Todo' });
    expect(result.value.features[0]?.approach).toBe('first line\nsecond line');
    expect(warningsIn(result, 'features').map((warning) => warning.line)).toEqual([5]);
  });

  it('keeps every paragraph of an approach and drops the blank lines around it (A33)', () => {
    const text = `${FEATURE}\n\nApproach: first paragraph\n\nsecond paragraph\n\nAcceptance criteria:\n- [ ] One`;

    const feature = parseFeaturesFile(text).value.features[0];

    expect(feature?.approach).toBe('first paragraph\n\nsecond paragraph');
    expect(feature?.criteria).toHaveLength(1);
  });

  it('ends the approach at Tasks when there are no criteria', () => {
    const text = `${FEATURE}\nApproach: only this\n\nTasks:\n- [ ] F01.1 Do it`;

    const feature = parseFeaturesFile(text).value.features[0];

    expect(feature?.approach).toBe('only this');
    expect(feature?.tasks).toHaveLength(1);
  });

  it('reads a metadata line placed after the approach and leaves it out of the approach', () => {
    const text = `## Features\n### F01 Sample\nApproach: first\n\nmore\n${META}`;

    const feature = parseFeaturesFile(text).value.features[0];

    expect(feature?.approach).toBe('first\n\nmore');
    expect(feature).toMatchObject({ priority: 'Must', branch: 'b' });
  });

  it('keeps blank lines inside a fenced block in the approach', () => {
    const text = `${FEATURE}\nApproach: sample:\n\`\`\`\nline one\n\nline two\n\`\`\``;

    const approach = parseFeaturesFile(text).value.features[0]?.approach;

    expect(approach).toBe('sample:\n```\nline one\n\nline two\n```');
  });

  it('gives an empty approach when nothing follows the label', () => {
    const text = `${FEATURE}\nApproach:\n\nTasks:\n- [ ] F01.1 Do it`;

    expect(parseFeaturesFile(text).value.features[0]?.approach).toBe('');
  });
});
