import type { ToolDefinition } from '../definition.js';

const pad = (value: number): string => value.toString().padStart(2, '0');

/**
 * Formats a date as YYYY-MM-DD using local time.
 */
const formatDate = (value: Date): string =>
  `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;

/**
 * Formats a time as HH:MM:SS using local time.
 */
const formatTime = (value: Date): string =>
  `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;

/**
 * Returns the local time in HH:MM:SS format.
 */
export const TIME_TOOL: ToolDefinition<Record<string, never>, string> = {
  name: 'time',
  description: 'Returns the current local time as HH:MM:SS.',
  schema: {},
  execute: () => formatTime(new Date()),
};

/**
 * Returns the local date in YYYY-MM-DD format.
 */
export const DATE_TOOL: ToolDefinition<Record<string, never>, string> = {
  name: 'date',
  description: 'Returns the current local date as YYYY-MM-DD.',
  schema: {},
  execute: () => formatDate(new Date()),
};

/**
 * Returns the local weekday name.
 */
export const WEEKDAY_TOOL: ToolDefinition<Record<string, never>, string> = {
  name: 'weekday',
  description: 'Returns the current local weekday name.',
  schema: {},
  execute: () =>
    new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date()),
};
