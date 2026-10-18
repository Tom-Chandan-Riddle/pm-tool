import { randomUUID } from 'node:crypto';
import swagger from '@fastify/swagger';
import scalar from '@scalar/fastify-api-reference';
import Fastify, { type FastifyInstance } from 'fastify';
import type { DestinationStream } from 'pino';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { healthRoutes } from './features/health/health.routes.js';
import { projectsRoutes } from './features/projects/projects.routes.js';
import type { Config } from './shared/config.js';
import { registerErrorHandler } from './shared/errors.js';

const CORRELATION_ID_HEADER = 'x-correlation-id';
// Fastify's request serializer logs no headers. These paths guard code that logs them itself.
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
];
const MAX_CORRELATION_ID_LENGTH = 128;
const CORRELATION_ID_CHARACTERS = /^[\w.-]+$/;

// A caller's id is echoed into responses and logs, so anything unusual is replaced.
function correlationIdFrom(headerValue: string | string[] | undefined): string {
  if (
    typeof headerValue === 'string' &&
    headerValue.length <= MAX_CORRELATION_ID_LENGTH &&
    CORRELATION_ID_CHARACTERS.test(headerValue)
  ) {
    return headerValue;
  }
  return randomUUID();
}

export interface BuildAppOptions {
  /** Where log lines go. Tests pass a stream to read them back. */
  readonly logDestination?: DestinationStream;
}

// Pretty logs write synchronously in-process. A worker-thread transport could lose the
// last fatal line when the process exits straight after logging it.
async function resolveLogDestination(
  config: Config,
  explicitDestination: DestinationStream | undefined,
): Promise<DestinationStream | undefined> {
  if (explicitDestination) return explicitDestination;
  if (config.NODE_ENV !== 'development') return undefined;
  const { default: pretty } = await import('pino-pretty');
  return pretty({ sync: true });
}

export async function buildApp(
  config: Config,
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const logDestination = await resolveLogDestination(config, options.logDestination);
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: REDACTED_PATHS,
      ...(logDestination && { stream: logDestination }),
    },
    requestIdHeader: false,
    genReqId: (request) => correlationIdFrom(request.headers[CORRELATION_ID_HEADER]),
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onSend', async (request, reply) => {
    reply.header(CORRELATION_ID_HEADER, request.id);
  });
  registerErrorHandler(app);

  if (config.NODE_ENV === 'development') {
    await app.register(swagger, {
      openapi: { info: { title: 'PM Tool API', version: '0.0.0' } },
      transform: jsonSchemaTransform,
    });
    await app.register(scalar, { routePrefix: '/docs' });
  }

  await app.register(healthRoutes);
  await app.register(projectsRoutes, { prefix: '/projects', projectsFile: config.PROJECTS_FILE });
  return app;
}
