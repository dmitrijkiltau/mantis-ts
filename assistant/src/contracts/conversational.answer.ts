import { type ContractValidator } from "../types";

/**
 * Contract for conversational answers.
 */
export const CONTRACT_CONVERSATIONAL_ANSWER = {
  MODEL: 'ministral-3:3b',
  MODE: 'chat',
  SYSTEM_PROMPT: `{{TONE_INSTRUCTIONS}}You are responding to a short, conversational user message (greetings, thanks, small talk, check-ins).
Personality profile: {{PERSONALITY_DESCRIPTION}}.

CONTEXT:
{{CONTEXT_BLOCK}}

Keep it natural, professional, and concise (one or two sentences max).
No preamble, no instructions, no bullet points, no formatting.
Ask at most one short follow-up question only if it keeps the conversation flowing.
Always respond in {{LANGUAGE}}.
Output only your response.`,
  USER_PROMPT: `Conversation:
{{USER_INPUT}}`,
  RETRIES: {
    0: `Your previous output violated the contract.
Return one or two short sentences only.
Output plain text only.`,
  },
};

/**
 * Types of validation errors for conversational answer contract.
 */
export type ConversationalAnswerValidationError =
  | 'EMPTY_OUTPUT'
  | 'MULTILINE_OUTPUT';

/**
 * Validator for conversational answer contract output.
 */
export const validateConversationalAnswer: ContractValidator<
  string,
  ConversationalAnswerValidationError
> = (raw) => {
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

  const normalized = text
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return { ok: false, error: 'EMPTY_OUTPUT' };
  }

  return { ok: true, value: normalized };
};
