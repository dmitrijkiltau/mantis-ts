import type { ToolDefinition } from '../definition.js';

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
};

type FetchToolResult = {
  url: string;
  finalUrl: string;
  method: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  contentType: string | null;
  content: string;
  bytesRead: number;
  totalBytes: number;
  truncated: boolean;
  redirected: boolean;
};

/* ------------------------------------------------------------------------- *
 * CONSTANTS
 * ------------------------------------------------------------------------- */

const DEFAULT_MAX_BYTES = 150_000;
const MAX_ALLOWED_BYTES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
const SUPPORTED_METHODS = new Set([
  //'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  //'PATCH',
  //'POST',
  //'PUT',
]);
const BODYLESS_METHODS = new Set(['GET', 'HEAD']);

/* ------------------------------------------------------------------------- *
 * HELPERS
 * ------------------------------------------------------------------------- */

const clampPositiveInteger = (
  value: number | null | undefined,
  fallback: number,
  max: number,
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(value), max);
};

const ensureHttpUrl = (raw: string): string => {
  const candidate = raw.trim();
  if (!candidate) {
    throw new Error('Request URL is required.');
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`Invalid URL "${candidate}".`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// or https:// URLs are supported.');
  }

  return parsed.toString();
};

const normalizeMethod = (raw: string | null): string => {
  const candidate = raw?.trim() ?? '';
  if (!candidate) {
    return 'GET';
  }

  const normalized = candidate.toUpperCase();
  if (!SUPPORTED_METHODS.has(normalized)) {
    throw new Error(
      `Unsupported HTTP method "${candidate}". Supported methods: ${Array.from(
        SUPPORTED_METHODS,
      ).join(', ')}.`,
    );
  }

  return normalized;
};

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

  const url = new URL(baseUrl);
  const seen = new Map<string, string[]>();

  for (let index = 0; index < entries.length; index += 1) {
    const [key, value] = entries[index];
    const existing = seen.get(key) ?? [];
    existing.push(value);
    seen.set(key, existing);
  }

  const overrideKeys = Array.from(seen.keys());
  for (let index = 0; index < overrideKeys.length; index += 1) {
    url.searchParams.delete(overrideKeys[index]);
  }

  for (const [key, values] of seen.entries()) {
    for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
      url.searchParams.append(key, values[valueIndex]);
    }
  }

  return url.toString();
};

const buildRequestBody = (
  method: string,
  rawBody: string | null,
): string | undefined => {
  if (rawBody === null) {
    return undefined;
  }

  if (BODYLESS_METHODS.has(method)) {
    throw new Error(`HTTP method ${method} cannot send a request body.`);
  }

  return rawBody;
};

const readResponseContent = async (
  response: Response,
  byteLimit: number,
): Promise<{
  content: string;
  bytesRead: number;
  totalBytes: number;
  truncated: boolean;
}> => {
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const totalBytes = bytes.length;
  const truncated = totalBytes > byteLimit;
  const view = truncated ? bytes.subarray(0, byteLimit) : bytes;
  const decoder = new TextDecoder();
  const content = decoder.decode(view);

  return {
    content,
    bytesRead: view.byteLength,
    totalBytes,
    truncated,
  };
};

/* ------------------------------------------------------------------------- *
 * TOOL DEFINITION
 * ------------------------------------------------------------------------- */

export const FETCH_TOOL: ToolDefinition<FetchToolArgs, FetchToolResult> = {
  name: 'fetch',
  description:
    'Fetch HTTP(S) endpoints. Supply an absolute URL, optional method (default GET), headers as a JSON object string, an optional body for non-GET/HEAD requests, and optional limits (timeout/ms, maxBytes). Use `queryParams` to append a JSON map or raw query string to the URL. Returns status metadata and a truncated text representation of the response.',
  schema: {
    url: 'string',
    method: 'string|null',
    headers: 'string|null',
  body: 'string|null',
  queryParams: 'string|null',
  maxBytes: 'number|null',
  timeoutMs: 'number|null',
},
  async execute(args) {
    const baseUrl = ensureHttpUrl(args.url);
    const targetUrl = applyQueryParams(baseUrl, args.queryParams);
    const method = normalizeMethod(args.method);
    const headers = parseHeaders(args.headers);
    const body = buildRequestBody(method, args.body);
    const maxBytes = clampPositiveInteger(args.maxBytes, DEFAULT_MAX_BYTES, MAX_ALLOWED_BYTES);
    const timeoutMs = clampPositiveInteger(args.timeoutMs, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(targetUrl, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      const { content, bytesRead, totalBytes, truncated } = await readResponseContent(
        response,
        maxBytes,
      );

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        url: targetUrl,
        finalUrl: response.url,
        method,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        contentType: response.headers.get('content-type'),
        content,
        bytesRead,
        totalBytes,
        truncated,
        redirected: response.redirected,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request to ${targetUrl} timed out after ${timeoutMs}ms.`);
      }
      throw new Error(`HTTP request failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }
  },
};
