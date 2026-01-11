import type { ContractExecutionResult } from './runner.js';
import type { Orchestrator } from './orchestrator.js';
import type { Runner } from './runner.js';
import { TOOLS, getToolDefinition, type ToolName } from './tools/registry.js';
import { Logger } from './logger.js';

export type PipelineStage =
  | 'intent'
  | 'tool_arguments'
  | 'tool_execution'
  | 'strict_answer'
  | 'error_channel';

export type PipelineError = {
  code: string;
  message: string;
};

export type PipelineResult =
  | {
      ok: true;
      kind: 'strict_answer';
      value: string;
      intent?: { intent: string; confidence: number };
      attempts: number;
    }
  | {
      ok: true;
      kind: 'tool';
      tool: ToolName;
      args: Record<string, unknown>;
      result: unknown;
      intent: { intent: string; confidence: number };
      attempts: number;
    }
  | {
      ok: false;
      kind: 'error';
      stage: PipelineStage;
      attempts: number;
      error?: PipelineError;
    };

/**
 * Executes the end-to-end orchestration pipeline described in ARCHITECTURE.
 */
export class Pipeline {
  constructor(
    private readonly orchestrator: Orchestrator,
    private readonly runner: Runner,
  ) {}

  /**
   * Routes a user input through intent classification, tool execution, or strict answer.
   */
  public async run(userInput: string): Promise<PipelineResult> {
    Logger.info('pipeline', 'Starting pipeline execution', {
      inputLength: userInput.length,
    });

    const intentPrompt = this.orchestrator.buildIntentClassificationPrompt(userInput);
    const intentResult = await this.runner.executeContract(
      'INTENT_CLASSIFICATION',
      intentPrompt,
      (raw) => this.orchestrator.validateIntentClassification(raw),
    );

    if (!intentResult.ok) {
      Logger.warn('pipeline', 'Intent classification failed, falling back to strict answer');
      return this.runStrictAnswer(userInput, undefined, intentResult.attempts);
    }

    const intent = intentResult.value;
    Logger.info('pipeline', `Intent classified: ${intent.intent}`, {
      confidence: intent.confidence,
    });

    const toolName = this.resolveToolName(intent.intent);
    if (!toolName) {
      Logger.info('pipeline', 'No matching tool for intent, using strict answer');
      return this.runStrictAnswer(userInput, intent, intentResult.attempts);
    }

    const tool = getToolDefinition(toolName);
    const schemaKeys = Object.keys(tool.schema);
    if (schemaKeys.length === 0) {
      Logger.info('pipeline', `Executing tool: ${toolName} (no arguments)`);
      try {
        const toolResult = await tool.execute({});
        Logger.info('pipeline', `Tool ${toolName} executed successfully`);
        return {
          ok: true,
          kind: 'tool',
          tool: toolName,
          args: {},
          result: toolResult,
          intent,
          attempts: intentResult.attempts,
        };
      } catch (error) {
        Logger.error('pipeline', `Tool ${toolName} execution failed`, error);
        return this.runErrorChannel(
          'tool_execution',
          intentResult.attempts,
          error,
        );
      }
    }

    Logger.info('pipeline', `Extracting arguments for tool: ${toolName}`);
    const toolArgPrompt = this.orchestrator.buildToolArgumentPrompt(
      tool.name,
      tool.schema,
      userInput,
    );
    const toolArgResult = await this.runner.executeContract(
      'TOOL_ARGUMENT_EXTRACTION',
      toolArgPrompt,
      (raw) => this.orchestrator.validateToolArguments(raw, tool.schema),
    );

    if (!toolArgResult.ok) {
      Logger.error('pipeline', `Tool argument extraction failed for: ${toolName}`);
      return this.runErrorChannel(
        'tool_arguments',
        intentResult.attempts + toolArgResult.attempts,
      );
    }

    Logger.info('pipeline', `Executing tool: ${toolName}`, {
      args: toolArgResult.value,
    });

    try {
      const toolResult = await tool.execute(
        toolArgResult.value as Record<string, unknown>,
      );
      Logger.info('pipeline', `Tool ${toolName} executed successfully`);
      return {
        ok: true,
        kind: 'tool',
        tool: toolName,
        args: toolArgResult.value,
        result: toolResult,
        intent,
        attempts: intentResult.attempts + toolArgResult.attempts,
      };
    } catch (error) {
      Logger.error('pipeline', `Tool ${toolName} execution failed`, error);
      return this.runErrorChannel(
        'tool_execution',
        intentResult.attempts + toolArgResult.attempts,
        error,
      );
    }
  }

  private resolveToolName(intent: string): ToolName | null {
    if (!intent.startsWith('tool.')) {
      return null;
    }

    const toolName = intent.slice('tool.'.length) as ToolName;
    if (!(toolName in TOOLS)) {
      return null;
    }

    return toolName;
  }

  private async runStrictAnswer(
    userInput: string,
    intent: { intent: string; confidence: number } | undefined,
    attempts: number,
  ): Promise<PipelineResult> {
    Logger.info('pipeline', 'Running strict answer contract');
    const prompt = this.orchestrator.buildStrictAnswerPrompt(userInput);
    const result = await this.runner.executeContract(
      'STRICT_ANSWER',
      prompt,
      (raw) => this.orchestrator.validateStrictAnswer(raw),
    );

    if (!result.ok) {
      Logger.error('pipeline', 'Strict answer contract failed');
      return {
        ok: false,
        kind: 'error',
        stage: 'strict_answer',
        attempts: attempts + result.attempts,
      };
    }

    Logger.info('pipeline', 'Strict answer generated successfully');
    return {
      ok: true,
      kind: 'strict_answer',
      value: result.value,
      intent,
      attempts: attempts + result.attempts,
    };
  }

  private async runErrorChannel(
    stage: PipelineStage,
    attempts: number,
    error?: unknown,
  ): Promise<PipelineResult> {
    const prompt = this.orchestrator.buildErrorChannelPrompt();
    const result = await this.runner.executeContract(
      'ERROR_CHANNEL',
      prompt,
      (raw) => this.orchestrator.validateErrorChannel(raw),
    );

    if (!result.ok) {
      return {
        ok: false,
        kind: 'error',
        stage: 'error_channel',
        attempts: attempts + result.attempts,
      };
    }

    return {
      ok: false,
      kind: 'error',
      stage,
      attempts: attempts + result.attempts,
      error: this.buildErrorPayload(result, error),
    };
  }

  private buildErrorPayload(
    result: ContractExecutionResult<{ error: PipelineError }, string>,
    error?: unknown,
  ): PipelineError {
    if (result.ok) {
      return result.value.error;
    }

    return {
      code: 'tool_error',
      message: error ? String(error) : 'Tool execution failed.',
    };
  }
}
