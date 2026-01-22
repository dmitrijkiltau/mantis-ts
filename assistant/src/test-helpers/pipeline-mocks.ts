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
    buildStrictAnswerPrompt: vi.fn(),
    buildResponseFormattingPrompt: vi.fn(),
    buildScoringPrompt: vi.fn().mockReturnValue({
      contractName: 'SCORING_EVALUATION',
      model: 'test-model',
      mode: 'raw',
      rawPrompt: 'test prompt',
    }),
    buildErrorChannelPrompt: vi.fn(),
    validateIntentClassification: vi.fn(),
    validateLanguageDetection: vi.fn(),
    validateToolArguments: vi.fn(),
    validateToolArgumentVerification: vi.fn(),
    validateStrictAnswer: vi.fn(),
    validateResponseFormatting: vi.fn(),
    validateScoring: vi.fn(),
    validateErrorChannel: vi.fn(),
  };

  return orchestrator as Orchestrator;
};

/**
 * Builds a minimal runner mock for pipeline tests.
 */
export const createMockRunner = (): Runner => {
  const runner = {
    executeContract: vi.fn(),
  };

  return runner as Runner;
};
