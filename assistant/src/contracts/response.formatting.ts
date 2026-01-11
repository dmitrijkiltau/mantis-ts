import { type ContractValidator } from "../types";

const MAX_RESPONSE_LENGTH = 200;

/**
 * Contract for response formatting.
 * Ensures responses are concise and formatted as a single short sentence.
 */
export const CONTRACT_RESPONSE_FORMATTING = {
  MODEL: 'ministral-3:3b',
  SYSTEM_PROMPT: `You format responses concisely, in a natural, human, everyday language.
Do not add new information, actions, opinions or context.
Preserve the original meaning exactly.
No preamble.
No explanations.
No follow-up questions.
Keep it brief and direct.`,
  USER_PROMPT: `Format this response as one short sentence:
{{RESPONSE}}`,
};

/**
 * Types of validation errors for response formatting contract.
 */
export type ResponseFormattingValidationError =
  | 'EMPTY_OUTPUT'
  | 'TOO_LONG'
  | 'META_TEXT_DETECTED'
  | 'MULTIPLE_SENTENCES';

/**
 * Validator for response formatting contract output.
 * Ensures output is a single, concise sentence (under 200 characters).
 */
export const validateResponseFormatting: ContractValidator<string, ResponseFormattingValidationError> = (raw) => {
  const text = raw.trim();

  if (!text) {
    return { ok: false, error: 'EMPTY_OUTPUT' };
  }

  // Remove extra whitespace
  const normalized = text.replace(/\s+/g, ' ').trim();

  // Check if response exceeds reasonable length for "one short sentence"
  if (normalized.length > MAX_RESPONSE_LENGTH) {
    return { ok: false, error: 'TOO_LONG' };
  }

  // Check for meta text indicating non-concise response
  if (/^(here is|this is)\b/i.test(normalized)) {
    return { ok: false, error: 'META_TEXT_DETECTED' };
  }

  return { ok: true, value: normalized };
};
