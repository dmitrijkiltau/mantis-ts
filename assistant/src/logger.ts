/**
 * Minimal logging utility for tracking assistant operations with colored output.
 * Logs are sent to console which Tauri captures in the terminal.
 * Optimized for minimal storage overhead with configurable retention.
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

const logLevels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
const logs: LogEntry[] = [];
let maxLogs = 1000;
let minLogLevelIndex = 0; // 0=debug, 1=info, 2=warn, 3=error
let consoleMinLogLevelIndex = logLevels.indexOf('info');

/**
 * Format a log message with colors based on level
 */
function formatLogMessage(
  level: LogLevel,
  stage: string,
  message: string,
  timestamp: string,
): string {
  const timestampFormatted = chalk.gray(timestamp);

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

  return `${timestampFormatted} ${stageFormatted} ${levelFormatted} ${message}`;
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
  const rawLevelIndex = logLevels.indexOf(level);
  const levelIndex = rawLevelIndex === -1 ? 0 : rawLevelIndex;
  const timestamp = new Date().toISOString();

  // Store to history only if meets minimum level threshold
  if (levelIndex >= minLogLevelIndex) {
    const entry: LogEntry = {
      timestamp,
      level,
      stage,
      message,
      data,
    };

    logs.push(entry);
    // Efficient circular buffer: shift oldest when limit reached
    if (logs.length > maxLogs) {
      logs.shift();
    }
  }

  if (levelIndex < consoleMinLogLevelIndex) {
    return;
  }

  const formattedMessage = formatLogMessage(level, stage, message, timestamp);
  const logFn = console[level] || console.log;

  if (data !== undefined) {
    logFn(formattedMessage, data);
  } else {
    logFn(formattedMessage);
  }
}

/**
 * Set the minimum log level to store in history (console output always shows all levels)
 * Levels: 'debug' < 'info' < 'warn' < 'error'
 */
export function setMinLogLevel(level: LogLevel): void {
  const index = logLevels.indexOf(level);
  if (index !== -1) {
    minLogLevelIndex = index;
  }
}

/**
 * Configure logger settings for memory optimization
 */
export function configureLogger(options: {
  maxHistorySize?: number;
  minLevel?: LogLevel;
  consoleLevel?: LogLevel;
} = {}): void {
  if (options.maxHistorySize !== undefined && options.maxHistorySize > 0) {
    maxLogs = options.maxHistorySize;
    while (logs.length > maxLogs) {
      logs.shift();
    }
  }
  if (options.minLevel !== undefined) {
    setMinLogLevel(options.minLevel);
  }
  if (options.consoleLevel !== undefined) {
    setConsoleLogLevel(options.consoleLevel);
  }
}

/**
 * Adjust the minimum log level printed to the console.
 */
export function setConsoleLogLevel(level: LogLevel): void {
  const index = logLevels.indexOf(level);
  if (index !== -1) {
    consoleMinLogLevelIndex = index;
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
