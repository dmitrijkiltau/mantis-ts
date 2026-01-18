import type { ToolDefinition } from '../definition.js';
import { clampPositiveInteger, clampNonNegativeInteger, normalizePath } from '../internal/helpers.js';

/* -------------------------------------------------------------------------
 * TYPES
 * ------------------------------------------------------------------------- */

type SearchToolArgs = {
  query: string;
  baseDir: string;
  startPath?: string | null;
  maxResults?: number | null;
  maxDepth?: number | null;
  includeFiles?: boolean | null;
  includeDirectories?: boolean | null;
  exactMatch?: boolean | null;
};

type SearchMatch = {
  path: string;
  type: 'file' | 'directory';
};

type SearchToolResult = {
  root: string;
  query: string;
  matches: SearchMatch[];
  truncated: boolean;
};

type NodeModules = {
  readDir: (path: string) => Promise<Array<{ name: string; isFile: boolean; isDirectory: boolean; isSymlink: boolean }>>;
};

type SearchFrame = {
  directory: string;
  depth: number;
};

/* -------------------------------------------------------------------------
 * CONSTANTS
 * ------------------------------------------------------------------------- */

const DEFAULT_MAX_RESULTS = 25;
const MAX_MAX_RESULTS = 250;
const DEFAULT_MAX_DEPTH = 4;
const MAX_MAX_DEPTH = 10;

/* -------------------------------------------------------------------------
 * STATE
 * ------------------------------------------------------------------------- */

let nodeModules: NodeModules | null = null;

/* -------------------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------------------- */

const loadNodeModules = async (): Promise<NodeModules> => {
  if (nodeModules) return nodeModules;
  const { readDir } = await import('@tauri-apps/plugin-fs');
  nodeModules = { readDir };
  return nodeModules;
};



const resolveSafeRoot = async (
  baseDir: string,
  startPath: string | null | undefined,
  _modules: NodeModules,
): Promise<string> => {
  if (!baseDir?.trim()) {
    throw Object.assign(new Error('BASE_DIR_REQUIRED'), {
      code: 'BASE_DIR_REQUIRED',
    });
  }

  const normalizedBase = normalizePath(baseDir);
  const base = startPath?.trim();
  
  if (base && base !== '.') {
    const normalizedStart = normalizePath(base).replace(/^\//, '');
    return `${normalizedBase}/${normalizedStart}`;
  }
  
  return normalizedBase;
};

/* -------------------------------------------------------------------------
 * SEARCH
 * ------------------------------------------------------------------------- */

const searchFileSystem = async (
  args: SearchToolArgs,
): Promise<SearchToolResult> => {
  const modules = await loadNodeModules();
  const { readDir } = modules;

  const query = args.query.trim().toLowerCase();
  if (!query) {
    throw Object.assign(new Error('EMPTY_QUERY'), { code: 'EMPTY_QUERY' });
  }

  const root = await resolveSafeRoot(args.baseDir, args.startPath, modules);

  const maxResults = clampPositiveInteger(
    args.maxResults,
    DEFAULT_MAX_RESULTS,
    MAX_MAX_RESULTS,
  );

  const maxDepth = clampNonNegativeInteger(
    args.maxDepth,
    DEFAULT_MAX_DEPTH,
    MAX_MAX_DEPTH,
  );

  const includeFiles = args.includeFiles !== false;
  const includeDirectories = args.includeDirectories !== false;
  const exactMatch = args.exactMatch === true;

  const matches: SearchMatch[] = [];
  const stack: SearchFrame[] = [{ directory: root, depth: 0 }];
  let truncated = false;

  const matchesQuery = (name: string): boolean => {
    const lowerName = name.toLowerCase();
    return exactMatch ? lowerName === query : lowerName.includes(query);
  };

  while (stack.length > 0 && matches.length < maxResults) {
    const { directory, depth } = stack.pop() as SearchFrame;

    let entries: Array<{ name: string; isFile: boolean; isDirectory: boolean; isSymlink: boolean }>;
    try {
      entries = await readDir(directory);
    } catch (error) {
      // Skip inaccessible directories (permissions, etc.) but continue search
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (matches.length >= maxResults) {
        truncated = true;
        break;
      }

      if (entry.isSymlink) continue;

      const entryPath = normalizePath(`${directory}/${entry.name}`);
      const nextDepth = depth + 1;

      if (entry.isDirectory) {
        if (includeDirectories && matchesQuery(entry.name)) {
          matches.push({ path: entryPath, type: 'directory' });
        }

        if (nextDepth <= maxDepth) {
          stack.push({ directory: entryPath, depth: nextDepth });
        }
      } else if (entry.isFile) {
        if (includeFiles && matchesQuery(entry.name)) {
          matches.push({ path: entryPath, type: 'file' });
        }
      }
    }
  }

  return {
    root,
    query,
    matches,
    truncated,
  };
};

/* -------------------------------------------------------------------------
 * TOOL DEFINITION
 * ------------------------------------------------------------------------- */

export const SEARCH_TOOL: ToolDefinition<SearchToolArgs, SearchToolResult> = {
  name: 'search',
  description: 'DISCOVERY. Use to find files/dirs by name/pattern when the path is unknown. Triggers: "find", "locate", "where is".',
  schema: {
    query: 'string',
    baseDir: 'string',
    startPath: 'string|null',
    maxResults: 'number|null',
    maxDepth: 'number|null',
    includeFiles: 'boolean|null',
    includeDirectories: 'boolean|null',
    exactMatch: 'boolean|null',
  },
  async execute(args) {
    return searchFileSystem(args);
  },
};
