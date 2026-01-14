import { Pipeline } from '../../assistant/src/pipeline';
import { Logger } from '../../assistant/src/logger';
import { getToolDefinition } from '../../assistant/src/tools/registry';
import { UIState } from './ui-state';
import { renderBubbleContent } from './bubble-renderer';

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

const parseNumberField = (value: string | null | undefined): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
};

export const createToolResultRenderer = (toolResults: HTMLElement | null) => {
  return (title: string, payload: unknown, meta?: Record<string, unknown>) => {
    if (!toolResults) {
      return;
    }

    const placeholder = toolResults.querySelector('.tool-placeholder');
    if (placeholder) {
      placeholder.remove();
    }

    const card = document.createElement('div');
    card.className = 'tool-result-card';

    const heading = document.createElement('div');
    heading.className = 'tool-result-title';
    heading.textContent = title;
    card.appendChild(heading);

    if (meta && Object.keys(meta).length > 0) {
      const metaBlock = document.createElement('div');
      metaBlock.className = 'tool-result-meta';
      metaBlock.textContent = formatPayload(meta);
      card.appendChild(metaBlock);
    }

    const body = document.createElement('pre');
    body.textContent = formatPayload(payload);
    card.appendChild(body);

    toolResults.prepend(card);
  };
};

export const createSearchToolHandler = (uiState: UIState, renderToolResult: ReturnType<typeof createToolResultRenderer>) => {
  return async (event: Event) => {
    event.preventDefault();

    const queryInput = document.getElementById('search-query') as HTMLInputElement | null;
    const baseInput = document.getElementById('search-base') as HTMLInputElement | null;
    const startInput = document.getElementById('search-start') as HTMLInputElement | null;
    const maxResultsInput = document.getElementById('search-max-results') as HTMLInputElement | null;
    const maxDepthInput = document.getElementById('search-max-depth') as HTMLInputElement | null;
    const filesInput = document.getElementById('search-files') as HTMLInputElement | null;
    const dirsInput = document.getElementById('search-dirs') as HTMLInputElement | null;

    const query = queryInput?.value.trim() ?? '';
    const baseDir = baseInput?.value.trim() ?? '';
    if (!query || !baseDir) {
      return;
    }

    const args = {
      query,
      baseDir,
      startPath: startInput?.value.trim() || null,
      maxResults: parseNumberField(maxResultsInput?.value),
      maxDepth: parseNumberField(maxDepthInput?.value),
      includeFiles: filesInput ? filesInput.checked : true,
      includeDirectories: dirsInput ? dirsInput.checked : true,
    };

    try {
      uiState.setMood('thinking');
      uiState.setStatus('OPERATIONAL', 'PROCESSING', 'TOOL_SEARCH');
      uiState.addLog('Executing filesystem search tool...');

      const tool = getToolDefinition('search');
      const result = await tool.execute(args as Record<string, unknown>);

      uiState.setMood('speaking');
      uiState.setStatus('OPERATIONAL', 'COMPLETE', 'TOOL_SEARCH');
      uiState.addLog(`Search completed (${(result as { matches?: unknown[] }).matches?.length ?? 0} matches)`);

      renderToolResult('Filesystem Search', result, { args });
    } catch (error) {
      uiState.setMood('concerned');
      uiState.setStatus('ERROR', 'FAILED', 'TOOL_SEARCH');
      uiState.addLog(`Search error: ${String(error)}`);
      renderToolResult('Filesystem Search Error', String(error));
    } finally {
      window.setTimeout(() => uiState.setMood('idle'), 500);
    }
  };
};

export const createOpenToolHandler = (uiState: UIState, renderToolResult: ReturnType<typeof createToolResultRenderer>) => {
  return async (event: Event) => {
    event.preventDefault();

    const actionSelect = document.getElementById('open-action') as HTMLSelectElement | null;
    const pathInput = document.getElementById('open-path') as HTMLInputElement | null;
    const limitInput = document.getElementById('open-limit') as HTMLInputElement | null;
    const maxBytesInput = document.getElementById('open-max-bytes') as HTMLInputElement | null;

    const action = actionSelect?.value ?? '';
    const path = pathInput?.value.trim() ?? '';
    if (!action || !path) {
      return;
    }

    const args = {
      action,
      path,
      limit: parseNumberField(limitInput?.value),
      maxBytes: parseNumberField(maxBytesInput?.value),
    };

    try {
      uiState.setMood('thinking');
      uiState.setStatus('OPERATIONAL', 'PROCESSING', 'TOOL_FILESYSTEM');
      uiState.addLog(`Executing filesystem tool (${action})...`);

      const tool = getToolDefinition('filesystem');
      const result = await tool.execute(args as Record<string, unknown>);

      uiState.setMood('speaking');
      uiState.setStatus('OPERATIONAL', 'COMPLETE', 'TOOL_FILESYSTEM');
      uiState.addLog(`Filesystem ${action} completed`);

      renderToolResult('Filesystem Open', result, { args });
    } catch (error) {
      uiState.setMood('concerned');
      uiState.setStatus('ERROR', 'FAILED', 'TOOL_FILESYSTEM');
      uiState.addLog(`Filesystem error: ${String(error)}`);
      renderToolResult('Filesystem Open Error', String(error));
    } finally {
      window.setTimeout(() => uiState.setMood('idle'), 500);
    }
  };
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

      const record = document.createElement('div');
      record.className = 'answer-card';
      if (result.ok) {
        if (result.kind === 'tool') {
          Logger.info('ui', `Tool result received: ${result.tool}`);
          uiState.setMood('speaking');
          uiState.setStatus('OPERATIONAL', 'COMPLETE', `TOOL_${result.tool.toUpperCase()}`);
          uiState.addLog(`Tool executed: ${result.tool}`);

          const answerText = formatPayload(result.result);
          uiState.showBubble(renderBubbleContent(answerText));

          record.innerHTML = `
            <h3>Tool: ${result.tool}</h3>
            <pre>${formatPayload(result.result)}</pre>
            <p>Args: ${formatPayload(result.args)}</p>
            <p>Attempts: ${result.attempts}</p>
          `;
        } else {
          Logger.info('ui', 'Strict answer generated');
          uiState.setMood('speaking');
          uiState.setStatus('OPERATIONAL', 'COMPLETE', 'ANSWER_GENERATED');
          uiState.addLog('Answer generated successfully');

          uiState.showBubble(renderBubbleContent(result.value));

          record.innerHTML = `
            <h3>Answer</h3>
            <pre>${result.value}</pre>
            <p>Attempts: ${result.attempts}</p>
          `;
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

        record.innerHTML = `
          <h3>Error (${result.stage})</h3>
          <pre>${errorDetail}</pre>
          <p>Attempts: ${result.attempts}</p>
        `;
      }
      historyElement.prepend(record);
    } catch (error) {
      Logger.error('ui', 'Unhandled exception in pipeline', error);
      uiState.setMood('concerned');
      uiState.setStatus('ERROR', 'EXCEPTION', 'UNHANDLED');
      uiState.addLog(`FATAL ERROR: ${String(error)}`);

      const errCard = document.createElement('div');
      errCard.className = 'answer-card';
      errCard.innerHTML = `<h3>Error</h3><pre>${String(error)}</pre>`;
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

const markButtonCopied = (button: HTMLButtonElement): void => {
  button.classList.add('http-json-button--copied');
  window.setTimeout(() => {
    button.classList.remove('http-json-button--copied');
  }, COPY_FEEDBACK_DURATION);
};

export const setupBubbleInteractions = (bubbleAnswer: HTMLElement | null) => {
  if (!bubbleAnswer) {
    return;
  }

  bubbleAnswer.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    const control = target.closest<HTMLButtonElement>('[data-http-json-action]');
    if (!control) {
      return;
    }

    const block = control.closest<HTMLElement>('.http-json-block');
    if (!block) {
      return;
    }

    const action = control.getAttribute('data-http-json-action');
    if (!action) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (action === JSON_TOGGLE_ACTION) {
      const current = block.getAttribute('data-json-view') === 'viewer' ? 'viewer' : 'pretty';
      const nextMode: 'pretty' | 'viewer' = current === 'pretty' ? 'viewer' : 'pretty';
      block.setAttribute('data-json-view', nextMode);
      updateToggleLabel(control, nextMode);
    } else if (action === JSON_COPY_ACTION) {
      const raw = block.dataset.jsonRaw ? decodeURIComponent(block.dataset.jsonRaw) : '';
      void copyTextToClipboard(raw).then((success) => {
        if (success) {
          markButtonCopied(control);
        }
      });
    }
  });
};
