import type { ServerResponse } from 'node:http';
import type { FastifyPluginCallback } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { projectSnapshotSchema, type ProjectSnapshot } from '@pm-tool/shared';
import { problemSchema, projectIdParamsSchema } from '../projects/projects.schemas.js';
import { createProjectStore } from '../projects/projects.store.js';
import { createSnapshotHub } from './snapshot.hub.js';
import { createSnapshotService } from './snapshot.service.js';

const RECONNECT_DELAY_MS = 2000;
const SNAPSHOT_EVENT = 'snapshot';

export interface WatchRoutesOptions {
  readonly projectsFile: string;
}

function writeSnapshot(stream: ServerResponse, snapshot: ProjectSnapshot): void {
  stream.write(`event: ${SNAPSHOT_EVENT}\ndata: ${JSON.stringify(snapshot)}\n\n`);
}

export const watchRoutes: FastifyPluginCallback<WatchRoutesOptions> = (app, options, done) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const hub = createSnapshotHub(app.log);
  const snapshots = createSnapshotService(
    createProjectStore(options.projectsFile, app.log),
    hub,
    app.log,
  );
  const openStreams = new Set<ServerResponse>();

  // Open streams never go idle, so they are ended first or the server could not finish closing.
  app.addHook('preClose', () => {
    for (const stream of openStreams) stream.end();
    openStreams.clear();
  });
  app.addHook('onClose', () => hub.close());

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

  typedApp.get(
    '/:id/events',
    {
      schema: {
        summary: 'Stream snapshot events: the current one at once, then one per change',
        tags: ['snapshot'],
        params: projectIdParamsSchema,
        response: {
          200: z.string().describe('text/event-stream with "snapshot" events'),
          404: problemSchema,
        },
      },
    },
    async (request, reply) => {
      const project = await snapshots.findProject(request.params.id);
      const stream = reply.raw;
      const subscription = await snapshots.subscribe(project, (snapshot) => {
        writeSnapshot(stream, snapshot);
      });
      // From here on the response is written by hand, so Fastify's own send is skipped.
      reply.hijack();

      const stopListening = () =>
        subscription.unsubscribe().catch((error: unknown) => {
          request.log.error({ err: error, projectId: project.id }, 'closing a stream failed');
        });
      if (stream.destroyed) {
        await stopListening();
        return reply;
      }

      stream.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Correlation-ID': request.id,
      });
      stream.write(`retry: ${String(RECONNECT_DELAY_MS)}\n\n`);
      writeSnapshot(stream, subscription.snapshot);
      request.log.info(
        { projectId: project.id, isWatched: subscription.isWatched },
        'stream opened',
      );

      if (!subscription.isWatched) {
        stream.end();
        return reply;
      }
      openStreams.add(stream);
      stream.once('close', () => {
        openStreams.delete(stream);
        request.log.info({ projectId: project.id }, 'stream closed');
        void stopListening();
      });
      return reply;
    },
  );
  done();
};
