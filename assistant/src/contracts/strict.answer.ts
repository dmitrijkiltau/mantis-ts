import { type ContractValidator } from "../types";

/**
 * Contract for strict answer.
 */
export const CONTRACT_STRICT_ANSWER = {
  MODEL: 'ministral-3:3b',
  SYSTEM_PROMPT: `{{TONE_INSTRUCTIONS}}You answer the question directly.
No preamble.
No disclaimers.
No follow-up questions.
If you do not know the answer, output exactly:
I don't know.`,
  USER_PROMPT: `Question:
{{QUESTION}}`,
  RETRIES: {
    0: `Answer directly.
One paragraph max.
No extra text.`,
  },
};

/**
 * Types of validation errors for strict answer contract.
 */
export type StrictAnswerValidationError =
  | 'EMPTY_OUTPUT'
  | 'MULTILINE_OUTPUT';

/**
 * Validator for strict answer contract output.
 */
export const validateStrictAnswer: ContractValidator<string, StrictAnswerValidationError> = (raw) => {
  const text = raw.trim();

  if (!text) {
    return { ok: false, error: 'EMPTY_OUTPUT' };
  }

  const paragraphs = text.split(/\n\s*\n/).filter((paragraph) => paragraph.trim().length > 0);
  if (paragraphs.length > 1) {
    return { ok: false, error: 'MULTILINE_OUTPUT' };
  }

  const normalized = paragraphs[0].replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return { ok: false, error: 'EMPTY_OUTPUT' };
  }

  return { ok: true, value: normalized };
};
