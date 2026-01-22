import type { ToolDefinition } from '../definition.js';
import { getPlatform } from '../internal/helpers.js';
import { z } from 'zod';

/* -------------------------------------------------------------------------
 * TYPES
 * ------------------------------------------------------------------------- */

type DetailLevel = 'basic' | 'detailed';

type PcInfoToolArgs = {
  metrics?: string[] | null;
  detailLevel?: DetailLevel | null;
};

type CpuInfo = {
  cores: number | null;
  threads: number | null;
  model: string | null;
  usage: number | null;
};

type MemoryInfo = {
  totalBytes: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
  usagePercent: number | null;
};

type DiskInfo = {
  path: string;
  totalBytes: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
  usagePercent: number | null;
};

type SystemInfo = {
  platform: string;
  hostname: string | null;
  uptime: number | null;
};

type PcInfoToolResult = {
  system?: SystemInfo;
  cpu?: CpuInfo;
  memory?: MemoryInfo;
  disks?: DiskInfo[];
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

const DEFAULT_METRICS = ['system', 'cpu', 'memory', 'disk'];
const VALID_METRICS = new Set(['system', 'cpu', 'memory', 'disk']);

const pcInfoArgsSchema = z.object({
  metrics: z.array(z.string()).nullable().optional(),
  detailLevel: z.enum(['basic', 'detailed']).nullable().optional(),
});

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
    throw new Error('PC info requires Tauri shell plugin.');
  }
};

const normalizeMetrics = (metrics: string[] | null | undefined): string[] => {
  if (!Array.isArray(metrics) || metrics.length === 0) {
    return DEFAULT_METRICS;
  }

  const normalized: string[] = [];
  for (let index = 0; index < metrics.length; index += 1) {
    const metric = metrics[index];
    if (!metric) {
      continue;
    }
    const lower = metric.toLowerCase().trim();
    const mapped = lower === 'ram' ? 'memory' : lower === 'storage' ? 'disk' : lower;
    if (VALID_METRICS.has(mapped)) {
      normalized.push(mapped);
    }
  }

  return normalized.length > 0 ? normalized : DEFAULT_METRICS;
};

/* -------------------------------------------------------------------------
 * WINDOWS IMPLEMENTATION
 * ------------------------------------------------------------------------- */

/**
 * Builds a PowerShell script to collect requested Windows metrics.
 */
const buildWindowsInfoScript = (metrics: string[], includeCpuUsage: boolean): string => {
  const needsCpu = metrics.includes('cpu');
  const needsMemory = metrics.includes('memory');
  const needsDisk = metrics.includes('disk');
  const needsSystem = metrics.includes('system');

  const sections: string[] = [];

  sections.push('$ErrorActionPreference = "Stop"');
  sections.push('$result = [PSCustomObject]@{}');

  if (needsSystem) {
    sections.push(`
$system = [PSCustomObject]@{
  platform = "win32"
  hostname = $env:COMPUTERNAME
  uptime = [int][Math]::Round((New-TimeSpan -Start (Get-CimInstance Win32_OperatingSystem).LastBootUpTime).TotalSeconds)
}
$result | Add-Member -NotePropertyName system -NotePropertyValue $system
`);
  }

  if (needsCpu) {
    sections.push(`
$cpuInfo = Get-CimInstance Win32_Processor | Select-Object -First 1
$cpu = [PSCustomObject]@{
  cores = $cpuInfo.NumberOfCores
  threads = $cpuInfo.NumberOfLogicalProcessors
  model = $cpuInfo.Name
  usage = $null
}
$result | Add-Member -NotePropertyName cpu -NotePropertyValue $cpu
`);
  }

  if (needsCpu && includeCpuUsage) {
    sections.push(`
$cpuLoad = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$result.cpu.usage = [double]$cpuLoad
`);
  }

  if (needsMemory) {
    sections.push(`
$os = Get-CimInstance Win32_OperatingSystem
$totalMemory = $os.TotalVisibleMemorySize * 1KB
$freeMemory = $os.FreePhysicalMemory * 1KB
$usedMemory = $totalMemory - $freeMemory
$memory = [PSCustomObject]@{
  totalBytes = [long]$totalMemory
  usedBytes = [long]$usedMemory
  freeBytes = [long]$freeMemory
  usagePercent = [double][Math]::Round(($usedMemory / $totalMemory) * 100, 2)
}
$result | Add-Member -NotePropertyName memory -NotePropertyValue $memory
`);
  }

  if (needsDisk) {
    sections.push(`
$diskList = Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 } | ForEach-Object {
  [PSCustomObject]@{
    path = $_.DeviceID
    totalBytes = [long]$_.Size
    freeBytes = [long]$_.FreeSpace
    usedBytes = [long]($_.Size - $_.FreeSpace)
    usagePercent = if ($_.Size -gt 0) { [double][Math]::Round((($_.Size - $_.FreeSpace) / $_.Size) * 100, 2) } else { 0.0 }
  }
}
$result | Add-Member -NotePropertyName disks -NotePropertyValue @($diskList)
`);
  }

  sections.push('$result | ConvertTo-Json -Depth 4 -Compress');
  return sections.join('\n');
};

/**
 * Runs the Windows PC info collection script.
 */
const runWindowsPcInfo = async (
  metrics: string[],
  includeCpuUsage: boolean,
): Promise<PcInfoToolResult> => {
  const { Command } = await loadShellModule();
  const script = buildWindowsInfoScript(metrics, includeCpuUsage);
  const command = Command.create('powershell', ['-NoProfile', '-NonInteractive', '-Command', script]);
  const result = await command.execute();

  if (result.code !== 0 && result.code !== null) {
    throw new Error(`PowerShell command failed with code ${result.code}: ${result.stderr}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    throw new Error('Unable to parse PC info from PowerShell output.');
  }

  return payload as PcInfoToolResult;
};

/* -------------------------------------------------------------------------
 * POSIX IMPLEMENTATION
 * ------------------------------------------------------------------------- */

const parsePosixUptime = (stdout: string): number | null => {
  // Parse uptime output: "up X days, HH:MM" or variations
  const match = /up\s+(?:(\d+)\s+days?,\s*)?(?:(\d+):(\d+))?/.exec(stdout);
  if (!match) {
    return null;
  }

  const daysToken = match[1];
  const hoursToken = match[2];
  const minutesToken = match[3];

  const days = daysToken ? Number.parseInt(daysToken, 10) : 0;
  const hours = hoursToken ? Number.parseInt(hoursToken, 10) : 0;
  const minutes = minutesToken ? Number.parseInt(minutesToken, 10) : 0;

  return days * 86_400 + hours * 3_600 + minutes * 60;
};

const getPosixSystemInfo = async (Command: TauriCommand): Promise<SystemInfo> => {
  let hostname: string | null = null;
  let uptime: number | null = null;

  try {
    const hostnameCmd = Command.create('hostname', []);
    const hostnameResult = await hostnameCmd.execute();
    if (hostnameResult.code === 0) {
      hostname = hostnameResult.stdout.trim();
    }
  } catch {
    // Hostname not critical
  }

  try {
    const uptimeCmd = Command.create('uptime', []);
    const uptimeResult = await uptimeCmd.execute();
    if (uptimeResult.code === 0) {
      uptime = parsePosixUptime(uptimeResult.stdout);
    }
  } catch {
    // Uptime not critical
  }

  return {
    platform: getPlatform(),
    hostname,
    uptime,
  };
};

/**
 * Collects POSIX CPU metadata and optional usage percentage.
 */
const getPosixCpuInfo = async (Command: TauriCommand, includeUsage: boolean): Promise<CpuInfo> => {
  let cores: number | null = null;
  let threads: number | null = null;
  let model: string | null = null;
  let usage: number | null = null;

  try {
    // Get CPU model and core count
    const cpuinfoCmd = Command.create('cat', ['/proc/cpuinfo']);
    const cpuinfoResult = await cpuinfoCmd.execute();
    if (cpuinfoResult.code === 0) {
      const lines = cpuinfoResult.stdout.split('\n');
      let processorCount = 0;
      let physicalIdSet = new Set<string>();

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line) {
          continue;
        }
        if (line.startsWith('processor')) {
          processorCount += 1;
        } else if (line.startsWith('physical id')) {
          const idMatch = /:\s*(\d+)/.exec(line);
          if (idMatch && idMatch[1]) {
            physicalIdSet.add(idMatch[1]);
          }
        } else if (line.startsWith('model name') && !model) {
          const modelMatch = /:\s*(.+)/.exec(line);
          if (modelMatch && modelMatch[1]) {
            model = modelMatch[1].trim();
          }
        }
      }

      threads = processorCount > 0 ? processorCount : null;
      cores = physicalIdSet.size > 0 ? physicalIdSet.size : threads;
    }
  } catch {
    // CPU info not critical
  }

  if (includeUsage) {
    try {
      // Get CPU usage via top
      const topCmd = Command.create('sh', ['-c', 'top -bn1 | grep "Cpu(s)"']);
      const topResult = await topCmd.execute();
      if (topResult.code === 0) {
        const match = /(\d+\.\d+)\s*id/.exec(topResult.stdout);
        if (match && match[1]) {
          const idle = Number.parseFloat(match[1]);
          usage = 100 - idle;
        }
      }
    } catch {
      // CPU usage not critical
    }
  }

  return { cores, threads, model, usage };
};

const getPosixMemoryInfo = async (Command: TauriCommand): Promise<MemoryInfo> => {
  let totalBytes: number | null = null;
  let freeBytes: number | null = null;
  let usedBytes: number | null = null;
  let usagePercent: number | null = null;

  try {
    const meminfoCmd = Command.create('cat', ['/proc/meminfo']);
    const meminfoResult = await meminfoCmd.execute();
    if (meminfoResult.code === 0) {
      const lines = meminfoResult.stdout.split('\n');
      let memTotal = 0;
      let memAvailable = 0;

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line) {
          continue;
        }
        if (line.startsWith('MemTotal:')) {
          const match = /(\d+)/.exec(line);
          if (match && match[1]) {
            memTotal = Number.parseInt(match[1], 10) * 1024;
          }
        } else if (line.startsWith('MemAvailable:')) {
          const match = /(\d+)/.exec(line);
          if (match && match[1]) {
            memAvailable = Number.parseInt(match[1], 10) * 1024;
          }
        }
      }

      if (memTotal > 0) {
        totalBytes = memTotal;
        freeBytes = memAvailable;
        usedBytes = memTotal - memAvailable;
        usagePercent = (usedBytes / memTotal) * 100;
      }
    }
  } catch {
    // Memory info not critical
  }

  return { totalBytes, usedBytes, freeBytes, usagePercent };
};

const getPosixDiskInfo = async (Command: TauriCommand): Promise<DiskInfo[]> => {
  const disks: DiskInfo[] = [];

  try {
    const dfCmd = Command.create('df', ['-k']);
    const dfResult = await dfCmd.execute();
    if (dfResult.code === 0) {
      const lines = dfResult.stdout.split('\n');

      for (let index = 1; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line) {
          continue;
        }
        const parts = line.trim().split(/\s+/);
        if (parts.length < 6) {
          continue;
        }

        const mountPoint = parts[5];
        if (!mountPoint || mountPoint.startsWith('/dev') || mountPoint.startsWith('/sys')) {
          continue;
        }

        const totalKb = Number.parseInt(parts[1] ?? '0', 10);
        const usedKb = Number.parseInt(parts[2] ?? '0', 10);
        const availKb = Number.parseInt(parts[3] ?? '0', 10);

        if (totalKb > 0) {
          disks.push({
            path: mountPoint,
            totalBytes: totalKb * 1024,
            usedBytes: usedKb * 1024,
            freeBytes: availKb * 1024,
            usagePercent: (usedKb / totalKb) * 100,
          });
        }
      }
    }
  } catch {
    // Disk info not critical
  }

  return disks;
};

/**
 * Collects POSIX system metrics based on the requested scope.
 */
const runPosixPcInfo = async (
  metrics: string[],
  includeCpuUsage: boolean,
): Promise<PcInfoToolResult> => {
  const { Command } = await loadShellModule();
  const result: PcInfoToolResult = {};

  if (metrics.includes('system')) {
    result.system = await getPosixSystemInfo(Command);
  }

  if (metrics.includes('cpu')) {
    result.cpu = await getPosixCpuInfo(Command, includeCpuUsage);
  }

  if (metrics.includes('memory')) {
    result.memory = await getPosixMemoryInfo(Command);
  }

  if (metrics.includes('disk')) {
    result.disks = await getPosixDiskInfo(Command);
  }

  return result;
};

/* -------------------------------------------------------------------------
 * TOOL IMPLEMENTATION
 * ------------------------------------------------------------------------- */

/**
 * Executes platform-specific system inspection.
 */
const getPcInfo = async (
  metrics: string[],
  includeCpuUsage: boolean,
): Promise<PcInfoToolResult> => {
  await loadShellModule();
  const platform = getPlatform();

  switch (platform) {
    case 'win32':
      return runWindowsPcInfo(metrics, includeCpuUsage);

    case 'linux':
    case 'darwin':
      return runPosixPcInfo(metrics, includeCpuUsage);

    default:
      throw new Error(
        `Platform "${platform}" is not supported for PC info. ` +
          'Supported: Windows, Linux, macOS.',
      );
  }
};

/**
 * Read-only PC information and resource usage inspector.
 * Provides system stats, CPU info/usage, memory usage, and disk usage.
 */
export const PCINFO_TOOL: ToolDefinition<PcInfoToolArgs, PcInfoToolResult> = {
  name: 'pcinfo',
  description: 'hardware summary, resource totals, and device identifiers of the host PC',
  schema: {
    metrics: 'string[]|null',
    detailLevel: 'string|null',
  },
  argsSchema: pcInfoArgsSchema,
  async execute(args) {
    const detailLevel: DetailLevel = args.detailLevel ?? 'detailed';
    const metrics = normalizeMetrics(args.metrics ?? null);
    const filteredMetrics = detailLevel === 'basic' ? metrics.filter((metric) => metric !== 'disk') : metrics;
    const includeCpuUsage = detailLevel === 'detailed';
    return getPcInfo(filteredMetrics, includeCpuUsage);
  },
};
