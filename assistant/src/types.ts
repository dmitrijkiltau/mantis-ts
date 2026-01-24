import type { ContractMode } from './contracts/definition.js';
import type { ContractName } from './orchestrator.js';

/**
 * Type of the result of validating a contract output.
 */
export type ValidationResult<Value = unknown, ErrorCode = string> =
  | { ok: true; value: Value }
  | { ok: false; error: ErrorCode };

/**
 * Type of a function that validates the raw output of a contract.
 */
export type ContractValidator<Value = unknown, ErrorCode = string> = (
  rawOutput: string,
) => ValidationResult<Value, ErrorCode>;

/**
 * Parameters used to invoke an LLM.
 */
export type ModelInvocation = {
  model: string;
  mode: ContractMode;
  systemPrompt?: string;
  userPrompt?: string;
  rawPrompt?: string;
  expectsJson?: boolean;
  images?: string[];
  signal?: AbortSignal;
};

/**
 * Contract execution telemetry emitted after each contract completes.
 */
export type ContractExecutionTelemetry = {
  contractName: ContractName;
  model: string;
  mode: ContractMode;
  durationMs: number;
  attempts: number;
  ok: boolean;
  timestamp: number;
};

/**
 * Callback that consumes contract execution telemetry.
 */
export type ContractExecutionTelemetrySink = (telemetry: ContractExecutionTelemetry) => void;

/**
 * Minimal interface that a model client needs to fulfill.
 */
export interface LLMClient {
  sendPrompt(invocation: ModelInvocation): Promise<string>;
}

/**
 * Controls how much history is retained about execution attempts
 */
export type HistoryRetention = 'none' | 'minimal' | 'full';

/**
 * Execution options that tweak retry behavior and history retention.
 */
export type RunnerOptions = {
  maxAttempts?: number;
  historyRetention?: HistoryRetention;
  signal?: AbortSignal;
};

/**
 * Captures what happened during a single prompt attempt.
 * raw is omitted for 'minimal' retention to save memory on large responses.
 */
export type AttemptRecord<T, E> = {
  attempt: number;
  raw?: string;
  validation: ValidationResult<T, E>;
};

/**
 * Result of a contract run after validation/retry logic is applied.
 */
export type ContractExecutionResult<T, E> =
  | {
      ok: true;
      value: T;
      attempts: number;
      history: AttemptRecord<T, E>[];
    }
  | {
      ok: false;
      attempts: number;
      history: AttemptRecord<T, E>[];
    };
