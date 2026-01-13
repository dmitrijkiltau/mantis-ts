import { OllamaClient } from '../../assistant/src/models/ollama';
import { Orchestrator } from '../../assistant/src/orchestrator';
import { Pipeline } from '../../assistant/src/pipeline';
import { Runner } from '../../assistant/src/runner';
import { AssistantAvatar } from './avatar';
import { UIState } from './ui-state';
import {
  createToolResultRenderer,
  createSearchToolHandler,
  createOpenToolHandler,
  createQuestionHandler,
  setupTabSwitching,
} from './ui-handlers';

import './styles.css';

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

const statusSystem = document.getElementById('status-system');
const statusState = document.getElementById('status-state');
const statusAction = document.getElementById('status-action');

const statQueries = document.getElementById('stat-queries');
const statRuntime = document.getElementById('stat-runtime');

const uiState = new UIState(
  avatar,
  moodLabel,
  speechBubble,
  bubbleAnswer,
  logsConsole,
  statusSystem,
  statusState,
  statusAction,
  statQueries,
  statRuntime,
);

uiState.setMood('idle');
uiState.setStatus('OPERATIONAL', 'AWAITING_INPUT', 'NONE');

const renderToolResult = createToolResultRenderer(toolResults);
const handleSearchTool = createSearchToolHandler(uiState, renderToolResult);
const handleOpenTool = createOpenToolHandler(uiState, renderToolResult);
const handleQuestion = promptInput && form && historyElement
  ? createQuestionHandler(pipeline, uiState, promptInput, form, historyElement)
  : null;

setupTabSwitching(uiState);

form?.addEventListener('submit', (event) => handleQuestion?.(event));
toolSearchForm?.addEventListener('submit', handleSearchTool);
toolOpenForm?.addEventListener('submit', handleOpenTool);

setInterval(() => uiState.updateStats(), 1000);

uiState.addLog('MANTIS Desktop initialized successfully');
uiState.addLog('System ready for queries');
