import type { Orchestrator } from './orchestrator.js';
import type { Runner } from './runner.js';
import type { RunnerOptions } from './types.js';
import type { ContextSnapshot } from './context.js';
import {
  TOOLS,
  GENERAL_ANSWER_INTENT,
  CONVERSATION_INTENT,
  getToolDefinition,
  TOOL_TRIGGERS,
  type ToolName,
} from './tools/registry.js';
import type { AnswerMode } from './contracts/answer.js';
import type { FieldType } from './contracts/definition.js';
import { Logger } from './logger.js';
import {
  deriveDetectedLanguage,
  type DetectedLanguage,
  LANGUAGE_FALLBACK,
} from './pipeline/language.js';
import {
  isPcInfoSummary,
  type PcInfoSummary,
} from './pipeline/type-guards.js';
import {
  measureDurationMs,
  isAbortError,
  createAbortError,
  extractPathCandidate,
  toTrimmedString,
  isAbsolutePath,
  joinPaths,
  stripLeadingSeparators,
  pathStartsWith,
  relativePath,
  areAllArgumentsNull,
  stringifyToolResult,
  normalizeImageAttachments,
  parseDirectToolRequest,
} from './helpers.js';
import type { 
  PipelineResult, 
  PipelineError, 
  ImageAttachment, 
  PipelineRunOptions, 
  DirectToolExecutionResult, 
  PipelineSummaryExtras, 
  PipelineSummaryStage 
} from './pipeline/types.js';

const TOOL_INTENT_PREFIX = 'tool.';
const REQUIRED_NULL_RATIO_THRESHOLD = 0.5;

/**
 * Executes the end-to-end orchestration pipeline described in ARCHITECTURE.
 */
export class Pipeline {
  constructor(
    private readonly orchestrator: Orchestrator,
    private readonly runner: Runner,
  ) { }

  private activeSignal: AbortSignal | null = null;

  private getRunnerOptions(): RunnerOptions | undefined {
    if (!this.activeSignal) {
      return undefined;
    }
    return {
      signal: this.activeSignal,
    };
  }

  private ensureNotAborted(): void {
    if (this.activeSignal?.aborted) {
      throw createAbortError();
    }
  }

  /**
   * Routes a user input through intent classification, tool execution, or non-tool answer.
   */
  public async run(
    userInput: string,
    attachments?: ImageAttachment[],
    contextSnapshot?: ContextSnapshot,
    options?: PipelineRunOptions,
  ): Promise<PipelineResult> {
    this.activeSignal = options?.signal ?? null;
    try {
      const intentModelOverride = options?.intentModelOverride;
      const result = await this.runOnce(
        userInput,
        attachments,
        contextSnapshot,
        intentModelOverride,
      );

      return result;
    } finally {
      this.activeSignal = null;
    }
  }

  private async runOnce(
    userInput: string,
    attachments?: ImageAttachment[],
    contextSnapshot?: ContextSnapshot,
    intentModelOverride?: string,
  ): Promise<PipelineResult> {
    const pipelineStartMs = Date.now();

    this.ensureNotAborted();

    const languagePromise = userInput.trim()
      ? this.detectLanguage(userInput)
      : Promise.resolve({ ok: false, language: LANGUAGE_FALLBACK, attempts: 0 });

    const imageAttachments = normalizeImageAttachments(attachments);
    if (imageAttachments.length > 0) {
      const languageResult = await languagePromise;
      const result = await this.runImageRecognition(
        userInput,
        imageAttachments,
        contextSnapshot,
        languageResult,
      );
      return this.completePipeline(result, 'image_recognition', pipelineStartMs, {
        imageCount: imageAttachments.length,
      });
    }

    const directTool = await this.tryRunDirectTool(userInput, contextSnapshot, languagePromise);
    if (directTool) {
      return this.completePipeline(directTool.result, 'direct_tool', pipelineStartMs, {
        tool: directTool.metadata.tool,
        reason: directTool.metadata.reason,
      });
    }

    const intentPrompt = this.orchestrator.buildIntentClassificationPrompt(
      userInput,
      contextSnapshot,
      intentModelOverride,
    );
    const intentResult = await this.runner.executeContract(
      'INTENT_CLASSIFICATION',
      intentPrompt,
      (raw) => this.orchestrator.validateIntentClassification(raw),
      this.getRunnerOptions(),
    );

    const languageResult = await languagePromise;

    if (!intentResult.ok) {
      Logger.warn('pipeline', 'Intent classification failed, falling back to strict answer');
      const result = await this.runNonToolAnswer(
        userInput,
        undefined,
        intentResult.attempts,
        contextSnapshot,
        undefined,
        languageResult.language,
        languageResult.attempts,
      );
      return this.completePipeline(result, 'intent_failed', pipelineStartMs, {
        reason: 'intent_classification_failure',
      });
    }

    const intent = intentResult.value as string;

    if (!this.isToolIntent(intent)) {
      const result = await this.runNonToolAnswer(
        userInput,
        intent,
        intentResult.attempts,
        contextSnapshot,
        undefined,
        languageResult.language,
        languageResult.attempts,
      );
      return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
        reason: 'non_tool_intent',
        intent,
      });
    }

    const toolName = this.resolveToolName(intent);
    if (!toolName) {
      const result = await this.runNonToolAnswer(
        userInput,
        intent,
        intentResult.attempts,
        contextSnapshot,
      );
      return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
        reason: 'tool_not_found',
        intent,
      });
    }

    if (!this.hasToolTrigger(userInput, toolName, intent)) {
      const result = await this.runNonToolAnswer(
        userInput,
        intent,
        intentResult.attempts,
        contextSnapshot,
      );
      return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
        reason: 'tool_trigger_missing',
        tool: toolName,
        intent,
      });
    }

    const pathCandidate = extractPathCandidate(userInput);
    let activeToolName = toolName;
    let toolOverrideReason: string | undefined;
    let extractionNotes: string | undefined;

    if (toolName === 'search') {
      extractionNotes =
        'Queries are filenames or patterns, not full paths. Do not convert explicit paths into queries. Use provided paths as baseDir/startPath when present.';
      if (pathCandidate) {
        activeToolName = 'filesystem';
        toolOverrideReason = 'search_to_filesystem_path_detected';
        extractionNotes = `Detected path: ${pathCandidate}\nUse action "list" unless user explicitly asked to read a file.`;
      }
    }

    const tool = getToolDefinition(activeToolName);
    const schemaKeys = Object.keys(tool.schema);
    let attemptsSoFar = intentResult.attempts;
    let toolArgs: Record<string, unknown> = {};

    if (schemaKeys.length > 0) {
      const toolArgResult = await this.extractToolArguments(
        tool,
        userInput,
        extractionNotes,
        contextSnapshot,
      );
      attemptsSoFar += toolArgResult.attempts;
      if (!toolArgResult.ok) {
        Logger.warn(
          'pipeline',
          `Tool argument extraction failed for ${activeToolName}, falling back to strict answer`,
        );
        const result = await this.runNonToolAnswer(
          userInput,
          intent,
          attemptsSoFar,
          contextSnapshot,
          undefined,
          languageResult.language,
          languageResult.attempts,
        );
        return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
          reason: 'argument_extraction_failed',
          tool: activeToolName,
          intent,
        });
      }
      toolArgs = toolArgResult.value as Record<string, unknown>;
      if (activeToolName === 'pcinfo') {
        toolArgs = this.normalizePcInfoArgs(userInput, toolArgs);
      }
      toolArgs = this.applyWorkingDirectoryDefaults(activeToolName, toolArgs, contextSnapshot);
    }

    const schemaValidation = this.validateToolArgsSchema(tool, toolArgs);
    let verificationResult = {
      decision: 'execute' as const,
    }
    if (!schemaValidation.ok) {
      verificationResult = schemaValidation.result;
    }
    if (verificationResult.decision !== 'execute') {
      Logger.info('pipeline', 'Tool argument verification decision', {
        tool: activeToolName,
        decision: verificationResult.decision,
      });
    }

    const requiredMissing = this.getMissingRequiredOverrides(activeToolName, toolArgs);
    if (requiredMissing.length > 0) {
      const missingVerification = {
        decision: 'clarify',
        reason: 'required_fields_missing',
        missingFields: requiredMissing,
      };
      if (this.shouldClarifyToolArguments(missingVerification)) {
        const result = await this.runToolClarification(
          userInput,
          activeToolName,
          requiredMissing,
          intent,
          attemptsSoFar,
          contextSnapshot,
          languageResult.language,
          languageResult.attempts,
        );
        return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
          reason: 'tool_clarify',
          tool: activeToolName,
          intent,
        });
      }

      Logger.info('pipeline', 'Required args missing for tool, falling back to strict answer', { tool: activeToolName, intent });
      const result = await this.runNonToolAnswer(
        userInput,
        intent,
        attemptsSoFar,
        contextSnapshot,
        undefined,
        languageResult.language,
        languageResult.attempts,
      );
      return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
        reason: 'argument_verification_clarify_denied',
        tool: activeToolName,
        intent,
      });
    }

    if (this.shouldSkipToolExecution(activeToolName, tool.schema, toolArgs)) {
      const result = await this.runNonToolAnswer(
        userInput,
        intent,
        attemptsSoFar,
        contextSnapshot,
        undefined,
        languageResult.language,
        languageResult.attempts,
      );
      return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
        reason: 'null_tool_arguments',
        tool: activeToolName,
        intent,
      });
    }

    const effectiveArgs = this.applyShellWorkingDirectory(
      activeToolName,
      toolArgs,
      contextSnapshot,
    );

    if (effectiveArgs !== toolArgs) {
      // shell working directory was applied
    }



    const toolResult = await this.executeAndFormatTool(
      activeToolName,
      tool,
      effectiveArgs,
      userInput,
      intent,
      attemptsSoFar,
      pipelineStartMs,
      contextSnapshot,
      languageResult.language,
      languageResult.attempts,
    );
    return this.completePipeline(toolResult, 'tool_execution', pipelineStartMs, {
      tool: activeToolName,
      ...(toolOverrideReason ? { reason: toolOverrideReason } : {}),
    });
  }

  private completePipeline(
    result: PipelineResult,
    stage: PipelineSummaryStage,
    pipelineStartMs: number,
    extras?: PipelineSummaryExtras,
  ): PipelineResult {
    const summary: Record<string, unknown> = {
      stage,
      durationMs: measureDurationMs(pipelineStartMs),
      resultKind: result.kind,
      attempts: result.attempts,
      ...extras,
    };

    if (
      !summary.intent &&
      result.kind === 'strict_answer' &&
      result.intent
    ) {
      summary.intent = result.intent;
    }

    if (result.kind === 'tool') {
      summary.tool = summary.tool ?? result.tool;
      summary.args = result.args;
    }

    if (result.kind === 'error' && result.error) {
      summary.error = summary.error ?? result.error;
    }

    Logger.info('pipeline', 'Pipeline summary', summary);
    return result;
  }



  private async runImageRecognition(
    userInput: string,
    attachments: ImageAttachment[],
    contextSnapshot?: ContextSnapshot,
    languageResultParam?: { ok: boolean; language: DetectedLanguage; attempts: number },
  ): Promise<PipelineResult> {


    const languageResult = languageResultParam ?? (userInput.trim()
      ? await this.detectLanguage(userInput)
      : {
        ok: false,
        language: LANGUAGE_FALLBACK,
        attempts: 0,
      });

    const prompt = this.orchestrator.buildImageRecognitionPrompt(
      userInput,
      attachments.length,
      languageResult.language,
      contextSnapshot,
    );
    const imagePayload = attachments.map((attachment) => attachment.data);
    const result = await this.runner.executeContract(
      'IMAGE_RECOGNITION',
      { ...prompt, images: imagePayload },
      (raw) => this.orchestrator.validateImageRecognition(raw),
      this.getRunnerOptions(),
    );

    const attemptOffset = languageResult.attempts;
    if (!result.ok) {
      Logger.error('pipeline', 'Image recognition contract failed');
      return {
        ok: false,
        kind: 'error',
        stage: 'image_recognition',
        attempts: result.attempts + attemptOffset,
      };
    }


    return {
      ok: true,
      kind: 'strict_answer',
      value: result.value,
      language: languageResult.language,
      attempts: result.attempts + attemptOffset,
    };
  }

  private async tryRunDirectTool(
    userInput: string,
    contextSnapshot?: ContextSnapshot,
    languagePromise?: Promise<{ ok: boolean; language: DetectedLanguage; attempts: number }>,
  ): Promise<DirectToolExecutionResult | null> {
    const directMatch = parseDirectToolRequest(userInput);
    if (!directMatch) {
      return null;
    }

    try {
      const tool = getToolDefinition(directMatch.tool);
      if (tool.argsSchema) {
        const parsed = tool.argsSchema.safeParse(directMatch.args);
        if (!parsed.success) {
          const issues = parsed.error.issues
            .map((issue) => {
              const path = issue.path.join('.');
              return path ? `${path}: ${issue.message}` : issue.message;
            })
            .join('; ');
          return {
            result: {
              ok: false,
              kind: 'error',
              stage: 'tool_execution',
              attempts: 0,
              error: {
                code: 'tool_error',
                message: `Invalid direct tool arguments: ${issues || 'unknown error'}`,
              },
            },
            metadata: {
              tool: directMatch.tool,
              reason: 'direct_tool_args_validation_failed',
            },
          };
        }
      }

      const languageResult = languagePromise
        ? await languagePromise
        : { ok: false, language: LANGUAGE_FALLBACK, attempts: 0 };
      const language = languageResult.language;

      const toolResult = await tool.execute(directMatch.args);
      let formattedResult = toolResult;
      let summary: string | undefined;

      if (typeof toolResult === 'string') {
        formattedResult = await this.formatResponse(
          toolResult,
          language,
          userInput,
          directMatch.tool,
          undefined,
          contextSnapshot,
        );
      } else {
        summary = await this.summarizeToolResult(
          toolResult,
          language,
          directMatch.tool,
          userInput,
          contextSnapshot,
        );
      }
      Logger.info('pipeline', 'Direct tool executed', {
        tool: directMatch.tool,
        attempts: languageResult.attempts,
        result: summary ?? formattedResult,
      });
      return {
        result: {
          ok: true,
          kind: 'tool',
          tool: directMatch.tool,
          args: directMatch.args,
          result: formattedResult,
          summary,
          intent: `tool.${directMatch.tool}`,
          language,
          attempts: languageResult.attempts,
        },
        metadata: {
          tool: directMatch.tool,
          reason: directMatch.reason,
        },
      };
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      Logger.error('pipeline', `Direct tool execution failed for ${directMatch.tool}`, error);
      return {
        result: {
          ok: false,
          kind: 'error',
          stage: 'tool_execution',
          attempts: 0,
          error: this.buildToolError(error),
        },
        metadata: {
          tool: directMatch.tool,
          reason: directMatch.reason,
        },
      };
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

  private hasToolTrigger(userInput: string, toolName: ToolName, intent?: string): boolean {
    const triggers = TOOL_TRIGGERS[toolName];
    if (!triggers || triggers.length === 0) {
      return true;
    }

    const normalizedInput = userInput.toLowerCase();
    const normalizedIntent = (intent ?? '').toLowerCase();

    for (let index = 0; index < triggers.length; index += 1) {
      const trigger = triggers[index];
      if (!trigger) {
        continue;
      }
      if (normalizedInput.includes(trigger) || normalizedIntent.includes(trigger)) {
        return true;
      }
    }
    return false;
  }

  private shouldClarifyToolArguments(
    verification: any,
  ): boolean {
    return verification.decision === 'clarify';
  }

  private validateToolArgsSchema(
    tool: ReturnType<typeof getToolDefinition>,
    args: Record<string, unknown>,
  ): { ok: true; value: Record<string, unknown> } | { ok: false; result: any } {
    if (!tool.argsSchema) {
      return { ok: true, value: args };
    }

    const parsed = tool.argsSchema.safeParse(args);
    if (parsed.success) {
      return { ok: true, value: parsed.data as Record<string, unknown> };
    }

    const missingFields = new Set<string>();
    const reasons: string[] = [];
    for (let index = 0; index < parsed.error.issues.length; index += 1) {
      const issue = parsed.error.issues[index];
      if (!issue) {
        continue;
      }
      const path = issue.path.join('.');
      reasons.push(path ? `${path}: ${issue.message}` : issue.message);
      if (issue.code === 'invalid_type' && issue.received === 'undefined') {
        const field = issue.path[0];
        if (typeof field === 'string') {
          missingFields.add(field);
        }
      }
    }

    const reason = reasons.length > 0
      ? `args_schema_validation_failed: ${reasons.join('; ')}`
      : 'args_schema_validation_failed';
    return {
      ok: false,
      result: {
        decision: 'clarify',
        reason,
        missingFields: missingFields.size > 0 ? Array.from(missingFields) : undefined,
      },
    };
  }

  /**
   * Builds a concise clarification question for missing tool arguments.
   */
  private buildClarificationQuestion(
    toolName: ToolName,
    missingFields?: string[],
  ): string {
    const hint = this.getClarificationHint(toolName, missingFields);
    if (missingFields && missingFields.length > 0) {
      if (missingFields.length === 1 && missingFields[0] === 'path') {
        return hint ?? 'Which path should I use?';
      }
      if (hint) {
        return hint;
      }
      return `I can use the ${toolName} tool, but I need ${missingFields.join(', ')}.`;
    }

    return hint ?? `I can use the ${toolName} tool for that, but I need a bit more detail.`;
  }

  /**
   * Provides tool-specific clarification hints when arguments are missing.
   */
  private getClarificationHint(
    toolName: ToolName,
    missingFields?: string[],
  ): string | null {
    const fields = missingFields ?? [];
    const hasField = (fieldName: string): boolean => fields.includes(fieldName);

    if (toolName === 'filesystem') {
      if (hasField('path')) {
        return 'Which file or folder path should I use?';
      }
      if (hasField('action')) {
        return 'Should I list a folder or read a file? Share the path you want.';
      }
    }

    if (toolName === 'search') {
      if (hasField('query')) {
        return 'What filename or pattern should I search for?';
      }
      if (hasField('baseDir')) {
        return 'Which folder should I search in?';
      }
    }

    if (toolName === 'http') {
      if (hasField('url')) {
        return 'Which URL should I fetch?';
      }
      if (hasField('method')) {
        return 'Which HTTP method should I use (GET, POST, etc.)?';
      }
    }

    if (toolName === 'process') {
      if (hasField('action')) {
        return 'Should I list running processes?';
      }
      if (hasField('query')) {
        return 'Which process name should I filter by?';
      }
    }

    if (toolName === 'shell') {
      if (hasField('program')) {
        return 'Which command should I run?';
      }
      if (hasField('args')) {
        return 'What arguments should I pass to the command?';
      }
    }

    if (toolName === 'pcinfo') {
      if (hasField('metrics')) {
        return 'Which system info do you need (cpu, memory, disk, or system)?';
      }
    }

    return null;
  }

  /**
   * Runs a clarification response when a tool is clearly intended.
   */
  private async runToolClarification(
    userInput: string,
    toolName: ToolName,
    missingFields: string[] | undefined,
    intent: string | undefined,
    attempts: number,
    contextSnapshot?: ContextSnapshot,
    language?: DetectedLanguage,
    languageAttempts: number = 0,
  ): Promise<PipelineResult> {
    const normalizedLanguage = language ?? LANGUAGE_FALLBACK;
    const question = this.buildClarificationQuestion(toolName, missingFields);
    const formatted = await this.formatResponse(
      question,
      normalizedLanguage,
      userInput,
      toolName,
      question,
      contextSnapshot,
    );
    return {
      ok: true,
      kind: 'strict_answer',
      value: formatted,
      intent,
      language: normalizedLanguage,
      attempts: attempts + languageAttempts,
    };
  }

  /**
   * Extracts tool arguments using the argument extraction contract.
   */
  private async extractToolArguments(
    tool: ReturnType<typeof getToolDefinition>,
    userInput: string,
    verifierNotes?: string,
    contextSnapshot?: ContextSnapshot,
  ) {
    const toolArgPrompt = this.orchestrator.buildToolArgumentPrompt(
      tool.name,
      tool.description,
      tool.schema,
      userInput,
      verifierNotes,
      contextSnapshot,
    );
    const toolArgResult = await this.runner.executeContract(
      'TOOL_ARGUMENT_EXTRACTION',
      toolArgPrompt,
      (raw) => this.orchestrator.validateToolArguments(raw, tool.schema),
      this.getRunnerOptions(),
    );
    return toolArgResult;
  }

  private shouldSkipToolExecution(
    toolName: ToolName,
    schema: Record<string, FieldType>,
    args: Record<string, unknown>,
  ): boolean {
    let requiredFields = 0;
    let nullRequired = 0;
    let missingRequiredOverride = false;
    const requiredOverrides = this.getRequiredFieldOverrides(toolName);
    const entries = Object.entries(schema);
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!entry) {
        continue;
      }
      const [key, type] = entry;
      const forceRequired = requiredOverrides.has(key);
      const allowsNull = !forceRequired && type.endsWith('|null');
      if (allowsNull) {
        continue;
      }

      requiredFields += 1;
      const value = args[key];
      const isMissing = value === null || value === undefined || (typeof value === 'string' && !value.trim());
      if (isMissing) {
        nullRequired += 1;
        if (forceRequired) {
          missingRequiredOverride = true;
        }
      }
    }

    if (requiredFields === 0) {
      return false;
    }

    if (missingRequiredOverride) {
      return true;
    }

    if (areAllArgumentsNull(args)) {
      return true;
    }

    const nullRatio = nullRequired / requiredFields;
    return nullRatio > REQUIRED_NULL_RATIO_THRESHOLD;
  }

  /**
   * Returns required-field overrides for tools that default fields from context.
   */
  private getRequiredFieldOverrides(toolName: ToolName): Set<string> {
    if (toolName === 'filesystem') {
      return new Set(['path']);
    }
    if (toolName === 'search') {
      return new Set(['baseDir']);
    }
    return new Set();
  }

  /**
   * Finds missing required fields for tools that default from context.
   */
  private getMissingRequiredOverrides(
    toolName: ToolName,
    args: Record<string, unknown>,
  ): string[] {
    const required = this.getRequiredFieldOverrides(toolName);
    if (required.size === 0) {
      return [];
    }

    const missing: string[] = [];
    for (const field of required) {
      const value = args[field];
      if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
        missing.push(field);
      }
    }
    return missing;
  }



  /**
   * Detects the user's language for non-tool responses.
   */
  private async detectLanguage(
    userInput: string,
  ): Promise<{
    ok: boolean;
    language: DetectedLanguage;
    attempts: number;
  }> {
    const prompt = this.orchestrator.buildLanguageDetectionPrompt(userInput);
    const result = await this.runner.executeContract(
      'LANGUAGE_DETECTION',
      prompt,
      (raw) => this.orchestrator.validateLanguageDetection(raw),
      this.getRunnerOptions(),
    );

    if (result.ok) {
      const language = deriveDetectedLanguage(result.value);
      return {
        ok: true,
        language,
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
    intent: string | undefined,
    attempts: number,
    contextSnapshot?: ContextSnapshot,
    toolSuggestion?: string,
    language?: DetectedLanguage,
    languageAttempts: number = 0,
  ): Promise<PipelineResult> {
    const normalizedLanguage = language ?? (await this.detectLanguage(userInput)).language;
    const totalAttemptsBeforeAnswer = attempts + languageAttempts;

    if (intent === CONVERSATION_INTENT) {
      return this.runAnswer(
        userInput,
        intent,
        totalAttemptsBeforeAnswer,
        normalizedLanguage,
        contextSnapshot,
        'conversational',
      );
    }

    return this.runAnswer(
      userInput,
      intent,
      totalAttemptsBeforeAnswer,
      normalizedLanguage,
      contextSnapshot,
      toolSuggestion,
      'strict',
    );
  }

  private async runAnswer(
    userInput: string,
    intent: string | undefined,
    attempts: number,
    language?: DetectedLanguage,
    contextSnapshot?: ContextSnapshot,
    toolSuggestion?: string,
    mode: AnswerMode = 'strict',
  ): Promise<PipelineResult> {

    const prompt = this.orchestrator.buildAnswerPrompt(
      userInput,
      mode,
      language,
      contextSnapshot,
    );
    const result = await this.runner.executeContract(
      'ANSWER',
      prompt,
      (raw) => this.orchestrator.validateAnswerMode(raw, mode),
      this.getRunnerOptions(),
    );

    if (!result.ok) {
      Logger.error('pipeline', 'Answer contract failed');
      return {
        ok: false,
        kind: 'error',
        stage: 'strict_answer',
        attempts: attempts + result.attempts,
      };
    }


    const responseText = toolSuggestion
      ? `${result.value}\n\n${toolSuggestion}`
      : result.value;
    const normalizedLanguage = language ?? LANGUAGE_FALLBACK;
    // ANSWER contract output is final - no formatting or scoring
    // (RESPONSE_FORMATTING is only for tool outputs per contract set v1.0)
    return {
      ok: true,
      kind: 'strict_answer',
      value: responseText,
      intent,
      language: normalizedLanguage,
      attempts: attempts + result.attempts,
    };
  }

  /**
   * Optionally formats response text as a concise response in the user's language.
   * This is a best-effort operation; formatting failures do not block the result.
   */
  private async formatResponse(
    text: string,
    language: DetectedLanguage,
    requestContext: string,
    toolLabel?: string,
    fallbackText?: string,
    contextSnapshot?: ContextSnapshot,
  ): Promise<string> {
    const stageStartMs = Date.now();
    const fallback = fallbackText ?? text;
    try {
      const prompt = this.orchestrator.buildAnswerPrompt(
        text,
        'tool-formatting',
        language,
        contextSnapshot,
        { requestContext, toolName: toolLabel, response: text },
      );
      const result = await this.runner.executeContract(
        'ANSWER',
        prompt,
        (raw) => this.orchestrator.validateAnswerMode(raw, 'tool-formatting'),
        this.getRunnerOptions(),
      );

      if (result.ok) {
        return result.value;
      }

      Logger.warn('pipeline', 'Response formatting failed, returning fallback text');
      return fallback;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
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


  /**
   * Normalizes pcinfo arguments to include all metrics for generic requests.
   */
  private normalizePcInfoArgs(
    userInput: string,
    args: Record<string, unknown>,
  ): Record<string, unknown> {
    const metrics = args.metrics;
    if (!Array.isArray(metrics)) {
      return args;
    }

    const metricHints = /cpu|processor|ram|memory|disk|drive|storage|system|uptime|hostname|os|prozessor|speicher|festplatte|platte|laufzeit|betriebszeit|rechner/i;
    if (!metricHints.test(userInput)) {
      return { ...args, metrics: null };
    }

    return args;
  }

  /**
   * Returns the configured working directory from context, if any.
   */
  private getContextCwd(contextSnapshot?: ContextSnapshot): string | null {
    const cwd = contextSnapshot?.environment?.cwd;
    if (typeof cwd !== 'string') {
      return null;
    }
    const trimmed = cwd.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Applies working-directory defaults for filesystem/search tools.
   */
  private applyWorkingDirectoryDefaults(
    toolName: ToolName,
    args: Record<string, unknown>,
    contextSnapshot?: ContextSnapshot,
  ): Record<string, unknown> {
    const cwd = this.getContextCwd(contextSnapshot);
    if (!cwd) {
      return args;
    }

    if (toolName === 'filesystem') {
      return this.applyFilesystemWorkingDirectory(args, cwd);
    }

    if (toolName === 'search') {
      return this.applySearchWorkingDirectory(args, cwd);
    }

    return args;
  }

  /**
   * Resolves filesystem paths against the working directory when needed.
   */
  private applyFilesystemWorkingDirectory(
    args: Record<string, unknown>,
    cwd: string,
  ): Record<string, unknown> {
    const rawPath = toTrimmedString(args.path);
    if (!rawPath) {
      return { ...args, path: cwd };
    }

    if (!isAbsolutePath(rawPath)) {
      return { ...args, path: joinPaths(cwd, rawPath) };
    }

    return args;
  }

  /**
   * Resolves search baseDir/startPath against the working directory when needed.
   */
  private applySearchWorkingDirectory(
    args: Record<string, unknown>,
    cwd: string,
  ): Record<string, unknown> {
    const baseDirRaw = toTrimmedString(args.baseDir);
    const startPathRaw = toTrimmedString(args.startPath);
    let nextBaseDir = baseDirRaw;
    let nextStartPath: string | null = startPathRaw || null;

    if (!nextBaseDir) {
      nextBaseDir = cwd;
    } else if (!isAbsolutePath(nextBaseDir)) {
      nextBaseDir = joinPaths(cwd, nextBaseDir);
    }

    if (nextStartPath) {
      if (isAbsolutePath(nextStartPath)) {
        if (pathStartsWith(nextStartPath, nextBaseDir)) {
          const relative = relativePath(nextStartPath, nextBaseDir);
          nextStartPath = relative.length > 0 ? relative : null;
        } else {
          nextBaseDir = nextStartPath;
          nextStartPath = null;
        }
      } else {
        nextStartPath = stripLeadingSeparators(nextStartPath);
      }
    }

    return {
      ...args,
      baseDir: nextBaseDir,
      startPath: nextStartPath,
    };
  }

















  /**
   * Apply the UI-selected working directory to shell tool runs.
   */
  private applyShellWorkingDirectory(
    toolName: ToolName,
    args: Record<string, unknown>,
    contextSnapshot?: ContextSnapshot,
  ): Record<string, unknown> {
    if (toolName !== 'shell') {
      return args;
    }

    const cwd = this.getContextCwd(contextSnapshot);
    if (!cwd) {
      return args;
    }

    const currentCwd = args.cwd;
    if (typeof currentCwd === 'string' && currentCwd.trim()) {
      return args;
    }

    return { ...args, cwd };
  }

  /**
   * Formats bytes into a human-readable string.
   */
  private formatBytes(bytes: number | null | undefined): string {
    if (!bytes || !Number.isFinite(bytes)) {
      return 'N/A';
    }
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  /**
   * Formats uptime seconds into a short string.
   */
  private formatUptime(seconds: number | null | undefined): string {
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
      return 'N/A';
    }
    const totalSeconds = Math.max(0, Math.floor(seconds));
    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const parts: string[] = [];
    if (days > 0) {
      parts.push(`${days}d`);
    }
    if (hours > 0 || days > 0) {
      parts.push(`${hours}h`);
    }
    parts.push(`${minutes}m`);
    return parts.join(' ');
  }

  /**
   * Builds a localized pcinfo summary from structured data.
   */
  private buildPcInfoSummary(result: PcInfoSummary): string {
    const labels = {
      system: 'System',
      hostname: 'Hostname',
      uptime: 'Uptime',
      platform: 'Platform',
      cpu: 'CPU',
      memory: 'RAM',
      disk: 'Disk',
      usage: 'Usage',
      cores: 'cores',
      threads: 'threads',
      free: 'Free',
    };

    const lines: string[] = [];

    if (result.system) {
      const hostname = result.system.hostname ?? 'N/A';
      const platform = result.system.platform ?? 'unknown';
      const uptime = this.formatUptime(result.system.uptime);
      lines.push(
        `${labels.system}: ${labels.platform} ${platform}, ${labels.hostname} ${hostname}, ${labels.uptime} ${uptime}.`,
      );
    }

    if (result.cpu) {
      const model = result.cpu.model ?? 'Unknown CPU';
      const cores = result.cpu.cores ?? 'N/A';
      const threads = result.cpu.threads ?? 'N/A';
      const usage = result.cpu.usage !== null && Number.isFinite(result.cpu.usage)
        ? `${result.cpu.usage.toFixed(1)}%`
        : 'N/A';
      lines.push(
        `${labels.cpu}: ${model} (${cores} ${labels.cores} / ${threads} ${labels.threads}), ${labels.usage} ${usage}.`,
      );
    }

    if (result.memory) {
      const total = this.formatBytes(result.memory.totalBytes);
      const used = this.formatBytes(result.memory.usedBytes);
      const free = this.formatBytes(result.memory.freeBytes);
      const usage = result.memory.usagePercent !== null && Number.isFinite(result.memory.usagePercent)
        ? `${result.memory.usagePercent.toFixed(1)}%`
        : 'N/A';
      lines.push(
        `${labels.memory}: ${used} / ${total} (${labels.usage} ${usage}), ${labels.free} ${free}.`,
      );
    }

    if (result.disks && result.disks.length > 0) {
      const entries: string[] = [];
      const count = Math.min(result.disks.length, 2);
      for (let index = 0; index < count; index += 1) {
        const disk = result.disks[index];
        if (!disk) {
          continue;
        }
        const total = this.formatBytes(disk.totalBytes);
        const used = this.formatBytes(disk.usedBytes);
        const usage = disk.usagePercent !== null && Number.isFinite(disk.usagePercent)
          ? `${disk.usagePercent.toFixed(1)}%`
          : 'N/A';
        entries.push(`${disk.path}: ${used} / ${total} (${usage})`);
      }
      const extra = result.disks.length > 2
        ? ` +${result.disks.length - 2} more`
        : '';
      lines.push(`${labels.disk}: ${entries.join('; ')}${extra}.`);
    }

    return lines.join('\n');
  }

  /**
   * Summarizes structured tool output using the response formatting contract.
   */
  private async summarizeToolResult(
    toolResult: unknown,
    language: DetectedLanguage,
    toolName: ToolName,
    userInput: string,
    contextSnapshot?: ContextSnapshot,
  ): Promise<string> {
    if (toolName === 'pcinfo' && isPcInfoSummary(toolResult)) {
      return this.buildPcInfoSummary(toolResult);
    }

    const payload = stringifyToolResult(toolResult);
    const fallback = `Tool ${toolName} output is ready. Raw data below.`;
    return this.formatResponse(
      payload,
      language,
      userInput,
      toolName,
      fallback,
      contextSnapshot,
    );
  }

  /**
   * Executes a tool and formats its response.
   * Uses precomputed language detection results provided by the caller.
   * Handles formatting, error cases, and logging.
   */
  private async executeAndFormatTool(
    toolName: ToolName,
    tool: ReturnType<typeof getToolDefinition>,
    args: Record<string, unknown>,
    userInput: string,
    intent: string | undefined,
    baseAttempts: number,
    pipelineStartMs: number,
    contextSnapshot?: ContextSnapshot,
    language?: DetectedLanguage,
    languageAttempts: number = 0,
  ): Promise<PipelineResult> {
    const effectiveLanguage = language ?? LANGUAGE_FALLBACK;

    try {
      const toolExecResult = await (async () => {
        try {
          return { ok: true, result: await tool.execute(args) };
        } catch (error) {
          return { ok: false, error };
        }
      })();

      if (!toolExecResult.ok) {
        Logger.error('pipeline', `Tool ${toolName} execution failed`, toolExecResult.error);
        return {
          ok: false,
          kind: 'error',
          stage: 'tool_execution',
          attempts: baseAttempts + languageAttempts,
          error: this.buildToolError(toolExecResult.error),
        };
      }

      const toolResult = toolExecResult.result;
      let formattedResult = toolResult;
      let summary: string | undefined;

      if (typeof toolResult === 'string') {
        formattedResult = await this.formatResponse(
          toolResult,
          effectiveLanguage,
          userInput,
          toolName,
          undefined,
          contextSnapshot,
        );
      } else {
        summary = await this.summarizeToolResult(
          toolResult,
          effectiveLanguage,
          toolName,
          userInput,
          contextSnapshot,
        );
      }
      const durationMs = measureDurationMs(pipelineStartMs);
      Logger.info('pipeline', 'Tool executed', {
        tool: toolName,
        durationMs,
        attempts: baseAttempts + languageAttempts,
        result: summary ?? formattedResult,
      });
      return {
        ok: true,
        kind: 'tool',
        tool: toolName,
        args,
        result: formattedResult,
        summary,
        intent: intent as string,
        language: effectiveLanguage,
        attempts: baseAttempts + languageAttempts,
      };    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      Logger.error('pipeline', `Tool ${toolName} execution unexpected error`, error);
      return {
        ok: false,
        kind: 'error',
        stage: 'tool_execution',
        attempts: baseAttempts + languageAttempts,
        error: this.buildToolError(error),
      };
    }
  }

  private buildToolError(error?: unknown): PipelineError {
    const message = error instanceof Error
      ? error.message
      : error
        ? String(error)
        : 'Tool execution failed.';

    return {
      code: 'tool_error',
      message,
    };
  }
}
