import { type ContractValidator } from "../types";

/**
 * Contract for strict answer.
 */
export const CONTRACT_STRICT_ANSWER = {
 MODEL: 'ministral-3:3b',
  SYSTEM_PROMPT: `{{TONE_INSTRUCTIONS}}Provide a single, short sentence answering the question.
No preamble, no instructions, no bullet points, no formatting.
If you do not know the answer, output exactly: I don't know.
Output only that one sentence.`,
  USER_PROMPT: `Question:
{{QUESTION}}`,
  RETRIES: {
    0: `Answer with one short sentence only.
No lists, no extra lines, no formatting.
If unsure, respond exactly: I don't know.`,
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

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  const normalized = (paragraphs[0] ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return { ok: false, error: 'EMPTY_OUTPUT' };
  }

  return { ok: true, value: normalized };
};
