import type { ToolDefinition } from '../definition.js';
import { clampPositiveInteger, normalizeAction, validatePath } from '../internal/helpers.js';
import { z } from 'zod';

/* -------------------------------------------------------------------------
 * TYPES
 * ------------------------------------------------------------------------- */

type FilesystemAction = 'read' | 'list' | 'stat';

type FilesystemToolArgs = {
  action: FilesystemAction;
  path: string | null;
};

type DirectoryEntrySummary = {
  name: string;
  type: 'file' | 'directory' | 'other';
  sizeBytes?: number | null;
};

type FileOpenResult = {
  action: 'file';
  path: string;
  content: string;
  bytesRead: number;
  totalBytes: number;
  truncated: boolean;
};

type DirectoryOpenResult = {
  action: 'directory';
  path: string;
  entries: DirectoryEntrySummary[];
  truncated: boolean;
};

type FilesystemStatResult = {
  action: 'stat';
  path: string;
  exists: boolean;
  type: 'file' | 'directory' | 'other' | 'missing';
  sizeBytes: number | null;
  message: string;
};

type FilesystemNoticeResult = {
  action: FilesystemAction;
  path: string;
  ok: false;
  error: 'not_found' | 'not_file' | 'not_directory' | 'permission_denied' | 'unknown';
  message: string;
};

type FilesystemToolResult =
  | FileOpenResult
  | DirectoryOpenResult
  | FilesystemStatResult
  | FilesystemNoticeResult;

type TauriFS = {
  readTextFile: (path: string) => Promise<string>;
  readDir: (path: string) => Promise<Array<{ name: string; isFile: boolean; isDirectory: boolean; isSymlink: boolean }>>;
  stat: (path: string) => Promise<{ size: number; isFile: boolean; isDirectory: boolean }>;
};

/* -------------------------------------------------------------------------
 * CONSTANTS
 * ------------------------------------------------------------------------- */

const DEFAULT_MAX_BYTES = 100_000; // 100 KB
const MAX_ALLOWED_BYTES = 1_000_000; // 1 MB safety cap
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 500;
const FILESYSTEM_ACTIONS = new Set<FilesystemAction>(['read', 'list', 'stat']);

const filesystemArgsSchema = z.object({
  action: z.enum(['read', 'list', 'stat']),
  path: z.string().min(1).nullable(),
});

/* -------------------------------------------------------------------------
 * STATE
 * ------------------------------------------------------------------------- */

let tauriFS: TauriFS | null = null;

/* -------------------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------------------- */

/**
 * Lazily loads Tauri filesystem APIs.
 */
const loadTauriFS = async (): Promise<TauriFS> => {
  if (tauriFS) {
    return tauriFS;
  }

  try {
    const { readTextFile, readDir, stat } = await import('@tauri-apps/plugin-fs');
    tauriFS = { readTextFile, readDir, stat };
    return tauriFS;
  } catch (error) {
    throw new Error('Filesystem operations require Tauri environment.');
  }
};



/**
 * Joins a base path with an entry name using the existing separator.
 */
const joinPath = (basePath: string, entryName: string): string => {
  if (/[\\/]+$/.test(basePath)) {
    return `${basePath}${entryName}`;
  }

  const separator = basePath.includes('\\') ? '\\' : '/';
  return `${basePath}${separator}${entryName}`;
};

const getErrorMessage = (error: unknown): string => (
  error instanceof Error ? error.message : String(error)
);

const isNotFoundError = (error: unknown): boolean => {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'ENOENT' || code === 'NotFound') {
      return true;
    }
  }

  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('no such file') ||
    message.includes('not found') ||
    message.includes('cannot find the file') ||
    message.includes('os error 2') ||
    message.includes('datei nicht finden')
  );
};

const isPermissionError = (error: unknown): boolean => {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'EACCES' || code === 'EPERM') {
      return true;
    }
  }

  const message = getErrorMessage(error).toLowerCase();
  return message.includes('permission') || message.includes('access denied');
};

const buildNoticeResult = (
  action: FilesystemAction,
  path: string,
  error: FilesystemNoticeResult['error'],
  message: string,
): FilesystemNoticeResult => ({
  action,
  path,
  ok: false,
  error,
  message,
});

const buildNoticeFromError = (
  action: FilesystemAction,
  path: string,
  error: unknown,
): FilesystemNoticeResult => {
  if (isNotFoundError(error)) {
    return buildNoticeResult(action, path, 'not_found', `No entry found at "${path}".`);
  }
  if (isPermissionError(error)) {
    return buildNoticeResult(action, path, 'permission_denied', `Permission denied for "${path}".`);
  }
  return buildNoticeResult(
    action,
    path,
    'unknown',
    `Unable to ${action} "${path}": ${getErrorMessage(error)}`,
  );
};

const statPath = async (
  targetPath: string,
  fs: TauriFS,
): Promise<
  | { ok: true; stats: { size: number; isFile: boolean; isDirectory: boolean } }
  | { ok: false; error: 'not_found' | 'permission_denied' | 'unknown'; message: string }
> => {
  try {
    const stats = await fs.stat(targetPath);
    return { ok: true, stats };
  } catch (error) {
    const message = getErrorMessage(error);
    if (isNotFoundError(error)) {
      return { ok: false, error: 'not_found', message };
    }
    if (isPermissionError(error)) {
      return { ok: false, error: 'permission_denied', message };
    }
    return { ok: false, error: 'unknown', message };
  }
};

/**
 * Opens a file and returns a bounded preview of its contents.
 */
const readFileContent = async (
  targetPath: string,
  maxBytes: number | null | undefined,
  fs: TauriFS,
): Promise<FileOpenResult> => {
  const byteLimit = clampPositiveInteger(maxBytes, DEFAULT_MAX_BYTES, MAX_ALLOWED_BYTES);

  let stats: { size: number; isFile: boolean; isDirectory: boolean };
  try {
    stats = await fs.stat(targetPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read file "${targetPath}": ${message}`);
  }

  if (!stats.isFile) {
    throw new Error(`Path is not a file: ${targetPath}`);
  }

  const content = await fs.readTextFile(targetPath);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  const totalBytes = bytes.byteLength;
  const truncated = totalBytes > byteLimit;
  
  const resultContent = truncated 
    ? new TextDecoder().decode(bytes.subarray(0, byteLimit))
    : content;

  return {
    action: 'file',
    path: targetPath,
    content: resultContent,
    bytesRead: Math.min(totalBytes, byteLimit),
    totalBytes,
    truncated,
  };
};

/**
 * Lists the contents of a directory with an optional entry cap.
 */
const listDirectory = async (
  targetPath: string,
  limit: number | null | undefined,
  fs: TauriFS,
): Promise<DirectoryOpenResult> => {
  const entryLimit = clampPositiveInteger(limit, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);

  let entries: Array<{ name: string; isFile: boolean; isDirectory: boolean; isSymlink: boolean }>;
  try {
    entries = await fs.readDir(targetPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to open directory "${targetPath}": ${message}`);
  }

  const summarized: DirectoryEntrySummary[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    if (summarized.length >= entryLimit) {
      break;
    }

    const entry = entries[index];
    if (!entry) {
      continue;
    }
    let type: DirectoryEntrySummary['type'] = 'other';
    let sizeBytes: number | null | undefined = undefined;

    if (entry.isDirectory) {
      type = 'directory';
    } else if (entry.isFile) {
      type = 'file';
    }

    if (type === 'file') {
      const entryPath = joinPath(targetPath, entry.name);
      try {
        const stats = await fs.stat(entryPath);
        sizeBytes = stats.size;
      } catch {
        sizeBytes = null;
      }
    }

    summarized.push({ name: entry.name, type, sizeBytes });
  }

  return {
    action: 'directory',
    path: targetPath,
    entries: summarized,
    truncated: entries.length > summarized.length,
  };
};

/* -------------------------------------------------------------------------
 * TOOL DEFINITION
 * ------------------------------------------------------------------------- */

export const FILESYSTEM_TOOL: ToolDefinition<FilesystemToolArgs, FilesystemToolResult> = {
  name: 'filesystem',
  description: `Select to read a file, list a directory, or stat path information on the local filesystem.`,
  triggers: ['file', 'files', 'folder', 'directory', 'path', 'read', 'list', 'open'],
  schema: {
    action: 'string',
    path: 'string|null',
  },
  argsSchema: filesystemArgsSchema,
  async execute(args) {
    const fs = await loadTauriFS();
    const targetPath = validatePath((args as any).path ?? '');
    const action = normalizeAction<FilesystemAction>((args as any).action, FILESYSTEM_ACTIONS);

    const statResult = await statPath(targetPath, fs);
    if (action === 'stat') {
      if (!statResult.ok) {
        if (statResult.error === 'not_found') {
          return {
            action: 'stat',
            path: targetPath,
            exists: false,
            type: 'missing',
            sizeBytes: null,
            message: `No entry found at "${targetPath}".`,
          };
        }
        return buildNoticeResult(
          'stat',
          targetPath,
          statResult.error,
          `Unable to stat "${targetPath}": ${statResult.message}`,
        );
      }

      const type = statResult.stats.isFile
        ? 'file'
        : statResult.stats.isDirectory
          ? 'directory'
          : 'other';
      const sizeBytes = type === 'file' ? statResult.stats.size : null;
      const message = type === 'file'
        ? `File exists at "${targetPath}".`
        : type === 'directory'
          ? `Directory exists at "${targetPath}".`
          : `Path exists at "${targetPath}".`;
      return {
        action: 'stat',
        path: targetPath,
        exists: true,
        type,
        sizeBytes,
        message,
      };
    }

    if (!statResult.ok) {
      if (statResult.error === 'not_found') {
        return buildNoticeResult(
          action,
          targetPath,
          'not_found',
          `No entry found at "${targetPath}".`,
        );
      }
      return buildNoticeResult(
        action,
        targetPath,
        statResult.error,
        `Unable to ${action} "${targetPath}": ${statResult.message}`,
      );
    }

    const limit = typeof (args as any).limit === 'number' ? (args as any).limit : null;
    const maxBytes = typeof (args as any).maxBytes === 'number' ? (args as any).maxBytes : null;

    if (action === 'read') {
      if (statResult.stats.isDirectory) {
        try {
          return await listDirectory(targetPath, limit, fs);
        } catch (error) {
          return buildNoticeFromError('list', targetPath, error);
        }
      }

      if (!statResult.stats.isFile) {
        return buildNoticeResult(
          action,
          targetPath,
          'not_file',
          `Path is not a file: "${targetPath}".`,
        );
      }

      try {
        return await readFileContent(targetPath, maxBytes, fs);
      } catch (error) {
        return buildNoticeFromError(action, targetPath, error);
      }
    }

    if (action === 'list') {
      if (statResult.stats.isFile) {
        return buildNoticeResult(
          action,
          targetPath,
          'not_directory',
          `Path is a file, not a directory: "${targetPath}".`,
        );
      }

      if (!statResult.stats.isDirectory) {
        return buildNoticeResult(
          action,
          targetPath,
          'not_directory',
          `Path is not a directory: "${targetPath}".`,
        );
      }

      try {
        return await listDirectory(targetPath, limit, fs);
      } catch (error) {
        return buildNoticeFromError(action, targetPath, error);
      }
    }

    return buildNoticeResult(
      action,
      targetPath,
      'unknown',
      `Unsupported filesystem action "${(args as any).action}".`,
    );
  },
};
