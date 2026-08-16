import { Logger } from '@nestjs/common';
import IORedis from 'ioredis';

const logger = new Logger('Redis');

const timedOut = 'ETIMEDOUT';

/* TLS is not set here on purpose — it is inferred from a `rediss://` url, so
   the deployed Upstash connection gets it and a local `redis://` docker
   container does not. Forcing it would break local development. */
const connectionOptions = {
  /* BullMQ workers issue blocking reads, which ioredis would otherwise abort
     after its default retry limit. Required by BullMQ, and harmless for the
     plain key/value client. */
  maxRetriesPerRequest: null,

  /* Upstash closes connections that have been idle, and this machine suspends
     between renders — so the first command after a wake often lands on a dead
     socket. Reconnecting on that specific error turns a fatal read timeout
     into a retry. */
  reconnectOnError: (error: Error): boolean => error.message.includes(timedOut),

  /* Upstash's proxy does not answer the INFO command ioredis uses to decide a
     connection is ready, which otherwise delays every reconnect. */
  enableReadyCheck: false,
} as const;

/* ioredis emits `error` on every connection blip. With no listener attached,
   Node reports it as an unhandled error event and the process becomes
   unstable — even though ioredis is already reconnecting on its own. */
const createConnection = (url: string): IORedis => {
  const client = new IORedis(url, connectionOptions);

  client.on('error', ({ message }: Error) => logger.warn(message));

  return client;
};

export { createConnection, connectionOptions, timedOut };
