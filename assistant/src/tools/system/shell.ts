import type { ToolDefinition } from '../definition.js';
import { getPlatform, normalizeAction } from '../internal/helpers.js';
import { z } from 'zod';

/* -------------------------------------------------------------------------
 * TYPES
 * ------------------------------------------------------------------------- */

type ShellToolArgs = {
  action: string;
  program: string;
  args?: string[] | null;
  timeoutMs?: number | null;
  cwd?: string | null;
};

type ShellRunResult = {
  action: 'run';
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

type TauriCommand = {
  create: (
    program: string,
    args?: string[] | string,
    options?: { cwd?: string },
  ) => TauriCommandChild;
};

type TauriCommandChild = {
  execute: () => Promise<{ code: number | null; signal: number | null; stdout: string; stderr: string }>;
  spawn: () => Promise<TauriCommandProcess>;
};

type TauriCommandProcess = {
  write: (data: string | Uint8Array) => Promise<void>;
  kill: () => Promise<void>;
};

type ShellModule = {
  Command: TauriCommand;
};

/* -------------------------------------------------------------------------
 * CONSTANTS
 * ------------------------------------------------------------------------- */

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

const SHELL_ACTIONS = new Set(['run']);

const RUN_ALIASES = new Set(['run', 'execute', 'exec', 'shell']);
const RUN_ALIAS_MAP = new Map(
  [...RUN_ALIASES].map((alias) => [alias, 'run' as const]),
);

// Allowlisted safe binaries per platform
const WINDOWS_ALLOWLIST = new Set(['powershell', 'ps', 'git', 'docker', 'npm']);
const POSIX_ALLOWLIST = new Set([
  'sh',
  'bash',
  'ps',
  'cat',
  'ls',
  'pwd',
  'echo',
  'grep',
  'find',
  'which',
  'env',
  'git',
  'docker',
  'npm',
  'systemctl',
]);

// Destructive tokens to block (exact matches only)
const DESTRUCTIVE_TOKENS = new Set([
  'rm',
  'del',
  'rmdir',
  'mv',
  'move',
  'cp',
  'copy',
  'sudo',
  'su',
  'kill',
  'pkill',
  'taskkill',
  'format',
  'mkfs',
  'dd',
  'fdisk',
  'parted',
  'shutdown',
  'reboot',
  'chown',
  'chmod',
  'chgrp',
  'chroot',
  'delete',
  'remove',
  'erase',
  'destroy',
  'wipe',
  'stop',
  'restart',
  'uninstall',
  'purge',
  'prune',
  'clean',
  'rmi',
]);

// Patterns for destructive operations
const DESTRUCTIVE_PATTERNS = [
  />/, // Output redirection
  />>/, // Append redirection
  /\|/, // Pipe (could chain to destructive commands)
  /;/, // Command chaining
  /&&/, // AND chaining
  /\|\|/, // OR chaining
  /`/, // Command substitution
  /\$\(/, // Command substitution
  /:\(\)\s*\{/, // Fork bomb pattern
  /^-force$/i,
  /^-recurse$/i,
  /^-rf$/i,
  /^-fr$/i,
  /^--force(?:=|$)/i,
  /^--recursive(?:=|$)/i,
  /^--delete(?:=|$)/i,
  /^--remove(?:=|$)/i,
  /^--purge(?:=|$)/i,
  /^--prune(?:=|$)/i,
];

const shellArgsSchema = z.object({
  action: z.string().min(1),
  program: z.string().min(1),
  args: z.array(z.string()).nullable().optional(),
  timeoutMs: z.number().int().positive().nullable().optional(),
  cwd: z.string().nullable().optional(),
});

/* -------------------------------------------------------------------------
 * STATE
 * ------------------------------------------------------------------------- */

let shellModule: ShellModule | null = null;

/* -------------------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------------------- */

/**
 * Lazy-load the Tauri shell module.
 */
const loadShellModule = async (): Promise<ShellModule> => {
  if (shellModule) {
    return shellModule;
  }

  try {
    const { Command } = await import('@tauri-apps/plugin-shell');
    shellModule = { Command };
    return shellModule;
  } catch (error) {
    throw new Error('Shell execution requires Tauri shell plugin.');
  }
};



/**
 * Clamp timeout to safe bounds.
 */
const clampTimeout = (timeoutMs: number | null | undefined): number => {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(Math.floor(timeoutMs), MAX_TIMEOUT_MS);
};

/**
 * Validate that the program is in the platform-specific allowlist.
 */
const validateProgram = (program: string, platform: string): void => {
  const normalized = program.trim().toLowerCase();

  if (!normalized) {
    throw new Error('Program name cannot be empty.');
  }

  // Check against platform allowlist
  const allowlist = platform === 'win32' ? WINDOWS_ALLOWLIST : POSIX_ALLOWLIST;
  const programName = normalized.split(/[\\/]/).pop() || normalized;

  if (!allowlist.has(programName)) {
    throw new Error(
      `Program "${program}" is not allowed. Permitted programs for ${platform}: ${[...allowlist].join(', ')}`,
    );
  }
};

/**
 * Scan for destructive tokens in program and args.
 */
const validateNoDestructiveTokens = (program: string, args: string[]): void => {
  const allTokens = [program, ...args];

  for (let index = 0; index < allTokens.length; index += 1) {
    const tokenValue = allTokens[index];
    if (!tokenValue) {
      continue;
    }
    const token = tokenValue.toLowerCase();

    // Check against destructive token set
    if (DESTRUCTIVE_TOKENS.has(token)) {
      throw new Error(
        `Destructive operation detected: "${tokenValue}". ` +
          'Only non-destructive commands are allowed.',
      );
    }

    // Check against destructive patterns
    for (let patternIndex = 0; patternIndex < DESTRUCTIVE_PATTERNS.length; patternIndex += 1) {
      const pattern = DESTRUCTIVE_PATTERNS[patternIndex];
      if (!pattern) {
        continue;
      }
      if (pattern.test(token)) {
        throw new Error(
          `Destructive pattern detected in "${allTokens[index]}". ` +
            'Shell redirection, chaining, and destructive operations are blocked.',
        );
      }
    }
  }
};

/**
 * Normalize and validate arguments.
 */
const normalizeArgs = (args: string[] | null | undefined): string[] => {
  if (!Array.isArray(args)) {
    return [];
  }
  return args.map((arg) => (typeof arg === 'string' ? arg : String(arg)));
};

/**
 * Normalize working directory input.
 */
const normalizeCwd = (cwd: string | null | undefined): string | null => {
  if (typeof cwd !== 'string') {
    return null;
  }
  const trimmed = cwd.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/* -------------------------------------------------------------------------
 * EXECUTION
 * ------------------------------------------------------------------------- */

/**
 * Build platform-specific command invocation.
 */
const buildCommand = async (
  program: string,
  args: string[],
  platform: string,
  cwd: string | null,
): Promise<TauriCommandChild> => {
  const { Command } = await loadShellModule();
  const options = cwd ? { cwd } : undefined;

  if (platform === 'win32') {
    // Windows: use powershell with safe execution policy
    const programLower = program.toLowerCase();
    if (programLower === 'powershell' || programLower === 'ps') {
      // Direct powershell execution
      return Command.create('powershell', ['-NoProfile', '-NonInteractive', ...args], options);
    }
    // Wrap other commands in powershell
    const escapedArgs = args.map((arg) => `'${arg.replace(/'/g, "''")}'`);
    const scriptBlock = [program, ...escapedArgs].join(' ');
    return Command.create('powershell', ['-NoProfile', '-NonInteractive', '-Command', scriptBlock], options);
  }

  // POSIX: use sh for sh/bash, or direct execution for other commands
  const programLower = program.toLowerCase();
  if (programLower === 'sh' || programLower === 'bash') {
    return Command.create(program, args, options);
  }

  // Direct execution for other allowlisted commands
  return Command.create(program, args, options);
};

/**
 * Execute shell command with timeout.
 */
const executeWithTimeout = async (
  command: TauriCommandChild,
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> => {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
  });

  try {
    const result = await Promise.race([command.execute(), timeoutPromise]);
    return {
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
      timedOut: false,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'TIMEOUT') {
      return {
        code: null,
        stdout: '',
        stderr: 'Command execution timed out.',
        timedOut: true,
      };
    }
    throw error;
  }
};

/**
 * Run shell command with full validation and safety checks.
 */
const runShellCommand = async (
  program: string,
  args: string[],
  timeoutMs: number,
  cwd: string | null,
): Promise<ShellRunResult> => {
  const platform = getPlatform();

  if (platform === 'unknown') {
    throw new Error('Unable to detect platform. Shell execution is not supported.');
  }

  // Validate program and args
  validateProgram(program, platform);
  validateNoDestructiveTokens(program, args);

  // Build and execute command
  const command = await buildCommand(program, args, platform, cwd);
  const result = await executeWithTimeout(command, timeoutMs);

  // Normalize exit code
  const exitCode = typeof result.code === 'number' ? result.code : -1;

  return {
    action: 'run',
    exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
  };
};

/* -------------------------------------------------------------------------
 * TOOL DEFINITION
 * ------------------------------------------------------------------------- */

/**
 * Safe shell command executor. Only allows non-destructive commands
 * from an allowlist. Blocks destructive operations, output redirection,
 * command chaining, and malicious patterns.
 */
export const SHELL_TOOL: ToolDefinition<ShellToolArgs, ShellRunResult> = {
  name: 'shell',
  description: `Fallback for system commands not covered by other tools: e.g., git/docker/npm/systemctl on POSIX; powershell/ps/git/docker/npm on Windows.
Use for non-destructive commands only.`,
  schema: {
    action: 'string',
    program: 'string',
    args: 'string[]|null',
    timeoutMs: 'number|null',
    cwd: 'string|null',
  },
  argsSchema: shellArgsSchema,
  async execute(args) {
    normalizeAction(args.action, SHELL_ACTIONS, {
      subject: 'shell',
      aliases: RUN_ALIAS_MAP,
      allowedHint: 'Only "run" is allowed.',
    });
    const normalizedArgs = normalizeArgs(args.args);
    const cwd = normalizeCwd(args.cwd);
    const timeoutMs = clampTimeout(args.timeoutMs);

    return runShellCommand(args.program, normalizedArgs, timeoutMs, cwd);
  },
};
