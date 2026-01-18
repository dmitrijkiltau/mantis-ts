import type { ToolDefinition } from '../definition.js';
import { clampPositiveInteger, validatePath } from '../internal/helpers.js';

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
  sizeBytes: number | null;
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
 * Joins a base path with an entry name using the existing separator.
 */
const joinPath = (basePath: string, entryName: string): string => {
  if (/[\\/]+$/.test(basePath)) {
    return `${basePath}${entryName}`;
  }

  const separator = basePath.includes('\\') ? '\\' : '/';
  return `${basePath}${separator}${entryName}`;
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
    let sizeBytes: number | null = null;

    if (entry.isDirectory) {
      type = 'directory';
    } else if (entry.isFile) {
      type = 'file';
    }

    if (type !== 'other') {
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
  description: 'ACTIONS: "read" (file content), "list" (directory). STRICTLY requires a specific, known path. Do NOT use for searching.',
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
      try {
        return await readFileContent(targetPath, args.maxBytes, fs);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith('Path is not a file:')
        ) {
          return listDirectory(targetPath, args.limit, fs);
        }
        throw error;
      }
    }

    // Check for "list" or any variant containing "list"
    if (normalized === 'list' || normalized.includes('list')) {
      return listDirectory(targetPath, args.limit, fs);
    }

    throw new Error(`Invalid action "${args.action}". Use "read" for files or "list" for directories.`);
  },
};
