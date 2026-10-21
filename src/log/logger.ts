import pino from 'pino';

export type Logger = pino.Logger;

export function createLogger(level: string): Logger {
  return pino({
    level,
    redact: [
      '*.authorization',
      '*.apiKey',
      '*.password',
      '*.token',
      '*.cookie',
      'req.headers.cookie',
      'req.headers.authorization',
      'req.headers["x-csrf-token"]',
    ],
  });
}

export function sanitizeLogMessage(_msg: string, _secrets?: string[]): string {
  throw new Error('not implemented');
}
