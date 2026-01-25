import type { ToolDefinitionBase } from './definition.js';
import { FILESYSTEM_TOOL } from './local/filesystem.js';
import { SEARCH_TOOL } from './local/search.js';
import { HTTP_TOOL } from './web/http.js';
import { PROCESS_TOOL } from './system/process.js';
import { SHELL_TOOL } from './system/shell.js';
import { PCINFO_TOOL } from './system/pcinfo.js';

/**
 * Central tool definitions keyed by name.
 */
const TOOL_DEFINITIONS = {
  filesystem: FILESYSTEM_TOOL,
  search: SEARCH_TOOL,
  http: HTTP_TOOL,
  process: PROCESS_TOOL,
  shell: SHELL_TOOL,
  pcinfo: PCINFO_TOOL,
} as const;

export type ToolName = keyof typeof TOOL_DEFINITIONS;

export const TOOLS = TOOL_DEFINITIONS as Record<ToolName, ToolDefinitionBase>;

const normalizeTriggers = (raw: unknown, name: string): string[] => {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`Tool "${name}" must declare a non-empty 'triggers' array`);
  }

  const normalized = Array.from(
    new Set(raw.map((t) => String(t).toLowerCase().trim()).filter(Boolean)),
  );

  if (normalized.length === 0) {
    throw new Error(`Tool "${name}" must declare at least one valid trigger`);
  }

  return normalized;
};

for (const [name, def] of Object.entries(TOOLS) as Array<[ToolName, ToolDefinitionBase]>) {
  def.triggers = normalizeTriggers(def.triggers, name);
}

export const getToolDefinition = (name: ToolName): ToolDefinitionBase => TOOLS[name];

export const GENERAL_ANSWER_INTENT = 'answer.general';
export const CONVERSATION_INTENT = 'answer.conversation';
