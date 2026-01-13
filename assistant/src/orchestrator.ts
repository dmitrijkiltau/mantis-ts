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
import { validateResponseFormatting } from './contracts/response.formatting.js';
import { validateErrorChannel } from './contracts/error.channel.js';
import { validateLanguageDetection } from './contracts/language.detection.js';
import { getToolIntents } from './tools/registry.js';
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
};

export type ToolSchema = Record<string, FieldType>;

type ContractEntry = ContractWithExtras;

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
    return JSON.stringify(schema, undefined, 2);
  }

  public buildIntentClassificationPrompt(
    userInput: string,
    allowedIntents: string[] = getToolIntents(),
  ): ContractPrompt {
    return this.buildPrompt('INTENT_CLASSIFICATION', {
      USER_INPUT: this.normalize(userInput),
      ALLOWED_INTENTS: toUnorderedList(allowedIntents),
    });
  }

  public buildLanguageDetectionPrompt(userInput: string): ContractPrompt {
    return this.buildPrompt('LANGUAGE_DETECTION', {
      USER_INPUT: this.normalize(userInput),
    });
  }

  public buildToolArgumentPrompt(
    toolName: string,
    schema: ToolSchema,
    userInput: string,
  ): ContractPrompt {
    return this.buildPrompt('TOOL_ARGUMENT_EXTRACTION', {
      TOOL_NAME: toolName,
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
  ): ContractPrompt {
    return this.buildPrompt('STRICT_ANSWER', {
      QUESTION: this.normalize(question),
      TONE_INSTRUCTIONS: this.formatToneInstructions(toneInstructions),
    });
  }

  public buildResponseFormattingPrompt(
    response: string,
    language: { language: string; name: string },
    toneInstructions?: string,
  ): ContractPrompt {
    return this.buildPrompt('RESPONSE_FORMATTING', {
      RESPONSE: this.normalize(response),
      LANGUAGE: language.name,
      TONE_INSTRUCTIONS: this.formatToneInstructions(toneInstructions),
    });
  }

  public buildErrorChannelPrompt(): ContractPrompt {
    return this.buildPrompt('ERROR_CHANNEL');
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
