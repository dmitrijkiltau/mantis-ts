import type { ContractExecutionResult } from './runner.js';
import type { Orchestrator } from './orchestrator.js';
import type { Runner } from './runner.js';
import { TOOLS, GENERAL_ANSWER_INTENT, getToolDefinition, type ToolName } from './tools/registry.js';
import type { FieldType } from './contracts/definition.js';
import { Logger } from './logger.js';
import { DEFAULT_PERSONALITY } from './personality.js';

const TOOL_INTENT_PREFIX = 'tool.';
const MIN_TOOL_CONFIDENCE = 0.6;
const REQUIRED_NULL_RATIO_THRESHOLD = 0.5;

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
      language: { language: string; name: string };
      attempts: number;
    }
  | {
      ok: true;
      kind: 'tool';
      tool: ToolName;
      args: Record<string, unknown>;
      result: unknown;
      intent: { intent: string; confidence: number };
      language: { language: string; name: string };
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

    const toneInstructions = DEFAULT_PERSONALITY.toneInstructions;
    Logger.info('pipeline', 'Using predefined MANTIS tone instructions');
    const languagePrompt = this.orchestrator.buildLanguageDetectionPrompt(userInput);
    const intentPrompt = this.orchestrator.buildIntentClassificationPrompt(userInput);
    const [languageResult, intentResult] = await Promise.all([
      this.runner.executeContract(
        'LANGUAGE_DETECTION',
        languagePrompt,
        (raw) => this.orchestrator.validateLanguageDetection(raw),
      ),
      this.runner.executeContract(
        'INTENT_CLASSIFICATION',
        intentPrompt,
        (raw) => this.orchestrator.validateIntentClassification(raw),
      ),
    ]);

    const language = languageResult.ok
      ? languageResult.value
      : { language: 'unknown', name: 'Unknown' };

    Logger.info('pipeline', 'Language detected:', language);

    const tentativeIntent = intentResult.ok ? intentResult.value : undefined;

    if (!intentResult.ok) {
      Logger.warn('pipeline', 'Intent classification failed, falling back to strict answer');
      return this.runStrictAnswer(
        userInput,
        tentativeIntent,
        intentResult.attempts,
        language,
        toneInstructions,
      );
    }

    const intent = intentResult.value;
    Logger.info('pipeline', `Intent classified: ${intent.intent}`, {
      confidence: intent.confidence,
    });

    if (!this.isToolIntent(intent.intent)) {
      Logger.info('pipeline', 'Non-tool intent selected, using strict answer');
      return this.runStrictAnswer(
        userInput,
        intent,
        intentResult.attempts,
        language,
        toneInstructions,
      );
    }

    if (!this.meetsToolConfidence(intent.confidence)) {
      Logger.info('pipeline', 'Tool intent below confidence threshold, using strict answer');
      return this.runStrictAnswer(
        userInput,
        intent,
        intentResult.attempts,
        language,
        toneInstructions,
      );
    }

    const toolName = this.resolveToolName(intent.intent);
    if (!toolName) {
      Logger.info('pipeline', 'No matching tool for intent, using strict answer');
      return this.runStrictAnswer(
        userInput,
        intent,
        intentResult.attempts,
        language,
        toneInstructions,
      );
    }

    const tool = getToolDefinition(toolName);
    const schemaKeys = Object.keys(tool.schema);
    if (schemaKeys.length === 0) {
      Logger.info('pipeline', `Executing tool: ${toolName} (no arguments)`);
      try {
        const toolResult = await tool.execute({});
        Logger.info('pipeline', `Tool ${toolName} executed successfully`);
        const formattedResult = typeof toolResult === 'string'
          ? await this.formatResponse(toolResult, language, toneInstructions)
          : toolResult;
        return {
          ok: true,
          kind: 'tool',
          tool: toolName,
          args: {},
          result: formattedResult,
          intent,
          language,
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
      Logger.warn(
        'pipeline',
        `Tool argument extraction failed for ${toolName}, falling back to strict answer`,
      );
      return this.runStrictAnswer(
        userInput,
        intent,
        intentResult.attempts + toolArgResult.attempts,
        language,
        toneInstructions,
      );
    }

    if (this.shouldSkipToolExecution(tool.schema, toolArgResult.value)) {
      Logger.info(
        'pipeline',
        `Tool arguments are mostly null for ${toolName}, using strict answer instead`,
      );
      return this.runStrictAnswer(
        userInput,
        intent,
        intentResult.attempts + toolArgResult.attempts,
        language,
        toneInstructions,
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
      const formattedResult = typeof toolResult === 'string'
        ? await this.formatResponse(toolResult, language, toneInstructions)
        : toolResult;
      return {
        ok: true,
        kind: 'tool',
        tool: toolName,
        args: toolArgResult.value,
        result: formattedResult,
        intent,
        language,
        attempts: intentResult.attempts + toolArgResult.attempts,
      };
    } catch (error) {
      Logger.error(
        'pipeline',
        `Tool ${toolName} execution failed, falling back to strict answer`,
        error,
      );
      return this.runStrictAnswer(
        userInput,
        intent,
        intentResult.attempts + toolArgResult.attempts,
        language,
        toneInstructions,
      );
    }
  }

  private resolveToolName(intent: string): ToolName | null {
    if (!this.isToolIntent(intent)) {
      return null;
    }

    const toolName = intent.slice(TOOL_INTENT_PREFIX.length) as ToolName;
    if (!(toolName in TOOLS)) {
      return null;
    }

    return toolName;
  }

  private isToolIntent(intent: string): boolean {
    if (intent === 'unknown') {
      return false;
    }

    if (intent === GENERAL_ANSWER_INTENT) {
      return false;
    }

    return intent.startsWith(TOOL_INTENT_PREFIX);
  }

  private meetsToolConfidence(confidence: number): boolean {
    return confidence >= MIN_TOOL_CONFIDENCE;
  }

  private shouldSkipToolExecution(
    schema: Record<string, FieldType>,
    args: Record<string, unknown>,
  ): boolean {
    if (this.areAllArgumentsNull(args)) {
      return true;
    }

    let requiredFields = 0;
    let nullRequired = 0;
    const entries = Object.entries(schema);
    for (let index = 0; index < entries.length; index += 1) {
      const [key, type] = entries[index];
      const allowsNull = type.endsWith('|null');
      if (allowsNull) {
        continue;
      }

      requiredFields += 1;
      const value = args[key];
      if (value === null || value === undefined) {
        nullRequired += 1;
      }
    }

    if (requiredFields === 0) {
      return false;
    }

    const nullRatio = nullRequired / requiredFields;
    return nullRatio > REQUIRED_NULL_RATIO_THRESHOLD;
  }

  private areAllArgumentsNull(args: Record<string, unknown>): boolean {
    const values = Object.values(args);
    if (values.length === 0) {
      return true;
    }

    for (let index = 0; index < values.length; index += 1) {
      if (values[index] !== null && values[index] !== undefined) {
        return false;
      }
    }

    return true;
  }

  private async runStrictAnswer(
    userInput: string,
    intent: { intent: string; confidence: number } | undefined,
    attempts: number,
    language: { language: string; name: string },
    toneInstructions?: string,
  ): Promise<PipelineResult> {
    Logger.info('pipeline', 'Running strict answer contract');
    const prompt = this.orchestrator.buildStrictAnswerPrompt(
      userInput,
      toneInstructions,
    );
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
      language,
      attempts: attempts + result.attempts,
    };
  }

  /**
   * Optionally formats response text as a single concise sentence in the user's language.
   * This is a best-effort operation; formatting failures do not block the result.
   */
  private async formatResponse(
    text: string,
    language: { language: string; name: string },
    toneInstructions?: string,
  ): Promise<string> {
    try {
      const prompt = this.orchestrator.buildResponseFormattingPrompt(
        text,
        language,
        toneInstructions,
      );
      const result = await this.runner.executeContract(
        'RESPONSE_FORMATTING',
        prompt,
        (raw) => this.orchestrator.validateResponseFormatting(raw),
      );

      if (result.ok) {
        Logger.info('pipeline', 'Response formatted successfully');
        return result.value;
      }

      Logger.warn('pipeline', 'Response formatting failed, returning original text');
      return text;
    } catch (error) {
      Logger.warn('pipeline', 'Response formatting error, returning original text', error);
      return text;
    }
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
