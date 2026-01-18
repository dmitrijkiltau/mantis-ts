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

type HttpQueryPrimitive = string | number | boolean;
type HttpQueryValue = HttpQueryPrimitive | Array<HttpQueryPrimitive>;

type HttpToolArgs = {
  url: string;
  method: string | null;
  headers: Record<string, HttpQueryPrimitive | null | undefined> | null;
  queryParams: Record<string, HttpQueryValue | null | undefined> | null;
  body: string | null;
  maxBytes: number | null;
  timeoutMs: number | null;
  bypassCookieNotices: boolean | null;
};

type HttpToolResult = HttpResponseResult;

/* ------------------------------------------------------------------------- *
 * HELPERS
 * ------------------------------------------------------------------------- */

const normalizeHeaders = (
  raw: Record<string, HttpQueryPrimitive | null | undefined> | null,
): Record<string, string> => {
  if (!raw) {
    return {};
  }

  const normalized: Record<string, string> = {};
  const keys = Object.keys(raw);

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (!key) {
      continue;
    }
    const value = raw[key];
    if (value === undefined) {
      continue;
    }
    normalized[key] = value === null ? '' : String(value);
  }

  return normalized;
};

const isQueryPrimitive = (
  value: unknown,
): value is HttpQueryPrimitive => {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
};

const buildQueryParamEntries = (
  raw: Record<string, HttpQueryValue | null | undefined> | null,
): Array<[string, string]> => {
  if (!raw) {
    return [];
  }

  const entries: Array<[string, string]> = [];
  const keys = Object.keys(raw);

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (!key) {
      continue;
    }
    const value = raw[key];
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (let itemIndex = 0; itemIndex < value.length; itemIndex += 1) {
        const item = value[itemIndex];
        if (!isQueryPrimitive(item)) {
          throw new Error(
            `Query parameter array for "${key}" contains unsupported value.`,
          );
        }
        entries.push([key, String(item)]);
      }
      continue;
    }

    if (!isQueryPrimitive(value)) {
      throw new Error(
        `Query parameter "${key}" must be a string, number, boolean, or array thereof.`,
      );
    }

    entries.push([key, String(value)]);
  }

  return entries;
};

/* ------------------------------------------------------------------------- *
 * TOOL DEFINITION
 * ------------------------------------------------------------------------- */

export const HTTP_TOOL: ToolDefinition<HttpToolArgs, HttpToolResult> = {
  name: 'http',
  description: 'HTTP client for both simple GETs and API interactions (headers, queries, JSON body). Use for all web requests.',
  schema: {
    url: 'string',
    method: 'string|null',
    headers: 'object|null',
    queryParams: 'object|null',
    body: 'string|null',
    maxBytes: 'number|null',
    timeoutMs: 'number|null',
    bypassCookieNotices: 'boolean|null',
  },
  async execute(args) {
    const baseUrl = ensureHttpUrl(args.url);
    const queryEntries = buildQueryParamEntries(args.queryParams);
    const targetUrl = applyQueryParamEntries(baseUrl, queryEntries);
    const method = normalizeMethod(args.method);
    const headers = normalizeHeaders(args.headers);
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
