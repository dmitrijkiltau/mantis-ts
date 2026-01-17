import { OllamaClient } from '../../assistant/src/models/ollama';
import { Orchestrator } from '../../assistant/src/orchestrator';
import { Pipeline } from '../../assistant/src/pipeline';
import { Runner } from '../../assistant/src/runner';
import { CONTRACTS } from '../../assistant/src/contracts/registry';
import contractIntentClassificationSource from '../../assistant/src/contracts/intent.classification.ts?raw';
import contractLanguageDetectionSource from '../../assistant/src/contracts/language.detection.ts?raw';
import contractToolArgumentExtractionSource from '../../assistant/src/contracts/tool.argument.extraction.ts?raw';
import contractTextTransformationSource from '../../assistant/src/contracts/text.transformation.ts?raw';
import contractScoringEvaluationSource from '../../assistant/src/contracts/scoring.evaluation.ts?raw';
import contractStrictAnswerSource from '../../assistant/src/contracts/strict.answer.ts?raw';
import contractConversationalAnswerSource from '../../assistant/src/contracts/conversational.answer.ts?raw';
import contractResponseFormattingSource from '../../assistant/src/contracts/response.formatting.ts?raw';
import contractErrorChannelSource from '../../assistant/src/contracts/error.channel.ts?raw';
import { AssistantAvatar } from './avatar';
import { UIState } from './ui-state';
import {
  createQuestionHandler,
  renderToolCatalog,
  setupTabSwitching,
  setupContentInteractions,
} from './ui-handlers';
import { renderToolOutputContent } from './bubble-renderer';
import { startIdleChatter } from './idle-chatter';

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
const contractModelList = document.getElementById('contract-models');
const contractModelCount = document.getElementById('contract-model-count');

const statQueries = document.getElementById('stat-queries');
const statRuntime = document.getElementById('stat-runtime');

type ContractSource = {
  path: string;
  content: string;
};

const CONTRACT_SOURCE_MAP = new Map<string, ContractSource>([
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
    'TEXT_TRANSFORMATION',
    {
      path: 'assistant/src/contracts/text.transformation.ts',
      content: contractTextTransformationSource,
    },
  ],
  [
    'SCORING_EVALUATION',
    {
      path: 'assistant/src/contracts/scoring.evaluation.ts',
      content: contractScoringEvaluationSource,
    },
  ],
  [
    'STRICT_ANSWER',
    {
      path: 'assistant/src/contracts/strict.answer.ts',
      content: contractStrictAnswerSource,
    },
  ],
  [
    'CONVERSATIONAL_ANSWER',
    {
      path: 'assistant/src/contracts/conversational.answer.ts',
      content: contractConversationalAnswerSource,
    },
  ],
  [
    'RESPONSE_FORMATTING',
    {
      path: 'assistant/src/contracts/response.formatting.ts',
      content: contractResponseFormattingSource,
    },
  ],
  [
    'ERROR_CHANNEL',
    {
      path: 'assistant/src/contracts/error.channel.ts',
      content: contractErrorChannelSource,
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
const getContractSource = (contractKey: string): ContractSource | null => {
  return CONTRACT_SOURCE_MAP.get(contractKey) ?? null;
};

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

if (contractModelList) {
  const contractEntries = Object.entries(CONTRACTS);
  const modelBuckets = new Map<string, string[]>();

  for (let index = 0; index < contractEntries.length; index += 1) {
    const entry = contractEntries[index];
    if (!entry) {
      continue;
    }
    const [name, contract] = entry;
    const modelName = contract.MODEL?.trim() || 'UNSPECIFIED';
    const bucket = modelBuckets.get(modelName);

    if (bucket) {
      bucket.push(name);
    } else {
      modelBuckets.set(modelName, [name]);
    }
  }

  const modelEntries = Array.from(modelBuckets.entries());
  modelEntries.sort((a, b) => a[0].localeCompare(b[0]));

  contractModelList.innerHTML = '';
  if (contractModelCount) {
    const modelCount = modelEntries.length;
    contractModelCount.textContent = `${modelCount} model${modelCount === 1 ? '' : 's'} loaded`;
  }

  if (modelEntries.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'contract-model-placeholder';
    placeholder.textContent = 'No contract models available.';
    contractModelList.appendChild(placeholder);
  } else {
    for (let index = 0; index < modelEntries.length; index += 1) {
      const entry = modelEntries[index];
      if (!entry) {
        continue;
      }
      const [modelName, contracts] = entry;
      const sortedContracts = [...contracts].sort((a, b) => a.localeCompare(b));
      const row = document.createElement('div');
      row.className = 'contract-model-row';

      const label = document.createElement('div');
      label.className = 'contract-model-name';
      const modelUrl = getOllamaModelUrl(modelName);
      if (modelUrl) {
        const modelLink = document.createElement('a');
        modelLink.className = 'contract-model-link';
        modelLink.href = modelUrl;
        modelLink.target = '_blank';
        modelLink.rel = 'noopener noreferrer';
        modelLink.textContent = modelName;
        label.appendChild(modelLink);
      } else {
        label.textContent = modelName;
      }

      const count = document.createElement('span');
      count.className = 'contract-model-count';
      count.textContent = ` (${sortedContracts.length})`;
      label.appendChild(count);

      const value = document.createElement('div');
      value.className = 'contract-model-value';
      for (let contractIndex = 0; contractIndex < sortedContracts.length; contractIndex += 1) {
        const contractKey = sortedContracts[contractIndex];
        if (!contractKey) {
          continue;
        }

        const link = document.createElement('a');
        link.className = 'contract-model-contract';
        link.href = '#';
        link.dataset.contractKey = contractKey;
        link.textContent = contractKey;
        value.appendChild(link);

        if (contractIndex < sortedContracts.length - 1) {
          value.appendChild(document.createTextNode(', '));
        }
      }

      row.appendChild(label);
      row.appendChild(value);
      contractModelList.appendChild(row);
    }
  }

  contractModelList.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    const link = target.closest<HTMLAnchorElement>('[data-contract-key]');
    if (!link) {
      return;
    }

    const contractKey = link.dataset.contractKey;
    if (!contractKey) {
      return;
    }

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
    const summary = `Contract source loaded for \`${contractKey}\`.`;
    uiState.showBubble(renderToolOutputContent(summary, payload));
    uiState.setMood('speaking');
    uiState.markActivity();
    uiState.addLog(`Contract source opened: ${contractKey}`);
  });
}

const handleQuestion = promptInput && form && historyElement
  ? createQuestionHandler(pipeline, uiState, promptInput, form, historyElement)
  : null;

renderToolCatalog(toolList, toolCountBadge, uiState);

setupTabSwitching(uiState);
setupContentInteractions(bubbleAnswer, historyElement);

form?.addEventListener('submit', (event) => handleQuestion?.(event));

setInterval(() => uiState.updateStats(), 1000);

uiState.addLog('MANTIS Desktop initialized successfully');
uiState.addLog('System ready for queries');

startIdleChatter(uiState);
