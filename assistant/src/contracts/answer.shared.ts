/**
 * Shared fragments for answer-style system prompts.
 */
export const ANSWER_CONTEXT_PROMPT = `{{TONE_INSTRUCTIONS}}CONTEXT:
{{CONTEXT_BLOCK}}`;

/**
 * Builds the closing instructions that remind the assistant to respond in the user's language
 * and to output only the direct response or answer.
 */
export const buildAnswerClosing = (noun: 'response' | 'answer'): string => (
  `Always respond in {{LANGUAGE}}.
Output only your ${noun}.`
);
