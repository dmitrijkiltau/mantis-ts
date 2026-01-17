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
 * Cached intent labels to avoid per-request allocation.
 */
let toolIntentsCache: string[] | null = null;

/**
 * Returns intent labels derived from the tool registry (cached).
 */
export const getToolIntents = (): string[] => {
  if (toolIntentsCache !== null) {
    return toolIntentsCache;
  }

  const intents: string[] = [];

  intents.push(GENERAL_ANSWER_INTENT);
  intents.push(CONVERSATION_INTENT);

  const toolNames = Object.keys(TOOLS) as ToolName[];
  for (let index = 0; index < toolNames.length; index += 1) {
    intents.push(`tool.${toolNames[index]}`);
  }

  toolIntentsCache = intents;
  return intents;
};

/**
 * Returns the tool definition for runtime dispatch.
 */
export const getToolDefinition = (name: ToolName): ToolDefinitionBase => TOOLS[name];
