export const SHARED_PACKAGE_NAME = '@pm-tool/shared';

export { createEmptyFeaturesDocument, parseFeaturesFile } from './parser/features.parser.js';
export { parseProcessLog } from './parser/log.parser.js';
export * from './parser/snapshot.js';
export { buildSnapshot } from './snapshot/build-snapshot.js';
export * from './snapshot/project-snapshot.js';
