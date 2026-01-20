import { Pipeline, type PipelineResult, type EvaluationAlert } from '../../assistant/src/pipeline';
import { Logger } from '../../assistant/src/logger';
import type { JSX } from 'solid-js';
import { render } from 'solid-js/web';
import { UIState, type BubbleContent } from './ui-state';
import type { ContextStore } from './context-store';
import { renderBubbleContent } from './bubble/render-bubble';
import { renderMarkdown } from './bubble/markdown';
import { ToolOutputContent } from './bubble/tool-output';
import { Command } from '@tauri-apps/plugin-shell';
import { invoke } from './tauri-invoke';
import {
  formatEvaluationSummary,
  getEvaluationAlertMessage,
} from './evaluation-utils';
import type { ImageAttachmentStore } from './state/image-attachment-context';

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

const truncateText = (value: string, limit: number): string => {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 3)}...`;
};

type BubbleRenderFn = () => JSX.Element;

const renderHistoryContent = (value: unknown): BubbleRenderFn => {
  const payload = typeof value === 'string' ? value : formatPayload(value);
  return () => renderBubbleContent(payload);
};

const renderToolOutput = (result: PipelineResult & { kind: 'tool' }): BubbleRenderFn => {
  if (hasToolSummary(result) && typeof result.result !== 'string') {
    return () => ToolOutputContent({ summary: result.summary, raw: result.result });
  }

  return renderHistoryContent(result.result);
};

/**
 * Wraps plain text for the live bubble typewriter flow.
 */
const buildBubbleContent = (text: string): BubbleContent => {
  return {
    kind: 'typewriter',
    text,
    render: () => renderBubbleContent(text),
  };
};

/**
 * Creates a bubble payload for tool results with a typed summary.
 */
const buildToolBubbleContent = (result: PipelineResult & { kind: 'tool' }): BubbleContent => {
  if (hasToolSummary(result) && typeof result.result !== 'string') {
    const summaryText = result.summary.trim();
    const summaryHtml = renderMarkdown(summaryText);
    return {
      kind: 'inline-typewriter',
      text: summaryText,
      targetSelector: '[data-typewriter-target="summary"]',
      finalHtml: summaryHtml,
      render: () => ToolOutputContent({
        summary: summaryText,
        raw: result.result,
        summaryHtml: '',
      }),
    };
  }

  const payload = typeof result.result === 'string' ? result.result : formatPayload(result.result);
  return buildBubbleContent(payload);
};

const createHistoryContentShell = (contentNode: BubbleRenderFn): HTMLDivElement => {
  const shell = document.createElement('div');
  shell.className = 'speech-bubble history-bubble-shell';

  const content = document.createElement('div');
  content.className = 'bubble-content history-content';
  render(contentNode, content);

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
    const pendingAttachment = imageStore?.attachment() ?? null;
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

          uiState.showBubble(buildToolBubbleContent(result));
        } else {
          Logger.info('ui', 'Strict answer generated');
          uiState.setMood('speaking');
          uiState.setStatus('OPERATIONAL', 'COMPLETE', 'ANSWER_GENERATED');
          uiState.addLog('Answer generated successfully');

          uiState.showBubble(buildBubbleContent(result.value));
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

        uiState.showBubble(buildBubbleContent(`Error: ${errorDetail}`));
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

      uiState.showBubble(buildBubbleContent(`Critical Error: ${String(error)}`));
    } finally {
      settle();
      uiState.updateStats();
    }
  };
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
 * Cycles through view options on a single toggle button.
 */
const handleViewCycle = (event: Event, target: HTMLElement): boolean => {
  const button = target.closest<HTMLButtonElement>('[data-view-cycle]');
  if (!button) {
    return false;
  }

  const options = (button.getAttribute('data-view-options') ?? '')
    .split(',')
    .map((option) => option.trim())
    .filter(Boolean);
  if (options.length < 2) {
    return false;
  }

  const root = button.closest<HTMLElement>('[data-view-root]');
  if (!root) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();

  const labels = (button.getAttribute('data-view-labels') ?? '')
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean);
  const current = root.getAttribute('data-view') ?? options[0]!;
  const currentIndex = Math.max(0, options.indexOf(current));
  const nextIndex = (currentIndex + 1) % options.length;
  const nextView = options[nextIndex] ?? options[0]!;
  root.setAttribute('data-view', nextView);

  const label = labels[nextIndex] ?? nextView.toUpperCase();
  const textNode = button.querySelector<HTMLElement>('.view-button-text');
  if (textNode) {
    textNode.textContent = label;
  }
  button.setAttribute('aria-label', `Toggle view: ${label}`);

  return true;
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

export const handleRichContentInteraction = (event: Event): void => {
  const target = event.target as HTMLElement | null;
  if (!target) {
    return;
  }

  const root = target.closest<HTMLElement>('[data-history-root], #bubble-answer, #history');
  if (!root) {
    return;
  }

  if (handleViewCycle(event, target)) {
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
      const rawContainer = codeControl.closest<HTMLElement>('[data-raw-copy]');
      if (rawContainer?.dataset.rawCopy) {
        raw = decodeURIComponent(rawContainer.dataset.rawCopy);
      }
      const block = codeControl.closest<HTMLElement>('.code-block, .code-block-markdown, .code-block-json');
      if (!raw && block) {
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
