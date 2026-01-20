import type { Orchestrator } from './orchestrator.js';
import type { Runner } from './runner.js';
import type { ContextSnapshot } from './context.js';
import {
  TOOLS,
  GENERAL_ANSWER_INTENT,
  CONVERSATION_INTENT,
  getToolDefinition,
  TOOL_TRIGGERS,
  type ToolName,
} from './tools/registry.js';
import type { FieldType } from './contracts/definition.js';
import type { ToolArgumentVerificationResult } from './contracts/tool.argument.verification.js';
import { Logger } from './logger.js';
import { DEFAULT_PERSONALITY } from './personality.js';
import type { HttpResponseResult } from './tools/web/http-core.js';

const TOOL_INTENT_PREFIX = 'tool.';
const MIN_TOOL_CONFIDENCE = 0.6;
const TOOL_ARGUMENT_VERIFICATION_RETRIES = 1;
const MIN_CLARIFY_INTENT_CONFIDENCE = 0.9;
const MIN_CLARIFY_VERIFICATION_CONFIDENCE = 0.9;
const MIN_TOOL_TRIGGER_CONFIDENCE = 0.85;
const REQUIRED_NULL_RATIO_THRESHOLD = 0.5;
const LOW_SCORE_THRESHOLD = 3;

type PipelineRunOptions = {
  intentModelOverride?: string;
  allowLowScoreRetry?: boolean;
};

type PcInfoSummary = {
  system?: {
    platform: string;
    hostname: string | null;
    uptime: number | null;
  };
  cpu?: {
    cores: number | null;
    threads: number | null;
    model: string | null;
    usage: number | null;
  };
  memory?: {
    totalBytes: number | null;
    usedBytes: number | null;
    freeBytes: number | null;
    usagePercent: number | null;
  };
  disks?: Array<{
    path: string;
    totalBytes: number | null;
    usedBytes: number | null;
    freeBytes: number | null;
    usagePercent: number | null;
  }>;
};

export type DetectedLanguage = { language: string; name: string };

const LANGUAGE_FALLBACK: DetectedLanguage = {
  language: 'unknown',
  name: 'Unknown',
};

const languageDisplayNameFormatter = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' });
  } catch {
    return null;
  }
})();

function formatLanguageDisplayName(code: string): string {
  if (!code) {
    return LANGUAGE_FALLBACK.name;
  }

  if (code === LANGUAGE_FALLBACK.language) {
    return LANGUAGE_FALLBACK.name;
  }

  const displayName = languageDisplayNameFormatter?.of(code);
  if (displayName && displayName.toLowerCase() !== code) {
    return displayName;
  }

  return `${code.charAt(0).toUpperCase()}${code.slice(1)}`;
}

const isHttpResponseResult = (value: unknown): value is HttpResponseResult => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.url === 'string'
    && typeof record.finalUrl === 'string'
    && typeof record.method === 'string'
    && typeof record.status === 'number'
    && typeof record.statusText === 'string'
    && typeof record.headers === 'object'
    && (typeof record.contentType === 'string' || record.contentType === null)
    && typeof record.content === 'string'
    && typeof record.bytesRead === 'number'
    && typeof record.totalBytes === 'number'
    && typeof record.truncated === 'boolean'
    && typeof record.redirected === 'boolean'
  );
};

const isPcInfoSummary = (value: unknown): value is PcInfoSummary => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.system === 'object'
    || typeof record.cpu === 'object'
    || typeof record.memory === 'object'
    || Array.isArray(record.disks)
  );
};

/**
 * Normalize an ISO code into a DetectedLanguage, deriving a friendly name via Intl when available.
 */
function deriveDetectedLanguage(code?: string): DetectedLanguage {
  if (!code) {
    return LANGUAGE_FALLBACK;
  }

  const normalized = code.trim().toLowerCase();
  if (!normalized) {
    return LANGUAGE_FALLBACK;
  }

  if (normalized === LANGUAGE_FALLBACK.language) {
    return LANGUAGE_FALLBACK;
  }

  return {
    language: normalized,
    name: formatLanguageDisplayName(normalized),
  };
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
  | 'strict_answer';

export type PipelineError = {
  code: string;
  message: string;
};

export type EvaluationAlert = 'scoring_failed' | 'low_scores';

export type PipelineResult =
  | {
      ok: true;
      kind: 'strict_answer';
      value: string;
      evaluation?: Record<string, number>;
      evaluationAlert?: EvaluationAlert;
      intent?: { intent: string; confidence: number };
      language: DetectedLanguage;
      attempts: number;
    }
  | {
      ok: true;
      kind: 'tool';
      tool: ToolName;
      args: Record<string, unknown>;
      result: unknown;
      summary?: string;
      evaluation?: Record<string, number>;
      evaluationAlert?: EvaluationAlert;
      intent: { intent: string; confidence: number };
      language: DetectedLanguage;
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

type DirectToolExecutionResult = {
  result: PipelineResult;
  metadata: {
    tool?: ToolName;
    reason: string;
  };
};

type PipelineSummaryStage =
  | PipelineStage
  | 'direct_tool'
  | 'intent_failed'
  | 'non_tool_intent'
  | 'low_confidence'
  | 'tool_not_found'
  | 'argument_extraction_failed'
  | 'null_tool_arguments';

type PipelineSummaryExtras = {
  reason?: string;
  tool?: ToolName;
  intent?: string;
  intentConfidence?: number;
  evaluationAlert?: EvaluationAlert;
  imageCount?: number;
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
   * Routes a user input through intent classification, tool execution, or non-tool answer.
   */
  public async run(
    userInput: string,
    attachments?: ImageAttachment[],
    contextSnapshot?: ContextSnapshot,
    options?: PipelineRunOptions,
  ): Promise<PipelineResult> {
    const allowLowScoreRetry = options?.allowLowScoreRetry ?? true;
    const intentModelOverride = options?.intentModelOverride;
    const result = await this.runOnce(
      userInput,
      attachments,
      contextSnapshot,
      intentModelOverride,
    );

    if (
      allowLowScoreRetry &&
      result.ok &&
      result.evaluationAlert === 'low_scores' &&
      !intentModelOverride
    ) {
      const upgradedModel = 'llama3.2:3b';
      Logger.warn('pipeline', 'Low scores detected, retrying with stronger intent model', {
        model: upgradedModel,
      });
      return this.runOnce(
        userInput,
        attachments,
        contextSnapshot,
        upgradedModel,
      );
    }

    return result;
  }

  private async runOnce(
    userInput: string,
    attachments?: ImageAttachment[],
    contextSnapshot?: ContextSnapshot,
    intentModelOverride?: string,
  ): Promise<PipelineResult> {
    const pipelineStartMs = Date.now();
    Logger.debug('pipeline', 'Starting pipeline execution', {
      inputLength: userInput.length,
    });

    const imageAttachments = this.normalizeImageAttachments(attachments);
    if (imageAttachments.length > 0) {
      const result = await this.runImageRecognition(
        userInput,
        imageAttachments,
        pipelineStartMs,
        contextSnapshot,
      );
      return this.completePipeline(result, 'image_recognition', pipelineStartMs, {
        imageCount: imageAttachments.length,
      });
    }

    const directTool = await this.tryRunDirectTool(userInput, contextSnapshot);
    if (directTool) {
      return this.completePipeline(directTool.result, 'direct_tool', pipelineStartMs, {
        tool: directTool.metadata.tool,
        reason: directTool.metadata.reason,
      });
    }

    const toneInstructions = DEFAULT_PERSONALITY.toneInstructions;
    const personalityDescription = DEFAULT_PERSONALITY.description;
    Logger.debug('pipeline', 'Using predefined MANTIS tone instructions');
    const intentPrompt = this.orchestrator.buildIntentClassificationPrompt(
      userInput,
      contextSnapshot,
      intentModelOverride,
    );
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

    if (!intentResult.ok) {
      Logger.warn('pipeline', 'Intent classification failed, falling back to strict answer');
      const result = await this.runNonToolAnswer(
        userInput,
        undefined,
        intentResult.attempts,
        toneInstructions,
        personalityDescription,
        contextSnapshot,
      );
      return this.completePipeline(result, 'intent_failed', pipelineStartMs, {
        reason: 'intent_classification_failure',
      });
    }

    const intent = intentResult.value;
    Logger.debug('pipeline', `Intent classified: ${intent.intent}`, {
      confidence: intent.confidence,
    });

    if (!this.isToolIntent(intent.intent)) {
      Logger.debug('pipeline', 'Non-tool intent selected, using non-tool answer');
      const result = await this.runNonToolAnswer(
        userInput,
        intent,
        intentResult.attempts,
        toneInstructions,
        personalityDescription,
        contextSnapshot,
      );
      return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
        reason: 'non_tool_intent',
        intent: intent.intent,
        intentConfidence: intent.confidence,
      });
    }

    if (!this.meetsToolConfidence(intent.confidence)) {
      Logger.debug('pipeline', 'Tool intent below confidence threshold, using strict answer');
      const result = await this.runNonToolAnswer(
        userInput,
        intent,
        intentResult.attempts,
        toneInstructions,
        personalityDescription,
        contextSnapshot,
      );
      return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
        reason: 'low_confidence',
        intent: intent.intent,
        intentConfidence: intent.confidence,
      });
    }

    const toolName = this.resolveToolName(intent.intent);
    if (!toolName) {
      Logger.debug('pipeline', 'No matching tool for intent, using strict answer');
      const result = await this.runNonToolAnswer(
        userInput,
        intent,
        intentResult.attempts,
        toneInstructions,
        personalityDescription,
        contextSnapshot,
      );
      return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
        reason: 'tool_not_found',
        intent: intent.intent,
        intentConfidence: intent.confidence,
      });
    }

    if (!this.hasToolTrigger(userInput, toolName)) {
      if (intent.confidence < MIN_TOOL_TRIGGER_CONFIDENCE) {
        Logger.debug('pipeline', 'Tool intent missing trigger keywords, using strict answer', {
          tool: toolName,
        });
        const result = await this.runNonToolAnswer(
          userInput,
          intent,
          intentResult.attempts,
          toneInstructions,
          personalityDescription,
          contextSnapshot,
        );
        return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
          reason: 'tool_trigger_missing',
          tool: toolName,
          intent: intent.intent,
          intentConfidence: intent.confidence,
        });
      }

      Logger.debug('pipeline', 'Tool trigger missing but confidence is high, proceeding', {
        tool: toolName,
        intentConfidence: intent.confidence,
      });
    }

    const pathCandidate = this.extractPathCandidate(userInput);
    let activeToolName = toolName;
    let toolOverrideReason: string | undefined;
    let extractionNotes: string | undefined;

    if (toolName === 'search') {
      extractionNotes =
        'Queries are filenames or patterns, not full paths. Do not convert explicit paths into queries. Use provided paths as baseDir/startPath when present.';
      if (pathCandidate) {
        activeToolName = 'filesystem';
        toolOverrideReason = 'search_to_filesystem_path_detected';
        Logger.debug('pipeline', 'Overriding search intent to filesystem due to explicit path', {
          path: pathCandidate,
        });
        extractionNotes = `Detected path: ${pathCandidate}\nUse action "list" unless user explicitly asked to read a file.`;
      }
    }

    const tool = getToolDefinition(activeToolName);
    const schemaKeys = Object.keys(tool.schema);
    let attemptsSoFar = intentResult.attempts;
    let toolArgs: Record<string, unknown> = {};

    if (schemaKeys.length > 0) {
      Logger.debug('pipeline', `Extracting arguments for tool: ${activeToolName}`);
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
          toneInstructions,
          personalityDescription,
          contextSnapshot,
        );
        return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
          reason: 'argument_extraction_failed',
          tool: activeToolName,
          intent: intent.intent,
          intentConfidence: intent.confidence,
        });
      }
      toolArgs = toolArgResult.value as Record<string, unknown>;
      if (activeToolName === 'pcinfo') {
        toolArgs = this.normalizePcInfoArgs(userInput, toolArgs);
      }
    }

    const schemaValidation = this.validateToolArgsSchema(tool, toolArgs);
    let verificationResult: ToolArgumentVerificationResult;
    if (!schemaValidation.ok) {
      verificationResult = schemaValidation.result;
    } else {
      toolArgs = schemaValidation.value;
      const verification = await this.verifyToolArguments(
        activeToolName,
        tool.description,
        tool.schema,
        userInput,
        toolArgs,
        contextSnapshot,
      );
      attemptsSoFar += verification.attempts;
      if (!verification.ok) {
        Logger.warn(
          'pipeline',
          `Tool argument verification failed for ${activeToolName}, falling back to strict answer`,
        );
        const result = await this.runNonToolAnswer(
          userInput,
          intent,
          attemptsSoFar,
          toneInstructions,
          personalityDescription,
          contextSnapshot,
        );
        return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
          reason: 'argument_verification_failed',
          tool: activeToolName,
          intent: intent.intent,
          intentConfidence: intent.confidence,
        });
      }

      verificationResult = verification.value;
    }
    Logger.debug('pipeline', 'Tool argument verification decision', {
      tool: activeToolName,
      decision: verificationResult.decision,
      confidence: verificationResult.confidence,
      reason: verificationResult.reason,
    });

    for (let retry = 0; retry < TOOL_ARGUMENT_VERIFICATION_RETRIES; retry += 1) {
      if (verificationResult.decision !== 'retry') {
        break;
      }
      if (schemaKeys.length === 0) {
        break;
      }

      const verifierNotes = this.buildVerificationNotes(verificationResult);
      Logger.debug('pipeline', 'Retrying tool argument extraction', {
        tool: activeToolName,
        attempt: retry + 1,
        reason: verificationResult.reason,
      });
      const retryResult = await this.extractToolArguments(
        tool,
        userInput,
        verifierNotes || extractionNotes,
        contextSnapshot,
      );
      attemptsSoFar += retryResult.attempts;
      if (!retryResult.ok) {
        Logger.warn(
          'pipeline',
          `Tool argument retry failed for ${activeToolName}, falling back to strict answer`,
        );
        const result = await this.runNonToolAnswer(
          userInput,
          intent,
          attemptsSoFar,
          toneInstructions,
          personalityDescription,
          contextSnapshot,
        );
        return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
          reason: 'argument_extraction_failed',
          tool: activeToolName,
          intent: intent.intent,
          intentConfidence: intent.confidence,
        });
      }

      toolArgs = retryResult.value as Record<string, unknown>;
      const retrySchemaValidation = this.validateToolArgsSchema(tool, toolArgs);
      if (!retrySchemaValidation.ok) {
        verificationResult = retrySchemaValidation.result;
        Logger.debug('pipeline', 'Tool argument verification decision', {
          tool: activeToolName,
          decision: verificationResult.decision,
          confidence: verificationResult.confidence,
          reason: verificationResult.reason,
        });
        continue;
      }

      toolArgs = retrySchemaValidation.value;
      const retryVerification = await this.verifyToolArguments(
        activeToolName,
        tool.description,
        tool.schema,
        userInput,
        toolArgs,
        contextSnapshot,
      );
      attemptsSoFar += retryVerification.attempts;
      if (!retryVerification.ok) {
        Logger.warn(
          'pipeline',
          `Tool argument verification retry failed for ${activeToolName}, falling back to strict answer`,
        );
        const result = await this.runNonToolAnswer(
          userInput,
          intent,
          attemptsSoFar,
          toneInstructions,
          personalityDescription,
          contextSnapshot,
        );
        return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
          reason: 'argument_verification_failed',
          tool: activeToolName,
          intent: intent.intent,
          intentConfidence: intent.confidence,
        });
      }

      verificationResult = retryVerification.value;
      Logger.debug('pipeline', 'Tool argument verification decision', {
        tool: activeToolName,
        decision: verificationResult.decision,
        confidence: verificationResult.confidence,
        reason: verificationResult.reason,
      });
    }

    if (verificationResult.decision === 'retry') {
      Logger.debug(
        'pipeline',
        `Tool argument verification retries exhausted for ${activeToolName}, falling back to strict answer`,
      );
      const result = await this.runNonToolAnswer(
        userInput,
        intent,
        attemptsSoFar,
        toneInstructions,
        personalityDescription,
        contextSnapshot,
      );
      return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
        reason: 'argument_verification_retry_exhausted',
        tool: activeToolName,
        intent: intent.intent,
        intentConfidence: intent.confidence,
      });
    }

    if (verificationResult.decision === 'abort') {
      Logger.debug(
        'pipeline',
        `Tool argument verification aborted for ${activeToolName}, falling back to strict answer`,
      );
      const result = await this.runNonToolAnswer(
        userInput,
        intent,
        attemptsSoFar,
        toneInstructions,
        personalityDescription,
        contextSnapshot,
      );
      return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
        reason: 'argument_verification_abort',
        tool: activeToolName,
        intent: intent.intent,
        intentConfidence: intent.confidence,
      });
    }

    if (verificationResult.decision === 'clarify') {
      if (this.shouldClarifyToolArguments(intent.confidence, verificationResult)) {
        const result = await this.runToolClarification(
          userInput,
          activeToolName,
          verificationResult.missingFields,
          intent,
          attemptsSoFar,
          toneInstructions,
          contextSnapshot,
        );
        return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
          reason: 'tool_clarify',
          tool: activeToolName,
          intent: intent.intent,
          intentConfidence: intent.confidence,
        });
      }

      Logger.debug(
        'pipeline',
        `Clarify requested for ${activeToolName} but confidence too low, falling back to strict answer`,
      );
      const result = await this.runNonToolAnswer(
        userInput,
        intent,
        attemptsSoFar,
        toneInstructions,
        personalityDescription,
        contextSnapshot,
      );
      return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
        reason: 'argument_verification_clarify_denied',
        tool: activeToolName,
        intent: intent.intent,
        intentConfidence: intent.confidence,
      });
    }

    if (this.shouldSkipToolExecution(tool.schema, toolArgs)) {
      Logger.debug(
        'pipeline',
        `Tool arguments are mostly null for ${activeToolName}, using strict answer instead`,
      );
      const result = await this.runNonToolAnswer(
        userInput,
        intent,
        attemptsSoFar,
        toneInstructions,
        personalityDescription,
        contextSnapshot,
      );
      return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
        reason: 'null_tool_arguments',
        tool: activeToolName,
        intent: intent.intent,
        intentConfidence: intent.confidence,
      });
    }

    Logger.debug('pipeline', `Executing tool: ${activeToolName}`, {
      args: toolArgs,
    });

    const toolResult = await this.executeAndFormatTool(
      activeToolName,
      tool,
      toolArgs,
      userInput,
      toneInstructions,
      intent,
      attemptsSoFar,
      pipelineStartMs,
      contextSnapshot,
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
      summary.intent = result.intent.intent;
      summary.intentConfidence = result.intent.confidence;
    }

    if (result.kind === 'tool') {
      summary.tool = summary.tool ?? result.tool;
      summary.args = result.args;
    }

    if (result.ok && result.evaluationAlert) {
      summary.evaluationAlert = summary.evaluationAlert ?? result.evaluationAlert;
    }

    if (result.kind === 'error' && result.error) {
      summary.error = summary.error ?? result.error;
    }

    Logger.info('pipeline', 'Pipeline summary', summary);
    return result;
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
    contextSnapshot?: ContextSnapshot,
  ): Promise<PipelineResult> {
    Logger.debug('pipeline', 'Running image recognition contract', {
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
      contextSnapshot,
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
      return {
        ok: false,
        kind: 'error',
        stage: 'image_recognition',
        attempts: result.attempts + attemptOffset,
      };
    }

    Logger.debug('pipeline', 'Image recognition completed successfully');
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
  ): Promise<DirectToolExecutionResult | null> {
    const directMatch = this.parseDirectToolRequest(userInput);
    if (!directMatch) {
      return null;
    }

    Logger.debug('pipeline', 'Direct tool command detected, bypassing contracts', {
      tool: directMatch.tool,
      reason: directMatch.reason,
    });

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
          contextSnapshot,
        );
      } else {
        summary = await this.summarizeToolResult(
          toolResult,
          LANGUAGE_FALLBACK,
          DEFAULT_PERSONALITY.toneInstructions,
          directMatch.tool,
          userInput,
          contextSnapshot,
        );
      }
      const evaluationText =
        typeof formattedResult === 'string'
          ? formattedResult
          : summary ?? this.stringifyToolResult(toolResult);
      const scoring = await this.runScoringEvaluation(
        `direct_tool.${directMatch.tool}`,
        evaluationText,
        userInput,
        this.formatReferenceContext(contextSnapshot, {
          toolName: directMatch.tool,
          toolArgs: directMatch.args,
        }),
        contextSnapshot,
      );
      return {
        result: {
          ok: true,
          kind: 'tool',
          tool: directMatch.tool,
          args: directMatch.args,
          result: formattedResult,
          summary,
          evaluation: scoring.evaluation,
          evaluationAlert: scoring.alert,
          intent: { intent: `tool.${directMatch.tool}`, confidence: 1 },
          language: LANGUAGE_FALLBACK,
          attempts: scoring.attempts,
        },
        metadata: {
          tool: directMatch.tool,
          reason: directMatch.reason,
        },
      };
    } catch (error) {
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

    const http = this.parseDirectHttpCommand(trimmed);
    if (http) {
      return http;
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

  private parseDirectHttpCommand(input: string): DirectToolMatch | null {
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
      tool: 'http',
      args: {
        url,
        method: 'GET',
        headers: null,
        body: null,
        queryParams: null,
        maxBytes: null,
        timeoutMs: null,
      },
      reason: 'direct_get_http',
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

  /**
   * Lightweight HTTP URL validator for direct commands.
   */
  private isHttpUrl(candidate: string): boolean {
    if (!candidate) {
      return false;
    }

    const value = candidate.trim();
    if (!value) {
      return false;
    }

    const tryParse = (raw: string): URL | null => {
      try {
        return new URL(raw);
      } catch {
        return null;
      }
    };

    const hasScheme = /^[a-zA-Z][a-zA-Z\d+-.]*:/.test(value);
    let parsed = tryParse(value);
    if (!parsed && !hasScheme) {
      const prefixed = value.startsWith('//') ? `https:${value}` : `https://${value}`;
      parsed = tryParse(prefixed);
    }

    if (!parsed) {
      return false;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const host = parsed.hostname;
    if (!host) {
      return false;
    }

    if (host === 'localhost') {
      return true;
    }

    return host.includes('.') || host.includes(':');
  }

  private extractPathCandidate(userInput: string): string | null {
    const tokens = userInput.split(/\s+/);
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (!token) {
        continue;
      }
      const unwrapped = this.stripWrappingQuotes(token.replace(/[?,]/g, ''));
      if (!unwrapped) {
        continue;
      }
      if (this.looksLikePath(unwrapped)) {
        return unwrapped;
      }
    }
    return null;
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

  private hasToolTrigger(userInput: string, toolName: ToolName): boolean {
    const triggers = TOOL_TRIGGERS[toolName];
    if (!triggers || triggers.length === 0) {
      return true;
    }

    const normalized = userInput.toLowerCase();
    for (let index = 0; index < triggers.length; index += 1) {
      const trigger = triggers[index];
      if (trigger && normalized.includes(trigger)) {
        return true;
      }
    }
    return false;
  }

  private meetsToolConfidence(confidence: number): boolean {
    return confidence >= MIN_TOOL_CONFIDENCE;
  }

  /**
   * Allows clarification only when tool intent confidence is very high.
   */
  private shouldClarifyToolArguments(
    intentConfidence: number,
    verification: ToolArgumentVerificationResult,
  ): boolean {
    return (
      verification.decision === 'clarify' &&
      intentConfidence >= MIN_CLARIFY_INTENT_CONFIDENCE &&
      verification.confidence >= MIN_CLARIFY_VERIFICATION_CONFIDENCE
    );
  }

  /**
   * Builds retry notes for tool-argument extraction based on verification feedback.
   */
  private buildVerificationNotes(verification: ToolArgumentVerificationResult): string {
    const notes: string[] = [];
    if (verification.reason) {
      notes.push(`Reason: ${verification.reason}`);
    }
    if (verification.missingFields && verification.missingFields.length > 0) {
      notes.push(`Missing fields: ${verification.missingFields.join(', ')}`);
    }
    if (verification.suggestedArgs && Object.keys(verification.suggestedArgs).length > 0) {
      notes.push(`Suggested args: ${JSON.stringify(verification.suggestedArgs)}`);
    }
    return notes.join('\n');
  }

  private validateToolArgsSchema(
    tool: ReturnType<typeof getToolDefinition>,
    args: Record<string, unknown>,
  ): { ok: true; value: Record<string, unknown> } | { ok: false; result: ToolArgumentVerificationResult } {
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
        decision: 'retry',
        confidence: 1,
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
    if (missingFields && missingFields.length > 0) {
      if (missingFields.length === 1 && missingFields[0] === 'path') {
        return 'Which path should I use?';
      }
      return `I can use the ${toolName} tool, but I need ${missingFields.join(', ')}.`;
    }

    return `I can use the ${toolName} tool for that, but I need a bit more detail.`;
  }

  /**
   * Runs a clarification response when a tool is clearly intended.
   */
  private async runToolClarification(
    userInput: string,
    toolName: ToolName,
    missingFields: string[] | undefined,
    intent: { intent: string; confidence: number },
    attempts: number,
    toneInstructions: string | undefined,
    contextSnapshot?: ContextSnapshot,
  ): Promise<PipelineResult> {
    const languageResult = await this.detectLanguage(userInput);
    const attemptOffset = languageResult.ok ? 0 : languageResult.attempts;
    const language = languageResult.language;
    const question = this.buildClarificationQuestion(toolName, missingFields);
    const formatted = await this.formatResponse(
      question,
      language,
      toneInstructions,
      userInput,
      toolName,
      question,
      contextSnapshot,
    );
    const scoring = await this.runScoringEvaluation(
      `tool.${toolName}.clarify`,
      formatted,
      userInput,
      this.formatReferenceContext(contextSnapshot, { toolName }),
      contextSnapshot,
    );
    return {
      ok: true,
      kind: 'strict_answer',
      value: formatted,
      evaluation: scoring.evaluation,
      evaluationAlert: scoring.alert,
      intent,
      language,
      attempts: attempts + attemptOffset + scoring.attempts,
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
    const toolArgStartMs = Date.now();
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
    );
    const toolArgDurationMs = measureDurationMs(toolArgStartMs);
    Logger.debug('pipeline', 'Tool argument extraction stage completed', {
      durationMs: toolArgDurationMs,
    });
    return toolArgResult;
  }

  /**
   * Verifies tool arguments with a dedicated verification contract.
   */
  private async verifyToolArguments(
    toolName: ToolName,
    description: string,
    schema: Record<string, FieldType>,
    userInput: string,
    extractedArgs: Record<string, unknown>,
    contextSnapshot?: ContextSnapshot,
  ) {
    const stageStartMs = Date.now();
    const prompt = this.orchestrator.buildToolArgumentVerificationPrompt(
      toolName,
      description,
      schema,
      userInput,
      extractedArgs,
      contextSnapshot,
    );
    const result = await this.runner.executeContract(
      'TOOL_ARGUMENT_VERIFICATION',
      prompt,
      (raw) => this.orchestrator.validateToolArgumentVerification(raw),
    );
    const durationMs = measureDurationMs(stageStartMs);
    Logger.debug('pipeline', 'Tool argument verification stage completed', {
      durationMs,
    });
    return result;
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
    language: DetectedLanguage;
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
        language: deriveDetectedLanguage(result.value),
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
    contextSnapshot?: ContextSnapshot,
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
        contextSnapshot,
      );
    }

    return this.runStrictAnswer(
      userInput,
      intent,
      attempts + attemptOffset,
      toneInstructions,
      language,
      contextSnapshot,
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
    language: DetectedLanguage,
    contextSnapshot?: ContextSnapshot,
  ): Promise<PipelineResult> {
    Logger.debug('pipeline', 'Running conversational answer contract');
    const stageStartMs = Date.now();
    const prompt = this.orchestrator.buildConversationalAnswerPrompt(
      userInput,
      toneInstructions,
      language,
      personalityDescription,
      contextSnapshot,
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
      );
    }

    Logger.debug('pipeline', 'Conversational answer generated successfully');
    const scoring = await this.runScoringEvaluation(
      'conversational_answer',
      result.value,
      userInput,
      this.formatReferenceContext(contextSnapshot),
      contextSnapshot,
    );
    return {
      ok: true,
      kind: 'strict_answer',
      value: result.value,
      evaluation: scoring.evaluation,
      evaluationAlert: scoring.alert,
      intent,
      language,
      attempts: attempts + result.attempts + scoring.attempts,
    };
  }

  private async runStrictAnswer(
    userInput: string,
    intent: { intent: string; confidence: number } | undefined,
    attempts: number,
    toneInstructions?: string,
    language?: DetectedLanguage,
    contextSnapshot?: ContextSnapshot,
  ): Promise<PipelineResult> {
    Logger.debug('pipeline', 'Running strict answer contract');
    const stageStartMs = Date.now();
    const prompt = this.orchestrator.buildStrictAnswerPrompt(
      userInput,
      toneInstructions,
      language,
      contextSnapshot,
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

    Logger.debug('pipeline', 'Strict answer generated successfully');
    const scoring = await this.runScoringEvaluation(
      'strict_answer',
      result.value,
      userInput,
      this.formatReferenceContext(contextSnapshot),
      contextSnapshot,
    );
    return {
      ok: true,
      kind: 'strict_answer',
      value: result.value,
      evaluation: scoring.evaluation,
      evaluationAlert: scoring.alert,
      intent,
      language: language ?? LANGUAGE_FALLBACK,
      attempts: attempts + result.attempts + scoring.attempts,
    };
  }

  /**
   * Optionally formats response text as a concise response in the user's language.
   * This is a best-effort operation; formatting failures do not block the result.
   */
  private async formatResponse(
    text: string,
    language: DetectedLanguage,
    toneInstructions: string | undefined,
    requestContext: string,
    toolName: ToolName,
    fallbackText?: string,
    contextSnapshot?: ContextSnapshot,
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
        contextSnapshot,
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
        Logger.debug('pipeline', 'Response formatted successfully');
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
    if (isHttpResponseResult(toolResult) && toolResult.status === 200) {
      return toolResult.content;
    }

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
  private buildPcInfoSummary(result: PcInfoSummary, language: DetectedLanguage): string {
    const isGerman = language.language.startsWith('de');
    const labels = isGerman
      ? {
          system: 'System',
          hostname: 'Hostname',
          uptime: 'Betriebszeit',
          platform: 'Plattform',
          cpu: 'CPU',
          memory: 'RAM',
          disk: 'Datenträger',
          usage: 'Auslastung',
          cores: 'Kerne',
          threads: 'Threads',
          free: 'Frei',
        }
      : {
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
   * Builds a compact reference context for scoring comparisons.
   */
  private formatReferenceContext(
    contextSnapshot?: ContextSnapshot,
    toolMeta?: { toolName?: ToolName; toolArgs?: Record<string, unknown> },
  ): string {
    if (!contextSnapshot && !toolMeta) {
      return 'Not provided.';
    }

    const payload = {
      ENVIRONMENT: contextSnapshot?.environment ?? {},
      STATE: contextSnapshot?.state ?? {},
      TOOL: toolMeta?.toolName
        ? {
            name: toolMeta.toolName,
            args: toolMeta.toolArgs ?? null,
          }
        : undefined,
    };

    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  }

  /**
   * Summarizes structured tool output using the response formatting contract.
   */
  private async summarizeToolResult(
    toolResult: unknown,
    language: DetectedLanguage,
    toneInstructions: string | undefined,
    toolName: ToolName,
    userInput: string,
    contextSnapshot?: ContextSnapshot,
  ): Promise<string> {
    if (toolName === 'pcinfo' && isPcInfoSummary(toolResult)) {
      return this.buildPcInfoSummary(toolResult, language);
    }

    const payload = this.stringifyToolResult(toolResult);
    const fallback = `Tool ${toolName} output is ready. Raw data below.`;
    const summaryContext = `User question: ${userInput}`;
    return this.formatResponse(
      payload,
      language,
      toneInstructions,
      summaryContext,
      toolName,
      fallback,
      contextSnapshot,
    );
  }

  private async runScoringEvaluation(
    label: string,
    text: string,
    userGoal?: string,
    referenceContext?: string,
    contextSnapshot?: ContextSnapshot,
  ): Promise<{ evaluation?: Record<string, number>; attempts: number; alert?: EvaluationAlert }> {
    if (!text || !text.trim()) {
      return { attempts: 0 };
    }

    Logger.debug('pipeline', 'Running scoring contract', { stage: label });
    const stageStartMs = Date.now();
    try {
      const prompt = this.orchestrator.buildScoringPrompt(
        text,
        userGoal,
        referenceContext,
        contextSnapshot,
      );
      const result = await this.runner.executeContract(
        'SCORING_EVALUATION',
        prompt,
        (raw) => this.orchestrator.validateScoring(raw),
      );
      const durationMs = measureDurationMs(stageStartMs);
      Logger.debug('pipeline', 'Scoring stage completed', {
        stage: label,
        durationMs,
        attempts: result.attempts,
      });

      if (result.ok) {
        Logger.debug('pipeline', 'Scoring evaluation succeeded', { stage: label });
        const evaluation = result.value;
        const hasLowScore = Object.values(evaluation).some(
          (score) => typeof score === 'number' && score < LOW_SCORE_THRESHOLD,
        );
        return {
          evaluation,
          attempts: result.attempts,
          alert: hasLowScore ? 'low_scores' : undefined,
        };
      }

      Logger.warn('pipeline', 'Scoring evaluation failed', {
        stage: label,
        attempts: result.attempts,
        history: result.history,
      });
      return { attempts: result.attempts, alert: 'scoring_failed' };
    } catch (error) {
      const durationMs = measureDurationMs(stageStartMs);
      Logger.error('pipeline', 'Scoring evaluation error', {
        stage: label,
        error,
        durationMs,
      });
      return { attempts: 0, alert: 'scoring_failed' };
    }
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
    contextSnapshot?: ContextSnapshot,
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

    const languageAttemptOffset = languageResult.ok ? 0 : languageResult.attempts;
    const language = languageResult.ok
      ? deriveDetectedLanguage(languageResult.value)
      : LANGUAGE_FALLBACK;

    if (!toolExecResult.ok) {
      Logger.error('pipeline', `Tool ${toolName} execution failed`, toolExecResult.error);
      return {
        ok: false,
        kind: 'error',
        stage: 'tool_execution',
        attempts: baseAttempts + languageAttemptOffset,
        error: this.buildToolError(toolExecResult.error),
      };
    }

    const toolResult = toolExecResult.result;
    Logger.debug('pipeline', `Tool ${toolName} executed successfully`);
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
        contextSnapshot,
      );
    } else {
      summary = await this.summarizeToolResult(
        toolResult,
        language,
        toneInstructions,
        toolName,
        userInput,
        contextSnapshot,
      );
    }
    const evaluationText =
      typeof formattedResult === 'string'
        ? formattedResult
        : summary ?? this.stringifyToolResult(toolResult);
    const scoring = await this.runScoringEvaluation(
      `tool.${toolName}`,
      evaluationText,
      userInput,
      this.formatReferenceContext(contextSnapshot, { toolName, toolArgs: args }),
      contextSnapshot,
    );
    const durationMs = measureDurationMs(pipelineStartMs);
    Logger.debug('pipeline', 'Pipeline completed (tool execution)', {
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
      evaluation: scoring.evaluation,
      evaluationAlert: scoring.alert,
      intent,
      language,
      attempts:
        baseAttempts + languageAttemptOffset + scoring.attempts,
    };
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
