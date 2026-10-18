import { isAbsolute } from 'node:path';
import { z } from 'zod';

const MAX_NAME_LENGTH = 200;
const MAX_PATH_LENGTH = 1024;
const MARKDOWN_EXTENSION = /\.md$/i;

// A18: these rules apply to what a caller sends. Entries already in projects.json are read with
// the looser projectSchema, so a hand-edited path is never rejected after the fact.
export const projectInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(MAX_NAME_LENGTH, 'Name is too long'),
  featuresPath: z
    .string()
    .trim()
    .min(1, 'Path to FEATURES.md is required')
    .max(MAX_PATH_LENGTH, 'Path is too long')
    .refine((path) => isAbsolute(path), 'Must be an absolute path')
    .refine((path) => MARKDOWN_EXTENSION.test(path), 'Must be a .md file'),
});

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  featuresPath: z.string().min(1),
});

export const FILE_STATUS = { ok: 'ok', missing: 'missing' } as const;

export const projectViewSchema = projectSchema.extend({
  fileStatus: z.enum([FILE_STATUS.ok, FILE_STATUS.missing]),
});

export const projectIdParamsSchema = z.object({ id: z.string().min(1) });

export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  detail: z.string().optional(),
  correlationId: z.string(),
  errors: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ProjectView = z.infer<typeof projectViewSchema>;
