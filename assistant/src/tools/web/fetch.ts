import type { ToolDefinition } from '../definition.js';
import {
  applyQueryParamEntries,
  buildRequestBody,
  clampPositiveInteger,
  DEFAULT_MAX_BYTES,
  DEFAULT_TIMEOUT_MS,
  executeHttpRequest,
  MAX_ALLOWED_BYTES,
  MAX_TIMEOUT_MS,
  normalizeMethod,
  ensureHttpUrl,
} from './http-core.js';
import type { HttpResponseResult } from './http-core.js';

/* ------------------------------------------------------------------------- *
 * TYPES
 * ------------------------------------------------------------------------- */

type FetchToolArgs = {
  url: string;
  method: string | null;
  headers: string | null;
  body: string | null;
  queryParams: string | null;
  maxBytes: number | null;
  timeoutMs: number | null;
  bypassCookieNotices: boolean | null;
};

type FetchToolResult = HttpResponseResult;

const parseHeaders = (raw: string | null): Record<string, string> => {
  if (!raw?.trim()) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Headers must be valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Headers must be a JSON object mapping header names to values.');
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    result[key] = value === null ? '' : String(value);
  }

  return result;
};

const ensureSupportedQueryValue = (
  value: unknown,
): value is string | number | boolean => {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
};

const buildQueryParamEntries = (
  raw: string | null,
): Array<[string, string]> => {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed[0] === '{') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('Query parameters must be valid JSON.');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Query parameters must be a JSON object.');
    }

    const entries: Array<[string, string]> = [];
    const parsedRecord = parsed as Record<string, unknown>;

    const keys = Object.keys(parsedRecord);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (!key) {
        continue;
      }
      const value = parsedRecord[key];
      if (value === null || value === undefined) {
        continue;
      }

      if (Array.isArray(value)) {
        for (let itemIndex = 0; itemIndex < value.length; itemIndex += 1) {
          const item = value[itemIndex];
          if (!ensureSupportedQueryValue(item)) {
            throw new Error(
              `Query parameter array for "${key}" contains unsupported value.`,
            );
          }
          entries.push([key, String(item)]);
        }
        continue;
      }

      if (!ensureSupportedQueryValue(value)) {
        throw new Error(
          `Query parameter "${key}" must be a string, number, boolean, or array thereof.`,
        );
      }

      entries.push([key, String(value)]);
    }

    return entries;
  }

  const params = new URLSearchParams(trimmed.replace(/^\?/, ''));
  return Array.from(params.entries());
};

const applyQueryParams = (
  baseUrl: string,
  raw: string | null,
): string => {
  const entries = buildQueryParamEntries(raw);
  if (entries.length === 0) {
    return baseUrl;
  }

  return applyQueryParamEntries(baseUrl, entries);
};

/* ------------------------------------------------------------------------- *
 * TOOL DEFINITION
 * ------------------------------------------------------------------------- */

export const FETCH_TOOL: ToolDefinition<FetchToolArgs, FetchToolResult> = {
  name: 'fetch',
  description:
    'Simple HTTP fetch. Best for raw URL retrieval or simple GET requests. Requires manual JSON stringification for headers/body.',
  schema: {
    url: 'string',
    method: 'string|null',
    headers: 'string|null',
    body: 'string|null',
    queryParams: 'string|null',
    maxBytes: 'number|null',
    timeoutMs: 'number|null',
    bypassCookieNotices: 'boolean|null',
  },
  async execute(args) {
    const baseUrl = ensureHttpUrl(args.url);
    const targetUrl = applyQueryParams(baseUrl, args.queryParams);
    const method = normalizeMethod(args.method);
    const headers = parseHeaders(args.headers);
    const body = buildRequestBody(method, args.body);
    const maxBytes = clampPositiveInteger(args.maxBytes, DEFAULT_MAX_BYTES, MAX_ALLOWED_BYTES);
    const timeoutMs = clampPositiveInteger(args.timeoutMs, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

    return executeHttpRequest(targetUrl, {
      method,
      headers,
      body,
      maxBytes,
      timeoutMs,
      bypassCookieNotices: args.bypassCookieNotices ?? false,
    });
  },
};
