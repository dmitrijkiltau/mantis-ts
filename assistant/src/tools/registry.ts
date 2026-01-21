import type { ToolDefinitionBase } from './definition.js';
import { CLIPBOARD_TOOL } from './local/clipboard.js';
import { FILESYSTEM_TOOL } from './local/filesystem.js';
import { SEARCH_TOOL } from './local/search.js';
import { HTTP_TOOL } from './web/http.js';
import { PROCESS_TOOL } from './system/process.js';
import { SHELL_TOOL } from './system/shell.js';
import { PCINFO_TOOL } from './system/pcinfo.js';

type ToolMetadata = {
  definition: ToolDefinitionBase;
  triggers: string[];
};

/**
 * Registry of available tools keyed by name.
 */
const TOOL_METADATA = {
  clipboard: {
    definition: CLIPBOARD_TOOL,
    triggers: ['clipboard', 'copy', 'paste'],
  },
  filesystem: {
    definition: FILESYSTEM_TOOL,
    triggers: ['file', 'files', 'folder', 'directory', 'path', 'read', 'list', 'open'],
  },
  search: {
    definition: SEARCH_TOOL,
    triggers: ['search', 'find', 'locate', 'lookup'],
  },
  http: {
    definition: HTTP_TOOL,
    triggers: ['http', 'https', 'url', 'fetch', 'get', 'request', 'download'],
  },
  process: {
    definition: PROCESS_TOOL,
    triggers: ['process', 'processes', 'ps', 'pid', 'task', 'service'],
  },
  shell: {
    definition: SHELL_TOOL,
    triggers: ['shell', 'command', 'terminal', 'cmd', 'run'],
  },
  pcinfo: {
    definition: PCINFO_TOOL,
    triggers: ['system', 'cpu', 'ram', 'memory', 'disk', 'storage', 'uptime', 'host', 'pc', 'machine'],
  },
} satisfies Record<string, ToolMetadata>;

export type ToolName = keyof typeof TOOL_METADATA;

const toolEntries = Object.entries(TOOL_METADATA) as Array<[ToolName, ToolMetadata]>;

export const TOOLS = {} as Record<ToolName, ToolDefinitionBase>;

/**
 * Trigger keywords that must appear in the user input to allow tool execution.
 */
export const TOOL_TRIGGERS = {} as Record<ToolName, string[]>;

for (const [name, metadata] of toolEntries) {
  TOOLS[name] = metadata.definition;
  TOOL_TRIGGERS[name] = metadata.triggers;
}

export const GENERAL_ANSWER_INTENT = 'answer.general';
export const CONVERSATION_INTENT = 'answer.conversation';

/**
 * Returns the tool definition for runtime dispatch.
 */
export const getToolDefinition = (name: ToolName): ToolDefinitionBase => TOOLS[name];
