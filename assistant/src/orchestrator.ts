import { renderTemplate } from './helpers.js';
import { buildContextBlock, type ContextSnapshot } from './context.js';
import { CONTRACTS } from './contracts/registry.js';
import {
  type IntentClassificationResult,
  validateIntentClassification,
} from './contracts/intent.classification.js';
import {
  validateToolArguments,
} from './contracts/tool.argument.extraction.js';
import {
  type ToolArgumentVerificationResult,
  validateToolArgumentVerification,
} from './contracts/tool.argument.verification.js';
import { validateTextTransformation } from './contracts/text.transformation.js';
import { validateScoring } from './contracts/scoring.evaluation.js';
import { validateStrictAnswer } from './contracts/strict.answer.js';
import { validateConversationalAnswer } from './contracts/conversational.answer.js';
import { validateResponseFormatting } from './contracts/response.formatting.js';
import { validateLanguageDetection } from './contracts/language.detection.js';
import { validateImageRecognition } from './contracts/image.recognition.js';
import {
  GENERAL_ANSWER_INTENT,
  CONVERSATION_INTENT,
  TOOLS,
} from './tools/registry.js';
import type {
  ContractMode,
  ContractWithExtras,
  FieldType,
} from './contracts/definition.js';
import type { ValidationResult } from './types.js';

export type ContractName = keyof typeof CONTRACTS;

export type ContractPrompt = {
  contractName: ContractName;
  model: string;
  mode: ContractMode;
  systemPrompt?: string;
  userPrompt?: string;
  rawPrompt?: string;
  retries?: Record<number, string>;
  expectsJson?: boolean;
  images?: string[];
};

export type ToolSchema = Record<string, FieldType>;

type ContractEntry = ContractWithExtras;

/**
 * Cached tool reference string to avoid per-request allocation.
 */
let toolReferenceCache: string | null = null;

/**
 * Cached formatted tool schemas to avoid per-request allocation.
 */
const toolSchemaCache = new Map<string, string>();

/**
 * Lightweight orchestrator that renders prompts and exposes validators for each contract.
 */
export class Orchestrator {
  private readonly contractRegistry = CONTRACTS;

  private buildPrompt(
    contractName: ContractName,
    context: Record<string, string> = {},
    contextSnapshot?: ContextSnapshot,
  ): ContractPrompt {
    const contract = this.getContractEntry(contractName);
    const mode = contract.MODE ?? 'chat';
    const promptContext = {
      ...context,
      CONTEXT_BLOCK: this.formatContextBlock(contextSnapshot),
    };

    if (mode === 'raw') {
      const legacyPrompt = [contract.SYSTEM_PROMPT, contract.USER_PROMPT]
        .filter(Boolean)
        .join('\n\n');
      const template = contract.PROMPT ?? legacyPrompt;
      const rawPrompt = template ? renderTemplate(template, promptContext) : '';
      return {
        contractName,
        model: this.resolveModel(contractName),
        mode,
        rawPrompt,
        retries: contract.RETRIES,
        expectsJson: contract.EXPECTS_JSON,
      };
    }

    const systemPrompt = contract.SYSTEM_PROMPT
      ? renderTemplate(contract.SYSTEM_PROMPT, promptContext)
      : '';
    const userPrompt = contract.USER_PROMPT
      ? renderTemplate(contract.USER_PROMPT, promptContext)
      : undefined;

    return {
      contractName,
      model: this.resolveModel(contractName),
      mode,
      systemPrompt,
      userPrompt,
      retries: contract.RETRIES,
      expectsJson: contract.EXPECTS_JSON,
    };
  }

  private getContractEntry(contractName: ContractName): ContractEntry {
    return this.contractRegistry[contractName] as ContractEntry;
  }

  private resolveModel(contractName: ContractName): string {
    return this.getContractEntry(contractName).MODEL;
  }

  private normalize(text: string): string {
    return text.trim();
  }

  /**
   * Renders a stable context block for prompt injection.
   */
  private formatContextBlock(snapshot?: ContextSnapshot): string {
    if (!snapshot) {
      return '';
    }

    return buildContextBlock(snapshot);
  }

  /**
   * Ensures tone instructions are injected as an optional leading block.
   */
  private formatToneInstructions(toneInstructions?: string): string {
    if (!toneInstructions) {
      return '';
    }

    const normalized = toneInstructions.trim();
    if (!normalized) {
      return '';
    }

    return `${normalized}\n`;
  }

  private formatToolSchema(schema: ToolSchema): string {
    // Create a cache key from schema keys + types for lightweight lookup
    const schemaKeyStr = Object.entries(schema)
      .map(([key, type]) => ({ key, type }))
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((entry) => `${entry.key}:${entry.type}`)
      .join('|');
    const cached = toolSchemaCache.get(schemaKeyStr);
    if (cached !== undefined) {
      return cached;
    }

    const formatted = JSON.stringify(schema, undefined, 2);
    toolSchemaCache.set(schemaKeyStr, formatted);
    return formatted;
  }

  private formatToolReference(): string {
    if (toolReferenceCache !== null) {
      return toolReferenceCache;
    }

    const toolEntries = Object.entries(TOOLS);
    const lines: string[] = [];

    for (let index = 0; index < toolEntries.length; index += 1) {
      const entry = toolEntries[index];
      if (!entry) {
        continue;
      }
      const [name, tool] = entry;
      const description = this.compactToolDescription(tool.description);
      if (!description) {
        continue;
      }
      lines.push(`- tool.${name}: ${description}`);
    }

    lines.push(
      `- ${GENERAL_ANSWER_INTENT}: Use only when NO tool applies. For general knowledge, coding help, or complex reasoning.`,
    );
    lines.push(
      `- ${CONVERSATION_INTENT}: Small talk, greetings, or thanks only.`,
    );

    const formatted = lines.join('\n');
    toolReferenceCache = formatted;
    return formatted;
  }

  /**
   * Shortens tool descriptions for routing prompts (removes examples).
   */
  private compactToolDescription(description: string): string {
    const trimmed = description.trim();
    if (!trimmed) {
      return '';
    }

    const exampleIndex = trimmed.search(/\n\s*Examples?:/i);
    const withoutExamples = exampleIndex >= 0
      ? trimmed.slice(0, exampleIndex).trim()
      : trimmed;
    const firstParagraph = withoutExamples.split(/\n\s*\n/)[0]?.trim() ?? withoutExamples;
    return firstParagraph.replace(/\s+/g, ' ').trim();
  }

  public buildIntentClassificationPrompt(
    userInput: string,
    contextSnapshot?: ContextSnapshot,
    modelOverride?: string,
  ): ContractPrompt {
    const prompt = this.buildPrompt('INTENT_CLASSIFICATION', {
      USER_INPUT: this.normalize(userInput),
      TOOL_REFERENCE: this.formatToolReference(),
    }, contextSnapshot);
    if (!modelOverride) {
      return prompt;
    }

    return {
      ...prompt,
      model: modelOverride,
    };
  }

  public buildLanguageDetectionPrompt(userInput: string): ContractPrompt {
    return this.buildPrompt('LANGUAGE_DETECTION', {
      USER_INPUT: this.normalize(userInput),
    });
  }

  public buildToolArgumentPrompt(
    toolName: string,
    description: string,
    schema: ToolSchema,
    userInput: string,
    verifierNotes?: string,
    contextSnapshot?: ContextSnapshot,
  ): ContractPrompt {
    const normalizedInput = this.normalize(userInput);
    const normalizedNotes = verifierNotes?.trim();
    const searchGuidance = toolName === 'search'
      ? 'Tool-specific guidance: queries are filenames or patterns, not full paths. Do not convert explicit paths into query globs. Use provided paths as baseDir/startPath when present.'
      : null;
    const cwdGuidance = toolName === 'filesystem'
      ? 'Tool-specific guidance: if no path is provided, use ENVIRONMENT.cwd from CONTEXT. Resolve relative paths against ENVIRONMENT.cwd.'
      : toolName === 'search'
        ? 'Tool-specific guidance: baseDir defaults to ENVIRONMENT.cwd when missing. Resolve relative baseDir against ENVIRONMENT.cwd. startPath must be relative to baseDir; if an absolute path is provided, set baseDir to it and startPath to null.'
        : null;
    const parts = [normalizedInput];
    if (searchGuidance) {
      parts.push(searchGuidance);
    }
    if (cwdGuidance) {
      parts.push(cwdGuidance);
    }
    if (normalizedNotes) {
      parts.push(`Verifier notes:\n${normalizedNotes}`);
    }
    const inputWithNotes = parts.join('\n\n');
    return this.buildPrompt('TOOL_ARGUMENT_EXTRACTION', {
      TOOL_NAME: toolName,
      TOOL_DESCRIPTION: description,
      TOOL_SCHEMA: this.formatToolSchema(schema),
      USER_INPUT: inputWithNotes,
    }, contextSnapshot);
  }

  /**
   * Builds a prompt to verify extracted tool arguments against user intent.
   */
  public buildToolArgumentVerificationPrompt(
    toolName: string,
    description: string,
    schema: ToolSchema,
    userInput: string,
    extractedArgs: Record<string, unknown>,
    contextSnapshot?: ContextSnapshot,
  ): ContractPrompt {
    return this.buildPrompt('TOOL_ARGUMENT_VERIFICATION', {
      TOOL_NAME: toolName,
      TOOL_DESCRIPTION: description,
      TOOL_SCHEMA: this.formatToolSchema(schema),
      USER_INPUT: this.normalize(userInput),
      EXTRACTED_ARGS: this.formatToolArguments(extractedArgs),
    }, contextSnapshot);
  }

  public buildTextTransformationPrompt(
    text: string,
    contextSnapshot?: ContextSnapshot,
  ): ContractPrompt {
    const contract = this.contractRegistry.TEXT_TRANSFORMATION;
    return this.buildPrompt('TEXT_TRANSFORMATION', {
      RULES: contract.RULES,
      TEXT: this.normalize(text),
    }, contextSnapshot);
  }

  public buildScoringPrompt(
    text: string,
    userGoal?: string,
    referenceContext?: string,
    contextSnapshot?: ContextSnapshot,
  ): ContractPrompt {
    const contract = this.contractRegistry.SCORING_EVALUATION;
    return this.buildPrompt('SCORING_EVALUATION', {
      CRITERIA: contract.CRITERIA,
      TEXT: this.normalize(text),
      USER_GOAL: userGoal?.trim() || 'Not provided.',
      REFERENCE_CONTEXT: referenceContext?.trim() || 'Not provided.',
    }, contextSnapshot);
  }

  public buildStrictAnswerPrompt(
    question: string,
    toneInstructions?: string,
    language?: { language: string; name: string },
    contextSnapshot?: ContextSnapshot,
  ): ContractPrompt {
    return this.buildPrompt('STRICT_ANSWER', {
      QUESTION: this.normalize(question),
      TONE_INSTRUCTIONS: this.formatToneInstructions(toneInstructions),
      LANGUAGE: language?.name ?? 'Unknown',
    }, contextSnapshot);
  }

  /**
   * Builds a prompt for short conversational replies.
   */
  public buildConversationalAnswerPrompt(
    userInput: string,
    toneInstructions?: string,
    language?: { language: string; name: string },
    personalityDescription?: string,
    contextSnapshot?: ContextSnapshot,
  ): ContractPrompt {
    return this.buildPrompt('CONVERSATIONAL_ANSWER', {
      USER_INPUT: this.normalize(userInput),
      TONE_INSTRUCTIONS: this.formatToneInstructions(toneInstructions),
      LANGUAGE: language?.name ?? 'Unknown',
      PERSONALITY_DESCRIPTION: personalityDescription?.trim() ?? 'Not specified.',
    }, contextSnapshot);
  }

  public buildResponseFormattingPrompt(
    response: string,
    language: { language: string; name: string },
    toneInstructions?: string,
    requestContext?: string,
    toolName?: string,
    contextSnapshot?: ContextSnapshot,
  ): ContractPrompt {
    return this.buildPrompt('RESPONSE_FORMATTING', {
      RESPONSE: this.normalize(response),
      LANGUAGE: language.name,
      TONE_INSTRUCTIONS: this.formatToneInstructions(toneInstructions),
      REQUEST_CONTEXT: requestContext ? this.normalize(requestContext) : 'Not provided.',
      TOOL_NAME: toolName ?? 'Not specified',
    }, contextSnapshot);
  }

  /**
   * Builds a prompt for analyzing attached image(s).
   */
  public buildImageRecognitionPrompt(
    userInput: string,
    imageCount: number,
    toneInstructions?: string,
    language?: { language: string; name: string },
    contextSnapshot?: ContextSnapshot,
  ): ContractPrompt {
    const normalized = this.normalize(userInput);
    return this.buildPrompt('IMAGE_RECOGNITION', {
      USER_INPUT: normalized || 'No additional question provided.',
      IMAGE_COUNT: String(imageCount),
      TONE_INSTRUCTIONS: this.formatToneInstructions(toneInstructions),
      LANGUAGE: language?.name ?? 'Unknown',
    }, contextSnapshot);
  }

  /**
   * Builds a single compiled contract prompt by name with sensible defaults.
   * Optional `options` let callers supply sample inputs for prompts that require them.
   */
  public buildCompiledContract(
    contractName: ContractName,
    options?: {
      userInput?: string;
      response?: string;
      language?: { language: string; name: string };
      imageCount?: number;
      verifierNotes?: string;
      extractedArgs?: Record<string, unknown>;
      toolName?: string;
      toolDescription?: string;
      toolSchema?: ToolSchema;
      contextSnapshot?: ContextSnapshot;
    },
  ): ContractPrompt {
    const opts = options ?? {};
    switch (contractName) {
      case 'INTENT_CLASSIFICATION':
        return this.buildIntentClassificationPrompt(opts.userInput ?? 'Show me README.md', opts.contextSnapshot);
      case 'LANGUAGE_DETECTION':
        return this.buildLanguageDetectionPrompt(opts.userInput ?? 'Bonjour');
      case 'TOOL_ARGUMENT_EXTRACTION': {
        const tool = (TOOLS as any)[opts.toolName ?? 'filesystem'];
        const desc = opts.toolDescription ?? tool?.description ?? '';
        const schema = (opts.toolSchema as ToolSchema) ?? tool?.schema ?? {};
        return this.buildToolArgumentPrompt(opts.toolName ?? 'filesystem', desc, schema, opts.userInput ?? 'Read ./README.md', opts.verifierNotes, opts.contextSnapshot);
      }
      case 'TOOL_ARGUMENT_VERIFICATION': {
        const tool = (TOOLS as any)[opts.toolName ?? 'filesystem'];
        const desc = opts.toolDescription ?? tool?.description ?? '';
        const schema = (opts.toolSchema as ToolSchema) ?? tool?.schema ?? {};
        const extracted = opts.extractedArgs ?? { action: 'read', path: './README.md', limit: null, maxBytes: null };
        return this.buildToolArgumentVerificationPrompt(opts.toolName ?? 'filesystem', desc, schema, opts.userInput ?? 'Read ./README.md', extracted, opts.contextSnapshot);
      }
      case 'TEXT_TRANSFORMATION':
        return this.buildTextTransformationPrompt(opts.userInput ?? 'Fix this text', opts.contextSnapshot);
      case 'SCORING_EVALUATION':
        return this.buildScoringPrompt(opts.response ?? 'Sample output', opts.userInput ?? 'Sample goal', opts.response ?? 'Sample context', opts.contextSnapshot);
      case 'STRICT_ANSWER':
        return this.buildStrictAnswerPrompt(opts.userInput ?? 'What is MANTIS?', undefined, opts.language, opts.contextSnapshot);
      case 'CONVERSATIONAL_ANSWER':
        return this.buildConversationalAnswerPrompt(opts.userInput ?? 'Hi there', undefined, opts.language, undefined, opts.contextSnapshot);
      case 'RESPONSE_FORMATTING':
        return this.buildResponseFormattingPrompt(opts.response ?? 'Here is a response', opts.language ?? { language: 'en', name: 'English' }, undefined, undefined, opts.toolName, opts.contextSnapshot);
      case 'IMAGE_RECOGNITION':
        return this.buildImageRecognitionPrompt(opts.userInput ?? 'Describe the image', opts.imageCount ?? 1, undefined, opts.language, opts.contextSnapshot);
      default:
        return this.buildPrompt(contractName);
    }
  }
  public getRetryInstruction(
    contractName: ContractName,
    attempt: number,
  ): string | undefined {
    return this.getContractEntry(contractName).RETRIES?.[attempt];
  }

  public validateIntentClassification(
    raw: string,
  ): ValidationResult<IntentClassificationResult> {
    return validateIntentClassification(raw);
  }

  public validateToolArguments(
    raw: string,
    schema: ToolSchema,
  ): ValidationResult<Record<string, unknown>> {
    return validateToolArguments(schema)(raw);
  }

  /**
   * Validates tool-argument verification output.
   */
  public validateToolArgumentVerification(
    raw: string,
  ): ValidationResult<ToolArgumentVerificationResult> {
    return validateToolArgumentVerification(raw);
  }

  public validateTextTransformation(raw: string): ValidationResult<string> {
    return validateTextTransformation(raw);
  }

  public validateScoring(
    raw: string,
  ): ValidationResult<Record<string, number>> {
    return validateScoring(raw);
  }

  public validateLanguageDetection(
    raw: string,
  ): ValidationResult<string> {
    return validateLanguageDetection(raw);
  }

  public validateStrictAnswer(raw: string): ValidationResult<string> {
    return validateStrictAnswer(raw);
  }

  public validateConversationalAnswer(raw: string): ValidationResult<string> {
    return validateConversationalAnswer(raw);
  }

  public validateResponseFormatting(
    raw: string,
  ): ValidationResult<string> {
    return validateResponseFormatting(raw);
  }

  public validateImageRecognition(raw: string): ValidationResult<string> {
    return validateImageRecognition(raw);
  }

  /**
   * Formats tool arguments for deterministic prompt inclusion.
   */
  private formatToolArguments(args: Record<string, unknown>): string {
    try {
      return JSON.stringify(args, null, 2);
    } catch {
      return String(args);
    }
  }

}
