import { z } from 'zod';

export const projectInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  featuresPath: z.string().trim().min(1, 'Path to FEATURES.md is required'),
});

export const projectSchema = projectInputSchema.extend({ id: z.string().min(1) });

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
