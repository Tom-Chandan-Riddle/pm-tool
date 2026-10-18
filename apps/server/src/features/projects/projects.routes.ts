import type { FastifyPluginCallback } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  problemSchema,
  projectIdParamsSchema,
  projectInputSchema,
  projectSchema,
  projectViewSchema,
} from './projects.schemas.js';
import { createProjectService } from './projects.service.js';
import { createProjectStore } from './projects.store.js';

export interface ProjectsRoutesOptions {
  readonly projectsFile: string;
}

export const projectsRoutes: FastifyPluginCallback<ProjectsRoutesOptions> = (
  app,
  options,
  done,
) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const service = createProjectService(createProjectStore(options.projectsFile, app.log), app.log);
  const tags = ['projects'];

  typedApp.get(
    '/',
    {
      schema: {
        summary: 'List projects with the state of their features file',
        tags,
        response: { 200: z.array(projectViewSchema) },
      },
    },
    () => service.list(),
  );

  typedApp.post(
    '/',
    {
      schema: {
        summary: 'Add a project',
        tags,
        body: projectInputSchema,
        response: {
          201: projectSchema,
          400: problemSchema,
          409: problemSchema,
          422: problemSchema,
        },
      },
    },
    async (request, reply) => reply.status(201).send(await service.add(request.body)),
  );

  typedApp.put(
    '/:id',
    {
      schema: {
        summary: 'Edit a project',
        tags,
        params: projectIdParamsSchema,
        body: projectInputSchema,
        response: {
          200: projectSchema,
          400: problemSchema,
          404: problemSchema,
          409: problemSchema,
          422: problemSchema,
        },
      },
    },
    (request) => service.edit(request.params.id, request.body),
  );

  typedApp.delete(
    '/:id',
    {
      schema: {
        summary: 'Remove a project',
        tags,
        params: projectIdParamsSchema,
        response: { 204: z.null(), 404: problemSchema, 409: problemSchema },
      },
    },
    async (request, reply) => {
      await service.remove(request.params.id);
      return reply.status(204).send(null);
    },
  );
  done();
};
