import type { FastifyPluginCallback } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { projectSnapshotSchema } from '@pm-tool/shared';
import { problemSchema, projectIdParamsSchema } from '../projects/projects.schemas.js';
import { createProjectStore } from '../projects/projects.store.js';
import { createSnapshotService } from './snapshot.service.js';

export interface WatchRoutesOptions {
  readonly projectsFile: string;
}

export const watchRoutes: FastifyPluginCallback<WatchRoutesOptions> = (app, options, done) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const snapshots = createSnapshotService(
    createProjectStore(options.projectsFile, app.log),
    app.log,
  );

  typedApp.get(
    '/:id/snapshot',
    {
      schema: {
        summary: 'Read the project files FEATURES.md and PROCESS-LOG.md as one snapshot',
        tags: ['snapshot'],
        params: projectIdParamsSchema,
        response: { 200: projectSnapshotSchema, 404: problemSchema },
      },
    },
    (request) => snapshots.getSnapshot(request.params.id),
  );
  done();
};
