import { toUnorderedList, renderTemplate } from './helpers.js';
import { CONTRACTS } from './contracts/registry.js';
import {
  validateIntentClassification,
} from './contracts/intent.classification.js';
import {
  validateToolArguments,
} from './contracts/tool.argument.extraction.js';
import { validateTextTransformation } from './contracts/text.transformation.js';
import { validateScoring } from './contracts/scoring.evaluation.js';
import { validateStrictAnswer } from './contracts/strict.answer.js';
import { validateConversationalAnswer } from './contracts/conversational.answer.js';
import { validateResponseFormatting } from './contracts/response.formatting.js';
import { validateErrorChannel } from './contracts/error.channel.js';
import { validateLanguageDetection } from './contracts/language.detection.js';
import {
  GENERAL_ANSWER_INTENT,
  CONVERSATION_INTENT,
  TOOLS,
  getToolIntents,
} from './tools/registry.js';
import type {
  ContractWithExtras,
  FieldType,
} from './contracts/definition.js';
import type { ValidationResult } from './types.js';

export type ContractName = keyof typeof CONTRACTS;

export type ContractPrompt = {
  contractName: ContractName;
  model: string;
  systemPrompt: string;
  userPrompt?: string;
  retries?: Record<number, string>;
  expectsJson?: boolean;
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
  ): ContractPrompt {
    const contract = this.getContractEntry(contractName);
    const systemPrompt = renderTemplate(contract.SYSTEM_PROMPT, context);
    const userPrompt = contract.USER_PROMPT
      ? renderTemplate(contract.USER_PROMPT, context)
      : undefined;

    return {
      contractName,
      model: contract.MODEL,
      systemPrompt,
      userPrompt,
      retries: contract.RETRIES,
      expectsJson: contract.EXPECTS_JSON,
    };
  }

  private getContractEntry(contractName: ContractName): ContractEntry {
    return this.contractRegistry[contractName] as ContractEntry;
  }

  private normalize(text: string): string {
    return text.trim();
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
    // Create a cache key from schema keys for lightweight lookup
    const schemaKeyStr = Object.keys(schema).sort().join('|');
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
      const [name, tool] = toolEntries[index];
      lines.push(`- tool.${name}: ${tool.description}`);
    }

    lines.push(
      `- ${GENERAL_ANSWER_INTENT}: General Q&A or instructions when no tool action is required.`,
    );
    lines.push(
      `- ${CONVERSATION_INTENT}: Short conversational or social responses without tool usage.`,
    );

    const formatted = lines.join('\n');
    toolReferenceCache = formatted;
    return formatted;
  }

  public buildIntentClassificationPrompt(
    userInput: string,
    allowedIntents: string[] = getToolIntents(),
  ): ContractPrompt {
    return this.buildPrompt('INTENT_CLASSIFICATION', {
      USER_INPUT: this.normalize(userInput),
      ALLOWED_INTENTS: toUnorderedList(allowedIntents),
      TOOL_REFERENCE: this.formatToolReference(),
    });
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
  ): ContractPrompt {
    return this.buildPrompt('TOOL_ARGUMENT_EXTRACTION', {
      TOOL_NAME: toolName,
      TOOL_DESCRIPTION: description,
      TOOL_SCHEMA: this.formatToolSchema(schema),
      USER_INPUT: this.normalize(userInput),
    });
  }

  public buildTextTransformationPrompt(text: string): ContractPrompt {
    const contract = this.contractRegistry.TEXT_TRANSFORMATION;
    return this.buildPrompt('TEXT_TRANSFORMATION', {
      RULES: contract.RULES,
      TEXT: this.normalize(text),
    });
  }

  public buildScoringPrompt(text: string): ContractPrompt {
    const contract = this.contractRegistry.SCORING_EVALUATION;
    return this.buildPrompt('SCORING_EVALUATION', {
      CRITERIA: contract.CRITERIA,
      TEXT: this.normalize(text),
    });
  }

  public buildStrictAnswerPrompt(
    question: string,
    toneInstructions?: string,
    language?: { language: string; name: string },
  ): ContractPrompt {
    return this.buildPrompt('STRICT_ANSWER', {
      QUESTION: this.normalize(question),
      TONE_INSTRUCTIONS: this.formatToneInstructions(toneInstructions),
      LANGUAGE: language?.name ?? 'Unknown',
    });
  }

  /**
   * Builds a prompt for short conversational replies.
   */
  public buildConversationalAnswerPrompt(
    userInput: string,
    toneInstructions?: string,
    language?: { language: string; name: string },
    personalityDescription?: string,
  ): ContractPrompt {
    return this.buildPrompt('CONVERSATIONAL_ANSWER', {
      USER_INPUT: this.normalize(userInput),
      TONE_INSTRUCTIONS: this.formatToneInstructions(toneInstructions),
      LANGUAGE: language?.name ?? 'Unknown',
      PERSONALITY_DESCRIPTION: personalityDescription?.trim() ?? 'Not specified.',
    });
  }

  public buildResponseFormattingPrompt(
    response: string,
    language: { language: string; name: string },
    toneInstructions?: string,
    requestContext?: string,
    toolName?: string,
  ): ContractPrompt {
    return this.buildPrompt('RESPONSE_FORMATTING', {
      RESPONSE: this.normalize(response),
      LANGUAGE: language.name,
      TONE_INSTRUCTIONS: this.formatToneInstructions(toneInstructions),
      REQUEST_CONTEXT: requestContext ? this.normalize(requestContext) : 'Not provided.',
      TOOL_NAME: toolName ?? 'Not specified',
    });
  }

  public buildErrorChannelPrompt(
    stage: string,
    errorContext?: string,
  ): ContractPrompt {
    return this.buildPrompt('ERROR_CHANNEL', {
      STAGE: stage,
      ERROR_CONTEXT: errorContext ?? 'No additional context available',
    });
  }

  public getRetryInstruction(
    contractName: ContractName,
    attempt: number,
  ): string | undefined {
    return this.getContractEntry(contractName).RETRIES?.[attempt];
  }

  public validateIntentClassification(
    raw: string,
  ): ValidationResult<{ intent: string; confidence: number }> {
    return validateIntentClassification(raw);
  }

  public validateToolArguments(
    raw: string,
    schema: ToolSchema,
  ): ValidationResult<Record<string, unknown>> {
    return validateToolArguments(schema)(raw);
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
  ): ValidationResult<{ language: string; name: string }> {
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

  public validateErrorChannel(raw: string): ValidationResult<{
    error: { code: string; message: string };
  }> {
    return validateErrorChannel(raw);
  }
}
