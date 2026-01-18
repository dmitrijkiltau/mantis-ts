/** @jsxImportSource solid-js */
import { createEffect, createMemo, createSignal, type Component } from 'solid-js';
import { useUIRefs, useUIStateContext } from '../../state/ui-state-context';
import type { ToolDefinitionBase } from '../../../../assistant/src/tools/definition';
import { TOOLS, type ToolName } from '../../../../assistant/src/tools/registry';
import { useTabletTabs } from '../../state/tablet-tabs-context';

type ToolEntry = {
  name: ToolName;
  definition: ToolDefinitionBase;
};

/**
 * Builds a sorted list of tool entries for display.
 */
const buildToolEntries = (): ToolEntry[] => {
  const entries = Object.entries(TOOLS) as Array<[ToolName, ToolDefinitionBase]>;
  entries.sort((a, b) => a[0].localeCompare(b[0]));

  const tools: ToolEntry[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) {
      continue;
    }
    const [name, definition] = entry;
    tools.push({ name, definition });
  }

  return tools;
};

/**
 * Renders the tool catalog panel.
 */
export const ToolsPanel: Component = () => {
  const refs = useUIRefs();
  const { uiState } = useUIStateContext();
  const { activeTab } = useTabletTabs();
  const [logged, setLogged] = createSignal(false);
  const tools = createMemo(() => buildToolEntries());
  const toolCountLabel = () => {
    const count = tools().length;
    return `${count} tool${count === 1 ? '' : 's'}`;
  };

  createEffect(() => {
    if (logged() || !uiState()) {
      return;
    }
    uiState()?.addLog(`Tool catalog loaded (${tools().length})`);
    setLogged(true);
  });

  return (
    <div class="tablet-panel" id="panel-tools" classList={{ active: activeTab() === 'tools' }}>
      <div class="tool-panel">
        <div class="tool-panel-header">
          <div>
            <div class="tool-label">Available Tools</div>
            <div class="tool-subtext">Registered capabilities accessible to the orchestrator.</div>
          </div>
          <div class="tool-count-badge" id="tool-count" ref={refs.toolCountBadge}>
            {toolCountLabel()}
          </div>
        </div>

        <div class="tool-grid" id="tool-list" ref={refs.toolList}>
          {tools().length === 0 ? (
            <div class="tool-placeholder">No tools registered.</div>
          ) : (
            tools().map((tool) => (
              <div class="tool-card">
                <div class="tool-card-header">
                  <div class="tool-label">
                    {tool.name === tool.definition.name
                      ? `[${tool.name}]`
                      : `[${tool.name}] ${tool.definition.name}`}
                  </div>
                  <div class="tool-subtext">{tool.definition.description}</div>
                </div>
                <div class="tool-schema">
                  <div class="tool-schema-label">Arguments</div>
                  <div class="tool-schema-list">
                    {Object.entries(tool.definition.schema).length === 0 ? (
                      <div class="tool-subtext">No parameters required.</div>
                    ) : (
                      Object.entries(tool.definition.schema).map(([fieldName, fieldType]) => (
                        <span class="schema-pill">
                          <span class="schema-name">{fieldName}</span>
                          <span class="schema-type">{fieldType}</span>
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
