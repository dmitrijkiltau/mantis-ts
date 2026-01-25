import type { ToolDefinition } from '../definition.js';
import { normalizeAction, validatePath } from '../internal/helpers.js';
import { z } from 'zod';

/* -------------------------------------------------------------------------
 * SLIMMED TYPES & ERRORS
 * ------------------------------------------------------------------------- */

type FilesystemAction = 'read' | 'list' | 'stat';

type FilesystemToolArgs = {
  action: FilesystemAction;
  path: string | null;
};

type DirectoryEntrySummary = {
  name: string;
  type: 'file' | 'directory' | 'other';
  sizeBytes: number | null; // explicit: number or null
};

type FileResult = {
  action: 'read';
  path: string;
  content: string;
  bytesRead: number;
  totalBytes: number;
  truncated: boolean;
};

type DirectoryResult = {
  action: 'list';
  path: string;
  entries: DirectoryEntrySummary[];
  truncated: boolean;
};

type StatResult = {
  action: 'stat';
  path: string;
  exists: boolean;
  type: 'file' | 'directory' | 'other' | 'missing';
  sizeBytes: number | null;
  message: string;
};

type ErrorResult = {
  action: FilesystemAction;
  path: string;
  ok: false;
  error: 'not_found' | 'permission_denied' | 'invalid_type' | 'unknown';
  message: string;
};

type FilesystemToolResult = FileResult | DirectoryResult | StatResult | ErrorResult;

/* -------------------------------------------------------------------------
 * TAURI FS SHIM
 * ------------------------------------------------------------------------- */

type TauriFS = {
  readTextFile: (path: string) => Promise<string>;
  readDir: (path: string) => Promise<Array<{ name: string; isFile: boolean; isDirectory: boolean; isSymlink: boolean }>>;
  stat: (path: string) => Promise<{ size: number; isFile: boolean; isDirectory: boolean }>;
};

/* -------------------------------------------------------------------------
 * CONSTANTS & SCHEMA
 * ------------------------------------------------------------------------- */

const DEFAULT_MAX_BYTES = 100_000; // 100 KB
const DEFAULT_LIST_LIMIT = 50;
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

const loadTauriFS = async (): Promise<TauriFS> => {
  if (tauriFS) return tauriFS;
  try {
    const { readTextFile, readDir, stat } = await import('@tauri-apps/plugin-fs');
    tauriFS = { readTextFile, readDir, stat };
    return tauriFS;
  } catch (e) {
    throw new Error('Filesystem operations require Tauri environment.');
  }
};

const joinPath = (basePath: string, entryName: string): string => {
  if (/[\\/]+$/.test(basePath)) return `${basePath}${entryName}`;
  const separator = basePath.includes('\\') ? '\\' : '/';
  return `${basePath}${separator}${entryName}`;
};

const ensureFile = (stats: { isFile: boolean }, path: string) => {
  if (!stats.isFile) throw new Error(`"${path}" is not a file`);
};

const ensureDir = (stats: { isDirectory: boolean }, path: string) => {
  if (!stats.isDirectory) throw new Error(`"${path}" is not a directory`);
};

const buildError = (action: FilesystemAction, path: string, e: unknown): ErrorResult => {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  
  if (e && typeof e === 'object' && 'code' in (e as any)) {
    const code = (e as any).code;
    if (code === 'ENOENT' || code === 'NotFound') return { action, path, ok: false, error: 'not_found', message: `No entry found at "${path}".` };
    if (code === 'EACCES' || code === 'EPERM') return { action, path, ok: false, error: 'permission_denied', message: `Permission denied for "${path}".` };
  }
  
  if (lower.includes('no such file') || lower.includes('not found') || lower.includes('os error 2')) {
    return { action, path, ok: false, error: 'not_found', message: `No entry found at "${path}".` };
  }
  if (lower.includes('permission') || lower.includes('access denied')) {
    return { action, path, ok: false, error: 'permission_denied', message: `Permission denied for "${path}".` };
  }
  if (lower.includes('not a file') || lower.includes('not a directory')) {
    return { action, path, ok: false, error: 'invalid_type', message: msg };
  }
  
  return { action, path, ok: false, error: 'unknown', message: `Unable to ${action} "${path}": ${msg}` };
};

const readFileContent = async (
  targetPath: string,
  fs: TauriFS,
  stats: { size: number; isFile: boolean; isDirectory: boolean },
): Promise<FileResult> => {
  ensureFile(stats, targetPath);
  const byteLimit = DEFAULT_MAX_BYTES;
  const content = await fs.readTextFile(targetPath);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  const totalBytes = bytes.byteLength;
  const truncated = totalBytes > byteLimit;
  const resultContent = truncated ? new TextDecoder().decode(bytes.subarray(0, byteLimit)) : content;
  return { action: 'read', path: targetPath, content: resultContent, bytesRead: Math.min(totalBytes, byteLimit), totalBytes, truncated };
};

const listDirectory = async (
  targetPath: string,
  fs: TauriFS,
): Promise<DirectoryResult> => {
  const entryLimit = DEFAULT_LIST_LIMIT;
  const entries = await fs.readDir(targetPath);
  const slice = entries.slice(0, entryLimit);

  const summarized = await Promise.all(
    slice.map(async (e) => {
      if (!e) return { name: '', type: 'other', sizeBytes: null } as DirectoryEntrySummary;
      if (e.isDirectory) return { name: e.name, type: 'directory', sizeBytes: null } as DirectoryEntrySummary;
      if (!e.isFile) return { name: e.name, type: 'other', sizeBytes: null } as DirectoryEntrySummary;
      const entryPath = joinPath(targetPath, e.name);
      try {
        const s = await fs.stat(entryPath);
        return { name: e.name, type: 'file', sizeBytes: s.size } as DirectoryEntrySummary;
      } catch {
        return { name: e.name, type: 'file', sizeBytes: null } as DirectoryEntrySummary;
      }
    }),
  );

  return { action: 'list', path: targetPath, entries: summarized, truncated: entries.length > summarized.length };
};

/* -------------------------------------------------------------------------
 * TOOL
 * ------------------------------------------------------------------------- */

export const FILESYSTEM_TOOL: ToolDefinition<FilesystemToolArgs, FilesystemToolResult> = {
  name: 'filesystem',
  description: `Select to read a file, list a directory, or stat path information on the local filesystem.`,
  triggers: ['file', 'files', 'folder', 'directory', 'path', 'read', 'list', 'open'],
  schema: { action: 'string', path: 'string|null' },
  argsSchema: filesystemArgsSchema,
  async execute(args) {
    const fs = await loadTauriFS();
    const targetPath = validatePath((args as any).path ?? '');
    const action = normalizeAction<FilesystemAction>((args as any).action, FILESYSTEM_ACTIONS);

    try {
      const stats = await fs.stat(targetPath);

      if (action === 'stat') {
        const type = stats.isFile ? 'file' : stats.isDirectory ? 'directory' : 'other';
        const sizeBytes = stats.isFile ? stats.size : null;
        const message = type === 'file' 
          ? `File exists at "${targetPath}".` 
          : type === 'directory' 
            ? `Directory exists at "${targetPath}".` 
            : `Path exists at "${targetPath}".`;
        return { action: 'stat', path: targetPath, exists: true, type, sizeBytes, message };
      }

      if (action === 'read') {
        ensureFile(stats, targetPath);
        return await readFileContent(targetPath, fs, stats);
      }

      if (action === 'list') {
        ensureDir(stats, targetPath);
        return await listDirectory(targetPath, fs);
      }

      return { action, path: targetPath, ok: false, error: 'unknown', message: `Unsupported filesystem action "${(args as any).action}".` };
    } catch (e) {
      if (action === 'stat' && (e instanceof Error && e.message.includes('not found') || (e && typeof e === 'object' && 'code' in (e as any) && ((e as any).code === 'ENOENT' || (e as any).code === 'NotFound')))) {
        return { action: 'stat', path: targetPath, exists: false, type: 'missing', sizeBytes: null, message: `No entry found at "${targetPath}".` };
      }
      return buildError(action, targetPath, e);
    }
  },
};
