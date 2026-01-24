import type { HttpResponseResult } from '../../../../assistant/src/tools/web/http';
import type {
  BubbleDirectoryPayload,
  BubbleFilePayload,
  BubbleSearchPayload,
  PcInfoPayload,
  ProcessListResult,
} from '../bubble-types';
import { isObjectRecord, isStringRecord } from '../shared';

export const isFilePayload = (value: unknown): value is BubbleFilePayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return record.action === 'file'
    && typeof record.path === 'string'
    && typeof record.content === 'string';
};

export const isDirectoryPayload = (value: unknown): value is BubbleDirectoryPayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return record.action === 'directory'
    && typeof record.path === 'string'
    && Array.isArray(record.entries);
};

export const isSearchPayload = (value: unknown): value is BubbleSearchPayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.root === 'string'
    && typeof record.query === 'string'
    && Array.isArray(record.matches);
};

export const isProcessListPayload = (value: unknown): value is ProcessListResult => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return record.action === 'list'
    && typeof record.total === 'number'
    && typeof record.truncated === 'boolean'
    && Array.isArray(record.processes);
};

export const isPcInfoPayload = (value: unknown): value is PcInfoPayload => {
  if (!isObjectRecord(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const hasSystem = isObjectRecord(record.system);
  const hasCpu = isObjectRecord(record.cpu);
  const hasMemory = isObjectRecord(record.memory);
  const hasDisks = Array.isArray(record.disks);
  return hasSystem || hasCpu || hasMemory || hasDisks;
};

export const isHttpResponsePayload = (value: unknown): value is HttpResponseResult => {
  if (!isObjectRecord(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.url === 'string'
    && typeof record.finalUrl === 'string'
    && typeof record.method === 'string'
    && typeof record.status === 'number'
    && Number.isFinite(record.status)
    && typeof record.statusText === 'string'
    && isStringRecord(record.headers)
    && (typeof record.contentType === 'string' || record.contentType === null)
    && typeof record.content === 'string'
    && typeof record.bytesRead === 'number'
    && Number.isFinite(record.bytesRead)
    && typeof record.totalBytes === 'number'
    && Number.isFinite(record.totalBytes)
    && typeof record.truncated === 'boolean'
    && typeof record.redirected === 'boolean'
  );
};
