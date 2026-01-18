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
  bypassCookieNotices?: boolean;
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
    const entry = entries[index];
    if (!entry) {
      continue;
    }
    const [key, value] = entry;
    const existing = seen.get(key) ?? [];
    existing.push(value);
    seen.set(key, existing);
  }

  const overrideKeys = Array.from(seen.keys());
  for (let index = 0; index < overrideKeys.length; index += 1) {
    const key = overrideKeys[index];
    if (!key) {
      continue;
    }
    url.searchParams.delete(key);
  }

  for (const [key, values] of seen.entries()) {
    for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
      const value = values[valueIndex];
      if (value === undefined) {
        continue;
      }
      url.searchParams.append(key, value);
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

const addCookieConsentHeaders = (
  headers: Record<string, string>,
): Record<string, string> => {
  const consentHeaders = {
    ...headers,
    'Cookie': [
      headers['Cookie'] || '',
      'cookie_consent=accepted',
      'gdpr_consent=true',
      'consent=true',
      'cookie_notice_accepted=1',
      'cookieconsent_status=allow',
      'cookies_accepted=yes',
    ].filter(Boolean).join('; '),
  };
  
  return consentHeaders;
};

const stripCookieNoticeElements = (html: string): string => {
  if (!html.includes('<') || !html.includes('>')) {
    return html;
  }

  let result = html;
  
  const cookiePatterns = [
    /<div[^>]*cookie[^>]*>.*?<\/div>/gis,
    /<div[^>]*consent[^>]*>.*?<\/div>/gis,
    /<div[^>]*gdpr[^>]*>.*?<\/div>/gis,
    /<section[^>]*cookie[^>]*>.*?<\/section>/gis,
    /<aside[^>]*cookie[^>]*>.*?<\/aside>/gis,
    /<div[^>]*id=["'][^"']*cookie[^"']*["'][^>]*>.*?<\/div>/gis,
    /<div[^>]*class=["'][^"']*cookie[^"']*["'][^>]*>.*?<\/div>/gis,
    /<div[^>]*class=["'][^"']*consent[^"']*["'][^>]*>.*?<\/div>/gis,
  ];

  for (let index = 0; index < cookiePatterns.length; index += 1) {
    const pattern = cookiePatterns[index];
    if (!pattern) {
      continue;
    }
    result = result.replace(pattern, '');
  }

  return result;
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

/**
 * Normalizes a fetch Response into the tool response payload.
 */
const buildHttpResponseResult = async (
  requestUrl: string,
  response: Response,
  options: HttpRequestOptions,
): Promise<HttpResponseResult> => {
  let { content, bytesRead, totalBytes, truncated } = await readResponseContent(
    response,
    options.maxBytes,
  );

  if (options.bypassCookieNotices) {
    const contentType = response.headers.get('content-type');
    const isHtml = contentType?.includes('text/html');
    if (isHtml) {
      content = stripCookieNoticeElements(content);
    }
  }

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
    // Not in Tauri environment, will fall back to browser fetch
    return null;
  }
};

export const executeHttpRequest = async (
  url: string,
  options: HttpRequestOptions,
): Promise<HttpResponseResult> => {
  const tauri = await loadTauriHttp();

  // Use Tauri HTTP plugin if available (bypasses CORS)
  if (tauri) {
    try {
      const requestHeaders = options.bypassCookieNotices
        ? addCookieConsentHeaders(options.headers)
        : options.headers;

      const response = await tauri.fetch(url, {
        method: options.method,
        headers: requestHeaders,
        body: options.body,
      });

      return buildHttpResponseResult(url, response, options);
    } catch (error) {
      throw new Error(
        `HTTP request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Fallback to browser fetch
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const requestHeaders = options.bypassCookieNotices
      ? addCookieConsentHeaders(options.headers)
      : options.headers;

    const response = await fetch(url, {
      method: options.method,
      headers: requestHeaders,
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
