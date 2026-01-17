import type { ContractExecutionResult } from './runner.js';
import type { Orchestrator } from './orchestrator.js';
import type { Runner } from './runner.js';
import {
  TOOLS,
  GENERAL_ANSWER_INTENT,
  CONVERSATION_INTENT,
  getToolDefinition,
  type ToolName,
} from './tools/registry.js';
import type {
  DifficultyLevel,
  FieldType,
} from './contracts/definition.js';
import { Logger } from './logger.js';
import { DEFAULT_PERSONALITY } from './personality.js';

const TOOL_INTENT_PREFIX = 'tool.';
const MIN_TOOL_CONFIDENCE = 0.6;
const REQUIRED_NULL_RATIO_THRESHOLD = 0.5;
const LANGUAGE_FALLBACK: { language: string; name: string } = {
  language: 'unknown',
  name: 'Unknown',
};

const DIFFICULTY_LEVELS: DifficultyLevel[] = ['easy', 'medium', 'hard'];
const DEFAULT_DIFFICULTY: DifficultyLevel = 'medium';

function normalizeDifficulty(value?: string): DifficultyLevel {
  if (!value) {
    return DEFAULT_DIFFICULTY;
  }
  const normalized = value.trim().toLowerCase();
  if (DIFFICULTY_LEVELS.includes(normalized as DifficultyLevel)) {
    return normalized as DifficultyLevel;
  }
  return DEFAULT_DIFFICULTY;
}

/**
 * Helper to measure execution duration in milliseconds.
 */
function measureDurationMs(startMs: number): number {
  return Math.round((Date.now() - startMs) * 100) / 100;
}

export type PipelineStage =
  | 'intent'
  | 'tool_arguments'
  | 'tool_execution'
  | 'image_recognition'
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
      summary?: string;
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

export type ImageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  data: string;
  source: 'upload' | 'drop' | 'screenshot';
};

type DirectToolMatch = {
  tool: ToolName;
  args: Record<string, unknown>;
  reason: string;
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
   * Routes a user input through intent classification, tool execution, or non-tool answer.
   */
  public async run(userInput: string, attachments?: ImageAttachment[]): Promise<PipelineResult> {
    const pipelineStartMs = Date.now();
    Logger.info('pipeline', 'Starting pipeline execution', {
      inputLength: userInput.length,
    });

    const imageAttachments = this.normalizeImageAttachments(attachments);
    if (imageAttachments.length > 0) {
      const result = await this.runImageRecognition(
        userInput,
        imageAttachments,
        pipelineStartMs,
      );
      return result;
    }

    const directResult = await this.tryRunDirectTool(userInput);
    if (directResult) {
      const durationMs = measureDurationMs(pipelineStartMs);
      Logger.info('pipeline', 'Pipeline completed (direct tool)', { durationMs });
      return directResult;
    }

    const toneInstructions = DEFAULT_PERSONALITY.toneInstructions;
    const personalityDescription = DEFAULT_PERSONALITY.description;
    Logger.info('pipeline', 'Using predefined MANTIS tone instructions');
    const intentPrompt = this.orchestrator.buildIntentClassificationPrompt(userInput);
    const intentStartMs = Date.now();
    const intentResult = await this.runner.executeContract(
      'INTENT_CLASSIFICATION',
      intentPrompt,
      (raw) => this.orchestrator.validateIntentClassification(raw),
    );
    const intentDurationMs = measureDurationMs(intentStartMs);
    Logger.debug('pipeline', 'Intent classification stage completed', {
      durationMs: intentDurationMs,
    });

    const difficulty = intentResult.ok
      ? normalizeDifficulty(intentResult.value.difficulty)
      : normalizeDifficulty(undefined);

    if (!intentResult.ok) {
      Logger.warn('pipeline', 'Intent classification failed, falling back to strict answer');
      const result = await this.runNonToolAnswer(
        userInput,
        undefined,
        intentResult.attempts,
        toneInstructions,
        personalityDescription,
        difficulty,
      );
      const durationMs = measureDurationMs(pipelineStartMs);
      Logger.info('pipeline', 'Pipeline completed (intent failed)', { durationMs });
      return result;
    }

    const intent = intentResult.value;
    Logger.info('pipeline', `Intent classified: ${intent.intent}`, {
      confidence: intent.confidence,
    });

    if (!this.isToolIntent(intent.intent)) {
      Logger.info('pipeline', 'Non-tool intent selected, using non-tool answer');
      const result = await this.runNonToolAnswer(
        userInput,
        intent,
        intentResult.attempts,
        toneInstructions,
        personalityDescription,
        difficulty,
      );
      const durationMs = measureDurationMs(pipelineStartMs);
      Logger.info('pipeline', 'Pipeline completed (non-tool intent)', { durationMs });
      return result;
    }

    if (!this.meetsToolConfidence(intent.confidence)) {
      Logger.info('pipeline', 'Tool intent below confidence threshold, using strict answer');
      const result = await this.runNonToolAnswer(
        userInput,
        intent,
        intentResult.attempts,
        toneInstructions,
        personalityDescription,
        difficulty,
      );
      const durationMs = measureDurationMs(pipelineStartMs);
      Logger.info('pipeline', 'Pipeline completed (low confidence)', { durationMs });
      return result;
    }

    const toolName = this.resolveToolName(intent.intent);
    if (!toolName) {
      Logger.info('pipeline', 'No matching tool for intent, using strict answer');
      const result = await this.runNonToolAnswer(
        userInput,
        intent,
        intentResult.attempts,
        toneInstructions,
        personalityDescription,
        difficulty,
      );
      const durationMs = measureDurationMs(pipelineStartMs);
      Logger.info('pipeline', 'Pipeline completed (no matching tool)', { durationMs });
      return result;
    }

    const tool = getToolDefinition(toolName);
    const schemaKeys = Object.keys(tool.schema);
    if (schemaKeys.length === 0) {
      Logger.info('pipeline', `Executing tool: ${toolName} (no arguments)`);
      const toolResult = await this.executeAndFormatTool(
        toolName,
        tool,
        {},
        userInput,
        toneInstructions,
        intent,
        intentResult.attempts,
        pipelineStartMs,
        difficulty,
      );
      return toolResult;
    }

    Logger.info('pipeline', `Extracting arguments for tool: ${toolName}`);
    const toolArgStartMs = Date.now();
    const toolArgPrompt = this.orchestrator.buildToolArgumentPrompt(
      tool.name,
      tool.description,
      tool.schema,
      userInput,
    );
    const toolArgResult = await this.runner.executeContract(
      'TOOL_ARGUMENT_EXTRACTION',
      toolArgPrompt,
      (raw) => this.orchestrator.validateToolArguments(raw, tool.schema),
    );
    const toolArgDurationMs = measureDurationMs(toolArgStartMs);
    Logger.debug('pipeline', 'Tool argument extraction stage completed', {
      durationMs: toolArgDurationMs,
    });

    if (!toolArgResult.ok) {
      Logger.warn(
        'pipeline',
        `Tool argument extraction failed for ${toolName}, falling back to strict answer`,
      );
      const result = await this.runNonToolAnswer(
        userInput,
        intent,
        intentResult.attempts + toolArgResult.attempts,
        toneInstructions,
        personalityDescription,
        difficulty,
      );
      const durationMs = measureDurationMs(pipelineStartMs);
      Logger.info('pipeline', 'Pipeline completed (arg extraction failed)', { durationMs });
      return result;
    }

    if (this.shouldSkipToolExecution(tool.schema, toolArgResult.value)) {
      Logger.info(
        'pipeline',
        `Tool arguments are mostly null for ${toolName}, using strict answer instead`,
      );
      const result = await this.runNonToolAnswer(
        userInput,
        intent,
        intentResult.attempts + toolArgResult.attempts,
        toneInstructions,
        personalityDescription,
        difficulty,
      );
      const durationMs = measureDurationMs(pipelineStartMs);
      Logger.info('pipeline', 'Pipeline completed (args mostly null)', { durationMs });
      return result;
    }

    Logger.info('pipeline', `Executing tool: ${toolName}`, {
      args: toolArgResult.value,
    });

    const toolResult = await this.executeAndFormatTool(
      toolName,
      tool,
      toolArgResult.value as Record<string, unknown>,
      userInput,
      toneInstructions,
      intent,
      intentResult.attempts + toolArgResult.attempts,
      pipelineStartMs,
      difficulty,
    );
    return toolResult;
  }

  private normalizeImageAttachments(attachments?: ImageAttachment[]): ImageAttachment[] {
    if (!attachments || attachments.length === 0) {
      return [];
    }

    const normalized: ImageAttachment[] = [];
    for (let index = 0; index < attachments.length; index += 1) {
      const entry = attachments[index];
      if (!entry) {
        continue;
      }
      if (typeof entry.data !== 'string' || !entry.data.trim()) {
        continue;
      }
      normalized.push(entry);
    }

    return normalized;
  }

  private async runImageRecognition(
    userInput: string,
    attachments: ImageAttachment[],
    pipelineStartMs: number,
  ): Promise<PipelineResult> {
    Logger.info('pipeline', 'Running image recognition contract', {
      imageCount: attachments.length,
    });

    const toneInstructions = DEFAULT_PERSONALITY.toneInstructions;
    const languageResult = userInput.trim()
      ? await this.detectLanguage(userInput)
      : {
          ok: false,
          language: LANGUAGE_FALLBACK,
          attempts: 0,
        };

    const prompt = this.orchestrator.buildImageRecognitionPrompt(
      userInput,
      attachments.length,
      toneInstructions,
      languageResult.language,
    );
    const imagePayload = attachments.map((attachment) => attachment.data);
    const result = await this.runner.executeContract(
      'IMAGE_RECOGNITION',
      { ...prompt, images: imagePayload },
      (raw) => this.orchestrator.validateImageRecognition(raw),
    );

    const durationMs = measureDurationMs(pipelineStartMs);
    Logger.debug('pipeline', 'Image recognition stage completed', {
      durationMs,
    });

    const attemptOffset = languageResult.ok ? 0 : languageResult.attempts;
    if (!result.ok) {
      Logger.error('pipeline', 'Image recognition contract failed');
      Logger.info('pipeline', 'Pipeline completed (image recognition)', {
        durationMs,
      });
      return {
        ok: false,
        kind: 'error',
        stage: 'image_recognition',
        attempts: result.attempts + attemptOffset,
      };
    }

    Logger.info('pipeline', 'Image recognition completed successfully');
    Logger.info('pipeline', 'Pipeline completed (image recognition)', {
      durationMs,
    });
    return {
      ok: true,
      kind: 'strict_answer',
      value: result.value,
      language: languageResult.language,
      attempts: result.attempts + attemptOffset,
    };
  }

  private async tryRunDirectTool(userInput: string): Promise<PipelineResult | null> {
    const directMatch = this.parseDirectToolRequest(userInput);
    if (!directMatch) {
      return null;
    }

    Logger.info('pipeline', 'Direct tool command detected, bypassing contracts', {
      tool: directMatch.tool,
      reason: directMatch.reason,
    });

    try {
      const tool = getToolDefinition(directMatch.tool);
      const toolResult = await tool.execute(directMatch.args);
      let formattedResult = toolResult;
      let summary: string | undefined;

      if (typeof toolResult === 'string') {
        formattedResult = await this.formatResponse(
          toolResult,
          LANGUAGE_FALLBACK,
          DEFAULT_PERSONALITY.toneInstructions,
          userInput,
          directMatch.tool,
          undefined,
          DEFAULT_DIFFICULTY,
        );
      } else {
        summary = await this.summarizeToolResult(
          toolResult,
          LANGUAGE_FALLBACK,
          DEFAULT_PERSONALITY.toneInstructions,
          userInput,
          directMatch.tool,
          DEFAULT_DIFFICULTY,
        );
      }
      return {
        ok: true,
        kind: 'tool',
        tool: directMatch.tool,
        args: directMatch.args,
        result: formattedResult,
        summary,
        intent: { intent: `tool.${directMatch.tool}`, confidence: 1 },
        language: LANGUAGE_FALLBACK,
        attempts: 0,
      };
    } catch (error) {
      Logger.error('pipeline', `Direct tool execution failed for ${directMatch.tool}`, error);
      return {
        ok: false,
        kind: 'error',
        stage: 'tool_execution',
        attempts: 0,
        error: {
          code: 'tool_error',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private parseDirectToolRequest(userInput: string): DirectToolMatch | null {
    const trimmed = userInput.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.includes('\n')) {
      return null;
    }

    const filesystem = this.parseDirectFilesystemCommand(trimmed);
    if (filesystem) {
      return filesystem;
    }

    const process = this.parseDirectProcessCommand(trimmed);
    if (process) {
      return process;
    }

    const fetch = this.parseDirectFetchCommand(trimmed);
    if (fetch) {
      return fetch;
    }

    return null;
  }

  private parseDirectProcessCommand(input: string): DirectToolMatch | null {
    const normalized = input.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    const psWithFilter = /^(?:ps|processes)\s+(.+)$/.exec(normalized);
    if (psWithFilter) {
      return {
        tool: 'process',
        args: {
          action: 'list',
          query: psWithFilter[1],
          limit: null,
        },
        reason: 'direct_process_with_filter',
      };
    }

    if (
      normalized === 'ps' ||
      normalized === 'processes' ||
      normalized === 'list processes'
    ) {
      return {
        tool: 'process',
        args: {
          action: 'list',
          query: null,
          limit: null,
        },
        reason: 'direct_process',
      };
    }

    return null;
  }

  private parseDirectFilesystemCommand(input: string): DirectToolMatch | null {
    const match = /^(read|list)\s+(.+)$/i.exec(input);
    if (!match) {
      return null;
    }

    const actionToken = match[1];
    const pathToken = match[2];
    if (!actionToken || !pathToken) {
      return null;
    }
    const action = actionToken.toLowerCase();
    const path = this.stripWrappingQuotes(pathToken);
    if (!path || !this.looksLikePath(path)) {
      return null;
    }

    return {
      tool: 'filesystem',
      args: {
        action,
        path,
        limit: null,
        maxBytes: null,
      },
      reason: `direct_${action}_filesystem`,
    };
  }

  private parseDirectFetchCommand(input: string): DirectToolMatch | null {
    const match = /^(get|fetch)\s+(.+)$/i.exec(input);
    if (!match) {
      return null;
    }

    const urlToken = match[2];
    if (!urlToken) {
      return null;
    }
    const url = this.stripWrappingQuotes(urlToken);
    if (!url || !this.isHttpUrl(url)) {
      return null;
    }

    return {
      tool: 'fetch',
      args: {
        url,
        method: 'GET',
        headers: null,
        body: null,
        queryParams: null,
        maxBytes: null,
        timeoutMs: null,
      },
      reason: 'direct_get_fetch',
    };
  }

  private stripWrappingQuotes(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      return trimmed;
    }

    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    const isWrapped =
      (first === '"' && last === '"') ||
      (first === "'" && last === "'") ||
      (first === '`' && last === '`');

    if (!isWrapped) {
      return trimmed;
    }

    return trimmed.slice(1, -1).trim();
  }

  private looksLikePath(candidate: string): boolean {
    if (!candidate) {
      return false;
    }

    if (/^https?:\/\//i.test(candidate)) {
      return false;
    }

    if (candidate.includes('\\') || candidate.includes('/')) {
      return true;
    }

    if (/^[A-Za-z]:/.test(candidate)) {
      return true;
    }

    if (candidate.startsWith('.')) {
      return true;
    }

    return candidate.includes('.');
  }

  private isHttpUrl(candidate: string): boolean {
    try {
      const url = new URL(candidate);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
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
    let requiredFields = 0;
    let nullRequired = 0;
    const entries = Object.entries(schema);
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!entry) {
        continue;
      }
      const [key, type] = entry;
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

    if (this.areAllArgumentsNull(args)) {
      return true;
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

  /**
   * Detects the user's language for non-tool responses.
   */
  private async detectLanguage(
    userInput: string,
  ): Promise<{
    ok: boolean;
    language: { language: string; name: string };
    attempts: number;
  }> {
    const stageStartMs = Date.now();
    const prompt = this.orchestrator.buildLanguageDetectionPrompt(userInput);
    const result = await this.runner.executeContract(
      'LANGUAGE_DETECTION',
      prompt,
      (raw) => this.orchestrator.validateLanguageDetection(raw),
    );
    const stageDurationMs = measureDurationMs(stageStartMs);
    Logger.debug('pipeline', 'Language detection stage completed', {
      durationMs: stageDurationMs,
    });

    if (result.ok) {
      return {
        ok: true,
        language: result.value,
        attempts: result.attempts,
      };
    }

    Logger.warn('pipeline', 'Language detection failed, using fallback language');
    return {
      ok: false,
      language: LANGUAGE_FALLBACK,
      attempts: result.attempts,
    };
  }

  /**
   * Runs a non-tool response after resolving language detection.
   */
  private async runNonToolAnswer(
    userInput: string,
    intent: { intent: string; confidence: number } | undefined,
    attempts: number,
    toneInstructions: string | undefined,
    personalityDescription: string,
    difficulty: DifficultyLevel,
  ): Promise<PipelineResult> {
    const languageResult = await this.detectLanguage(userInput);
    const attemptOffset = languageResult.ok ? 0 : languageResult.attempts;
    const language = languageResult.language;

    if (intent?.intent === CONVERSATION_INTENT) {
      return this.runConversationalAnswer(
        userInput,
        intent,
        attempts + attemptOffset,
        toneInstructions,
        personalityDescription,
        language,
        difficulty,
      );
    }

    return this.runStrictAnswer(
      userInput,
      intent,
      attempts + attemptOffset,
      toneInstructions,
      language,
      difficulty,
    );
  }

  /**
   * Runs the conversational answer contract for simple dialogue.
   */
  private async runConversationalAnswer(
    userInput: string,
    intent: { intent: string; confidence: number } | undefined,
    attempts: number,
    toneInstructions: string | undefined,
    personalityDescription: string,
    language: { language: string; name: string },
    difficulty: DifficultyLevel,
  ): Promise<PipelineResult> {
    Logger.info('pipeline', 'Running conversational answer contract');
    const stageStartMs = Date.now();
    const prompt = this.orchestrator.buildConversationalAnswerPrompt(
      userInput,
      toneInstructions,
      language,
      personalityDescription,
      difficulty,
    );
    const result = await this.runner.executeContract(
      'CONVERSATIONAL_ANSWER',
      prompt,
      (raw) => this.orchestrator.validateConversationalAnswer(raw),
    );
    const stageDurationMs = measureDurationMs(stageStartMs);
    Logger.debug('pipeline', 'Conversational answer stage completed', {
      durationMs: stageDurationMs,
    });

    if (!result.ok) {
      Logger.warn(
        'pipeline',
        'Conversational answer contract failed, falling back to strict answer',
      );
      return this.runStrictAnswer(
        userInput,
        intent,
        attempts + result.attempts,
        toneInstructions,
        language,
        difficulty,
      );
    }

    Logger.info('pipeline', 'Conversational answer generated successfully');
    return {
      ok: true,
      kind: 'strict_answer',
      value: result.value,
      intent,
      language,
      attempts: attempts + result.attempts,
    };
  }

  private async runStrictAnswer(
    userInput: string,
    intent: { intent: string; confidence: number } | undefined,
    attempts: number,
    toneInstructions?: string,
    language?: { language: string; name: string },
    difficulty: DifficultyLevel = DEFAULT_DIFFICULTY,
  ): Promise<PipelineResult> {
    Logger.info('pipeline', 'Running strict answer contract');
    const stageStartMs = Date.now();
    const prompt = this.orchestrator.buildStrictAnswerPrompt(
      userInput,
      toneInstructions,
      language,
      difficulty,
    );
    const result = await this.runner.executeContract(
      'STRICT_ANSWER',
      prompt,
      (raw) => this.orchestrator.validateStrictAnswer(raw),
    );
    const stageDurationMs = measureDurationMs(stageStartMs);
    Logger.debug('pipeline', 'Strict answer stage completed', {
      durationMs: stageDurationMs,
    });

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
      language: language ?? LANGUAGE_FALLBACK,
      attempts: attempts + result.attempts,
    };
  }

  /**
   * Optionally formats response text as a concise response in the user's language.
   * This is a best-effort operation; formatting failures do not block the result.
   */
  private async formatResponse(
    text: string,
    language: { language: string; name: string },
    toneInstructions: string | undefined,
    requestContext: string,
    toolName: ToolName,
    fallbackText?: string,
    difficulty?: DifficultyLevel,
  ): Promise<string> {
    const stageStartMs = Date.now();
    const fallback = fallbackText ?? text;
    try {
      const prompt = this.orchestrator.buildResponseFormattingPrompt(
        text,
        language,
        toneInstructions,
        requestContext,
        toolName,
        difficulty,
      );
      const result = await this.runner.executeContract(
        'RESPONSE_FORMATTING',
        prompt,
        (raw) => this.orchestrator.validateResponseFormatting(raw),
      );
      const stageDurationMs = measureDurationMs(stageStartMs);
      Logger.debug('pipeline', 'Response formatting stage completed', {
        durationMs: stageDurationMs,
      });

      if (result.ok) {
        Logger.info('pipeline', 'Response formatted successfully');
        return result.value;
      }

      Logger.warn('pipeline', 'Response formatting failed, returning fallback text');
      return fallback;
    } catch (error) {
      const stageDurationMs = measureDurationMs(stageStartMs);
      Logger.warn('pipeline', 'Response formatting error, returning fallback text', {
        error,
        durationMs: stageDurationMs,
      });
      return fallback;
    }
  }

  /**
   * Serializes tool output into a string for summarization prompts.
   */
  private stringifyToolResult(toolResult: unknown): string {
    if (typeof toolResult === 'string') {
      return toolResult;
    }

    try {
      const serialized = JSON.stringify(toolResult, null, 2);
      if (typeof serialized === 'string') {
        return serialized;
      }
    } catch {
      // Fall through to String conversion.
    }

    return String(toolResult);
  }

  /**
   * Summarizes structured tool output using the response formatting contract.
   */
  private async summarizeToolResult(
    toolResult: unknown,
    language: { language: string; name: string },
    toneInstructions: string | undefined,
    requestContext: string,
    toolName: ToolName,
    difficulty?: DifficultyLevel,
  ): Promise<string> {
    const payload = this.stringifyToolResult(toolResult);
    const fallback = `Tool ${toolName} output is ready. Raw data below.`;
    return this.formatResponse(
      payload,
      language,
      toneInstructions,
      requestContext,
      toolName,
      fallback,
      difficulty,
    );
  }

  private async runErrorChannel(
    stage: PipelineStage,
    attempts: number,
    error?: unknown,
  ): Promise<PipelineResult> {
    const errorContext = error ? String(error) : undefined;
    const prompt = this.orchestrator.buildErrorChannelPrompt(stage, errorContext);
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

  /**
   * Executes a tool and formats its response.
   * Fetches language detection in parallel with tool execution.
   * Handles formatting, error cases, and logging.
   */
  private async executeAndFormatTool(
    toolName: ToolName,
    tool: ReturnType<typeof getToolDefinition>,
    args: Record<string, unknown>,
    userInput: string,
    toneInstructions: string | undefined,
    intent: { intent: string; confidence: number },
    baseAttempts: number,
    pipelineStartMs: number,
    difficulty: DifficultyLevel,
  ): Promise<PipelineResult> {
    // Fetch language in parallel with tool execution since we'll need it for formatting
    const languagePrompt = this.orchestrator.buildLanguageDetectionPrompt(userInput);
    const parallelStartMs = Date.now();
    const [languageResult, toolExecResult] = await Promise.all([
      this.runner.executeContract(
        'LANGUAGE_DETECTION',
        languagePrompt,
        (raw) => this.orchestrator.validateLanguageDetection(raw),
      ),
      (async () => {
        try {
          return { ok: true, result: await tool.execute(args) };
        } catch (error) {
          return { ok: false, error };
        }
      })(),
    ]);
    const parallelDurationMs = measureDurationMs(parallelStartMs);
    Logger.debug('pipeline', 'Language detection + tool execution (parallel)', {
      durationMs: parallelDurationMs,
    });

    const language = languageResult.ok
      ? languageResult.value
      : LANGUAGE_FALLBACK;

    if (!toolExecResult.ok) {
      Logger.error('pipeline', `Tool ${toolName} execution failed`, toolExecResult.error);
      return this.runErrorChannel(
        'tool_execution',
        baseAttempts,
        toolExecResult.error,
      );
    }

    const toolResult = toolExecResult.result;
    Logger.info('pipeline', `Tool ${toolName} executed successfully`);
    let formattedResult = toolResult;
    let summary: string | undefined;

    if (typeof toolResult === 'string') {
      formattedResult = await this.formatResponse(
        toolResult,
        language,
        toneInstructions,
        userInput,
        toolName,
        undefined,
        difficulty,
       );
    } else {
      summary = await this.summarizeToolResult(
        toolResult,
        language,
        toneInstructions,
        userInput,
        toolName,
        difficulty,
      );
    }
    const durationMs = measureDurationMs(pipelineStartMs);
    Logger.info('pipeline', 'Pipeline completed (tool execution)', {
      tool: toolName,
      durationMs,
    });
    return {
      ok: true,
      kind: 'tool',
      tool: toolName,
      args,
      result: formattedResult,
      summary,
      intent,
      language,
      attempts: baseAttempts + (languageResult.ok ? 0 : languageResult.attempts),
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
