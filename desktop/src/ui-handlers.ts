import { Pipeline, type PipelineResult, type ImageAttachment, type EvaluationAlert } from '../../assistant/src/pipeline';
import { Logger } from '../../assistant/src/logger';
import type { ToolDefinitionBase, ToolSchema } from '../../assistant/src/tools/definition';
import { TOOLS, type ToolName } from '../../assistant/src/tools/registry';
import { UIState } from './ui-state';
import type { ContextStore } from './context-store';
import { renderBubbleContent, renderToolOutputContent } from './bubble-renderer';
import { Command } from '@tauri-apps/plugin-shell';
import { invoke } from './tauri-invoke';
import { buildImageAttachmentFromFile } from './image-attachments';
import { captureScreenSelectionAttachment } from './screen-capture';
import {
  formatEvaluationSummary,
  getEvaluationAlertMessage,
} from './evaluation-utils';

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
    const entry = entries[index];
    if (!entry) {
      continue;
    }
    const [name, definition] = entry;
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
      const entry = fields[index];
      if (!entry) {
        continue;
      }
      const [fieldName, fieldType] = entry;
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
    const tool = tools[index];
    if (!tool) {
      continue;
    }
    const card = renderToolCard(tool);
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

const createEvaluationNode = (evaluation: Record<string, number>): HTMLDivElement => {
  const container = document.createElement('div');
  container.className = 'history-evaluation';

  const entries = Object.entries(evaluation).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [criterion, score] of entries) {
    const row = document.createElement('div');
    row.className = 'history-evaluation-row';

    const label = document.createElement('span');
    label.className = 'history-evaluation-label';
    label.textContent = criterion;

    const value = document.createElement('span');
    value.className = 'history-evaluation-score';
    value.textContent = `${score}/10`;

    row.appendChild(label);
    row.appendChild(value);
    container.appendChild(row);
  }

  return container;
};

const createEvaluationAlertBanner = (alert: EvaluationAlert): HTMLDivElement => {
  const node = document.createElement('div');
  node.className = 'history-evaluation-alert';
  node.textContent = getEvaluationAlertMessage(alert);
  return node;
};

const appendEvaluationSection = (
  body: HTMLElement,
  evaluation?: Record<string, number>,
  alert?: EvaluationAlert,
): void => {
  if (!evaluation && !alert) {
    return;
  }

  if (evaluation) {
    const evaluationNode = createEvaluationNode(evaluation);
    if (alert === 'low_scores') {
      evaluationNode.appendChild(createEvaluationAlertBanner(alert));
    }
    body.appendChild(createHistorySection('Evaluation', evaluationNode));
    return;
  }

  if (alert) {
    body.appendChild(createHistorySection('Evaluation', createHistoryText(getEvaluationAlertMessage(alert))));
  }
};

const logEvaluationOutcome = (result: PipelineResult, uiState: UIState): void => {
  if (!result.ok) {
    return;
  }

  const label = result.kind === 'tool' ? `tool.${result.tool}` : 'strict_answer';
  if (result.evaluation || result.evaluationAlert) {
    uiState.recordEvaluation(result.evaluation, result.evaluationAlert, label);
  }

  if (result.evaluation) {
    const summary = formatEvaluationSummary(result.evaluation);
    uiState.addLog(`Evaluation scores: ${summary}`);
    Logger.info('ui', 'Evaluation scores', result.evaluation);
  }

  if (result.evaluationAlert === 'scoring_failed') {
    const message = getEvaluationAlertMessage('scoring_failed');
    uiState.addLog(message);
    Logger.warn('ui', message);
  } else if (result.evaluationAlert === 'low_scores') {
    const message = getEvaluationAlertMessage('low_scores');
    uiState.addLog(message);
    Logger.warn('ui', message, result.evaluation);
  }
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
    appendEvaluationSection(body, result.evaluation, result.evaluationAlert);
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

export type ImageAttachmentStore = {
  getAttachment: () => ImageAttachment | null;
  consumeAttachment: () => ImageAttachment | null;
};

type ImageAttachmentElements = {
  promptInput: HTMLTextAreaElement;
  uploadButton: HTMLButtonElement | null;
  captureButton: HTMLButtonElement | null;
  fileInput: HTMLInputElement | null;
  attachmentRow: HTMLElement | null;
  attachmentName: HTMLElement | null;
  clearButton: HTMLButtonElement | null;
  uiState: UIState;
};

/**
 * Updates the attachment status row.
 */
const updateAttachmentUi = (
  elements: ImageAttachmentElements,
  attachment: ImageAttachment | null,
): void => {
  const { attachmentRow, attachmentName } = elements;
  if (!attachmentRow || !attachmentName) {
    return;
  }

  if (!attachment) {
    attachmentRow.classList.add('hidden');
    attachmentRow.removeAttribute('data-source');
    attachmentName.textContent = 'None';
    return;
  }

  attachmentRow.classList.remove('hidden');
  attachmentRow.dataset.source = attachment.source;
  attachmentName.textContent = `${attachment.name} (${attachment.source.toUpperCase()})`;
};

/**
 * Extracts the first image file from a FileList.
 */
const extractFirstImageFile = (files: FileList | null): File | null => {
  if (!files || files.length === 0) {
    return null;
  }

  for (let index = 0; index < files.length; index += 1) {
    const file = files.item(index);
    if (file && file.type.startsWith('image/')) {
      return file;
    }
  }

  return null;
};

/**
 * Returns true when the drag event contains file data.
 */
const isFileDrag = (event: DragEvent): boolean => {
  const types = event.dataTransfer?.types;
  if (!types) {
    return false;
  }

  for (let index = 0; index < types.length; index += 1) {
    if (types[index] === 'Files') {
      return true;
    }
  }

  return false;
};

/**
 * Wires up image upload, drop handling, and screenshot capture.
 */
export const setupImageInput = (elements: ImageAttachmentElements): ImageAttachmentStore => {
  let currentAttachment: ImageAttachment | null = null;
  let dragDepth = 0;
  const terminalRoot = elements.promptInput.closest<HTMLElement>('.input-terminal');

  const setAttachment = (attachment: ImageAttachment | null): void => {
    currentAttachment = attachment;
    updateAttachmentUi(elements, attachment);
  };

  const handleAttachment = async (
    file: File,
    source: ImageAttachment['source'],
  ): Promise<void> => {
    const attachment = await buildImageAttachmentFromFile(file, source);
    if (!attachment) {
      elements.uiState.addLog('Unable to read image attachment.');
      return;
    }

    setAttachment(attachment);
    elements.uiState.addLog(`Image attached (${source}): ${attachment.name}`);
  };

  elements.uploadButton?.addEventListener('click', () => {
    elements.fileInput?.click();
  });

  elements.fileInput?.addEventListener('change', async () => {
    const file = extractFirstImageFile(elements.fileInput?.files ?? null);
    if (!file) {
      elements.uiState.addLog('Selected file is not an image.');
      return;
    }
    await handleAttachment(file, 'upload');
    if (elements.fileInput) {
      elements.fileInput.value = '';
    }
  });

  elements.clearButton?.addEventListener('click', () => {
    setAttachment(null);
    elements.uiState.addLog('Image attachment cleared.');
  });

  elements.captureButton?.addEventListener('click', async () => {
    try {
      const attachment = await captureScreenSelectionAttachment();
      if (!attachment) {
        elements.uiState.addLog('Screen capture not supported or canceled.');
        return;
      }
      setAttachment(attachment);
      elements.uiState.addLog(`Screenshot captured: ${attachment.name}`);
    } catch (error) {
      elements.uiState.addLog(`Screenshot capture failed: ${String(error)}`);
    }
  });

  elements.promptInput.addEventListener('dragenter', (event) => {
    if (!isFileDrag(event)) {
      return;
    }
    dragDepth += 1;
    terminalRoot?.classList.add('is-dropping');
  });

  elements.promptInput.addEventListener('dragover', (event) => {
    if (!isFileDrag(event)) {
      return;
    }
    event.preventDefault();
  });

  elements.promptInput.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      terminalRoot?.classList.remove('is-dropping');
    }
  });

  elements.promptInput.addEventListener('drop', async (event) => {
    event.preventDefault();
    dragDepth = 0;
    terminalRoot?.classList.remove('is-dropping');

    const file = extractFirstImageFile(event.dataTransfer?.files ?? null);
    if (!file) {
      elements.uiState.addLog('Dropped item is not an image.');
      return;
    }
    await handleAttachment(file, 'drop');
  });

  return {
    getAttachment: () => currentAttachment,
    consumeAttachment: () => {
      const attachment = currentAttachment;
      if (attachment) {
        setAttachment(null);
      }
      return attachment;
    },
  };
};

export const createQuestionHandler = (
  pipeline: Pipeline,
  uiState: UIState,
  promptInput: HTMLTextAreaElement,
  form: HTMLFormElement,
  historyElement: HTMLElement,
  imageStore?: ImageAttachmentStore,
  contextStore?: ContextStore,
) => {
  return async (event: Event) => {
    event.preventDefault();

    const question = promptInput.value.trim();
    const pendingAttachment = imageStore?.getAttachment() ?? null;
    if (!question && !pendingAttachment) {
      return;
    }

    const displayQuestion = question || '[IMAGE ATTACHED]';
    uiState.incrementQueryCount();
    uiState.updateStats();
    uiState.markActivity();
    uiState.setBusy(true);

    const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    submitButton?.setAttribute('disabled', 'true');
    uiState.hideBubble();
    uiState.setStatus('OPERATIONAL', 'PROCESSING', 'QUERY_RECEIVED');
    uiState.setMood('listening');
    uiState.addLog(`Query received: "${displayQuestion.substring(0, 50)}..."`);
    Logger.info('ui', 'User submitted question', { questionLength: question.length });

    const settle = () => {
      submitButton?.removeAttribute('disabled');
      uiState.setStatus('OPERATIONAL', 'AWAITING_INPUT', 'COMPLETE');
      uiState.setBusy(false);
      uiState.markActivity();
      window.setTimeout(() => {
        uiState.setMood('idle');
      }, 650);
    };

    try {
      uiState.setMood('thinking');
      uiState.setStatus('OPERATIONAL', 'ANALYZING', 'CONTRACT_VALIDATION');
      uiState.addLog('Analyzing query with contracts...');
      const consumedAttachment = pendingAttachment ? imageStore?.consumeAttachment() : null;
      const attachments = consumedAttachment ? [consumedAttachment] : undefined;
      const contextSnapshot = contextStore?.getSnapshot();
      const result = await pipeline.run(question, attachments, contextSnapshot);

      const record = buildHistoryEntry(displayQuestion, result);
      contextStore?.updateAfterRun(displayQuestion, result);

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
        logEvaluationOutcome(result, uiState);
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

        const errCard = buildHistoryEntry(displayQuestion, {
          ok: false,
          kind: 'error',
          stage: 'tool_execution',
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

const PLATFORM_WINDOWS = 'windows';

let cachedPlatformName: string | null = null;

const detectPlatform = async (): Promise<string> => {
  try {
    const platformName = await invoke<string>('detect_platform');
    return platformName?.toLowerCase() ?? '';
  } catch (error) {
    Logger.error('ui', 'Unable to detect platform via Tauri', { error });
    return '';
  }
};

const getPlatformName = async (): Promise<string> => {
  if (cachedPlatformName !== null) {
    return cachedPlatformName;
  }

  cachedPlatformName = await detectPlatform();
  if (!cachedPlatformName) {
    cachedPlatformName = navigator.platform?.toLowerCase() ?? '';
  }

  return cachedPlatformName;
};

const isWindowsPlatform = async (): Promise<boolean> => (await getPlatformName()) === PLATFORM_WINDOWS;

const resolveExplorerPath = async (trimmedPath: string): Promise<string> => {
  try {
    const normalized = await invoke<string>('normalize_path', { rawPath: trimmedPath });
    if (normalized && normalized.length > 0) {
      return normalized;
    }
  } catch (error) {
    Logger.error('ui', 'Failed to normalize explorer path', { path: trimmedPath, error });
  }
  return trimmedPath;
};

/**
 * Builds the PowerShell script for opening Explorer to a target path.
 */
const buildExplorerScript = (resolvedPath: string): string => {
  const safePath = resolvedPath.replace(/'/g, "''");
  return `
$path = '${safePath}'
$path = $path.TrimEnd('\\', '/')
$isFile = Test-Path $path -PathType Leaf
if ($isFile) {
  $args = "/select,\`"$path\`""
} else {
  $args = "\`"$path\`""
}
Start-Process explorer.exe -ArgumentList $args
`.trim();
};

/**
 * Opens a file preview path in the system file explorer.
 */
const openPathInExplorer = async (rawPath: string): Promise<void> => {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return;
  }

  const resolvedPath = await resolveExplorerPath(trimmed);

  try {
    if (await isWindowsPlatform()) {
      const command = Command.create('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        buildExplorerScript(resolvedPath),
      ]);
      await command.execute();
      return;
    }

    const platformName = await getPlatformName();
    const openCommand =
      platformName === 'macos' || platformName === 'darwin' ? 'open' : 'xdg-open';
    const command = Command.create(openCommand, [resolvedPath]);
    await command.execute();
  } catch (error) {
    Logger.error('ui', 'Failed to open file path', { path: resolvedPath, error });
  }
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

  const filePathButton = target.closest<HTMLElement>('[data-file-path]');
  if (filePathButton) {
    const encoded = filePathButton.getAttribute('data-file-path');
    if (!encoded) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    void openPathInExplorer(decodeURIComponent(encoded));
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
