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
    buildAnswerPrompt: vi.fn(),
    buildImageRecognitionPrompt: vi.fn(),
    validateIntentClassification: vi.fn(),
    validateLanguageDetection: vi.fn(),
    validateToolArguments: vi.fn(),
    validateAnswer: vi.fn(),
    validateAnswerMode: vi.fn(),
    validateImageRecognition: vi.fn(),
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
