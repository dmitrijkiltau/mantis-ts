import { OllamaClient } from '../../assistant/src/models/ollama';
import { Orchestrator } from '../../assistant/src/orchestrator';
import { Pipeline } from '../../assistant/src/pipeline';
import { Runner } from '../../assistant/src/runner';
import { AssistantAvatar } from './avatar';
import { UIState } from './ui-state';
import {
  createQuestionHandler,
  renderToolCatalog,
  setupTabSwitching,
  setupBubbleInteractions,
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
const toolList = document.getElementById('tool-list');
const toolCountBadge = document.getElementById('tool-count');

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

const handleQuestion = promptInput && form && historyElement
  ? createQuestionHandler(pipeline, uiState, promptInput, form, historyElement)
  : null;

renderToolCatalog(toolList, toolCountBadge, uiState);

setupTabSwitching(uiState);
setupBubbleInteractions(bubbleAnswer);

form?.addEventListener('submit', (event) => handleQuestion?.(event));

setInterval(() => uiState.updateStats(), 1000);

uiState.addLog('MANTIS Desktop initialized successfully');
uiState.addLog('System ready for queries');
