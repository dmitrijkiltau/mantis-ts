import { Pipeline, type PipelineResult } from '../../assistant/src/pipeline';
import { Logger } from '../../assistant/src/logger';
import type { ToolDefinitionBase, ToolSchema } from '../../assistant/src/tools/definition';
import { TOOLS, type ToolName } from '../../assistant/src/tools/registry';
import { UIState } from './ui-state';
import { renderBubbleContent, renderToolOutputContent } from './bubble-renderer';

const formatPayload = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const hasToolSummary = (
  result: PipelineResult,
): result is PipelineResult & { kind: 'tool'; summary: string } => {
  return result.kind === 'tool'
    && typeof result.summary === 'string'
    && result.summary.trim().length > 0;
};

type ToolEntry = {
  name: ToolName;
  definition: ToolDefinitionBase;
};

const buildToolEntries = (): ToolEntry[] => {
  const entries = Object.entries(TOOLS) as Array<[ToolName, ToolDefinitionBase]>;
  entries.sort((a, b) => a[0].localeCompare(b[0]));

  const tools: ToolEntry[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const [name, definition] = entries[index];
    tools.push({ name, definition });
  }

  return tools;
};

const createSchemaPill = (fieldName: string, fieldType: string): HTMLSpanElement => {
  const pill = document.createElement('span');
  pill.className = 'schema-pill';

  const nameNode = document.createElement('span');
  nameNode.className = 'schema-name';
  nameNode.textContent = fieldName;

  const typeNode = document.createElement('span');
  typeNode.className = 'schema-type';
  typeNode.textContent = fieldType;

  pill.appendChild(nameNode);
  pill.appendChild(typeNode);

  return pill;
};

const renderSchemaSection = (schema: ToolSchema): HTMLElement => {
  const section = document.createElement('div');
  section.className = 'tool-schema';

  const label = document.createElement('div');
  label.className = 'tool-schema-label';
  label.textContent = 'Arguments';
  section.appendChild(label);

  const list = document.createElement('div');
  list.className = 'tool-schema-list';

  const fields = Object.entries(schema);
  if (fields.length === 0) {
    const noArgs = document.createElement('div');
    noArgs.className = 'tool-subtext';
    noArgs.textContent = 'No parameters required.';
    list.appendChild(noArgs);
  } else {
    for (let index = 0; index < fields.length; index += 1) {
      const [fieldName, fieldType] = fields[index];
      list.appendChild(createSchemaPill(fieldName, fieldType));
    }
  }

  section.appendChild(list);
  return section;
};

const renderToolCard = (tool: ToolEntry): HTMLDivElement => {
  const card = document.createElement('div');
  card.className = 'tool-card';

  const header = document.createElement('div');
  header.className = 'tool-card-header';

  const label = document.createElement('div');
  label.className = 'tool-label';
  label.textContent = tool.name === tool.definition.name ? `[${tool.name}]` : `[${tool.name}] ${tool.definition.name}`;
  header.appendChild(label);

  const description = document.createElement('div');
  description.className = 'tool-subtext';
  description.textContent = tool.definition.description;
  header.appendChild(description);

  card.appendChild(header);
  card.appendChild(renderSchemaSection(tool.definition.schema));

  return card;
};

/**
 * Renders the registered tools inside the Tools tab.
 */
export const renderToolCatalog = (
  listContainer: HTMLElement | null,
  countBadge: HTMLElement | null,
  uiState: UIState,
): void => {
  if (!listContainer) {
    return;
  }

  const tools = buildToolEntries();
  listContainer.innerHTML = '';

  if (tools.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'tool-placeholder';
    placeholder.textContent = 'No tools registered.';
    listContainer.appendChild(placeholder);
    if (countBadge) {
      countBadge.textContent = '0 tools';
    }
    return;
  }

  for (let index = 0; index < tools.length; index += 1) {
    const card = renderToolCard(tools[index]);
    listContainer.appendChild(card);
  }

  if (countBadge) {
    const suffix = tools.length === 1 ? '' : 's';
    countBadge.textContent = `${tools.length} tool${suffix}`;
  }

  uiState.addLog(`Tool catalog loaded (${tools.length})`);
};

const truncateText = (value: string, limit: number): string => {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 3)}...`;
};

const renderHistoryContent = (value: unknown): string => {
  const payload = typeof value === 'string' ? value : formatPayload(value);
  return renderBubbleContent(payload);
};

const renderToolOutput = (result: PipelineResult & { kind: 'tool' }): string => {
  if (hasToolSummary(result) && typeof result.result !== 'string') {
    return renderToolOutputContent(result.summary, result.result);
  }

  return renderHistoryContent(result.result);
};

const createHistoryContentShell = (contentHtml: string): HTMLDivElement => {
  const shell = document.createElement('div');
  shell.className = 'speech-bubble history-bubble-shell';

  const content = document.createElement('div');
  content.className = 'bubble-content history-content';
  content.innerHTML = contentHtml;

  shell.appendChild(content);
  return shell;
};

const createHistorySection = (label: string, valueNode: HTMLElement): HTMLDivElement => {
  const section = document.createElement('div');
  section.className = 'history-section';

  const heading = document.createElement('div');
  heading.className = 'history-section-label';
  heading.textContent = label;

  section.appendChild(heading);
  section.appendChild(valueNode);

  return section;
};

const createHistoryText = (value: string): HTMLDivElement => {
  const node = document.createElement('div');
  node.className = 'history-text';
  node.textContent = value;
  return node;
};

const buildHistoryEntry = (question: string, result: PipelineResult): HTMLDetailsElement => {
  const entry = document.createElement('details');
  entry.className = 'history-entry';
  entry.setAttribute('data-kind', result.ok ? result.kind : 'error');
  entry.open = true;

  const summary = document.createElement('summary');
  summary.className = 'history-summary';

  const badge = document.createElement('span');
  badge.className = 'history-badge';
  badge.textContent = result.ok
    ? result.kind === 'tool'
      ? 'TOOL'
      : 'ANSWER'
    : 'ERROR';

  const title = document.createElement('span');
  title.className = 'history-title';
  title.textContent = result.ok
    ? result.kind === 'tool'
      ? result.tool
      : 'Strict Answer'
    : result.stage.toUpperCase();

  const promptSnippet = document.createElement('span');
  promptSnippet.className = 'history-question-snippet';
  promptSnippet.textContent = truncateText(question, 72);

  const meta = document.createElement('span');
  meta.className = 'history-meta';
  meta.textContent = `Attempts: ${result.attempts}`;

  summary.appendChild(badge);
  summary.appendChild(title);
  summary.appendChild(promptSnippet);
  summary.appendChild(meta);

  const body = document.createElement('div');
  body.className = 'history-body';

  body.appendChild(createHistorySection('Prompt', createHistoryText(question)));

  if (result.ok) {
    if (result.kind === 'tool') {
      body.appendChild(createHistorySection('Tool Output', createHistoryContentShell(renderToolOutput(result))));
      body.appendChild(createHistorySection('Tool Arguments', createHistoryContentShell(renderHistoryContent(result.args))));
    } else {
      body.appendChild(createHistorySection('Answer', createHistoryContentShell(renderHistoryContent(result.value))));
    }
  } else {
    const errorDetail = result.error
      ? `${result.error.code}: ${result.error.message}`
      : 'No valid response after retries.';
    body.appendChild(createHistorySection('Error', createHistoryContentShell(renderHistoryContent(errorDetail))));
  }

  entry.appendChild(summary);
  entry.appendChild(body);

  return entry;
};

export const createQuestionHandler = (
  pipeline: Pipeline,
  uiState: UIState,
  promptInput: HTMLTextAreaElement,
  form: HTMLFormElement,
  historyElement: HTMLElement,
) => {
  return async (event: Event) => {
    event.preventDefault();

    const question = promptInput.value.trim();
    if (!question) {
      return;
    }

    uiState.incrementQueryCount();
    uiState.updateStats();

    const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    submitButton?.setAttribute('disabled', 'true');
    uiState.hideBubble();
    uiState.setStatus('OPERATIONAL', 'PROCESSING', 'QUERY_RECEIVED');
    uiState.setMood('listening');
    uiState.addLog(`Query received: "${question.substring(0, 50)}..."`);
    Logger.info('ui', 'User submitted question', { questionLength: question.length });

    const settle = () => {
      submitButton?.removeAttribute('disabled');
      uiState.setStatus('OPERATIONAL', 'AWAITING_INPUT', 'COMPLETE');
      window.setTimeout(() => {
        uiState.setMood('idle');
      }, 650);
    };

    try {
      uiState.setMood('thinking');
      uiState.setStatus('OPERATIONAL', 'ANALYZING', 'CONTRACT_VALIDATION');
      uiState.addLog('Analyzing query with contracts...');
      const result = await pipeline.run(question);

      const record = buildHistoryEntry(question, result);

      if (result.ok) {
      if (result.kind === 'tool') {
        Logger.info('ui', `Tool result received: ${result.tool}`);
        uiState.setMood('speaking');
        uiState.setStatus('OPERATIONAL', 'COMPLETE', `TOOL_${result.tool.toUpperCase()}`);
        uiState.addLog(`Tool executed: ${result.tool}`);

        uiState.showBubble(renderToolOutput(result));
      } else {
        Logger.info('ui', 'Strict answer generated');
        uiState.setMood('speaking');
          uiState.setStatus('OPERATIONAL', 'COMPLETE', 'ANSWER_GENERATED');
          uiState.addLog('Answer generated successfully');

          uiState.showBubble(renderBubbleContent(result.value));
        }
      } else {
        Logger.error('ui', `Pipeline failed at stage: ${result.stage}`);
        uiState.setMood('concerned');
        uiState.setStatus('ERROR', 'FAILED', result.stage.toUpperCase());
        const errorDetail = result.error
          ? `${result.error.code}: ${result.error.message}`
          : 'No valid response after retries.';
        uiState.addLog(`ERROR: ${errorDetail}`);

        uiState.showBubble(renderBubbleContent(`Error: ${errorDetail}`));
      }

      historyElement.prepend(record);
    } catch (error) {
      Logger.error('ui', 'Unhandled exception in pipeline', error);
      uiState.setMood('concerned');
      uiState.setStatus('ERROR', 'EXCEPTION', 'UNHANDLED');
      uiState.addLog(`FATAL ERROR: ${String(error)}`);

      const errCard = buildHistoryEntry(question, {
        ok: false,
        kind: 'error',
        stage: 'error_channel',
        attempts: 0,
        error: {
          code: 'unhandled_exception',
          message: String(error),
        },
      });
      historyElement.prepend(errCard);

      uiState.showBubble(renderBubbleContent(`Critical Error: ${String(error)}`));
    } finally {
      settle();
      uiState.updateStats();
    }
  };
};

export const setupTabSwitching = (uiState: UIState) => {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabPanels = document.querySelectorAll('.tablet-panel');

  for (const button of tabButtons) {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');

      for (const btn of tabButtons) {
        btn.classList.remove('active');
      }
      button.classList.add('active');

      for (const panel of tabPanels) {
        panel.classList.remove('active');
      }

      const targetPanel = document.getElementById(`panel-${targetTab}`);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }

      uiState.addLog(`Switched to ${targetTab!.toUpperCase()} panel`);
    });
  }
};

const JSON_TOGGLE_ACTION = 'toggle';
const JSON_COPY_ACTION = 'copy';
const COPY_FEEDBACK_DURATION = 1200;

const updateToggleLabel = (button: HTMLButtonElement | null, mode: 'pretty' | 'viewer'): void => {
  if (!button) {
    return;
  }

  const label = mode === 'viewer' ? 'Structured JSON view' : 'Pretty JSON view';
  button.setAttribute('aria-label', label);
};

const fallbackCopy = (text: string): boolean => {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const succeeded = document.execCommand('copy');
    textarea.remove();
    return Boolean(succeeded);
  } catch {
    return false;
  }
};

const copyTextToClipboard = async (text: string): Promise<boolean> => {
  if (!text) {
    return false;
  }

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return fallbackCopy(text);
    }
  }

  return fallbackCopy(text);
};

/**
 * Applies the selected view to the root container and its view buttons.
 */
const applyViewSelection = (
  root: HTMLElement,
  group: HTMLElement | null,
  viewTarget: string,
): void => {
  root.setAttribute('data-view', viewTarget);

  const scope = group ?? root;
  const buttons = scope.querySelectorAll<HTMLButtonElement>('[data-view-target]');
  for (const button of buttons) {
    const target = button.getAttribute('data-view-target');
    const pressed = target === viewTarget;
    button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  }
};

/**
 * Handles clicks on view switcher buttons.
 */
const handleViewSwitch = (event: Event, target: HTMLElement): boolean => {
  const button = target.closest<HTMLButtonElement>('[data-view-target]');
  if (!button) {
    return false;
  }

  const viewTarget = button.getAttribute('data-view-target');
  if (!viewTarget) {
    return false;
  }

  const root = button.closest<HTMLElement>('[data-view-root]');
  if (!root) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();

  const group = button.closest<HTMLElement>('[data-view-group]');
  applyViewSelection(root, group, viewTarget);
  return true;
};

const markButtonCopied = (button: HTMLButtonElement): void => {
  const isBubbleButton = button.classList.contains('code-block-button');
  const copiedClass = isBubbleButton ? 'code-block-button--copied' : 'http-json-button--copied';
  button.classList.add(copiedClass);
  window.setTimeout(() => {
    button.classList.remove(copiedClass);
  }, COPY_FEEDBACK_DURATION);
};

const handleRichContentInteraction = (event: Event): void => {
  const target = event.target as HTMLElement | null;
  if (!target) {
    return;
  }

  const root = target.closest<HTMLElement>('[data-history-root], #bubble-answer, #history');
  if (!root) {
    return;
  }

  if (handleViewSwitch(event, target)) {
    return;
  }

  // Handle HTTP JSON block interactions
  const jsonControl = target.closest<HTMLButtonElement>('[data-http-json-action]');
  if (jsonControl) {
    const block = jsonControl.closest<HTMLElement>('.http-json-block');
    if (!block) {
      return;
    }

    const action = jsonControl.getAttribute('data-http-json-action');
    if (!action) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (action === JSON_TOGGLE_ACTION) {
      const current = block.getAttribute('data-json-view') === 'viewer' ? 'viewer' : 'pretty';
      const nextMode: 'pretty' | 'viewer' = current === 'pretty' ? 'viewer' : 'pretty';
      block.setAttribute('data-json-view', nextMode);
      updateToggleLabel(jsonControl, nextMode);
    } else if (action === JSON_COPY_ACTION) {
      const raw = block.dataset.jsonRaw ? decodeURIComponent(block.dataset.jsonRaw) : '';
      void copyTextToClipboard(raw).then((success) => {
        if (success) {
          markButtonCopied(jsonControl);
        }
      });
    }
    return;
  }

  // Handle code block copy
  const codeControl = target.closest<HTMLButtonElement>('[data-code-action]');
  if (codeControl) {
    const action = codeControl.getAttribute('data-code-action');
    if (action === JSON_COPY_ACTION) {
      event.preventDefault();
      event.stopPropagation();

      let raw = '';
      const block = codeControl.closest<HTMLElement>('.code-block, .code-block-markdown, .code-block-json');
      if (block) {
        if (block.classList.contains('code-block-markdown')) {
          raw = block.dataset.markdownRaw ? decodeURIComponent(block.dataset.markdownRaw) : '';
        } else if (block.classList.contains('code-block-json')) {
          raw = block.dataset.jsonRaw ? decodeURIComponent(block.dataset.jsonRaw) : '';
        } else {
          const codeElement = block.querySelector('code[data-raw]') as HTMLElement | null;
          raw = codeElement?.dataset.raw ? decodeURIComponent(codeElement.dataset.raw) : '';
          if (!raw) {
            const codeNode = block.querySelector('code');
            raw = codeNode?.textContent ?? '';
          }
        }
      }

      void copyTextToClipboard(raw).then((success) => {
        if (success) {
          markButtonCopied(codeControl);
        }
      });
    }
  }
};

export const setupContentInteractions = (...containers: Array<HTMLElement | null>) => {
  for (let index = 0; index < containers.length; index += 1) {
    const container = containers[index];
    if (!container) {
      continue;
    }

    container.dataset.historyRoot = 'true';
    container.addEventListener('click', (event) => {
      handleRichContentInteraction(event);
    });
  }
};
