import pino from "pino";

export type Logger = pino.Logger;

export function createLogger(
  level: string,
  destination?: pino.DestinationStream,
): Logger {
  return pino(
    {
      level,
      redact: [
        "*.authorization",
        "*.apiKey",
        "*.password",
        "*.token",
        "*.cookie",
        "req.headers.cookie",
        "req.headers.authorization",
        'req.headers["x-csrf-token"]',
      ],
    },
    destination,
  );
}

const MAX_LOG_MESSAGE = 500;

export function sanitizeLogMessage(
  msg: string,
  secrets: string[] = [],
): string {
  let out = msg;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join("[redacted]");
  }
  out = out
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/\bsk-ant-[A-Za-z0-9_-]+/g, "[redacted]");
  return out.length > MAX_LOG_MESSAGE
    ? `${out.slice(0, MAX_LOG_MESSAGE)}…`
    : out;
}
