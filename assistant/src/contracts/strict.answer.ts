import { type ContractValidator } from "../types";

/**
 * Contract for strict answer.
 */
export const CONTRACT_STRICT_ANSWER = {
  MODEL: 'ministral-3:3b',
  SYSTEM_PROMPT: `You answer the question directly.
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
export const validateStrictAnswer: ContractValidator = (raw) => {
  const text = raw.trim();

  if (!text) {
    return { ok: false, error: 'EMPTY_OUTPUT' };
  }

  if (text.split('\n').length > 1) {
    return { ok: false, error: 'MULTILINE_OUTPUT' };
  }

  return { ok: true, value: text };
};
