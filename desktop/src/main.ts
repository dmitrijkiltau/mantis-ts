import { OllamaClient } from '../../assistant/src/models/ollama';
import { Orchestrator } from '../../assistant/src/orchestrator';
import { Pipeline } from '../../assistant/src/pipeline';
import { Runner } from '../../assistant/src/runner';
import { Logger } from '../../assistant/src/logger';
import { getToolDefinition } from '../../assistant/src/tools/registry';
import './styles.css';
import { AssistantAvatar, AvatarMood } from './avatar';
import { marked } from 'marked';

const orchestrator = new Orchestrator();
const runner = new Runner(orchestrator, new OllamaClient());
const pipeline = new Pipeline(orchestrator, runner);

const form = document.getElementById('prompt-form') as HTMLFormElement | null;
const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement | null;
const historyElement = document.getElementById('history');
const avatarMount = document.getElementById('assistant-avatar') as HTMLDivElement | null;
const moodLabel = document.getElementById('avatar-mood-label');
const speechBubble = document.getElementById('speech-bubble');
const bubbleAnswer = document.getElementById('bubble-answer');
const logsConsole = document.getElementById('logs');
const avatar = avatarMount ? new AssistantAvatar(avatarMount) : null;
const toolResults = document.getElementById('tool-results');
const toolSearchForm = document.getElementById('tool-search-form') as HTMLFormElement | null;
const toolOpenForm = document.getElementById('tool-open-form') as HTMLFormElement | null;

// Status display elements
const statusSystem = document.getElementById('status-system');
const statusState = document.getElementById('status-state');
const statusAction = document.getElementById('status-action');

// Stats elements
const statQueries = document.getElementById('stat-queries');
const statRuntime = document.getElementById('stat-runtime');

let queryCount = 0;
let sessionStart = Date.now();

/**
 * Updates stats display
 */
const updateStats = () => {
  const runtimeSeconds = Math.floor((Date.now() - sessionStart) / 1000);
  if (statQueries) statQueries.textContent = `Q:${queryCount}`;
  if (statRuntime) statRuntime.textContent = `RT:${runtimeSeconds}s`;
};

/**
 * Adds log entry to the logs console
 */
const addLog = (message: string) => {
  if (logsConsole) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}] ${message}`;
    logsConsole.appendChild(entry);
    logsConsole.scrollTop = logsConsole.scrollHeight;
  }
};

/**
 * Shows answer in speech bubble with markdown support
 */
const showBubble = (text: string) => {
  if (speechBubble && bubbleAnswer) {
    bubbleAnswer.innerHTML = marked.parse(text) as string;
    bubbleAnswer.textContent = bubbleAnswer.textContent.replace(/\n$/, '');
    speechBubble.classList.remove('hidden');
  }
};

/**
 * Hides speech bubble
 */
const hideBubble = () => {
  if (speechBubble) {
    speechBubble.classList.add('hidden');
  }
};

/**
 * Updates tablet status display
 */
const setStatus = (system: string, state: string, action: string) => {
  if (statusSystem) statusSystem.textContent = system;
  if (statusState) statusState.textContent = state;
  if (statusAction) statusAction.textContent = action;
};

const setMood = (mood: AvatarMood) => {
  avatar?.setMood(mood);
  if (moodLabel) {
    const title = mood.toUpperCase();
    moodLabel.textContent = title;
    moodLabel.setAttribute('data-mood', mood);
  }
};

setMood('idle');
setStatus('OPERATIONAL', 'AWAITING_INPUT', 'NONE');

/**
 * Formats tool output for display
 */
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

const renderToolResult = (title: string, payload: unknown, meta?: Record<string, unknown>) => {
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

/**
 * Executes the search tool with UI-provided arguments.
 */
const handleSearchTool = async (event: Event) => {
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
    setMood('thinking');
    setStatus('OPERATIONAL', 'PROCESSING', 'TOOL_SEARCH');
    addLog('Executing filesystem search tool...');

    const tool = getToolDefinition('search');
    const result = await tool.execute(args as Record<string, unknown>);

    setMood('speaking');
    setStatus('OPERATIONAL', 'COMPLETE', 'TOOL_SEARCH');
    addLog(`Search completed (${(result as { matches?: unknown[] }).matches?.length ?? 0} matches)`);

    renderToolResult('Filesystem Search', result, { args });
  } catch (error) {
    setMood('concerned');
    setStatus('ERROR', 'FAILED', 'TOOL_SEARCH');
    addLog(`Search error: ${String(error)}`);
    renderToolResult('Filesystem Search Error', String(error));
  } finally {
    window.setTimeout(() => setMood('idle'), 500);
  }
};

/**
 * Executes the filesystem open tool with UI-provided arguments.
 */
const handleOpenTool = async (event: Event) => {
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
    setMood('thinking');
    setStatus('OPERATIONAL', 'PROCESSING', 'TOOL_FILESYSTEM');
    addLog(`Executing filesystem tool (${action})...`);

    const tool = getToolDefinition('filesystem');
    const result = await tool.execute(args as Record<string, unknown>);

    setMood('speaking');
    setStatus('OPERATIONAL', 'COMPLETE', 'TOOL_FILESYSTEM');
    addLog(`Filesystem ${action} completed`);

    renderToolResult('Filesystem Open', result, { args });
  } catch (error) {
    setMood('concerned');
    setStatus('ERROR', 'FAILED', 'TOOL_FILESYSTEM');
    addLog(`Filesystem error: ${String(error)}`);
    renderToolResult('Filesystem Open Error', String(error));
  } finally {
    window.setTimeout(() => setMood('idle'), 500);
  }
};

/**
 * Handles user question submission
 */
async function handleQuestion(event: Event) {
  event.preventDefault();

  if (!promptInput || !form || !historyElement) {
    return;
  }

  const question = promptInput.value.trim();
  if (!question) {
    return;
  }

  queryCount++;
  updateStats();

  const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
  submitButton?.setAttribute('disabled', 'true');
  hideBubble();
  setStatus('OPERATIONAL', 'PROCESSING', 'QUERY_RECEIVED');
  setMood('listening');
  addLog(`Query received: "${question.substring(0, 50)}..."`);
  Logger.info('ui', 'User submitted question', { questionLength: question.length });

  const settle = () => {
    submitButton?.removeAttribute('disabled');
    setStatus('OPERATIONAL', 'AWAITING_INPUT', 'COMPLETE');
    window.setTimeout(() => {
      setMood('idle');
    }, 650);
  };

  try {
    setMood('thinking');
    setStatus('OPERATIONAL', 'ANALYZING', 'CONTRACT_VALIDATION');
    addLog('Analyzing query with contracts...');
    const result = await pipeline.run(question);

    const record = document.createElement('div');
    record.className = 'answer-card';
    if (result.ok) {
      if (result.kind === 'tool') {
        Logger.info('ui', `Tool result received: ${result.tool}`);
        setMood('speaking');
        setStatus('OPERATIONAL', 'COMPLETE', `TOOL_${result.tool.toUpperCase()}`);
        addLog(`Tool executed: ${result.tool}`);
        
        // Don't show 'Tool: time Result:' - just show the actual result
        const answerText = formatPayload(result.result);
        showBubble(answerText);
        
        record.innerHTML = `
          <h3>Tool: ${result.tool}</h3>
          <pre>${formatPayload(result.result)}</pre>
          <p>Args: ${formatPayload(result.args)}</p>
          <p>Attempts: ${result.attempts}</p>
        `;
      } else {
        Logger.info('ui', 'Strict answer generated');
        setMood('speaking');
        setStatus('OPERATIONAL', 'COMPLETE', 'ANSWER_GENERATED');
        addLog('Answer generated successfully');
        
        showBubble(result.value);
        
        record.innerHTML = `
          <h3>Answer</h3>
          <pre>${result.value}</pre>
          <p>Attempts: ${result.attempts}</p>
        `;
      }
    } else {
      Logger.error('ui', `Pipeline failed at stage: ${result.stage}`);
      setMood('concerned');
      setStatus('ERROR', 'FAILED', result.stage.toUpperCase());
      const errorDetail = result.error
        ? `${result.error.code}: ${result.error.message}`
        : 'No valid response after retries.';
      addLog(`ERROR: ${errorDetail}`);
      
      showBubble(`Error: ${errorDetail}`);
      
      record.innerHTML = `
        <h3>Error (${result.stage})</h3>
        <pre>${errorDetail}</pre>
        <p>Attempts: ${result.attempts}</p>
      `;
    }
    historyElement.prepend(record);
  } catch (error) {
    Logger.error('ui', 'Unhandled exception in pipeline', error);
    setMood('concerned');
    setStatus('ERROR', 'EXCEPTION', 'UNHANDLED');
    addLog(`FATAL ERROR: ${String(error)}`);
    
    const errCard = document.createElement('div');
    errCard.className = 'answer-card';
    errCard.innerHTML = `<h3>Error</h3><pre>${String(error)}</pre>`;
    historyElement.prepend(errCard);
    
    showBubble(`Critical Error: ${String(error)}`);
  } finally {
    settle();
    updateStats();
  }
}

// Tab switching functionality
const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.tablet-panel');

for (const button of tabButtons) {
  button.addEventListener('click', () => {
    const targetTab = button.getAttribute('data-tab');
    
    // Update active states
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
    
    addLog(`Switched to ${targetTab!.toUpperCase()} panel`);
  });
}

form?.addEventListener('submit', handleQuestion);
toolSearchForm?.addEventListener('submit', handleSearchTool);
toolOpenForm?.addEventListener('submit', handleOpenTool);

// Update runtime counter every second
setInterval(updateStats, 1000);

addLog('MANTIS Desktop initialized successfully');
addLog('System ready for queries');
