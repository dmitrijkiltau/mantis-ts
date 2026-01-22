/** @jsxImportSource solid-js */
import { createEffect, createMemo, createSignal, For, type Component } from 'solid-js';
import type { ToolDefinitionBase } from '../../../assistant/src/tools/definition';
import { TOOLS, TOOL_TRIGGERS, type ToolName } from '../../../assistant/src/tools/registry';
import { useUIStateContext } from '../state/ui-state-context';

type ToolEntry = {
  name: ToolName;
  definition: ToolDefinitionBase;
};

type SchemaEntry = {
  name: string;
  type: string;
  required: boolean;
};

type ToolStatus = 'ACTIVE' | 'LOCKED' | 'DEGRADED' | 'UNUSED';

type ToolRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTERNAL';

type ToolAccess = 'LOCAL' | 'SYSTEM' | 'EXTERNAL';

type ToolProfile = {
  label: string;
  icon: string;
  access: ToolAccess;
  risk: ToolRisk;
  status: ToolStatus;
  brief: string[];
  capabilities: string[];
};

/**
 * Fallout-styled tool profiles for the tablet UI.
 */
const TOOL_PROFILES: Record<ToolName, ToolProfile> = {
  clipboard: {
    label: 'CLIPBOARD',
    icon: '[=]',
    access: 'LOCAL',
    risk: 'LOW',
    status: 'ACTIVE',
    brief: ['LOCAL CLIPBOARD ONLY', 'NO FILESYSTEM', 'NO NETWORK'],
    capabilities: ['read clipboard', 'write clipboard'],
  },
  filesystem: {
    label: 'FILESYSTEM',
    icon: '[#]',
    access: 'LOCAL',
    risk: 'MEDIUM',
    status: 'ACTIVE',
    brief: ['LOCAL FILE ACCESS ONLY', 'NO NETWORK', 'NO URLS'],
    capabilities: ['read file', 'list directory', 'stat path'],
  },
  search: {
    label: 'SEARCH',
    icon: '[?]',
    access: 'LOCAL',
    risk: 'LOW',
    status: 'ACTIVE',
    brief: ['LOCAL INDEX SCAN', 'NO NETWORK', 'SKIPS COMMON BUILD DIRS'],
    capabilities: ['scan directories', 'match by name', 'bounded depth search'],
  },
  http: {
    label: 'HTTP',
    icon: '[<>]',
    access: 'EXTERNAL',
    risk: 'EXTERNAL',
    status: 'ACTIVE',
    brief: ['REMOTE REQUESTS ONLY', 'URL REQUIRED', 'NO FILESYSTEM'],
    capabilities: ['fetch url', 'capture headers', 'return response body'],
  },
  process: {
    label: 'PROCESS',
    icon: '[::]',
    access: 'SYSTEM',
    risk: 'MEDIUM',
    status: 'ACTIVE',
    brief: ['READ-ONLY PROCESS LIST', 'LOCAL ONLY', 'NO TERMINATION'],
    capabilities: ['list processes', 'filter by name', 'resource snapshot'],
  },
  shell: {
    label: 'SHELL',
    icon: '[>]',
    access: 'SYSTEM',
    risk: 'HIGH',
    status: 'ACTIVE',
    brief: ['COMMAND EXECUTION', 'LOCAL SHELL ONLY', 'OUTPUT CAPTURED'],
    capabilities: ['run command', 'capture stdout', 'return exit status'],
  },
  pcinfo: {
    label: 'PC INFO',
    icon: '[i]',
    access: 'SYSTEM',
    risk: 'LOW',
    status: 'ACTIVE',
    brief: ['SYSTEM INVENTORY', 'READ-ONLY PROBE', 'LOCAL ONLY'],
    capabilities: ['hardware summary', 'resource totals', 'device identifiers'],
  },
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
 * Normalizes schema types for tool display.
 */
const normalizeSchemaType = (value: string): string => value.replace('|null', ' | null');

/**
 * Returns true when a schema type allows null values.
 */
const isOptionalSchemaType = (value: string): boolean => value.includes('|null');

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
    const typeLabel = String(type);
    entries.push({
      name,
      type: normalizeSchemaType(typeLabel),
      required: !isOptionalSchemaType(typeLabel),
    });
  }

  return entries;
};

/**
 * Renders the tool count badge.
 */
const ToolCountBadge: Component<{ count: number }> = (props) => {
  const label = () => `CAPABILITIES ONLINE: ${props.count}`;
  return <div class="tool-count-badge">{label()}</div>;
};

/**
 * Renders the brief operating notes.
 */
const ToolBrief: Component<{ lines: string[] }> = (props) => (
  <div class="tool-brief">
    <div class="tool-section-label">OPERATIVE NOTES</div>
    <div class="tool-brief-lines">
      <For each={props.lines}>{(line) => <div class="tool-brief-line">{line}</div>}</For>
    </div>
  </div>
);

/**
 * Renders tool capabilities in list form.
 */
const ToolCapabilitiesList: Component<{ capabilities: string[] }> = (props) => (
  <div class="tool-capabilities">
    <div class="tool-section-label">CAPABILITIES</div>
    <div class="tool-capability-list">
      <For each={props.capabilities}>{(capability) => <div class="tool-capability-item">{capability}</div>}</For>
    </div>
  </div>
);

/**
 * Renders the list of schema arguments.
 */
const ToolSchemaList: Component<{ schema: ToolDefinitionBase['schema'] }> = (props) => {
  const entries = createMemo(() => buildSchemaEntries(props.schema));

  return (
    <div class="tool-arguments">
      <div class="tool-section-label">ARGUMENT PORTS</div>
      {entries().length === 0 ? (
        <div class="tool-subtext">NO PARAMETERS REQUIRED.</div>
      ) : (
        <div class="tool-arguments-list">
          <For each={entries()}>
            {(entry) => (
              <div class="tool-argument-row">
                <span class="tool-argument-name">{entry.name}</span>
                <span class="tool-argument-type">{entry.type}</span>
                <span class="tool-argument-required" data-required={entry.required ? 'required' : 'optional'}>
                  {entry.required ? 'REQUIRED' : 'OPTIONAL'}
                </span>
              </div>
            )}
          </For>
        </div>
      )}
    </div>
  );
};

/**
 * Renders the collapsible tool manual.
 */
const ToolManual: Component<{ entry: ToolEntry }> = (props) => {
  const triggers = createMemo(() => TOOL_TRIGGERS[props.entry.name] ?? []);

  return (
    <details class="tool-manual">
      <summary class="tool-manual-summary">DETAILS / MANUAL</summary>
      <div class="tool-manual-body">
        <div class="tool-manual-title">DESCRIPTION</div>
        <div class="tool-manual-text">{props.entry.definition.description}</div>
        <div class="tool-manual-title">TRIGGERS</div>
        <div class="tool-manual-tags">
          {triggers().length === 0 ? (
            <div class="tool-subtext">NO TRIGGERS REGISTERED.</div>
          ) : (
            <For each={triggers()}>{(trigger) => <span class="tool-manual-tag">{trigger}</span>}</For>
          )}
        </div>
      </div>
    </details>
  );
};

/**
 * Renders a single tool card entry.
 */
const ToolCard: Component<{ entry: ToolEntry }> = (props) => {
  const profile = createMemo(() => TOOL_PROFILES[props.entry.name]);

  return (
    <div class="tool-card">
      <div class="tool-card-header">
        <div class="tool-title-group">
          <span class="tool-icon">{profile().icon}</span>
          <div class="tool-name">[ {profile().label} ]</div>
        </div>
        <div class="tool-status" data-status={profile().status}>
          {profile().status}
        </div>
      </div>
      <div class="tool-card-meta">
        <div class="tool-meta-row">
          <span class="tool-meta-label">ACCESS LEVEL</span>
          <span class="tool-meta-value">{profile().access}</span>
        </div>
        <div class="tool-meta-row">
          <span class="tool-meta-label">RISK</span>
          <span class="tool-meta-value" data-risk={profile().risk}>
            {profile().risk}
          </span>
        </div>
      </div>
      <div class="tool-divider"></div>
      <ToolBrief lines={profile().brief} />
      <div class="tool-divider"></div>
      <ToolCapabilitiesList capabilities={profile().capabilities} />
      <div class="tool-divider"></div>
      <ToolSchemaList schema={props.entry.definition.schema} />
      <ToolManual entry={props.entry} />
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
          <div class="tool-panel-title">REGISTERED CAPABILITIES</div>
          <div class="tool-panel-subtitle">AUTHORIZED FOR ORCHESTRATION</div>
        </div>
        <ToolCountBadge count={tools().length} />
      </div>

      <div class="tool-grid">
        {tools().length === 0 ? (
          <div class="tool-placeholder">NO CAPABILITIES REGISTERED.</div>
        ) : (
          <For each={tools()}>{(tool) => <ToolCard entry={tool} />}</For>
        )}
      </div>
    </div>
  );
};
