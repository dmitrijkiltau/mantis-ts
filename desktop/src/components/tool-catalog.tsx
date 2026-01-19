/** @jsxImportSource solid-js */
import { createEffect, createMemo, createSignal, For, type Component } from 'solid-js';
import type { ToolDefinitionBase } from '../../../assistant/src/tools/definition';
import { TOOLS, type ToolName } from '../../../assistant/src/tools/registry';
import { useUIStateContext } from '../state/ui-state-context';

type ToolEntry = {
  name: ToolName;
  definition: ToolDefinitionBase;
};

type SchemaEntry = {
  name: string;
  type: string;
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
 * Normalizes schema entries for rendering.
 */
const buildSchemaEntries = (schema: ToolDefinitionBase['schema']): SchemaEntry[] => {
  const rawEntries = Object.entries(schema);
  const entries: SchemaEntry[] = [];

  for (let index = 0; index < rawEntries.length; index += 1) {
    const entry = rawEntries[index];
    if (!entry) {
      continue;
    }
    const [name, type] = entry;
    entries.push({ name, type: String(type) });
  }

  return entries;
};

/**
 * Renders the tool count badge.
 */
const ToolCountBadge: Component<{ count: number }> = (props) => {
  const label = () => `${props.count} tool${props.count === 1 ? '' : 's'}`;
  return <div class="tool-count-badge">{label()}</div>;
};

/**
 * Renders a schema pill for a single argument.
 */
const ToolSchemaPill: Component<{ entry: SchemaEntry }> = (props) => (
  <span class="schema-pill">
    <span class="schema-name">{props.entry.name}</span>
    <span class="schema-type">{props.entry.type}</span>
  </span>
);

/**
 * Renders the list of schema arguments.
 */
const ToolSchemaList: Component<{ schema: ToolDefinitionBase['schema'] }> = (props) => {
  const entries = createMemo(() => buildSchemaEntries(props.schema));

  return (
    <div class="tool-schema">
      <div class="tool-schema-label">Arguments</div>
      <div class="tool-schema-list">
        {entries().length === 0 ? (
          <div class="tool-subtext">No parameters required.</div>
        ) : (
          <For each={entries()}>{(entry) => <ToolSchemaPill entry={entry} />}</For>
        )}
      </div>
    </div>
  );
};

/**
 * Renders a single tool card entry.
 */
const ToolCard: Component<{ entry: ToolEntry }> = (props) => {
  const label = () => {
    const { name, definition } = props.entry;
    return name === definition.name ? `[${name}]` : `[${name}] ${definition.name}`;
  };

  return (
    <div class="tool-card">
      <div class="tool-card-header">
        <div class="tool-label">{label()}</div>
        <div class="tool-subtext">{props.entry.definition.description}</div>
      </div>
      <ToolSchemaList schema={props.entry.definition.schema} />
    </div>
  );
};

/**
 * Renders the tool catalog listing.
 */
export const ToolCatalog: Component = () => {
  const { uiState } = useUIStateContext();
  const [logged, setLogged] = createSignal(false);
  const tools = createMemo(() => buildToolEntries());

  createEffect(() => {
    if (logged() || !uiState()) {
      return;
    }
    uiState()?.addLog(`Tool catalog loaded (${tools().length})`);
    setLogged(true);
  });

  return (
    <div class="tool-panel">
      <div class="tool-panel-header">
        <div>
          <div class="tool-label">Available Tools</div>
          <div class="tool-subtext">Registered capabilities accessible to the orchestrator.</div>
        </div>
        <ToolCountBadge count={tools().length} />
      </div>

      <div class="tool-grid">
        {tools().length === 0 ? (
          <div class="tool-placeholder">No tools registered.</div>
        ) : (
          <For each={tools()}>{(tool) => <ToolCard entry={tool} />}</For>
        )}
      </div>
    </div>
  );
};
