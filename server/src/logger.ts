export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

let currentLevel: LogLevel = LogLevel.INFO;

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function formatTime(): string {
  return new Date().toISOString().slice(11, 23);
}

export const logger = {
  debug(message: string, ...args: unknown[]): void {
    if (currentLevel <= LogLevel.DEBUG) {
      console.log(`[${formatTime()}] [DEBUG] ${message}`, ...args);
    }
  },

  info(message: string, ...args: unknown[]): void {
    if (currentLevel <= LogLevel.INFO) {
      console.log(`[${formatTime()}] [INFO]  ${message}`, ...args);
    }
  },

  warn(message: string, ...args: unknown[]): void {
    if (currentLevel <= LogLevel.WARN) {
      console.warn(`[${formatTime()}] [WARN]  ${message}`, ...args);
    }
  },

  error(message: string, ...args: unknown[]): void {
    if (currentLevel <= LogLevel.ERROR) {
      console.error(`[${formatTime()}] [ERROR] ${message}`, ...args);
    }
  },
};
