import type { FastifyInstance } from 'fastify';

export const SHUTDOWN_TIMEOUT_MS = 10_000;

const EXIT_OK = 0;
const EXIT_FAILURE = 1;

interface ProcessEvents {
  on(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown;
  on(event: 'uncaughtException', listener: (error: Error) => void): unknown;
}

interface ProcessHandlerOptions {
  readonly app: Pick<FastifyInstance, 'log' | 'close'>;
  readonly processEvents?: ProcessEvents;
  readonly exit?: (code: number) => void;
  readonly timeoutMs?: number;
}

export function installProcessHandlers({
  app,
  processEvents = process,
  exit = (code) => process.exit(code),
  timeoutMs = SHUTDOWN_TIMEOUT_MS,
}: ProcessHandlerOptions): void {
  let isShuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (isShuttingDown) {
      app.log.warn({ signal }, 'shutdown already in progress');
      return;
    }
    isShuttingDown = true;
    app.log.info({ signal }, 'shutting down');

    const forceExit = setTimeout(() => {
      app.log.fatal({ timeoutMs }, 'shutdown timed out');
      exit(EXIT_FAILURE);
    }, timeoutMs);
    forceExit.unref();

    try {
      await app.close();
      clearTimeout(forceExit);
      exit(EXIT_OK);
    } catch (error) {
      clearTimeout(forceExit);
      app.log.error({ err: error }, 'shutdown failed');
      exit(EXIT_FAILURE);
    }
  }

  processEvents.on('SIGINT', () => void shutdown('SIGINT'));
  processEvents.on('SIGTERM', () => void shutdown('SIGTERM'));
  processEvents.on('unhandledRejection', (reason) => {
    app.log.fatal({ err: reason }, 'unhandled rejection');
    exit(EXIT_FAILURE);
  });
  processEvents.on('uncaughtException', (error) => {
    app.log.fatal({ err: error }, 'uncaught exception');
    exit(EXIT_FAILURE);
  });
}
