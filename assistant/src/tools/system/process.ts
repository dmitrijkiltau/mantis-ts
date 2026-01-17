import type { ToolDefinition } from '../definition.js';
import { clampPositiveInteger, getPlatform, escapePowerShellString } from '../internal/helpers.js';

/* -------------------------------------------------------------------------
 * TYPES
 * ------------------------------------------------------------------------- */

type ProcessToolArgs = {
  action: string;
  query?: string | null;
  limit?: number | null;
};

type ProcessInfo = {
  pid: number;
  name: string;
  cpu: number | null;
  memoryBytes: number | null;
  runtimeSeconds: number | null;
  command: string | null;
};

type ProcessListResult = {
  action: 'list';
  total: number;
  truncated: boolean;
  processes: ProcessInfo[];
};

type TauriCommand = {
  create: (program: string, args: string[]) => TauriCommandChild;
};

type TauriCommandChild = {
  execute: () => Promise<{ code: number | null; signal: number | null; stdout: string; stderr: string }>;
};

type ShellModule = {
  Command: TauriCommand;
};

/* -------------------------------------------------------------------------
 * CONSTANTS
 * ------------------------------------------------------------------------- */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const LIST_ALIASES = new Set(['list', 'ps', 'processes', 'show']);

/* -------------------------------------------------------------------------
 * STATE
 * ------------------------------------------------------------------------- */

let shellModule: ShellModule | null = null;

/* -------------------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------------------- */



const loadShellModule = async (): Promise<ShellModule> => {
  if (shellModule) {
    return shellModule;
  }

  try {
    const { Command } = await import('@tauri-apps/plugin-shell');
    shellModule = { Command };
    return shellModule;
  } catch (error) {
    throw new Error('Process listing requires Tauri shell plugin.');
  }
};

const normalizeAction = (action: string): 'list' => {
  const normalized = action.trim().toLowerCase();
  if (LIST_ALIASES.has(normalized)) {
    return 'list';
  }
  throw new Error(`Unsupported process action "${action}". Only "list" is allowed (read-only).`);
};

const normalizeQuery = (query: string | null | undefined): string | null => {
  if (typeof query !== 'string') {
    return null;
  }
  const trimmed = query.trim();
  return trimmed ? trimmed : null;
};

/* -------------------------------------------------------------------------
 * WINDOWS IMPLEMENTATION
 * ------------------------------------------------------------------------- */



const buildPowerShellListScript = (query: string | null, limit: number): string => {
  const filterClause = query
    ? `| Where-Object { $_.ProcessName -like "*${escapePowerShellString(query)}*" }`
    : '';

  return `
$ErrorActionPreference = "Stop"
$procs = Get-Process ${filterClause} | Sort-Object CPU -Descending
$selected = $procs | Select-Object -First ${limit} Id, ProcessName, CPU, PM, StartTime, Path
$result = [PSCustomObject]@{
  total = $procs.Count
  truncated = $procs.Count -gt ${limit}
  processes = $selected | ForEach-Object {
    $runtime = $null
    if ($_.StartTime) {
      try {
        $runtime = [int][Math]::Round((New-TimeSpan -Start $_.StartTime).TotalSeconds)
      } catch {}
    }

    [PSCustomObject]@{
      pid = $_.Id
      name = $_.ProcessName
      cpu = if ($_.CPU) { [double]$_.CPU } else { $null }
      memoryBytes = if ($_.PM) { [long]$_.PM } else { $null }
      runtimeSeconds = $runtime
      command = $_.Path
    }
  }
}
$result | ConvertTo-Json -Depth 4 -Compress
`.trim();
};

const runWindowsProcessList = async (query: string | null, limit: number): Promise<ProcessListResult> => {
  const { Command } = await loadShellModule();
  const script = buildPowerShellListScript(query, limit);
  const command = Command.create('powershell', ['-NoProfile', '-NonInteractive', '-Command', script]);
  const result = await command.execute();

  if (result.code !== 0 && result.code !== null) {
    throw new Error(`PowerShell command failed with code ${result.code}: ${result.stderr}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    throw new Error('Unable to parse process list from PowerShell output.');
  }

  const data = payload as {
    total?: number;
    truncated?: boolean;
    processes?: Array<{
      pid?: number;
      name?: string;
      cpu?: number | null;
      memoryBytes?: number | null;
      runtimeSeconds?: number | null;
      command?: string | null;
    }>;
  };

  if (!data || !Array.isArray(data.processes)) {
    throw new Error('PowerShell returned an unexpected process payload.');
  }

  const processes: ProcessInfo[] = [];
  for (let index = 0; index < data.processes.length; index += 1) {
    const entry = data.processes[index] ?? {};
    if (typeof entry.pid !== 'number' || !entry.name) {
      continue;
    }

    processes.push({
      pid: entry.pid,
      name: entry.name,
      cpu: typeof entry.cpu === 'number' ? entry.cpu : null,
      memoryBytes: typeof entry.memoryBytes === 'number' ? entry.memoryBytes : null,
      runtimeSeconds: typeof entry.runtimeSeconds === 'number' ? entry.runtimeSeconds : null,
      command: entry.command ?? null,
    });
  }

  const total = typeof data.total === 'number' ? data.total : processes.length;
  const truncated = data.truncated === true || total > processes.length;

  return {
    action: 'list',
    total,
    truncated,
    processes,
  };
};

/* -------------------------------------------------------------------------
 * POSIX IMPLEMENTATION
 * ------------------------------------------------------------------------- */

const parseElapsedSeconds = (value: string): number | null => {
  if (!value) {
    return null;
  }

  // Formats: [[dd-]hh:]mm:ss
  const normalized = value.trim();
  const daySplit = normalized.split('-');
  let days = 0;
  let timePart = normalized;

  if (daySplit.length === 2) {
    const dayToken = daySplit[0];
    const timeToken = daySplit[1];
    if (!dayToken || !timeToken) {
      return null;
    }
    days = Number.parseInt(dayToken, 10);
    timePart = timeToken;
  }

  const segments = timePart.split(':');
  if (segments.length < 2 || segments.length > 3) {
    return null;
  }

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (segments.length === 2) {
    hours = 0;
    const minuteToken = segments[0];
    const secondToken = segments[1];
    if (!minuteToken || !secondToken) {
      return null;
    }
    minutes = Number.parseInt(minuteToken, 10);
    seconds = Number.parseInt(secondToken, 10);
  } else {
    const hourToken = segments[0];
    const minuteToken = segments[1];
    const secondToken = segments[2];
    if (!hourToken || !minuteToken || !secondToken) {
      return null;
    }
    hours = Number.parseInt(hourToken, 10);
    minutes = Number.parseInt(minuteToken, 10);
    seconds = Number.parseInt(secondToken, 10);
  }

  if (Number.isNaN(minutes) || Number.isNaN(seconds) || Number.isNaN(hours) || Number.isNaN(days)) {
    return null;
  }

  return days * 86_400 + hours * 3_600 + minutes * 60 + seconds;
};

const parsePosixProcessLines = (output: string): ProcessInfo[] => {
  const lines = output.split(/\r?\n/);
  if (lines.length <= 1) {
    return [];
  }

  const processes: ProcessInfo[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      continue;
    }

    // Expected columns: PID COMMAND %CPU RSS ETIME
    const match = /^(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+([\d:-]+)$/.exec(trimmedLine);
    if (!match) {
      continue;
    }

    const pidToken = match[1];
    const nameToken = match[2];
    const cpuToken = match[3];
    const rssToken = match[4];
    const etimeToken = match[5];
    if (!pidToken || !nameToken || !cpuToken || !rssToken || !etimeToken) {
      continue;
    }

    const pid = Number.parseInt(pidToken, 10);
    const name = nameToken;
    const cpu = Number.parseFloat(cpuToken);
    const rssKb = Number.parseInt(rssToken, 10);
    const etime = etimeToken;

    processes.push({
      pid,
      name,
      cpu: Number.isNaN(cpu) ? null : cpu,
      memoryBytes: Number.isNaN(rssKb) ? null : rssKb * 1024,
      runtimeSeconds: parseElapsedSeconds(etime),
      command: null, // ps "comm" output excludes full command path to stay portable
    });
  }

  return processes;
};

const runPosixProcessList = async (query: string | null, limit: number): Promise<ProcessListResult> => {
  const { Command } = await loadShellModule();
  const command = Command.create('ps', ['-axo', 'pid,comm,%cpu,rss,etime']);
  const result = await command.execute();

  if (result.code !== 0 && result.code !== null) {
    throw new Error(`ps command failed with code ${result.code}: ${result.stderr}`);
  }

  const allProcesses = parsePosixProcessLines(result.stdout);
  const filtered: ProcessInfo[] = [];
  const normalizedQuery = query ? query.toLowerCase() : null;

  for (let index = 0; index < allProcesses.length; index += 1) {
    const proc = allProcesses[index];
    if (!proc) {
      continue;
    }
    if (normalizedQuery && !proc.name.toLowerCase().includes(normalizedQuery)) {
      continue;
    }
    filtered.push(proc);
  }

  filtered.sort((a, b) => {
    const cpuA = typeof a.cpu === 'number' ? a.cpu : -1;
    const cpuB = typeof b.cpu === 'number' ? b.cpu : -1;
    return cpuB - cpuA;
  });

  const total = filtered.length;
  const truncated = total > limit;
  const processes = filtered.slice(0, limit);

  return {
    action: 'list',
    total,
    truncated,
    processes,
  };
};

/* -------------------------------------------------------------------------
 * TOOL IMPLEMENTATION
 * ------------------------------------------------------------------------- */



const listProcesses = async (query: string | null, limit: number): Promise<ProcessListResult> => {
  await loadShellModule();
  const platform = getPlatform();

  switch (platform) {
    case 'win32':
      return runWindowsProcessList(query, limit);

    case 'linux':
    case 'darwin':
      return runPosixProcessList(query, limit);

    default:
      throw new Error(
        `Platform "${platform}" is not supported for process listing. ` +
          'Supported: Windows, Linux, macOS.',
      );
  }
};

/**
 * Read-only process inspector. Lists running processes optionally filtered by name
 * with a configurable max count. No mutation (no kill/spawn).
 */
export const PROCESS_TOOL: ToolDefinition<ProcessToolArgs, ProcessListResult> = {
  name: 'process',
  description:
    'Lists running processes (list). Supports optional name filter ("query") and a max result limit.',
  schema: {
    action: 'string',
    query: 'string|null',
    limit: 'number|null',
  },
  async execute(args) {
    normalizeAction(args.action);
    const query = normalizeQuery(args.query ?? null);
    const limit = clampPositiveInteger(args.limit, DEFAULT_LIMIT, MAX_LIMIT);
    return listProcesses(query, limit);
  },
};
