import type { ToolDefinitionBase } from './definition.js';
import { CLIPBOARD_TOOL } from './local/clipboard.js';
import { FILESYSTEM_TOOL } from './local/filesystem.js';
import { SEARCH_TOOL } from './local/search.js';
import { HTTP_TOOL } from './web/http.js';
import { PROCESS_TOOL } from './system/process.js';
import { SHELL_TOOL } from './system/shell.js';
import { PCINFO_TOOL } from './system/pcinfo.js';

/**
 * Registry of available tools keyed by name.
 */
export const TOOLS = {
  clipboard: CLIPBOARD_TOOL,
  filesystem: FILESYSTEM_TOOL,
  search: SEARCH_TOOL,
  http: HTTP_TOOL,
  process: PROCESS_TOOL,
  shell: SHELL_TOOL,
  pcinfo: PCINFO_TOOL,
};

export type ToolName = keyof typeof TOOLS;

export const GENERAL_ANSWER_INTENT = 'answer.general';
export const CONVERSATION_INTENT = 'answer.conversation';

/**
 * Trigger keywords that must appear in the user input to allow tool execution.
 */
export const TOOL_TRIGGERS: Record<ToolName, string[]> = {
  clipboard: ['clipboard', 'copy', 'paste'],
  filesystem: ['file', 'files', 'folder', 'directory', 'path', 'read', 'list', 'open'],
  search: ['search', 'find', 'locate', 'lookup'],
  http: ['http', 'https', 'url', 'fetch', 'get', 'request', 'download'],
  process: ['process', 'processes', 'ps', 'pid', 'task', 'service'],
  shell: ['shell', 'command', 'terminal', 'cmd', 'run'],
  pcinfo: ['system', 'cpu', 'ram', 'memory', 'disk', 'storage', 'uptime', 'host', 'pc', 'machine'],
};

/**
 * Returns the tool definition for runtime dispatch.
 */
export const getToolDefinition = (name: ToolName): ToolDefinitionBase => TOOLS[name];
