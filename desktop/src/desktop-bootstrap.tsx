/** @jsxImportSource solid-js */
import { createEffect, createSignal, onCleanup, type Component } from 'solid-js';
import { CONTRACTS } from '../../assistant/src/contracts/registry';
import contractIntentClassificationSource from '../../assistant/src/contracts/intent.classification.ts?raw';
import contractLanguageDetectionSource from '../../assistant/src/contracts/language.detection.ts?raw';
import contractToolArgumentExtractionSource from '../../assistant/src/contracts/tool.argument.extraction.ts?raw';
import contractTextTransformationSource from '../../assistant/src/contracts/text.transformation.ts?raw';
import contractScoringEvaluationSource from '../../assistant/src/contracts/scoring.evaluation.ts?raw';
import contractStrictAnswerSource from '../../assistant/src/contracts/strict.answer.ts?raw';
import contractConversationalAnswerSource from '../../assistant/src/contracts/conversational.answer.ts?raw';
import contractResponseFormattingSource from '../../assistant/src/contracts/response.formatting.ts?raw';
import contractImageRecognitionSource from '../../assistant/src/contracts/image.recognition.ts?raw';
import { AssistantAvatar } from './avatar';
import { renderToolOutputContent } from './bubble-renderer';
import { startIdleChatter } from './idle-chatter';
import { UIState } from './ui-state';
import { useUIStateContext } from './state/ui-state-context';

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
const getContractSource = (contractKey: string): ContractSource | null => {
  return CONTRACT_SOURCE_MAP.get(contractKey) ?? null;
};

/**
 * Wires UI state and behavior once Solid refs are available.
 */
const DesktopBootstrap: Component = () => {
  const { nodes, uiState, setUiState } = useUIStateContext();
  const [setupComplete, setSetupComplete] = createSignal(false);

  createEffect(() => {
    if (uiState()) {
      return;
    }

    const form = nodes.promptForm();
    const promptInput = nodes.promptInput();
    const historyElement = nodes.historyElement();
    const avatarMount = nodes.avatarMount();
    const moodLabel = nodes.moodLabel();
    const speechBubble = nodes.speechBubble();
    const bubbleAnswer = nodes.bubbleAnswer();
    const logsConsole = nodes.logsConsole();
    const statusSystem = nodes.statusSystem();
    const statusState = nodes.statusState();
    const statusAction = nodes.statusAction();
    const statQueries = nodes.statQueries();
    const statRuntime = nodes.statRuntime();

    if (
      !form
      || !promptInput
      || !historyElement
      || !moodLabel
      || !speechBubble
      || !bubbleAnswer
      || !logsConsole
      || !statusSystem
      || !statusState
      || !statusAction
      || !statQueries
      || !statRuntime
    ) {
      return;
    }

    const avatar = avatarMount ? new AssistantAvatar(avatarMount) : null;
    const state = new UIState(
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

    state.registerTelemetryNodes({
      totalEvaluations: nodes.telemetryTotal(),
      lowScoreCount: nodes.telemetryLowScore(),
      failureCount: nodes.telemetryFailures(),
      averageContainer: nodes.telemetryAverages(),
      recentList: nodes.telemetryRecent(),
    });

    state.setMood('idle');
    state.setStatus('OPERATIONAL', 'AWAITING_INPUT', 'NONE');
    setUiState(state);
  });

  createEffect(() => {
    const currentState = uiState();
    if (!currentState || setupComplete()) {
      return;
    }

    const contractModelList = nodes.contractModelList();
    const contractModelCount = nodes.contractModelCount();

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
    }

    const contractClickHandler = (event: Event) => {
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
      currentState.showBubble(renderToolOutputContent(summary, payload));
      currentState.setMood('speaking');
      currentState.markActivity();
      currentState.addLog(`Contract source opened: ${contractKey}`);
    };

    contractModelList?.addEventListener('click', contractClickHandler);

    const statsInterval = window.setInterval(() => currentState.updateStats(), 1000);

    currentState.addLog('MANTIS Desktop initialized successfully');
    currentState.addLog('System ready for queries');

    startIdleChatter(currentState);
    setSetupComplete(true);

    onCleanup(() => {
      contractModelList?.removeEventListener('click', contractClickHandler);
      window.clearInterval(statsInterval);
    });
  });

  return null;
};

export default DesktopBootstrap;
