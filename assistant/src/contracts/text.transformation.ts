import { toUnorderedList } from "../helpers";
import { type ContractValidator } from "../types";

const MAX_SENTENCES = 3;

/**
 * Contract for deterministic text transformation.
 */
export const CONTRACT_TEXT_TRANSFORMATION = {
  MODEL: 'ministral-3:3b',
  MODE: 'chat',
  SYSTEM_PROMPT: `You transform text according to rules.
You preserve meaning.
You do not add information.
You do not explain.

CONTEXT:
{{CONTEXT_BLOCK}}`,
  USER_PROMPT: `Rewrite the following text to be:
{{RULES}}
- max ${MAX_SENTENCES} sentences

Text:
{{TEXT}}`,
  RETRIES: {
    0: `You violated the rules.
Rewrite again.
No additions.
No explanations.`,
  },
  RULES: toUnorderedList(['concise', 'neutral']),
};

/**
 * Types of validation errors for text transformation contract.
 */
export type TextTransformationValidationError =
  | 'EMPTY_OUTPUT'
  | 'META_TEXT_DETECTED'
  | 'LIST_OUTPUT_NOT_ALLOWED'
  | 'TOO_MANY_SENTENCES'

/**
 * Validator for text transformation contract output.
 */
export const validateTextTransformation: ContractValidator<
  string,
  TextTransformationValidationError
> = (raw) => {
  const text = raw.trim();
  if (!text) {
    return { ok: false, error: 'EMPTY_OUTPUT' };
  }

  // Validate meta text
  if (/^here (is|are)\b/i.test(text)) {
    return { ok: false, error: 'META_TEXT_DETECTED' };
  }

  // Validate list output
  if (/^[-*•]\s+/m.test(text)) {
    return { ok: false, error: 'LIST_OUTPUT_NOT_ALLOWED' };
  }

  // Validate sentence count
  const sentenceCount = text.split(/[.!?]+/).filter(Boolean).length;
  if (sentenceCount > MAX_SENTENCES) {
    return { ok: false, error: 'TOO_MANY_SENTENCES', meta: { sentenceCount, max: MAX_SENTENCES } };
  }

  return { ok: true, value: text };
};
