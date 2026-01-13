import type { ToolDefinition } from '../definition.js';

/* -------------------------------------------------------------------------
 * TYPES
 * ------------------------------------------------------------------------- */

type FilesystemToolArgs = {
  action: string;
  path: string;
  limit?: number | null;
  maxBytes?: number | null;
};

type DirectoryEntrySummary = {
  name: string;
  type: 'file' | 'directory' | 'other';
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

type FilesystemToolResult = FileOpenResult | DirectoryOpenResult;

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
 * Clamps numeric arguments to a positive integer within a max bound.
 */
const clampPositiveInteger = (
  value: number | null | undefined,
  fallback: number,
  max: number,
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  const normalized = Math.floor(value);
  return Math.min(normalized, max);
};

/**
 * Validates a user-provided path.
 */
const validatePath = (rawPath: string): string => {
  const candidate = rawPath.trim();
  if (!candidate) {
    throw new Error('Path is required for filesystem access.');
  }
  return candidate;
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
    let type: DirectoryEntrySummary['type'] = 'other';

    if (entry.isDirectory) {
      type = 'directory';
    } else if (entry.isFile) {
      type = 'file';
    }

    summarized.push({ name: entry.name, type });
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
  description:
    'Read or list known file/directory paths. Use action "read" to get file contents, "list" to show directory entries. Use when user asks to "read", "show", "display", "open", "what\'s in" with a specific path. NOT for finding/searching files.',
  schema: {
    action: 'string',
    path: 'string',
    limit: 'number|null',
    maxBytes: 'number|null',
  },
  async execute(args) {
    const fs = await loadTauriFS();
    const targetPath = validatePath(args.path);
    
    // Normalize action: lowercase, remove separators, extract core word
    const normalized = args.action.toLowerCase().trim().replace(/[_\-\s]/g, '');
    
    // Check for "read" or any variant containing "read"
    if (normalized === 'read' || normalized.includes('read')) {
      return readFileContent(targetPath, args.maxBytes, fs);
    }

    // Check for "list" or any variant containing "list"
    if (normalized === 'list' || normalized.includes('list')) {
      return listDirectory(targetPath, args.limit, fs);
    }

    throw new Error(`Invalid action "${args.action}". Use "read" for files or "list" for directories.`);
  },
};
