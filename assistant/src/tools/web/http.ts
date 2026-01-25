import type { ToolDefinition } from '../definition.js';
import { z } from 'zod';

/* ------------------------------------------------------------------------- *
 * CORE (merged from http-core.ts)
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

export const ensureHttpUrl = (raw: string): string => {
  const candidate = raw.trim();
  if (!candidate) {
    throw new Error('Request URL is required.');
  }

  const tryParse = (value: string): URL | null => {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  };

  const hasScheme = /^[a-zA-Z][a-zA-Z\d+-.]*:/.test(candidate);
  let parsed: URL | null = tryParse(candidate);
  if (!parsed && !hasScheme) {
    const prefixed = candidate.startsWith('//')
      ? `https:${candidate}`
      : `https://${candidate}`;
    parsed = tryParse(prefixed);
  }

  if (!parsed) {
    throw new Error(`Invalid URL "${candidate}".`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// or https:// URLs are supported.');
  }

  return parsed.toString();
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

const buildHttpResponseResult = async (
  requestUrl: string,
  response: Response,
  options: HttpRequestOptions,
): Promise<HttpResponseResult> => {
  const { content, bytesRead, totalBytes, truncated } = await readResponseContent(
    response,
    options.maxBytes,
  );

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  const finalUrl = response.url || requestUrl;
  const redirected = response.redirected || finalUrl !== requestUrl;

  return {
    url: requestUrl,
    finalUrl,
    method: options.method,
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    contentType: response.headers.get('content-type'),
    content,
    bytesRead,
    totalBytes,
    truncated,
    redirected,
  };
};

type TauriHttpModule = {
  fetch: (url: string, options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }) => Promise<Response>;
};

let tauriHttpModule: TauriHttpModule | null = null;

const loadTauriHttp = async (): Promise<TauriHttpModule | null> => {
  if (tauriHttpModule !== null) {
    return tauriHttpModule;
  }

  try {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    tauriHttpModule = { fetch: tauriFetch as unknown as (url: string, options?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    }) => Promise<Response> };
    return tauriHttpModule;
  } catch {
    return null;
  }
};

export const executeHttpRequest = async (
  url: string,
  options: HttpRequestOptions,
): Promise<HttpResponseResult> => {
  const tauri = await loadTauriHttp();

  if (tauri) {
    try {
      const response = await tauri.fetch(url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
      });

      return buildHttpResponseResult(url, response, options);
    } catch (error) {
      throw new Error(
        `HTTP request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });

    return buildHttpResponseResult(url, response, options);
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

/* ------------------------------------------------------------------------- *
 * TYPES
 * ------------------------------------------------------------------------- */

type HttpToolArgs = {
  url: string;
  body: string | null;
};

type HttpToolResult = HttpResponseResult;

const httpArgsSchema = z.object({
  url: z.string().min(1),
  body: z.string().nullable(),
});

/* ------------------------------------------------------------------------- *
 * TOOL DEFINITION
 * ------------------------------------------------------------------------- */

export const HTTP_TOOL: ToolDefinition<HttpToolArgs, HttpToolResult> = {
  name: 'http',
  description: 'Select to fetch a url (default to https:// without "www") and return the response body.',
  triggers: ['http', 'https', 'url', 'fetch', 'get', 'request', 'download'],
  schema: {
    url: 'string',
    body: 'string|null',
  },
  argsSchema: httpArgsSchema,
  async execute(args) {
    const targetUrl = ensureHttpUrl(args.url);
    const method = 'GET'; // Only supported method
    const maxBytes = DEFAULT_MAX_BYTES;
    const timeoutMs = DEFAULT_TIMEOUT_MS;

    // Provided body (if any) is ignored because GET is the only supported method.
    return executeHttpRequest(targetUrl, {
      method,
      headers: {},
      maxBytes,
      timeoutMs,
    });
  },
};
