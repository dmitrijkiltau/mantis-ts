/**
 * Minimal logging utility for tracking assistant operations with colored output.
 * Logs are sent to console which Tauri captures in the terminal.
 */

import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  stage: string;
  message: string;
  data?: unknown;
}

const logs: LogEntry[] = [];
const maxLogs = 1000;

/**
 * Format a log message with colors based on level
 */
function formatLogMessage(
  level: LogLevel,
  stage: string,
  message: string,
): string {
  const timestamp = chalk.gray(new Date().toISOString());

  let levelColor: (text: string) => string;
  switch (level) {
    case 'debug':
      levelColor = chalk.blue;
      break;
    case 'info':
      levelColor = chalk.green;
      break;
    case 'warn':
      levelColor = chalk.yellow;
      break;
    case 'error':
      levelColor = chalk.red;
      break;
  }

  const stageFormatted = chalk.cyan(`[${stage}]`);
  const levelFormatted = levelColor(`[${level.toUpperCase()}]`);

  return `${timestamp} ${stageFormatted} ${levelFormatted} ${message}`;
}

/**
 * Log a message at the specified level
 */
export function log(
  level: LogLevel,
  stage: string,
  message: string,
  data?: unknown,
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    stage,
    message,
    data,
  };

  logs.push(entry);
  if (logs.length > maxLogs) {
    logs.shift();
  }

  const formattedMessage = formatLogMessage(level, stage, message);
  const logFn = console[level] || console.log;

  if (data !== undefined) {
    logFn(formattedMessage, data);
  } else {
    logFn(formattedMessage);
  }
}

export const Logger = {
  debug: (stage: string, message: string, data?: unknown) =>
    log('debug', stage, message, data),
  info: (stage: string, message: string, data?: unknown) =>
    log('info', stage, message, data),
  warn: (stage: string, message: string, data?: unknown) =>
    log('warn', stage, message, data),
  error: (stage: string, message: string, data?: unknown) =>
    log('error', stage, message, data),
};

/**
 * Get all logged entries (useful for debugging)
 */
export function getLogs(): LogEntry[] {
  return [...logs];
}

/**
 * Clear all logs
 */
export function clearLogs(): void {
  logs.length = 0;
}
