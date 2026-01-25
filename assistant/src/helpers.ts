import chalk from 'chalk';
import type { LogLevel } from './types.js';

/**
 * Converts an array of strings into a markdown unordered list.
 */
export const toUnorderedList = (items: string[]): string => {
  return items.map((item) => `- ${item}`).join('\n');
};

/**
 * Renders a template using `{{PLACEHOLDER}}` syntax and returns the interpolated text.
 *
 * Special handling: when the `QUESTION` or `RESPONSE` placeholder contains JSON (e.g. tool outputs),
 * it is converted to a compact YAML-like representation to reduce token usage.
 */
const isPlainObject = (v: unknown): v is Record<string, unknown> => (
  v !== null && typeof v === 'object' && !Array.isArray(v)
);

const escapeScalar = (v: string): string => {
  // Keep it compact: avoid quotes where possible. If the string contains a newline,
  // represent it as a block scalar for readability; otherwise return as-is.
  if (/\n/.test(v)) {
    const lines = v.split(/\r?\n/).map((ln) => ln.trimEnd());
    return `|\n${lines.map((ln) => `  ${ln}`).join('\n')}`;
  }
  return v;
};

const jsonToYamlCompact = (value: unknown, indent = 0): string => {
  const indentStr = ' '.repeat(indent);

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return escapeScalar(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    // If all scalars, render in-line to save tokens: [a, b, c]
    if (value.every((v) => ['string', 'number', 'boolean'].includes(typeof v) || v === null)) {
      const items = value.map((v) => (v === null ? 'null' : typeof v === 'string' ? escapeScalar(String(v)) : String(v)));
      return `[${items.join(', ')}]`;
    }

    // Complex arrays: build dash items and normalize indentation so that nested lines align nicely.
    return value.map((item) => {
      const block = jsonToYamlCompact(item, indent + 2);
      const lines = block.split(/\r?\n/);
      const first = lines[0]!.trimStart();
      const rest = lines.slice(1).map((ln) => ' '.repeat(indent + 2) + ln);
      return `${indentStr}- ${first}${rest.length ? '\n' + rest.join('\n') : ''}`;
    }).join('\n');
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    return entries.map(([k, v]) => {
      if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
        const scalar = v === null ? 'null' : typeof v === 'string' ? escapeScalar(String(v)) : String(v);
        return `${indentStr}${k}: ${scalar}`;
      }

      // Inline arrays of scalars when possible to reduce tokens: `key: [a, b]`
      if (Array.isArray(v) && v.every((it) => ['string', 'number', 'boolean'].includes(typeof it) || it === null)) {
        const arrItems = v.map((it) => (it === null ? 'null' : typeof it === 'string' ? escapeScalar(String(it)) : String(it)));
        return `${indentStr}${k}: [${arrItems.join(', ')}]`;
      }

      // nested structure (objects or complex arrays)
      return `${indentStr}${k}:\n${jsonToYamlCompact(v, indent + 2)}`;
    }).join('\n');
  }

  // Fallback: stringify
  try {
    return String(value);
  } catch {
    return '';
  }
};

export const renderTemplate = (template: string, context: Record<string, string> = {}): string => {
  return template.replace(/{{\s*([A-Z0-9_]+)\s*}}/g, (_, key) => {
    const raw = context[key];

    if ((key === 'QUESTION' || key === 'RESPONSE') && typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return '';

      // Try parsing JSON; if successful, convert to compact YAML-like text
      try {
        const parsed = JSON.parse(trimmed);
        return jsonToYamlCompact(parsed);
      } catch {
        // Not JSON: return as-is
        return raw;
      }
    }

    return raw ?? '';
  });
};

/**
 * Helper to measure execution duration in milliseconds.
 */
export function measureDurationMs(startMs: number): number {
  return Math.round((Date.now() - startMs) * 100) / 100;
}

/**
 * Create a standard AbortError instance used by the runner.
 */
export const createAbortError = (): Error => {
  const error = new Error('Contract execution aborted');
  error.name = 'AbortError';
  return error;
};

/**
 * Throws an AbortError if the given AbortSignal has been aborted.
 */
export const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw createAbortError();
};

/**
 * Format a log message with colors based on level
 */
export function formatLogMessage(
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
 * Type-guard for AbortError instances.
 */
export const isAbortError = (error: unknown): error is Error => (
  typeof error === 'object'
  && error !== null
  && error instanceof Error
  && error.name === 'AbortError'
);

/**
 * Strip wrapping quotes (single, double, backticks) from a string, if present.
 */
export const stripWrappingQuotes = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  const isWrapped =
    (first === '"' && last === '"') ||
    (first === "'" && last === "'") ||
    (first === '`' && last === '`');
  if (!isWrapped) return trimmed;
  return trimmed.slice(1, -1).trim();
};

/**
 * Heuristic to determine whether a string looks like a file path.
 */
export const looksLikePath = (candidate: string): boolean => {
  if (!candidate) return false;
  if (/^https?:\/\//i.test(candidate)) return false;
  if (candidate.includes('\\') || candidate.includes('/')) return true;
  if (/^[A-Za-z]:/.test(candidate)) return true;
  if (candidate.startsWith('.')) return true;
  return candidate.includes('.');
};

/**
 * Lightweight HTTP URL validator.
 */
export const isHttpUrl = (candidate: string): boolean => {
  if (!candidate) return false;
  const value = candidate.trim();
  if (!value) return false;
  const tryParse = (raw: string): URL | null => {
    try {
      return new URL(raw);
    } catch {
      return null;
    }
  };

  const hasScheme = /^[a-zA-Z][a-zA-Z\d+-.]*:/.test(value);
  let parsed = tryParse(value);
  if (!parsed && !hasScheme) {
    parsed = tryParse(`http://${value}`);
  }
  if (!parsed) return false;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname;
  if (!host) return false;
  if (host === 'localhost') return true;
  return host.includes('.') || host.includes(':');
};

/**
 * Extract a path-like token from a user input string, if present.
 */
export const extractPathCandidate = (userInput: string): string | null => {
  const tokens = userInput.split(/\s+/);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = stripWrappingQuotes(tokens[index]!);
    if (looksLikePath(token)) {
      return token;
    }
  }
  return null;
};

/**
 * Narrow an arbitrary value into a trimmed string or return empty string.
 */
export const toTrimmedString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Returns true if the path is absolute for Windows or POSIX.
 */
export const isAbsolutePath = (value: string): boolean => {
  if (!value) return false;
  if (value.startsWith('/') || value.startsWith('\\')) return true;
  return /^[A-Za-z]:[\\/]/.test(value);
};

/**
 * Normalize a path value by normalizing separators and trimming.
 */
export const normalizePathValue = (value: string): string => {
  const trimmed = value.trim();
  const normalized = trimmed.replace(/[\\]+/g, '/');
  return normalized.replace(/\/+/g, '/').replace(/\/+$/, '');
};

/**
 * Join base and relative paths using normalized separators.
 */
export const joinPaths = (basePath: string, relativePath: string): string => {
  const base = normalizePathValue(basePath);
  const relative = normalizePathValue(relativePath).replace(/^\/+/, '');
  if (!base) return relative;
  if (!relative) return base;
  return `${base}/${relative}`;
};

/**
 * Strip leading separators from a path segment.
 */
export const stripLeadingSeparators = (value: string): string => value.replace(/^[\\/]+/, '');

/**
 * Normalize a path for case-insensitive comparisons.
 */
export const normalizePathForCompare = (value: string): string => {
  const normalized = normalizePathValue(value);
  if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith('//')) {
    return normalized.toLowerCase();
  }
  return normalized;
};

/**
 * Returns true if the path is within the base directory.
 */
export const pathStartsWith = (pathValue: string, basePath: string): boolean => {
  const normalizedPath = normalizePathForCompare(pathValue);
  const normalizedBase = normalizePathForCompare(basePath);
  if (!normalizedBase) return false;
  return normalizedPath === normalizedBase || normalizedPath.startsWith(`${normalizedBase}/`);
};

/**
 * Computes a relative path from base to target.
 */
export const relativePath = (pathValue: string, basePath: string): string => {
  const normalizedPath = normalizePathValue(pathValue);
  const normalizedBase = normalizePathValue(basePath);
  if (!pathStartsWith(normalizedPath, normalizedBase)) return pathValue;
  return normalizedPath.slice(normalizedBase.length).replace(/^\/+/, '');
};

/**
 * Returns true if all entries of an object are strictly null.
 */
export const areAllArgumentsNull = (args: Record<string, unknown>): boolean => {
  const values = Object.values(args);
  if (values.length === 0) return true;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== null && values[index] !== undefined) return false;
  }
  return true;
};

/**
 * Small wrapper for creating a Pipeline-style error object.
 */
export const buildToolError = (error?: unknown): { code: string; message: string } => {
  const message = error instanceof Error ? error.message : error ? String(error) : 'Tool execution failed.';
  return { code: 'tool_error', message };
};

/**
 * Serializes tool output into a string for summarization prompts.
 */
export const stringifyToolResult = (toolResult: unknown): string => {
  try {
    return JSON.stringify(toolResult, null, 2);
  } catch {
    return String(toolResult);
  }
};

/**
 * Normalize image attachments (filter invalid and trim fields).
 */
export const normalizeImageAttachments = (attachments?: Array<{
  id?: unknown;
  name?: unknown;
  mimeType?: unknown;
  data?: unknown;
  source?: unknown;
}>): Array<{ id: string; name: string; mimeType: string; data: string; source: 'upload' | 'drop' | 'screenshot' }> => {
  if (!attachments || attachments.length === 0) return [];
  const normalized: Array<{ id: string; name: string; mimeType: string; data: string; source: 'upload' | 'drop' | 'screenshot' }> = [];
  for (let index = 0; index < attachments.length; index += 1) {
    const a = attachments[index] as Record<string, unknown>;
    if (!a || typeof a !== 'object') continue;
    const id = typeof a.id === 'string' ? a.id.trim() : '';
    const name = typeof a.name === 'string' ? a.name.trim() : '';
    const mimeType = typeof a.mimeType === 'string' ? a.mimeType.trim() : '';
    const data = typeof a.data === 'string' ? a.data.trim() : '';
    const source = a.source === 'upload' || a.source === 'drop' || a.source === 'screenshot' ? a.source : 'upload';
    if (!id || !data) continue;
    normalized.push({ id, name, mimeType, data, source });
  }
  return normalized;
};

/**
 * Parse a direct filesystem command like "read \"C:\\file.txt\"" or "list /some/path"
 */
export const parseDirectFilesystemCommand = (input: string): { action: string; path: string } | null => {
  const match = /^(read|list)\s+(.+)$/i.exec(input);
  if (!match) return null;
  const actionToken = match[1];
  const pathToken = match[2];
  if (!actionToken || !pathToken) return null;
  const action = actionToken.toLowerCase();
  const path = stripWrappingQuotes(pathToken);
  if (!path || !looksLikePath(path)) return null;
  return { action, path };
};

/**
 * Parse a direct process command like "ps" or "ps chrome"
 */
export const parseDirectProcessCommand = (input: string): { filter?: string } | null => {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;
  const psWithFilter = /^(?:ps|processes)\s+(.+)$/.exec(normalized);
  if (psWithFilter) {
    return { filter: psWithFilter[1] };
  }
  if (normalized === 'ps' || normalized === 'processes' || normalized === 'list processes') {
    return { filter: undefined };
  }
  return null;
};

/**
 * Parse a direct HTTP command like "get https://example.com"
 */
export const parseDirectHttpCommand = (input: string): { url: string } | null => {
  const match = /^(get|fetch)\s+(.+)$/i.exec(input);
  if (!match) return null;
  const urlToken = match[2];
  if (!urlToken) return null;
  const url = stripWrappingQuotes(urlToken);
  if (!url || !isHttpUrl(url)) return null;
  return { url };
};

/**
 * High-level parser that detects direct tool requests and returns a small descriptor.
 */
import type { ToolName } from './tools/registry.js';

export const parseDirectToolRequest = (userInput: string): { tool: ToolName; args: Record<string, unknown>; reason: string } | null => {
  const trimmed = userInput.trim();
  if (!trimmed) return null;
  if (trimmed.includes('\n')) return null;
  const filesystem = parseDirectFilesystemCommand(trimmed);
  if (filesystem) {
    return { tool: 'filesystem', args: { action: filesystem.action, path: filesystem.path }, reason: `direct_${filesystem.action}_filesystem` };
  }
  const process = parseDirectProcessCommand(trimmed);
  if (process) {
    return { tool: 'process', args: { action: 'list', query: process.filter ?? null, limit: null }, reason: process.filter ? 'direct_process_with_filter' : 'direct_process' };
  }
  const http = parseDirectHttpCommand(trimmed);
  if (http) {
    return { tool: 'http', args: { url: http.url, method: 'GET', headers: null, body: null, queryParams: null, maxBytes: null, timeoutMs: null }, reason: 'direct_get_http' };
  }
  return null;
};

