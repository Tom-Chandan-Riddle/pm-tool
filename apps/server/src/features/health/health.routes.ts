import type { FastifyPluginCallback } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

const healthResponse = z.object({ status: z.literal('ok') });

export const healthRoutes: FastifyPluginCallback = (app, _options, done) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/health',
    { schema: { summary: 'Liveness check', tags: ['health'], response: { 200: healthResponse } } },
    () => ({ status: 'ok' as const }),
  );

  // No dependencies yet. Later features add their checks here.
  typedApp.get(
    '/health/ready',
    { schema: { summary: 'Readiness check', tags: ['health'], response: { 200: healthResponse } } },
    () => ({ status: 'ok' as const }),
  );
  done();
};
