/** @jsxImportSource solid-js */
import { createMemo, createSignal, onCleanup, onMount, type Component } from 'solid-js';
import { CONTRACTS } from '../../../assistant/src/contracts/registry';
import contractIntentClassificationSource from '../../../assistant/src/contracts/intent.classification.ts?raw';
import contractLanguageDetectionSource from '../../../assistant/src/contracts/language.detection.ts?raw';
import contractToolArgumentExtractionSource from '../../../assistant/src/contracts/tool.argument.extraction.ts?raw';
import contractAnswerSource from '../../../assistant/src/contracts/answer.ts?raw';

import contractImageRecognitionSource from '../../../assistant/src/contracts/image.recognition.ts?raw';
import { renderMarkdown } from '../bubble/markdown';
import { ToolOutputContent } from '../bubble/tool-output';
import { useDesktopServices } from '../state/desktop-context';
import type { ContractTelemetrySnapshot } from '../state/contract-telemetry';
import { useUIStateContext } from '../state/ui-state-context';
import type { BubbleContent } from '../ui-state';

type ContractKey = keyof typeof CONTRACTS;

type ContractSource = {
  path: string;
  content: string;
};

type ContractMode = 'chat' | 'raw';

type SubsystemState = 'ACTIVE' | 'IDLE' | 'STANDBY' | 'DEGRADED' | 'OFFLINE';

type AccessLabel = 'LOCKED' | 'OPEN';

type SubsystemGroupId =
  | 'CORE_REASONING'
  | 'TOOL_CONTROL'
  | 'INTERACTION'
  | 'PERCEPTION'
  | 'AUXILIARY';

type SubsystemGroupConfig = {
  id: SubsystemGroupId;
  label: string;
  description: string;
  order: number;
};

type ContractModuleConfig = {
  title: string;
  group: SubsystemGroupId;
  role: string;
  state: SubsystemState;
  priority: number;
};

type ContractTelemetry = {
  lastExec: string;
  avgLatency: string;
};

type SubsystemModule = ContractModuleConfig & {
  contractKey: ContractKey;
  modelName: string;
  mode: ContractMode;
  accessLabel: AccessLabel;
  telemetry: ContractTelemetry;
};

type SubsystemGroup = SubsystemGroupConfig & {
  modules: SubsystemModule[];
};

type ContractTelemetryMap = Partial<Record<ContractKey, ContractTelemetrySnapshot>>;

const SUBSYSTEM_GROUPS: SubsystemGroupConfig[] = [
  {
    id: 'CORE_REASONING',
    label: 'CORE REASONING',
    description: 'Routing, intent, and language gating.',
    order: 1,
  },
  {
    id: 'TOOL_CONTROL',
    label: 'TOOL CONTROL',
    description: 'Tool argument extraction and related helpers.',
    order: 2,
  },
  {
    id: 'INTERACTION',
    label: 'INTERACTION',
    description: 'User-facing response shaping.',
    order: 4,
  },
  {
    id: 'PERCEPTION',
    label: 'PERCEPTION',
    description: 'Vision and sensory parsing.',
    order: 5,
  },
  {
    id: 'AUXILIARY',
    label: 'AUXILIARY',
    description: 'Unmapped subsystems.',
    order: 6,
  },
];

const DEFAULT_MODULE_CONFIG: ContractModuleConfig = {
  title: 'UNCLASSIFIED MODULE',
  group: 'AUXILIARY',
  role: 'UNASSIGNED',
  state: 'IDLE',
  priority: 1,
};

const CONTRACT_MODULES = new Map<ContractKey, ContractModuleConfig>([
  [
    'INTENT_CLASSIFICATION',
    {
      title: 'INTENT CORE',
      group: 'CORE_REASONING',
      role: 'ROUTING / ORCHESTRATION',
      state: 'ACTIVE',
      priority: 6,
    },
  ],
  [
    'LANGUAGE_DETECTION',
    {
      title: 'LANGUAGE GATE',
      group: 'CORE_REASONING',
      role: 'LOCALE / SAFETY',
      state: 'ACTIVE',
      priority: 5,
    },
  ],
  [
    'TOOL_ARGUMENT_EXTRACTION',
    {
      title: 'TOOL ARGUMENTS',
      group: 'TOOL_CONTROL',
      role: 'ARGUMENT EXTRACTION',
      state: 'ACTIVE',
      priority: 5,
    },
  ],
  [
    'ANSWER',
    {
      title: 'ANSWER MODULE',
      group: 'INTERACTION',
      role: 'KNOWLEDGE OUTPUT',
      state: 'ACTIVE',
      priority: 5,
    },
  ],

  [
    'IMAGE_RECOGNITION',
    {
      title: 'VISION SCAN',
      group: 'PERCEPTION',
      role: 'IMAGE PARSING',
      state: 'STANDBY',
      priority: 3,
    },
  ],
]);

const DEFAULT_TELEMETRY: ContractTelemetry = {
  lastExec: '--',
  avgLatency: '--',
};

/**
 * Formats the average latency value.
 */
const formatLatency = (value: number | null | undefined): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }
  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }
  return `${(value / 1000).toFixed(2)}s`;
};


/**
 * Formats the last execution timestamp as a localized date/time (y-m-d hh:mm).
 */
export const formatLastExec = (timestamp: number | null | undefined): string => {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return '--';
  }
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = d.getHours();
  const mm = d.getMinutes();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${y}-${pad(m)}-${pad(day)} ${pad(hh)}:${pad(mm)}`;
};

/**
 * Resolves telemetry values for a given contract key.
 */
const resolveTelemetry = (
  contractKey: ContractKey,
  telemetryMap: ContractTelemetryMap,
): ContractTelemetry => {
  const telemetry = telemetryMap[contractKey];
  if (!telemetry) {
    return DEFAULT_TELEMETRY;
  }

  return {
    lastExec: formatLastExec(telemetry.lastExecAt),
    avgLatency: formatLatency(telemetry.averageLatencyMs),
  };
};

const CONTRACT_SOURCE_MAP = new Map<ContractKey, ContractSource>([
  [
    'INTENT_CLASSIFICATION',
    {
      path: 'assistant/src/contracts/intent.classification.ts',
      content: contractIntentClassificationSource,
    },
  ],
  [
    'LANGUAGE_DETECTION',
    {
      path: 'assistant/src/contracts/language.detection.ts',
      content: contractLanguageDetectionSource,
    },
  ],
  [
    'TOOL_ARGUMENT_EXTRACTION',
    {
      path: 'assistant/src/contracts/tool.argument.extraction.ts',
      content: contractToolArgumentExtractionSource,
    },
  ],
  [
    'ANSWER',
    {
      path: 'assistant/src/contracts/answer.ts',
      content: contractAnswerSource,
    },
  ],

  [
    'IMAGE_RECOGNITION',
    {
      path: 'assistant/src/contracts/image.recognition.ts',
      content: contractImageRecognitionSource,
    },
  ],
]);

/**
 * Builds an Ollama library URL for a model name.
 */
const getOllamaModelUrl = (modelName: string): string | null => {
  const trimmed = modelName.trim();
  if (!trimmed || trimmed === 'UNSPECIFIED') {
    return null;
  }

  return `https://ollama.com/library/${encodeURIComponent(trimmed)}`;
};

/**
 * Resolves the contract source payload for a contract key.
 */
const getContractSource = (contractKey: ContractKey): ContractSource | null => {
  return CONTRACT_SOURCE_MAP.get(contractKey) ?? null;
};

/**
 * Resolves the configured contract mode.
 */
const getContractMode = (contractKey: ContractKey): ContractMode => {
  const contract = CONTRACTS[contractKey];
  return (contract?.MODE as ContractMode | undefined) ?? 'chat';
};

/**
 * Resolves the prompt shape label for the configured contract mode.
 */
const getPromptShapeLabel = (mode: ContractMode): string => {
  return mode === 'raw' ? 'PROMPT' : 'SYSTEM/USER';
};

/**
 * Resolves the access state label for the contract mode.
 */
const getAccessLabel = (mode: ContractMode): AccessLabel => {
  return mode === 'raw' ? 'LOCKED' : 'OPEN';
};

/**
 * Normalizes a contract model name for display and lookups.
 */
const normalizeModelName = (modelName: string): string => {
  const trimmed = modelName.trim();
  return trimmed ? trimmed : 'UNSPECIFIED';
};

/**
 * Resolves the model display name.
 */
const getModelDisplayName = (modelName: string): string => {
  return modelName === 'UNSPECIFIED' ? 'UNASSIGNED' : modelName;
};

/**
 * Resolves the subsystem state based on module config and model availability.
 */
const resolveSubsystemState = (modelName: string, configuredState: SubsystemState): SubsystemState => {
  return modelName === 'UNSPECIFIED' ? 'OFFLINE' : configuredState;
};

/**
 * Resolves the module definition for a contract key.
 */
const getModuleDefinition = (contractKey: ContractKey): ContractModuleConfig => {
  return CONTRACT_MODULES.get(contractKey) ?? DEFAULT_MODULE_CONFIG;
};

/**
 * Builds the ASCII load bar for the provided priority rating.
 */
const getLoadBar = (priority: number): string => {
  const segments = 6;
  const clamped = Math.min(Math.max(priority, 0), segments);
  return `${'#'.repeat(clamped)}${'-'.repeat(segments - clamped)}`;
};

/**
 * Builds the grouped subsystem list for rendering.
 */
const buildSubsystemGroups = (
  telemetryMap: ContractTelemetryMap,
): SubsystemGroup[] => {
  const groupsById = new Map<SubsystemGroupId, SubsystemGroup>();
  for (let index = 0; index < SUBSYSTEM_GROUPS.length; index += 1) {
    const config = SUBSYSTEM_GROUPS[index]!;
    groupsById.set(config.id, { ...config, modules: [] });
  }

  const contractEntries = Object.entries(CONTRACTS) as [ContractKey, (typeof CONTRACTS)[ContractKey]][];
  for (let index = 0; index < contractEntries.length; index += 1) {
    const entry = contractEntries[index];
    if (!entry) {
      continue;
    }
    const [contractKey, contract] = entry;
    const moduleConfig = getModuleDefinition(contractKey);
    const modelName = normalizeModelName(contract.MODEL ?? '');
    const mode = getContractMode(contractKey);
    const moduleState = resolveSubsystemState(modelName, moduleConfig.state);
    const group = groupsById.get(moduleConfig.group) ?? groupsById.get('AUXILIARY');
    if (!group) {
      continue;
    }

    group.modules.push({
      ...moduleConfig,
      contractKey,
      modelName,
      mode,
      accessLabel: getAccessLabel(mode),
      telemetry: resolveTelemetry(contractKey, telemetryMap),
      state: moduleState,
    });
  }

  const groups = SUBSYSTEM_GROUPS.map((group) => groupsById.get(group.id)).filter(
    (group): group is SubsystemGroup => Boolean(group),
  );

  for (let index = 0; index < groups.length; index += 1) {
    groups[index]!.modules.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.title.localeCompare(b.title);
    });
  }

  return groups.filter((group) => group.modules.length > 0);
};

/**
 * Renders the subsystem list with contract source previews.
 */
export const ContractModels: Component = () => {
  const services = useDesktopServices();
  const { uiState } = useUIStateContext();
  const [telemetryMap, setTelemetryMap] = createSignal<ContractTelemetryMap>({});
  const subsystemGroups = createMemo<SubsystemGroup[]>(() => buildSubsystemGroups(telemetryMap()));
  const moduleCounts = createMemo(() => {
    const groups = subsystemGroups();
    let total = 0;
    let online = 0;

    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index]!;
      total += group.modules.length;
      for (let moduleIndex = 0; moduleIndex < group.modules.length; moduleIndex += 1) {
        if (group.modules[moduleIndex]!.state !== 'OFFLINE') {
          online += 1;
        }
      }
    }

    return { total, online };
  });

  onMount(() => {
    const unsubscribe = services.contractTelemetry.subscribe((snapshot) => {
      setTelemetryMap(snapshot as ContractTelemetryMap);
    });

    onCleanup(() => {
      unsubscribe();
    });
  });

  const handleContractClick = (event: MouseEvent, contractKey: ContractKey): void => {
    event.preventDefault();

    const source = getContractSource(contractKey);
    if (!source) {
      return;
    }

    const payload = {
      action: 'file' as const,
      path: source.path,
      content: source.content,
    };
    const summaryText = `Contract source loaded for \`${contractKey}\`.`;
    const summaryHtml = renderMarkdown(summaryText);
    const bubbleContent: BubbleContent = {
      kind: 'inline-typewriter',
      text: summaryText,
      targetSelector: '[data-typewriter-target="summary"]',
      finalHtml: summaryHtml,
      render: () => ToolOutputContent({
        summary: summaryText,
        raw: payload,
        summaryHtml: '',
      }),
    };
    const state = uiState();
    state?.showBubble(bubbleContent);
    state?.setMood('speaking');
    state?.markActivity();
    state?.addLog(`Contract source opened: ${contractKey}`);
    window.setTimeout(() => {
      state?.setMood('idle');
    }, 650);
  };

  const renderModelName = (modelName: string) => {
    const normalized = normalizeModelName(modelName);
    const displayName = getModelDisplayName(normalized);
    const modelUrl = getOllamaModelUrl(normalized);
    if (modelUrl) {
      return (
        <a class="subsystem-module-link" href={modelUrl} target="_blank" rel="noopener noreferrer">
          {displayName}
        </a>
      );
    }
    return displayName;
  };

  const countLabel = () => {
    const counts = moduleCounts();
    return `AI MODULES ONLINE: ${counts.online}`;
  };

  return (
    <div class="status-contracts">
      <div class="status-section-header">
        <div class="status-section-label">AI SUBSYSTEMS</div>
        <div
          class="tool-count-badge"
          id="contract-model-count"
          title={`Online modules: ${moduleCounts().online} / ${moduleCounts().total}`}
        >
          {countLabel()}
        </div>
      </div>
      <div class="subsystem-groups" id="contract-models">
        {subsystemGroups().length === 0 ? (
          <div class="subsystem-placeholder">No subsystems configured.</div>
        ) : (
          subsystemGroups().map((group) => (
            <div class="subsystem-group">
              <div class="subsystem-group-header">
                <div class="subsystem-group-title">{group.label}</div>
                <div class="subsystem-group-subtitle">{group.description}</div>
              </div>
              <div class="subsystem-module-grid">
                {group.modules.map((module) => {
                  const promptShapeLabel = getPromptShapeLabel(module.mode);
                  return (
                    <div class="subsystem-module" data-state={module.state}>
                      <div class="subsystem-module-header">
                        <div class="subsystem-module-title">
                          <span class="subsystem-module-lamp" data-state={module.state}></span>
                          <span>{module.title}</span>
                        </div>
                        <div class="subsystem-module-status" data-state={module.state}>{module.state}</div>
                      </div>
                      <div class="subsystem-module-body">
                        <div class="subsystem-module-row">
                          <span class="subsystem-module-label">CONTRACT</span>
                          <span class="subsystem-module-value">
                            <a
                              class="subsystem-module-link"
                              href="#"
                              onClick={(event) => handleContractClick(event, module.contractKey)}
                            >
                              {module.contractKey}
                            </a>
                          </span>
                        </div>
                        <div class="subsystem-module-row">
                          <span class="subsystem-module-label">MODEL</span>
                          <span class="subsystem-module-value">{renderModelName(module.modelName)}</span>
                        </div>
                        <div class="subsystem-module-row">
                          <span class="subsystem-module-label">ACCESS</span>
                          <span
                            class="subsystem-module-access"
                            data-access={module.accessLabel}
                            title={`Prompt shape: ${promptShapeLabel}`}
                          >
                            {module.accessLabel}
                          </span>
                        </div>
                        <div class="subsystem-module-row">
                          <span class="subsystem-module-label">ROLE</span>
                          <span class="subsystem-module-value">{module.role}</span>
                        </div>
                        <div class="subsystem-module-row">
                          <span class="subsystem-module-label">LOAD</span>
                          <span class="subsystem-module-load">{getLoadBar(module.priority)}</span>
                        </div>
                      </div>
                      <div class="subsystem-module-telemetry">
                        <span>Last exec: {module.telemetry.lastExec}</span>
                        <span>Avg RT: {module.telemetry.avgLatency}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
