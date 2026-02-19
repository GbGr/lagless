export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
  Silent = 4,
}

export interface LogSink {
  debug(tag: string, message: string, ...args: unknown[]): void;
  info(tag: string, message: string, ...args: unknown[]): void;
  warn(tag: string, message: string, ...args: unknown[]): void;
  error(tag: string, message: string, ...args: unknown[]): void;
}

const consoleSink: LogSink = {
  debug: (tag, msg, ...args) => console.debug(`[${tag}]`, msg, ...args),
  info: (tag, msg, ...args) => console.log(`[${tag}]`, msg, ...args),
  warn: (tag, msg, ...args) => console.warn(`[${tag}]`, msg, ...args),
  error: (tag, msg, ...args) => console.error(`[${tag}]`, msg, ...args),
};

let globalLevel: LogLevel = LogLevel.Info;
let globalSink: LogSink = consoleSink;

export function setLogLevel(level: LogLevel): void {
  globalLevel = level;
}

export function getLogLevel(): LogLevel {
  return globalLevel;
}

export function setLogSink(sink: LogSink): void {
  globalSink = sink;
}

export function createLogger(tag: string) {
  return {
    debug(message: string, ...args: unknown[]): void {
      if (globalLevel <= LogLevel.Debug) globalSink.debug(tag, message, ...args);
    },
    info(message: string, ...args: unknown[]): void {
      if (globalLevel <= LogLevel.Info) globalSink.info(tag, message, ...args);
    },
    warn(message: string, ...args: unknown[]): void {
      if (globalLevel <= LogLevel.Warn) globalSink.warn(tag, message, ...args);
    },
    error(message: string, ...args: unknown[]): void {
      if (globalLevel <= LogLevel.Error) globalSink.error(tag, message, ...args);
    },
  };
}
