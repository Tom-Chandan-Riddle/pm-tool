import { z } from 'zod';
import { featuresDocumentSchema, logEventSchema, parseWarningSchema } from '../parser/snapshot.js';

export const FILE_STATES = ['ok', 'missing'] as const;

export const projectSnapshotSchema = z.object({
  featuresFile: z.enum(FILE_STATES),
  logFile: z.enum(FILE_STATES),
  features: featuresDocumentSchema,
  events: z.array(logEventSchema),
  warnings: z.array(parseWarningSchema),
});

export type ProjectSnapshot = z.infer<typeof projectSnapshotSchema>;

/** The text of a project's two files. `null` means the file does not exist. */
export interface SourceTexts {
  readonly featuresText: string | null;
  readonly logText: string | null;
}
