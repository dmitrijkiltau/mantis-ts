/** @jsxImportSource solid-js */
import { createMemo, type Component } from 'solid-js';
import { CONTRACTS } from '../../../assistant/src/contracts/registry';
import contractIntentClassificationSource from '../../../assistant/src/contracts/intent.classification.ts?raw';
import contractLanguageDetectionSource from '../../../assistant/src/contracts/language.detection.ts?raw';
import contractToolArgumentExtractionSource from '../../../assistant/src/contracts/tool.argument.extraction.ts?raw';
import contractTextTransformationSource from '../../../assistant/src/contracts/text.transformation.ts?raw';
import contractScoringEvaluationSource from '../../../assistant/src/contracts/scoring.evaluation.ts?raw';
import contractStrictAnswerSource from '../../../assistant/src/contracts/strict.answer.ts?raw';
import contractConversationalAnswerSource from '../../../assistant/src/contracts/conversational.answer.ts?raw';
import contractResponseFormattingSource from '../../../assistant/src/contracts/response.formatting.ts?raw';
import contractImageRecognitionSource from '../../../assistant/src/contracts/image.recognition.ts?raw';
import { renderMarkdown } from '../bubble/markdown';
import { ToolOutputContent } from '../bubble/tool-output';
import { useUIStateContext } from '../state/ui-state-context';
import type { BubbleContent } from '../ui-state';

type ContractSource = {
  path: string;
  content: string;
};

type ModelEntry = {
  modelName: string;
  contracts: string[];
};

type ContractMode = 'chat' | 'raw';

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
 * Resolves the configured contract mode.
 */
const getContractMode = (contractKey: string): ContractMode => {
  const contract = CONTRACTS[contractKey as keyof typeof CONTRACTS];
  return (contract?.MODE as ContractMode | undefined) ?? 'chat';
};

/**
 * Renders the contract model list with source previews.
 */
export const ContractModels: Component = () => {
  const { uiState } = useUIStateContext();
  const modelEntries = createMemo<ModelEntry[]>(() => {
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

    const models = Array.from(modelBuckets.entries()).map(([modelName, contracts]) => ({
      modelName,
      contracts: [...contracts].sort((a, b) => a.localeCompare(b)),
    }));
    models.sort((a, b) => a.modelName.localeCompare(b.modelName));
    return models;
  });

  const handleContractClick = (event: MouseEvent, contractKey: string): void => {
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
    const summaryText = `Contract source loaded for \`${contractKey}\`.`;
    const summaryHtml = renderMarkdown(summaryText);
    const bubbleContent: BubbleContent = {
      kind: 'inline-typewriter',
      text: summaryText,
      targetSelector: '[data-typewriter-target="summary"]',
      finalHtml: summaryHtml,
      render: () => ToolOutputContent({
        summary: summaryText,
        raw: payload,
        summaryHtml: '',
      }),
    };
    const state = uiState();
    state?.showBubble(bubbleContent);
    state?.setMood('speaking');
    state?.markActivity();
    state?.addLog(`Contract source opened: ${contractKey}`);
    window.setTimeout(() => {
      state?.setMood('idle');
    }, 650);
  };

  const renderModelName = (modelName: string) => {
    const modelUrl = getOllamaModelUrl(modelName);
    if (modelUrl) {
      return (
        <a class="contract-model-link" href={modelUrl} target="_blank" rel="noopener noreferrer">
          {modelName}
        </a>
      );
    }
    return modelName;
  };

  const countLabel = () => {
    const count = modelEntries().length;
    return `${count} model${count === 1 ? '' : 's'} loaded`;
  };

  return (
    <div class="status-contracts">
      <div class="status-section-header">
        <div class="status-section-label">CONTRACT MODELS</div>
        <div class="status-section-meta" id="contract-model-count">{countLabel()}</div>
      </div>
      <div class="contract-model-list" id="contract-models">
        {modelEntries().length === 0 ? (
          <div class="contract-model-placeholder">No contract models available.</div>
        ) : (
          modelEntries().map((entry) => (
            <div class="contract-model-row">
              <div class="contract-model-name">
                {renderModelName(entry.modelName)}
                <span class="contract-model-count"> ({entry.contracts.length})</span>
              </div>
              <div class="contract-model-value">
                {entry.contracts.map((contractKey, index) => {
                  const mode = getContractMode(contractKey);
                  return (
                    <span>
                      <a
                        class="contract-model-contract"
                        href="#"
                        onClick={(event) => handleContractClick(event, contractKey)}
                      >
                        {contractKey}
                      </a>{' '}
                      <span class="contract-model-mode" data-mode={mode}>
                        {mode.toUpperCase()}
                      </span>
                      {index < entry.contracts.length - 1 ? ', ' : ''}
                    </span>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
