import { STATUS_CODES } from 'node:http';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export interface FieldError {
  readonly field: string;
  readonly message: string;
}

export interface ProblemBody {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly correlationId: string;
  readonly errors?: readonly FieldError[];
}

/** An expected failure. Features subclass this for not found, conflict and rule violations. */
export class ProblemError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    detail?: string,
  ) {
    super(detail ?? title);
    this.name = 'ProblemError';
  }
}

type ProblemDetails = Omit<ProblemBody, 'type' | 'correlationId'>;

function sendProblem(reply: FastifyReply, request: FastifyRequest, problem: ProblemDetails) {
  const body: ProblemBody = { type: 'about:blank', correlationId: request.id, ...problem };
  return reply.status(problem.status).type(PROBLEM_CONTENT_TYPE).send(body);
}

const FIRST_CLIENT_ERROR_STATUS = 400;
const LAST_CLIENT_ERROR_STATUS = 499;

function isClientError(error: FastifyError): error is FastifyError & { statusCode: number } {
  return (
    error.statusCode !== undefined &&
    error.statusCode >= FIRST_CLIENT_ERROR_STATUS &&
    error.statusCode <= LAST_CLIENT_ERROR_STATUS
  );
}

function toFieldErrors(error: FastifyError): FieldError[] {
  if (!hasZodFastifySchemaValidationErrors(error)) return [];
  return error.validation.map((issue) => ({
    field: issue.instancePath.replace(/^\//, '').replaceAll('/', '.'),
    message: issue.message ?? 'Invalid value',
  }));
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | ProblemError, request, reply) => {
    if (error instanceof ProblemError) {
      request.log.warn({ status: error.status, reason: error.message }, 'request rejected');
      return sendProblem(reply, request, {
        title: error.title,
        status: error.status,
        detail: error.message,
      });
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      const errors = toFieldErrors(error);
      request.log.warn({ errors }, 'request validation failed');
      return sendProblem(reply, request, { title: 'Invalid request', status: 400, errors });
    }
    if (isClientError(error)) {
      request.log.warn({ status: error.statusCode, code: error.code }, 'request rejected');
      return sendProblem(reply, request, {
        title: STATUS_CODES[error.statusCode] ?? 'Bad Request',
        status: error.statusCode,
      });
    }
    request.log.error({ err: error }, 'unexpected error');
    return sendProblem(reply, request, { title: 'Internal Server Error', status: 500 });
  });

  app.setNotFoundHandler((request, reply) =>
    sendProblem(reply, request, {
      title: 'Not Found',
      status: 404,
      detail: `${request.method} ${request.url} does not exist`,
    }),
  );
}
