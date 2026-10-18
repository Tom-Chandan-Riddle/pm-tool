import { z } from 'zod';

export const FEATURE_STATUSES = ['Todo', 'In Progress', 'Done', 'Cut'] as const;

// A21: line is 1-based in the source file.
export const parseWarningSchema = z.object({
  section: z.string(),
  line: z.number().int().positive(),
  message: z.string(),
});

export const headerSchema = z.object({
  baseCommit: z.string(),
  repoState: z.string(),
  model: z.string(),
});

export const assumptionSchema = z.object({
  id: z.string(),
  text: z.string(),
  reason: z.string(),
  approved: z.string(),
  superseded: z.boolean(),
});

export const decisionSchema = z.object({
  id: z.string(),
  text: z.string(),
  alternatives: z.string(),
  reason: z.string(),
});

export const criterionSchema = z.object({
  text: z.string(),
  ticked: z.boolean(),
});

export const taskSchema = z.object({
  id: z.string(),
  text: z.string(),
  ticked: z.boolean(),
});

export const featureSchema = z.object({
  id: z.string(),
  name: z.string(),
  priority: z.string(),
  status: z.enum(FEATURE_STATUSES),
  branch: z.string(),
  estimateMinutes: z.number().int().nonnegative().nullable(),
  approach: z.string(),
  criteria: z.array(criterionSchema),
  tasks: z.array(taskSchema),
});

export const changeLogEntrySchema = z.object({
  time: z.string(),
  change: z.string(),
  source: z.string(),
});

export const featuresDocumentSchema = z.object({
  header: headerSchema,
  // A19: kept as raw markdown.
  outline: z.string(),
  assumptions: z.array(assumptionSchema),
  decisions: z.array(decisionSchema),
  features: z.array(featureSchema),
  changeLog: z.array(changeLogEntrySchema),
});

export type ParseWarning = z.infer<typeof parseWarningSchema>;
export type Header = z.infer<typeof headerSchema>;
export type Assumption = z.infer<typeof assumptionSchema>;
export type Decision = z.infer<typeof decisionSchema>;
export type Criterion = z.infer<typeof criterionSchema>;
export type Task = z.infer<typeof taskSchema>;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];
export type Feature = z.infer<typeof featureSchema>;
export type ChangeLogEntry = z.infer<typeof changeLogEntrySchema>;
export type FeaturesDocument = z.infer<typeof featuresDocumentSchema>;

export interface ParseResult<Value> {
  readonly value: Value;
  readonly warnings: readonly ParseWarning[];
}
