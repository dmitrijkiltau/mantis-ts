import type { ToolDefinitionBase } from './definition.js';
import { CLIPBOARD_TOOL } from './local/clipboard.js';
import { FILESYSTEM_TOOL } from './local/filesystem.js';
import { SEARCH_TOOL } from './local/search.js';
import { FETCH_TOOL } from './web/fetch.js';
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
  fetch: FETCH_TOOL,
  http: HTTP_TOOL,
  process: PROCESS_TOOL,
  shell: SHELL_TOOL,
  pcinfo: PCINFO_TOOL,
};

export type ToolName = keyof typeof TOOLS;

export const GENERAL_ANSWER_INTENT = 'answer.general';
export const CONVERSATION_INTENT = 'answer.conversation';

/**
 * Returns the tool definition for runtime dispatch.
 */
export const getToolDefinition = (name: ToolName): ToolDefinitionBase => TOOLS[name];
