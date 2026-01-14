/* ------------------------------------------------------------------------- *
 * HTTP CORE HELPERS
 * ------------------------------------------------------------------------- */

export type HttpResponseResult = {
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

export type HttpRequestOptions = {
  method: string;
  headers: Record<string, string>;
  body?: string;
  maxBytes: number;
  timeoutMs: number;
};

export const DEFAULT_MAX_BYTES = 150_000;
export const MAX_ALLOWED_BYTES = 1_000_000;
export const DEFAULT_TIMEOUT_MS = 15_000;
export const MAX_TIMEOUT_MS = 60_000;

const SUPPORTED_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const BODYLESS_METHODS = new Set(['GET', 'HEAD']);

export const clampPositiveInteger = (
  value: number | null | undefined,
  fallback: number,
  max: number,
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(value), max);
};

export const ensureHttpUrl = (raw: string): string => {
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

export const normalizeMethod = (raw: string | null): string => {
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

export const applyQueryParamEntries = (
  baseUrl: string,
  entries: Array<[string, string]>,
): string => {
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

export const buildRequestBody = (
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

export const executeHttpRequest = async (
  url: string,
  options: HttpRequestOptions,
): Promise<HttpResponseResult> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });

    const { content, bytesRead, totalBytes, truncated } = await readResponseContent(
      response,
      options.maxBytes,
    );

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      url,
      finalUrl: response.url,
      method: options.method,
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
      throw new Error(`Request to ${url} timed out after ${options.timeoutMs}ms.`);
    }
    throw new Error(
      `HTTP request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }
};
