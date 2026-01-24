import type { HttpResponseResult } from '../tools/web/http.js';

export type PcInfoSummary = {
  system?: {
    platform: string;
    hostname: string | null;
    uptime: number | null;
  };
  cpu?: {
    cores: number | null;
    threads: number | null;
    model: string | null;
    usage: number | null;
  };
  memory?: {
    totalBytes: number | null;
    usedBytes: number | null;
    freeBytes: number | null;
    usagePercent: number | null;
  };
  disks?: Array<{
    path: string;
    totalBytes: number | null;
    usedBytes: number | null;
    freeBytes: number | null;
    usagePercent: number | null;
  }>;
};

/**
 * Narrow result data into a valid HTTP response payload.
 */
export const isHttpResponseResult = (value: unknown): value is HttpResponseResult => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.url === 'string'
    && typeof record.finalUrl === 'string'
    && typeof record.method === 'string'
    && typeof record.status === 'number'
    && typeof record.statusText === 'string'
    && typeof record.headers === 'object'
    && (typeof record.contentType === 'string' || record.contentType === null)
    && typeof record.content === 'string'
    && typeof record.bytesRead === 'number'
    && typeof record.totalBytes === 'number'
    && typeof record.truncated === 'boolean'
    && typeof record.redirected === 'boolean'
  );
};

/**
 * Narrow result data into a PC info summary payload.
 */
export const isPcInfoSummary = (value: unknown): value is PcInfoSummary => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.system === 'object'
    || typeof record.cpu === 'object'
    || typeof record.memory === 'object'
    || Array.isArray(record.disks)
  );
};
