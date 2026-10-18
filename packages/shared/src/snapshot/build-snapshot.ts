import { createEmptyFeaturesDocument, parseFeaturesFile } from '../parser/features.parser.js';
import { parseProcessLog } from '../parser/log.parser.js';
import type { FeaturesDocument, LogEvent, ParseWarning } from '../parser/snapshot.js';
import type { ProjectSnapshot, SourceTexts } from './project-snapshot.js';

interface Part<Value> {
  readonly file: ProjectSnapshot['featuresFile'];
  readonly value: Value;
  readonly warnings: readonly ParseWarning[];
}

// A38: a file that exists but yields nothing keeps what the last good snapshot had, with a warning.
export function buildSnapshot(texts: SourceTexts, lastGood?: ProjectSnapshot): ProjectSnapshot {
  const features = buildFeatures(texts.featuresText, lastGood);
  const events = buildEvents(texts.logText, lastGood);
  return {
    featuresFile: features.file,
    logFile: events.file,
    features: features.value,
    events: events.value,
    warnings: [...features.warnings, ...events.warnings],
  };
}

function buildFeatures(
  text: string | null,
  lastGood: ProjectSnapshot | undefined,
): Part<FeaturesDocument> {
  if (text === null) {
    return { file: 'missing', value: createEmptyFeaturesDocument(), warnings: [] };
  }
  const parsed = parseFeaturesFile(text);
  const previous = lastGood?.features;
  if (parsed.value.features.length > 0 || !previous || previous.features.length === 0) {
    return { file: 'ok', value: parsed.value, warnings: parsed.warnings };
  }
  const kept = keptWarning(
    'file',
    'The features file has no features, showing the last good version',
  );
  return { file: 'ok', value: previous, warnings: [...parsed.warnings, kept] };
}

function buildEvents(text: string | null, lastGood: ProjectSnapshot | undefined): Part<LogEvent[]> {
  if (text === null) return { file: 'missing', value: [], warnings: [] };
  const parsed = parseProcessLog(text);
  const previous = lastGood?.events ?? [];
  if (parsed.value.length > 0 || previous.length === 0) {
    return { file: 'ok', value: parsed.value, warnings: parsed.warnings };
  }
  const kept = keptWarning('log', 'The log has no entries, showing the last good version');
  return { file: 'ok', value: previous, warnings: [...parsed.warnings, kept] };
}

function keptWarning(section: string, message: string): ParseWarning {
  return { section, line: 1, message };
}
