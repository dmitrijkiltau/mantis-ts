import type {
  ContractName,
  ContractPrompt,
  Orchestrator,
} from './orchestrator.js';
import type { ContractMode } from './contracts/definition.js';
import type { ValidationResult } from './types.js';
import { Logger } from './logger.js';

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
 * Helper to measure execution duration in milliseconds.
 */
function measureDurationMs(startMs: number): number {
  return Math.round((Date.now() - startMs) * 100) / 100;
}

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

const createAbortError = (): Error => {
  const error = new Error('Contract execution aborted');
  error.name = 'AbortError';
  return error;
};

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw createAbortError();
  }
};

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

/**
 * Coordinates prompt execution by combining the Orchestrator, validators, and an LLM client.
 */
export class Runner {
  constructor(
    private readonly orchestrator: Orchestrator,
    private readonly llm: LLMClient,
    private readonly telemetrySink?: ContractExecutionTelemetrySink,
  ) {}

  /**
   * Filter history based on retention policy to reduce memory overhead
   */
  private filterHistory<T, E>(
    history: AttemptRecord<T, E>[],
    retention: HistoryRetention,
  ): AttemptRecord<T, E>[] {
    if (retention === 'none') return [];

    if (retention === 'minimal') {
      // Keep validation results but discard large raw responses
      for (const record of history) {
        delete record.raw;
      }
    }

    return history;
  }

  /**
   * Emits telemetry for a completed contract execution.
   */
  private recordTelemetry(
    contractName: ContractName,
    prompt: ContractPrompt,
    durationMs: number,
    attempts: number,
    ok: boolean,
  ): void {
    if (!this.telemetrySink) return;

    this.telemetrySink({
      contractName,
      model: prompt.model,
      mode: prompt.mode,
      durationMs,
      attempts,
      ok,
      timestamp: Date.now(),
    });
  }

  /**
   * Executes a prompt + validator loop while respecting the orchestrator's retry guidance.
   */
  public async executeContract<T, E>(
    contractName: ContractName,
    prompt: ContractPrompt,
    validator: (raw: string) => ValidationResult<T, E>,
    options?: RunnerOptions,
  ): Promise<ContractExecutionResult<T, E>> {
    const history: AttemptRecord<T, E>[] = [];
    const attemptsLimit = this.deriveAttemptsLimit(prompt, options?.maxAttempts);
    const contractStartMs = Date.now();
    const signal = options?.signal;

    Logger.info('runner', `Starting contract execution: ${contractName}`, {
      model: prompt.model,
      attemptsLimit,
    });

    throwIfAborted(signal);

    for (let attempt = 0; attempt < attemptsLimit; attempt += 1) {
      throwIfAborted(signal);
      const attemptPrompt = this.applyRetryInstruction(prompt, contractName, attempt);
      const llmStartMs = Date.now();
      const raw = await this.llm.sendPrompt({
        model: attemptPrompt.model,
        mode: attemptPrompt.mode,
        systemPrompt: attemptPrompt.systemPrompt,
        userPrompt: attemptPrompt.userPrompt,
        rawPrompt: this.buildRawPrompt(attemptPrompt),
        expectsJson: attemptPrompt.expectsJson,
        images: attemptPrompt.images,
        signal,
      });
      const llmDurationMs = measureDurationMs(llmStartMs);
      Logger.debug('runner', `Attempt ${attempt + 1}/${attemptsLimit} response received`, {
        model: attemptPrompt.model,
        length: raw.length,
        durationMs: llmDurationMs,
      });

      const validation = validator(raw);
      history.push({ attempt, raw, validation });

      if (validation.ok) {
        const totalDurationMs = measureDurationMs(contractStartMs);
        Logger.info('runner', `Contract ${contractName} succeeded on attempt ${attempt + 1}`, {
          attemptDurationMs: llmDurationMs,
          totalDurationMs,
        });
        this.recordTelemetry(
          contractName,
          attemptPrompt,
          totalDurationMs,
          attempt + 1,
          true,
        );
        const retention: HistoryRetention = options?.historyRetention ?? 'minimal';
        return {
          ok: true,
          value: validation.value,
          attempts: attempt + 1,
          history: this.filterHistory(history, retention),
        };
      }

      Logger.warn('runner', `Validation failed on attempt ${attempt + 1}`, {
        error: validation.error,
        attemptDurationMs: llmDurationMs,
      });
    }

    throwIfAborted(signal);
    const totalDurationMs = measureDurationMs(contractStartMs);
    Logger.error('runner', `Contract ${contractName} failed after ${history.length} attempts`, {
      totalDurationMs,
    });
    this.recordTelemetry(
      contractName,
      prompt,
      totalDurationMs,
      history.length,
      false,
    );
    const retention: HistoryRetention = options?.historyRetention ?? 'minimal';
    return { ok: false, attempts: history.length, history: this.filterHistory(history, retention) };
  }

  /**
   * Derives the maximum number of attempts for a contract execution.
   */
  private deriveAttemptsLimit(prompt: ContractPrompt, override?: number): number {
    if (override !== undefined) return Math.max(1, override);
    if (!prompt.retries) return 1;

    const keys = Object.keys(prompt.retries);
    if (keys.length === 0) return 1;

    const maxRetryIndex = Math.max(...keys.map((key) => Number(key)));
    return maxRetryIndex + 2;
  }

  /**
   * Applies retry instructions to the prompt based on the attempt number.
   */
  private applyRetryInstruction(
    prompt: ContractPrompt,
    contractName: ContractName,
    attempt: number,
  ): ContractPrompt {
    if (attempt === 0) return prompt;

    const retryInstruction = this.orchestrator.getRetryInstruction(contractName, attempt - 1);
    if (!retryInstruction) return prompt;

    if (prompt.mode === 'raw') {
      const rawPrompt = this.buildRawPrompt(prompt);
      return {
        ...prompt,
        rawPrompt: rawPrompt ? `${retryInstruction}\n\n${rawPrompt}` : retryInstruction,
      };
    }

    if (prompt.userPrompt) {
      return {
        ...prompt,
        userPrompt: `${retryInstruction}\n\n${prompt.userPrompt}`,
      };
    }

    return {
      ...prompt,
      systemPrompt: `${retryInstruction}\n\n${prompt.systemPrompt}`,
    };
  }

  /**
   * Builds the raw prompt string for 'raw' mode contracts.
   */
  private buildRawPrompt(prompt: ContractPrompt): string | undefined {
    if (prompt.mode !== 'raw') return undefined;
    if (prompt.rawPrompt) return prompt.rawPrompt;

    const parts: string[] = [];
    if (prompt.systemPrompt) parts.push(prompt.systemPrompt);
    if (prompt.userPrompt) parts.push(prompt.userPrompt);
    return parts.join('\n\n');
  }
}
