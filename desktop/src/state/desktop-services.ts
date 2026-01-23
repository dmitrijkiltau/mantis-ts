import { OllamaClient } from '../../../assistant/src/models/ollama';
import { Orchestrator } from '../../../assistant/src/orchestrator';
import { Pipeline } from '../../../assistant/src/pipeline';
import { Runner } from '../../../assistant/src/runner';
import { ContextStore } from '../context-store';
import { ContractTelemetryStore } from './contract-telemetry';

export type DesktopServices = {
  orchestrator: Orchestrator;
  runner: Runner;
  pipeline: Pipeline;
  contextStore: ContextStore;
  contractTelemetry: ContractTelemetryStore;
};

/**
 * Creates the core desktop services used across the UI shell.
 */
export const createDesktopServices = (): DesktopServices => {
  const orchestrator = new Orchestrator();
  const contractTelemetry = new ContractTelemetryStore();
  const runner = new Runner(
    orchestrator,
    new OllamaClient(),
    (event) => contractTelemetry.record(event),
  );
  const pipeline = new Pipeline(orchestrator, runner);
  const contextStore = new ContextStore();

  return {
    orchestrator,
    runner,
    pipeline,
    contextStore,
    contractTelemetry,
  };
};
