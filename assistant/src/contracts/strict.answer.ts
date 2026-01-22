import { type ContractValidator } from "../types";

/**
 * Contract for strict answer.
 */
export const CONTRACT_STRICT_ANSWER = {
  MODEL: 'ministral-3:3b',
  MODE: 'chat',
  SYSTEM_PROMPT: `{{TONE_INSTRUCTIONS}}Provide a short answer to the question.

CONTEXT:
{{CONTEXT_BLOCK}}

Do not invent physical context (weather, location, people) that is not provided.
No preamble, no instructions, no bullet points, no formatting. Preferably one sentence.
Always respond in {{LANGUAGE}}.
Output only your answer.`,
  USER_PROMPT: `Question:
{{QUESTION}}`,
  RETRIES: {
    0: `Answer with one or few short sentences only.
No preamble, no instructions, no bullet points, no formatting.`
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
  let text = raw.trim();

  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as { message?: { content?: unknown } };
      if (typeof parsed?.message?.content === 'string') {
        text = parsed.message.content.trim();
      }
    } catch {
      // Keep original text if it is not JSON.
    }
  }

  if (!text) {
    return { ok: false, error: 'EMPTY_OUTPUT' };
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return { ok: false, error: 'EMPTY_OUTPUT' };
  }

  return { ok: true, value: normalized };
};
