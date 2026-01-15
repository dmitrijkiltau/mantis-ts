import type { ToolDefinition } from '../definition.js';

type DateTimeKind = 'date' | 'time' | 'weekday' | 'datetime';

type DateTimeArgs = {
  /**
   * Desired output type. Defaults to "time" when omitted.
   */
  kind: DateTimeKind | null;
  /**
   * Optional IANA timezone (e.g., "UTC", "America/New_York"). Falls back to local time.
   */
  timezone: string | null;
  /**
   * Optional format hint. Currently supports "iso" for full ISO datetime when kind = "datetime".
   */
  format: string | null;
};

const pad = (value: number): string => value.toString().padStart(2, '0');

const safeDate = (timezone: string | null): Date => {
  if (!timezone) {
    return new Date();
  }

  // Validate timezone; fallback to local on failure.
  try {
    // Using Intl.DateTimeFormat as a guard; it will throw on invalid timezones.
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  } catch {
    return new Date();
  }
};

const formatDate = (value: Date): string =>
  `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;

const formatTime = (value: Date): string =>
  `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;

const formatWeekday = (value: Date): string =>
  new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(value);

const formatDateTime = (value: Date, formatHint: string | null): string => {
  if (formatHint && formatHint.toLowerCase() === 'iso') {
    return value.toISOString();
  }

  return `${formatDate(value)} ${formatTime(value)}`;
};

const resolveKind = (kind: DateTimeArgs['kind']): DateTimeKind => {
  if (kind === 'date' || kind === 'time' || kind === 'weekday' || kind === 'datetime') {
    return kind;
  }
  return 'time';
};

/**
 * Combined datetime tool that returns date, time, weekday, or full datetime.
 */
export const DATETIME_TOOL: ToolDefinition<DateTimeArgs, string> = {
  name: 'datetime',
  description:
    'Returns the current date, time, weekday, or full datetime. Optional IANA timezone (e.g., "UTC").',
  schema: {
    kind: 'string|null',
    timezone: 'string|null',
    format: 'string|null',
  },
  execute: (args) => {
    const kind = resolveKind(args.kind);
    const now = safeDate(args.timezone);

    switch (kind) {
      case 'date':
        return formatDate(now);
      case 'weekday':
        return formatWeekday(now);
      case 'datetime':
        return formatDateTime(now, args.format);
      case 'time':
      default:
        return formatTime(now);
    }
  },
};
