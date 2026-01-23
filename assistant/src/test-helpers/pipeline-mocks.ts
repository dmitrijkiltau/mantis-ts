import { vi } from 'vitest';
import type { Orchestrator } from '../orchestrator.js';
import type { Runner } from '../runner.js';

/**
 * Builds a minimal orchestrator mock for pipeline tests.
 */
export const createMockOrchestrator = (): Orchestrator => {
  const orchestrator = {
    buildIntentClassificationPrompt: vi.fn(),
    buildLanguageDetectionPrompt: vi.fn(),
    buildToolArgumentPrompt: vi.fn(),
    buildToolArgumentVerificationPrompt: vi.fn(),
    buildAnswerPrompt: vi.fn(),
    buildConversationalAnswerPrompt: vi.fn(),
    buildResponseFormattingPrompt: vi.fn(),
    buildImageRecognitionPrompt: vi.fn(),
    buildScoringPrompt: vi.fn().mockReturnValue({
      contractName: 'SCORING_EVALUATION',
      model: 'test-model',
      mode: 'raw',
      rawPrompt: 'test prompt',
    }),
    validateIntentClassification: vi.fn(),
    validateLanguageDetection: vi.fn(),
    validateToolArguments: vi.fn(),
    validateToolArgumentVerification: vi.fn(),
    validateAnswer: vi.fn(),
    validateConversationalAnswer: vi.fn(),
    validateResponseFormatting: vi.fn(),
    validateImageRecognition: vi.fn(),
    validateScoring: vi.fn(),
  };

  return orchestrator as unknown as Orchestrator;
};

/**
 * Builds a minimal runner mock for pipeline tests.
 */
export const createMockRunner = (): Runner => {
  const runner = {
    executeContract: vi.fn(),
  };

  return runner as unknown as Runner;
};
