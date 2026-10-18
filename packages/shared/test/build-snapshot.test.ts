import { describe, expect, it } from 'vitest';
import { buildSnapshot, type ProjectSnapshot } from '../src/index.js';

const FEATURES_TEXT = [
  '# FEATURES.md',
  '## Features',
  '### F01 Sample',
  'Priority: Must · Status: Todo · Branch: b · Estimate: 5 min',
  'Tasks:',
  '- [x] F01.1 Do it',
].join('\n');

const LOG_TEXT = ['## Log', '09:00 · START · — · Begin', '09:10 · TASK · F01.1 · Done'].join('\n');

const KEPT_FEATURES_WARNING = {
  section: 'file',
  line: 1,
  message: 'The features file has no features, showing the last good version',
};
const KEPT_LOG_WARNING = {
  section: 'log',
  line: 1,
  message: 'The log has no entries, showing the last good version',
};

function goodSnapshot(): ProjectSnapshot {
  return buildSnapshot({ featuresText: FEATURES_TEXT, logText: LOG_TEXT });
}

describe('buildSnapshot from two good files', () => {
  it('parses both files and reports both as present', () => {
    const snapshot = goodSnapshot();

    expect(snapshot.featuresFile).toBe('ok');
    expect(snapshot.logFile).toBe('ok');
    expect(snapshot.features.features.map((feature) => feature.id)).toEqual(['F01']);
    expect(snapshot.events.map((event) => event.type)).toEqual(['START', 'TASK']);
  });

  it('merges the warnings of both files, features first', () => {
    const snapshot = buildSnapshot({
      featuresText: `${FEATURES_TEXT}\n### F02 No metadata`,
      logText: '## Log\n09:00 · NOTE · — · Unknown type',
    });

    const sections = snapshot.warnings.map((warning) => warning.section);

    expect(sections.indexOf('features')).toBeLessThan(sections.indexOf('log'));
    expect(sections).toContain('log');
  });
});

describe('buildSnapshot with missing files (A37, A38)', () => {
  it('reports a deleted features file as missing with empty features, even when there is a last good', () => {
    const snapshot = buildSnapshot({ featuresText: null, logText: LOG_TEXT }, goodSnapshot());

    expect(snapshot.featuresFile).toBe('missing');
    expect(snapshot.features.features).toEqual([]);
    expect(snapshot.events).toHaveLength(2);
    expect(snapshot.warnings.filter((warning) => warning.section === 'file')).toEqual([]);
  });

  it('reports a missing log as missing with no events and no warning', () => {
    const snapshot = buildSnapshot({ featuresText: FEATURES_TEXT, logText: null }, goodSnapshot());

    expect(snapshot.logFile).toBe('missing');
    expect(snapshot.events).toEqual([]);
    expect(snapshot.warnings.some((warning) => warning.section === 'log')).toBe(false);
  });

  it('handles both files missing', () => {
    const snapshot = buildSnapshot({ featuresText: null, logText: null });

    expect(snapshot).toMatchObject({ featuresFile: 'missing', logFile: 'missing', events: [] });
    expect(snapshot.warnings).toEqual([]);
  });
});

describe('buildSnapshot keeping the last good snapshot (A38)', () => {
  it('keeps the previous features when the features file is now empty', () => {
    const lastGood = goodSnapshot();

    const snapshot = buildSnapshot({ featuresText: '', logText: LOG_TEXT }, lastGood);

    expect(snapshot.featuresFile).toBe('ok');
    expect(snapshot.features).toEqual(lastGood.features);
    expect(snapshot.warnings).toContainEqual(KEPT_FEATURES_WARNING);
    expect(snapshot.warnings).toContainEqual({
      section: 'file',
      line: 1,
      message: 'The file is empty',
    });
  });

  it('keeps the previous features when the text has no feature headings', () => {
    const snapshot = buildSnapshot(
      { featuresText: '# FEATURES.md\nhalf typed', logText: LOG_TEXT },
      goodSnapshot(),
    );

    expect(snapshot.features.features.map((feature) => feature.id)).toEqual(['F01']);
    expect(snapshot.warnings).toContainEqual(KEPT_FEATURES_WARNING);
  });

  it('publishes the empty result with its warnings when there is nothing earlier to keep', () => {
    const snapshot = buildSnapshot({ featuresText: '', logText: null });

    expect(snapshot.features.features).toEqual([]);
    expect(snapshot.warnings).toEqual([{ section: 'file', line: 1, message: 'The file is empty' }]);
  });

  it('does not keep anything when the last good had no features either', () => {
    const empty = buildSnapshot({ featuresText: '', logText: null });

    const snapshot = buildSnapshot({ featuresText: '', logText: null }, empty);

    expect(snapshot.warnings).not.toContainEqual(KEPT_FEATURES_WARNING);
  });

  it('keeps the previous events when the log is now empty, but takes the new features', () => {
    const lastGood = goodSnapshot();
    const changedFeatures = FEATURES_TEXT.replace('F01 Sample', 'F01 Renamed');

    const snapshot = buildSnapshot({ featuresText: changedFeatures, logText: '' }, lastGood);

    expect(snapshot.events).toEqual(lastGood.events);
    expect(snapshot.features.features[0]?.name).toBe('Renamed');
    expect(snapshot.warnings).toContainEqual(KEPT_LOG_WARNING);
  });

  it('recovers without a kept warning once the files are valid again', () => {
    const lastGood = goodSnapshot();
    const broken = buildSnapshot({ featuresText: '', logText: '' }, lastGood);

    const recovered = buildSnapshot({ featuresText: FEATURES_TEXT, logText: LOG_TEXT }, broken);

    expect(recovered.warnings).not.toContainEqual(KEPT_FEATURES_WARNING);
    expect(recovered.warnings).not.toContainEqual(KEPT_LOG_WARNING);
    expect(recovered.features.features).toHaveLength(1);
  });

  it('keeps the good version across several bad ones in a row', () => {
    const lastGood = goodSnapshot();
    const firstBad = buildSnapshot({ featuresText: '', logText: LOG_TEXT }, lastGood);

    const secondBad = buildSnapshot({ featuresText: 'still broken', logText: LOG_TEXT }, firstBad);

    expect(secondBad.features).toEqual(lastGood.features);
  });

  it('does not change the last good snapshot it was given', () => {
    const lastGood = goodSnapshot();
    const before = structuredClone(lastGood);

    buildSnapshot({ featuresText: '', logText: '' }, lastGood);

    expect(lastGood).toEqual(before);
  });
});
