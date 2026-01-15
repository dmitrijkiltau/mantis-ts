import { Pipeline } from '../../assistant/src/pipeline';
import { Logger } from '../../assistant/src/logger';
import type { ToolDefinitionBase, ToolSchema } from '../../assistant/src/tools/definition';
import { TOOLS, type ToolName } from '../../assistant/src/tools/registry';
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
  const isBubbleButton = button.classList.contains('code-block-button');
  const copiedClass = isBubbleButton ? 'code-block-button--copied' : 'http-json-button--copied';
  button.classList.add(copiedClass);
  window.setTimeout(() => {
    button.classList.remove(copiedClass);
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

    // Handle markdown preview toggle
    const markdownControl = target.closest<HTMLButtonElement>('[data-markdown-action]');
    if (markdownControl) {
      const block = markdownControl.closest<HTMLElement>('.code-block-markdown');
      if (!block) {
        return;
      }

      const action = markdownControl.getAttribute('data-markdown-action');
      if (action === JSON_TOGGLE_ACTION) {
        event.preventDefault();
        event.stopPropagation();

        const current = block.getAttribute('data-markdown-view') === 'preview' ? 'preview' : 'raw';
        const nextMode: 'preview' | 'raw' = current === 'preview' ? 'raw' : 'preview';
        block.setAttribute('data-markdown-view', nextMode);
        
        const label = nextMode === 'preview' ? 'Show raw markdown' : 'Show markdown preview';
        markdownControl.setAttribute('aria-label', label);
      }
      return;
    }

    // Handle JSON code block preview toggle
    const jsonCodeControl = target.closest<HTMLButtonElement>('[data-json-action]');
    if (jsonCodeControl) {
      const block = jsonCodeControl.closest<HTMLElement>('.code-block-json');
      if (!block) {
        return;
      }

      const action = jsonCodeControl.getAttribute('data-json-action');
      if (action === JSON_TOGGLE_ACTION) {
        event.preventDefault();
        event.stopPropagation();

        const current = block.getAttribute('data-json-view') === 'viewer' ? 'viewer' : 'pretty';
        const nextMode: 'pretty' | 'viewer' = current === 'pretty' ? 'viewer' : 'pretty';
        block.setAttribute('data-json-view', nextMode);
        
        const label = nextMode === 'viewer' ? 'Show pretty JSON' : 'Show structured JSON view';
        jsonCodeControl.setAttribute('aria-label', label);
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
      return;
    }
  });
};
