import type { Orchestrator } from './orchestrator.js';
import type { Runner } from './runner.js';
import {
  TOOLS,
  GENERAL_ANSWER_INTENT,
  CONVERSATION_INTENT,
  getToolDefinition,
  type ToolName,
} from './tools/registry.js';
import type { FieldType } from './contracts/definition.js';
import { Logger } from './logger.js';
import { DEFAULT_PERSONALITY } from './personality.js';

const TOOL_INTENT_PREFIX = 'tool.';
const MIN_TOOL_CONFIDENCE = 0.6;
const REQUIRED_NULL_RATIO_THRESHOLD = 0.5;
const LOW_SCORE_THRESHOLD = 4;

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

const TOOL_TRIGGERS: Record<ToolName, string[]> = {
  clipboard: ['clipboard', 'copy', 'paste', 'clipboard text', 'clip'],
  filesystem: ['file', 'read', 'list', 'ls', 'dir', 'cat', 'tree'],
  search: ['search', 'lookup', 'find', 'google', 'bing', 'look up'],
  fetch: ['fetch', 'download', 'get', 'grab'],
  http: ['http', 'curl', 'post', 'request', 'headers', 'status'],
  process: ['ps', 'process', 'task', 'processes', 'running processes'],
  shell: ['run', 'execute', 'shell', 'command', 'script'],
  pcinfo: ['pc', 'system', 'info', 'spec', 'hardware', 'configuration'],
};

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
  | 'trigger_guard'
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
  public async run(userInput: string, attachments?: ImageAttachment[]): Promise<PipelineResult> {
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
      );
      return this.completePipeline(result, 'image_recognition', pipelineStartMs, {
        imageCount: imageAttachments.length,
      });
    }

    const directTool = await this.tryRunDirectTool(userInput);
    if (directTool) {
      return this.completePipeline(directTool.result, 'direct_tool', pipelineStartMs, {
        tool: directTool.metadata.tool,
        reason: directTool.metadata.reason,
      });
    }

    const toneInstructions = DEFAULT_PERSONALITY.toneInstructions;
    const personalityDescription = DEFAULT_PERSONALITY.description;
    Logger.debug('pipeline', 'Using predefined MANTIS tone instructions');
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

    if (!intentResult.ok) {
      Logger.warn('pipeline', 'Intent classification failed, falling back to strict answer');
      const result = await this.runNonToolAnswer(
        userInput,
        undefined,
        intentResult.attempts,
        toneInstructions,
        personalityDescription,
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
      );
      return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
        reason: 'tool_not_found',
        intent: intent.intent,
        intentConfidence: intent.confidence,
      });
    }

    if (!this.hasExplicitToolTrigger(userInput, toolName)) {
      Logger.debug(
        'pipeline',
        `Tool intent ${toolName} lacked an explicit trigger, falling back to non-tool answer`,
      );
      const result = await this.runNonToolAnswer(
        userInput,
        intent,
        intentResult.attempts,
        toneInstructions,
        personalityDescription,
      );
      return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
        reason: 'trigger_guard',
        tool: toolName,
        intent: intent.intent,
        intentConfidence: intent.confidence,
      });
    }

    const tool = getToolDefinition(toolName);
    const schemaKeys = Object.keys(tool.schema);
    if (schemaKeys.length === 0) {
      Logger.debug('pipeline', `Executing tool: ${toolName} (no arguments)`);
      const toolResult = await this.executeAndFormatTool(
        toolName,
        tool,
        {},
        userInput,
        toneInstructions,
        intent,
        intentResult.attempts,
        pipelineStartMs,
      );
      return this.completePipeline(toolResult, 'tool_execution', pipelineStartMs, {
        tool: toolName,
        reason: 'no_arguments',
      });
    }

    Logger.debug('pipeline', `Extracting arguments for tool: ${toolName}`);
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
      );
      return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
        reason: 'argument_extraction_failed',
        tool: toolName,
        intent: intent.intent,
        intentConfidence: intent.confidence,
      });
    }

    if (this.shouldSkipToolExecution(tool.schema, toolArgResult.value)) {
      Logger.debug(
        'pipeline',
        `Tool arguments are mostly null for ${toolName}, using strict answer instead`,
      );
      const result = await this.runNonToolAnswer(
        userInput,
        intent,
        intentResult.attempts + toolArgResult.attempts,
        toneInstructions,
        personalityDescription,
      );
      return this.completePipeline(result, 'strict_answer', pipelineStartMs, {
        reason: 'null_tool_arguments',
        tool: toolName,
        intent: intent.intent,
        intentConfidence: intent.confidence,
      });
    }

    Logger.debug('pipeline', `Executing tool: ${toolName}`, {
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
    );
    return this.completePipeline(toolResult, 'tool_execution', pipelineStartMs, {
      tool: toolName,
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
        );
      } else {
        summary = await this.summarizeToolResult(
          toolResult,
          LANGUAGE_FALLBACK,
          DEFAULT_PERSONALITY.toneInstructions,
          directMatch.tool,
        );
      }
      const evaluationText =
        typeof formattedResult === 'string'
          ? formattedResult
          : summary ?? this.stringifyToolResult(toolResult);
      const scoring = await this.runScoringEvaluation(
        `direct_tool.${directMatch.tool}`,
        evaluationText,
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

  private hasExplicitToolTrigger(userInput: string, toolName: ToolName): boolean {
    const triggers = TOOL_TRIGGERS[toolName];
    if (!triggers || triggers.length === 0) {
      return true;
    }
    const normalized = userInput.trim().toLowerCase();

    for (let index = 0; index < triggers.length; index += 1) {
      const keyword = triggers[index];
      if (!keyword) {
        continue;
      }
      if (normalized.includes(keyword)) {
        return true;
      }
    }

    return false;
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
      );
    }

    return this.runStrictAnswer(
      userInput,
      intent,
      attempts + attemptOffset,
      toneInstructions,
      language,
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
  ): Promise<PipelineResult> {
    Logger.debug('pipeline', 'Running conversational answer contract');
    const stageStartMs = Date.now();
    const prompt = this.orchestrator.buildConversationalAnswerPrompt(
      userInput,
      toneInstructions,
      language,
      personalityDescription,
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
    const scoring = await this.runScoringEvaluation('conversational_answer', result.value);
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
  ): Promise<PipelineResult> {
    Logger.debug('pipeline', 'Running strict answer contract');
    const stageStartMs = Date.now();
    const prompt = this.orchestrator.buildStrictAnswerPrompt(
      userInput,
      toneInstructions,
      language,
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
    const scoring = await this.runScoringEvaluation('strict_answer', result.value);
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
    language: DetectedLanguage,
    toneInstructions: string | undefined,
    toolName: ToolName,
  ): Promise<string> {
    const payload = this.stringifyToolResult(toolResult);
    const fallback = `Tool ${toolName} output is ready. Raw data below.`;
    const summaryContext = `Tool ${toolName} output only.`;
    return this.formatResponse(
      payload,
      language,
      toneInstructions,
      summaryContext,
      toolName,
      fallback,
    );
  }

  private async runScoringEvaluation(
    label: string,
    text: string,
  ): Promise<{ evaluation?: Record<string, number>; attempts: number; alert?: EvaluationAlert }> {
    if (!text || !text.trim()) {
      return { attempts: 0 };
    }

    Logger.debug('pipeline', 'Running scoring contract', { stage: label });
    const stageStartMs = Date.now();
    try {
      const prompt = this.orchestrator.buildScoringPrompt(text);
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
      );
    } else {
      summary = await this.summarizeToolResult(
        toolResult,
        language,
        toneInstructions,
        toolName,
      );
    }
    const evaluationText =
      typeof formattedResult === 'string'
        ? formattedResult
        : summary ?? this.stringifyToolResult(toolResult);
    const scoring = await this.runScoringEvaluation(`tool.${toolName}`, evaluationText);
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
