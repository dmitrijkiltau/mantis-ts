import { type ContractValidator } from '../types';
import { ANSWER_CONTEXT_PROMPT, buildAnswerClosing } from './answer.shared.js';

/**
 * Answer mode determines response style.
 * - strict: concise, factual, no elaboration
 * - normal: natural, allows more context and explanation
 */
export type AnswerMode = 'strict' | 'normal';

/**
 * Unified contract for knowledge answers.
 * Replaces separate STRICT_ANSWER contract with a mode-based approach.
 */
export const CONTRACT_ANSWER = {
  MODEL: 'ministral-3:3b',
  MODE: 'chat',
  SYSTEM_PROMPT: `${ANSWER_CONTEXT_PROMPT}

{{MODE_INSTRUCTIONS}}
Personality profile: {{PERSONALITY_DESCRIPTION}}.

Do not invent physical context (weather, location, people) that is not provided.
No preamble, no instructions, no bullet points, no formatting.
${buildAnswerClosing('answer')}`,
  USER_PROMPT: `Question:
{{QUESTION}}`,
  RETRIES: {
    0: `Answer with one or few short sentences only.
No preamble, no instructions, no bullet points, no formatting.`,
  },
};

/**
 * Mode-specific instructions for the ANSWER contract.
 */
export const ANSWER_MODE_INSTRUCTIONS: Record<AnswerMode, string> = {
  strict: `Provide a short, factual answer to the question. One sentence preferred.`,
  normal: `Provide a helpful answer to the question. Be concise but complete.`,
};

/**
 * Types of validation errors for answer contract.
 */
export type AnswerValidationError = 'EMPTY_OUTPUT';

/**
 * Validator for unified answer contract output.
 */
export const validateAnswer: ContractValidator<string, AnswerValidationError> = (raw) => {
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
