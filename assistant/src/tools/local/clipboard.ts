import type { ExecFileOptionsWithStringEncoding } from 'node:child_process';
import type { ToolDefinition } from '../definition.js';

/* -------------------------------------------------------------------------
 * TYPES
 * ------------------------------------------------------------------------- */

type ClipboardToolArgs = {
  action: string;
  text?: string | null;
};

type ClipboardToolResult =
  | { action: 'read'; text: string }
  | { action: 'write'; text: string };

type ProcessCommand = {
  command: string;
  args?: string[];
};

/* -------------------------------------------------------------------------
 * CONSTANTS & CONFIG
 * ------------------------------------------------------------------------- */

const DEFAULT_OPTIONS: ExecFileOptionsWithStringEncoding = {
  encoding: 'utf8',
  maxBuffer: 1024 * 1024,
};

// Windows
const WIN_READ: ProcessCommand = {
  command: 'powershell',
  args: ['-NoProfile', '-NonInteractive', '-Command', 'Get-Clipboard'],
};
const WIN_WRITE: ProcessCommand = { command: 'clip' };

// macOS
const MAC_READ: ProcessCommand = { command: 'pbpaste' };
const MAC_WRITE: ProcessCommand = { command: 'pbcopy' };

// Linux (Priority Order)
const LINUX_READS: ProcessCommand[] = [
  { command: 'wl-paste', args: ['--no-newline'] },
  { command: 'xclip', args: ['-selection', 'clipboard', '-o'] },
  { command: 'xsel', args: ['--clipboard', '--output'] },
];

const LINUX_WRITES: ProcessCommand[] = [
  { command: 'wl-copy' },
  { command: 'xclip', args: ['-selection', 'clipboard'] },
  { command: 'xsel', args: ['--clipboard', '--input'] },
];

/* -------------------------------------------------------------------------
 * NODE MODULE LAZY LOADING
 * ------------------------------------------------------------------------- */

type NodeModules = {
  execFileAsync: (file: string, args: string[], options: any) => Promise<{ stdout: string }>;
  spawn: typeof import('node:child_process').spawn;
};

let nodeModules: NodeModules | null = null;

const loadNodeModules = async (): Promise<NodeModules> => {
  if (nodeModules) return nodeModules;

  if (typeof process === 'undefined' || !process.versions?.node) {
    throw new Error('Clipboard operations requiring native commands must run in Node.js.');
  }

  const [cp, util] = await Promise.all([
    import('node:child_process'),
    import('node:util'),
  ]);

  nodeModules = {
    execFileAsync: util.promisify(cp.execFile),
    spawn: cp.spawn,
  };
  return nodeModules;
};

/* -------------------------------------------------------------------------
 * LOW-LEVEL EXECUTION
 * ------------------------------------------------------------------------- */

const runRead = async (cmd: ProcessCommand): Promise<string> => {
  const { execFileAsync } = await loadNodeModules();
  const { stdout } = await execFileAsync(cmd.command, cmd.args ?? [], DEFAULT_OPTIONS);
  return stdout.trim(); // Usually desirable to trim OS shell artifacts
};

const runWrite = async (cmd: ProcessCommand, text: string): Promise<void> => {
  const { spawn } = await loadNodeModules();
  return new Promise((resolve, reject) => {
    const child = spawn(cmd.command, cmd.args ?? [], { stdio: ['pipe', 'ignore', 'ignore'] });
    
    child.on('error', reject);
    child.on('close', (code) => {
      code === 0 ? resolve() : reject(new Error(`"${cmd.command}" exited with code ${code}`));
    });

    if (child.stdin) {
      child.stdin.end(text, 'utf8');
    } else {
      reject(new Error('Stdin unavailable for clipboard command.'));
    }
  });
};

/* -------------------------------------------------------------------------
 * PLATFORM STRATEGY RESOLUTION
 * ------------------------------------------------------------------------- */

type ClipboardDriver = {
  read: () => Promise<string>;
  write: (text: string) => Promise<void>;
};

let activeDriver: ClipboardDriver | null = null;

/**
 * Determines the correct clipboard strategy once and caches it.
 * Checks Browser API -> Windows -> Mac -> Linux (Auto-detect).
 */
const getClipboardDriver = async (): Promise<ClipboardDriver> => {
  if (activeDriver) return activeDriver;

  // 1. Browser Environment
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard?.readText &&
    navigator.clipboard?.writeText
  ) {
    activeDriver = {
      read: () => navigator.clipboard.readText(),
      write: (t) => navigator.clipboard.writeText(t),
    };
    return activeDriver;
  }

  // 2. Node Environment
  await loadNodeModules(); // Ensure modules exist before checking platform

  switch (process.platform) {
    case 'win32':
      activeDriver = {
        read: () => runRead(WIN_READ),
        write: (t) => runWrite(WIN_WRITE, t),
      };
      break;

    case 'darwin':
      activeDriver = {
        read: () => runRead(MAC_READ),
        write: (t) => runWrite(MAC_WRITE, t),
      };
      break;

    case 'linux':
    case 'freebsd':
    case 'openbsd':
    case 'sunos':
      // Linux Optimization: Find the working command pair ONCE
      activeDriver = await resolveLinuxDriver();
      break;

    default:
      throw new Error(`Platform "${process.platform}" is not supported.`);
  }

  return activeDriver!;
};

/**
 * Iterates through Linux commands to find the installed one.
 * Returns a driver that uses ONLY the working command.
 */
const resolveLinuxDriver = async (): Promise<ClipboardDriver> => {
  for (let i = 0; i < LINUX_READS.length; i++) {
    const readCmd = LINUX_READS[i];
    const writeCmd = LINUX_WRITES[i];
    try {
      // Test read command (safest way to check existence)
      // We assume if read works, write works for the same suite (e.g. wl-paste + wl-copy)
      await runRead(readCmd);
      
      // If successful, return a driver bound to these specific commands
      return {
        read: () => runRead(readCmd),
        write: (t) => runWrite(writeCmd, t),
      };
    } catch {
      // Continue to next tool
    }
  }
  throw new Error('No supported clipboard utilities (wl-clipboard, xclip, xsel) found.');
};

/* -------------------------------------------------------------------------
 * TOOL DEFINITION
 * ------------------------------------------------------------------------- */

const READ_ALIASES = new Set(['read', 'paste', 'get', 'get_clipboard_content']);
const WRITE_ALIASES = new Set(['write', 'copy', 'set']);

export const CLIPBOARD_TOOL: ToolDefinition<ClipboardToolArgs, ClipboardToolResult> = {
  name: 'clipboard',
  description:
    'Reads from or writes to the OS clipboard. Actions: "read" (or "paste") to fetch, "write" (or "copy") to update.',
  schema: {
    action: 'string',
    text: 'string|null',
  },
  async execute(args) {
    const action = args.action.trim().toLowerCase();
    const driver = await getClipboardDriver();

    if (READ_ALIASES.has(action)) {
      const text = await driver.read();
      return { action: 'read', text };
    }

    if (WRITE_ALIASES.has(action)) {
      if (typeof args.text !== 'string') {
        throw new Error('Clipboard write requires a "text" argument.');
      }
      await driver.write(args.text);
      return { action: 'write', text: args.text };
    }

    throw new Error(`Unknown clipboard action: "${action}"`);
  },
};