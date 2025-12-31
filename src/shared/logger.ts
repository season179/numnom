/**
 * Custom logger with log levels and context prefixes
 * Log level is configured at build time via Bun's --define flag
 */

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';
export type LogContext = 'content' | 'popup' | 'background';

const LEVELS = { silent: -1, error: 0, warn: 1, info: 2, debug: 3 } as const;

// Build-time constant - replaced by Bun's --define flag
declare const __LOG_LEVEL__: LogLevel;
const CURRENT = typeof __LOG_LEVEL__ !== 'undefined' ? __LOG_LEVEL__ : 'debug';

function formatData(data: unknown): string {
  if (data === undefined) return '';
  if (data instanceof Error) return ` ${data.message}`;
  if (typeof data === 'object' && data !== null) {
    try {
      return ` ${JSON.stringify(data)}`;
    } catch {
      return ' [Object]';
    }
  }
  return ` ${String(data)}`;
}

export interface Logger {
  error(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  debug(msg: string, data?: unknown): void;
}

export function createLogger(context: LogContext): Logger {
  const p = `[${context}]`;
  return {
    error: (msg, data) => {
      if (LEVELS[CURRENT] >= LEVELS.error) {
        console.error(`${p} ERROR: ${msg}${formatData(data)}`);
      }
    },
    warn: (msg, data) => {
      if (LEVELS[CURRENT] >= LEVELS.warn) {
        console.warn(`${p} WARN: ${msg}${formatData(data)}`);
      }
    },
    info: (msg, data) => {
      if (LEVELS[CURRENT] >= LEVELS.info) {
        console.log(`${p} INFO: ${msg}${formatData(data)}`);
      }
    },
    debug: (msg, data) => {
      if (LEVELS[CURRENT] >= LEVELS.debug) {
        console.log(`${p} DEBUG: ${msg}${formatData(data)}`);
      }
    },
  };
}
