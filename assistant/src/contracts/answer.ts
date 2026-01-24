import { type ContractValidator } from '../types';

/**
 * Answer mode determines response style.
 * - strict: concise, factual, no elaboration
 * - normal: natural, allows more context and explanation
 * - conversational: short, natural replies (one or two short sentences, optional single follow-up)
 * - tool-formatting: format raw tool results into a concise single-sentence response grounded in the payload
 */
export type AnswerMode = 'strict' | 'normal' | 'conversational' | 'tool-formatting';

/**
 * Unified contract for knowledge answers.
 * Replaces separate STRICT_ANSWER / CONVERSATIONAL_ANSWER / RESPONSE_FORMATTING contracts with a mode-based approach.
 */
export const CONTRACT_ANSWER = {
  MODEL: 'ministral-3:3b',
  MODE: 'chat',
  SYSTEM_PROMPT: `{{TONE_INSTRUCTIONS}}CONTEXT:
{{CONTEXT_BLOCK}}

{{MODE_INSTRUCTIONS}}
Personality profile: {{PERSONALITY_DESCRIPTION}}.

Do not invent physical context (weather, location, people) that is not provided.
No preamble, no instructions, no bullet points, no formatting.
Always respond in {{LANGUAGE}}.
Output only your answer.`,
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
  strict: `Provide a short, factual answer to the question. 
One sentence preferred.`,
  normal: `Provide a helpful answer to the question. 
Be concise but complete.`,
  conversational: `You are responding to a short, conversational user message (greetings, thanks, small talk, check-ins). 
Keep it natural, professional, and concise (one or two sentences max). 
Ask at most one short follow-up question only if it keeps the conversation flowing.`,
  'tool-formatting': `You format responses concisely so they faithfully reflect the raw result provided. 
Summarize the key facts exactly as given, without inventing data. 
Do not add new information, actions, opinions, or context beyond what appears in the payload. 
Ground the wording in the provided tool output and user question. 
Keep it brief and direct.`,
};

/**
 * Types of validation errors for answer contract.
 */
export type AnswerValidationError =
  | 'EMPTY_OUTPUT'
  | 'META_TEXT_DETECTED'
  | 'MULTIPLE_SENTENCES';

/**
 * Mode-aware validator factory for the ANSWER contract output.
 */
export const getAnswerValidator = (
  mode: AnswerMode,
): ContractValidator<string, AnswerValidationError> => (raw) => {
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

  if (mode === 'conversational') {
    const normalized = text.trim();
    if (!normalized) {
      return { ok: false, error: 'EMPTY_OUTPUT' };
    }
    return { ok: true, value: normalized };
  }

  if (mode === 'tool-formatting') {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return { ok: false, error: 'EMPTY_OUTPUT' };
    }

    // Detect meta text like "Here is" which indicates a non-concise wrapper
    if (/^(here is|this is)\b/i.test(normalized)) {
      return { ok: false, error: 'META_TEXT_DETECTED' };
    }

    return { ok: true, value: normalized };
  }

  // Default (strict/normal) behavior: collapse whitespace and return normalized text.
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return { ok: false, error: 'EMPTY_OUTPUT' };
  }

  return { ok: true, value: normalized };
};

/**
 * Backward-compatible default validator (keeps existing behavior for callers not specifying a mode).
 */
export const validateAnswer: ContractValidator<string, AnswerValidationError> = (raw) => {
  return getAnswerValidator('normal')(raw);
};
