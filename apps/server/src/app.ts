import { randomUUID } from 'node:crypto';
import swagger from '@fastify/swagger';
import scalar from '@scalar/fastify-api-reference';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { healthRoutes } from './features/health/health.routes.js';
import type { Config } from './shared/config.js';
import { registerErrorHandler } from './shared/errors.js';

const CORRELATION_ID_HEADER = 'x-correlation-id';
const REDACTED_PATHS = ['req.headers.authorization', 'req.headers.cookie'];
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

function buildLoggerOptions(config: Config) {
  return {
    level: config.LOG_LEVEL,
    redact: REDACTED_PATHS,
    ...(config.NODE_ENV === 'development' && { transport: { target: 'pino-pretty' } }),
  };
}

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: buildLoggerOptions(config),
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
  return app;
}
