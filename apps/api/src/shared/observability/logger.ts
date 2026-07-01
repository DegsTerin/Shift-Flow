import { env } from "../config/env.js";

type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const configuredLevel = env.LOG_LEVEL as LogLevel;
const minimumLevel = levelWeight[configuredLevel] ? configuredLevel : "info";

function normalizeError(error: unknown) {
  if (!(error instanceof Error)) {
    return error;
  }

  return {
    name: error.name,
    message: error.message,
    stack: env.NODE_ENV === "production" ? undefined : error.stack
  };
}

function write(level: LogLevel, message: string, fields: LogFields = {}) {
  if (levelWeight[level] < levelWeight[minimumLevel]) {
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    service: "shiftflow-api",
    message,
    ...fields,
    error: fields.error ? normalizeError(fields.error) : undefined
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.info(line);
}

export const logger = {
  debug: (message: string, fields?: LogFields) => write("debug", message, fields),
  info: (message: string, fields?: LogFields) => write("info", message, fields),
  warn: (message: string, fields?: LogFields) => write("warn", message, fields),
  error: (message: string, fields?: LogFields) => write("error", message, fields)
};
