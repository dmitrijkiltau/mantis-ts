import type {
  ContractName,
  ContractPrompt,
  Orchestrator,
} from './orchestrator.js';
import type { ValidationResult } from './types.js';

/**
 * Parameters used to invoke an LLM.
 */
export type ModelInvocation = {
  model: string;
  systemPrompt: string;
  userPrompt?: string;
};

/**
 * Minimal interface that a model client needs to fulfill.
 */
export interface LLMClient {
  sendPrompt(invocation: ModelInvocation): Promise<string>;
}

/**
 * Execution options that tweak retry behavior.
 */
export type RunnerOptions = {
  maxAttempts?: number;
};

/**
 * Captures what happened during a single prompt attempt.
 */
export type AttemptRecord<T, E> = {
  attempt: number;
  raw: string;
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
  ) {}

  /**
   * Executes a prompt + validator loop while respecting the orchestrator’s retry guidance.
   */
  public async executeContract<T, E>(
    contractName: ContractName,
    prompt: ContractPrompt,
    validator: (raw: string) => ValidationResult<T, E>,
    options?: RunnerOptions,
  ): Promise<ContractExecutionResult<T, E>> {
    const history: AttemptRecord<T, E>[] = [];
    const attemptsLimit = this.deriveAttemptsLimit(prompt, options?.maxAttempts);

    for (let attempt = 0; attempt < attemptsLimit; attempt += 1) {
      const attemptPrompt = this.applyRetryInstruction(prompt, contractName, attempt);
      const raw = await this.llm.sendPrompt({
        model: attemptPrompt.model,
        systemPrompt: attemptPrompt.systemPrompt,
        userPrompt: attemptPrompt.userPrompt,
      });
      const validation = validator(raw);
      history.push({ attempt, raw, validation });

      if (validation.ok) {
        return { ok: true, value: validation.value, attempts: attempt + 1, history };
      }
    }

    return { ok: false, attempts: history.length, history };
  }

  private deriveAttemptsLimit(prompt: ContractPrompt, override?: number): number {
    if (override !== undefined) {
      return Math.max(1, override);
    }

    if (!prompt.retries) {
      return 1;
    }

    const keys = Object.keys(prompt.retries);
    if (keys.length === 0) {
      return 1;
    }

    const maxRetryIndex = Math.max(...keys.map((key) => Number(key)));
    return maxRetryIndex + 2;
  }

  private applyRetryInstruction(
    prompt: ContractPrompt,
    contractName: ContractName,
    attempt: number,
  ): ContractPrompt {
    if (attempt === 0) {
      return prompt;
    }

    const retryInstruction = this.orchestrator.getRetryInstruction(contractName, attempt - 1);
    if (!retryInstruction) {
      return prompt;
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
}
