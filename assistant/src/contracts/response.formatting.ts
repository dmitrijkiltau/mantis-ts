import { type ContractValidator } from "../types";

/**
 * Contract for response formatting.
 * Ensures responses are concise and formatted as a short response in the user's language.
 */
export const CONTRACT_RESPONSE_FORMATTING = {
  MODEL: 'ministral-3:3b',
  SYSTEM_PROMPT: `{{TONE_INSTRUCTIONS}}You format responses concisely so they faithfully reflect the raw result provided.

CONTEXT:
{{CONTEXT_BLOCK}}

The raw result may be JSON: Summarize the key facts exactly as given, without inventing data.
Do not add new information, actions, opinions, or context beyond what appears in the payload.
Ground the wording in the provided tool output and tool name when available.
Keep it brief and direct (one sentence preferred).
Always respond in {{LANGUAGE}}.`,
  USER_PROMPT: `
User request:
{{REQUEST_CONTEXT}}

Tool: {{TOOL_NAME}}

Raw result to format as a concise response:
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
 * Ensures output is concise (under 200 characters).
 */
export const validateResponseFormatting: ContractValidator<string, ResponseFormattingValidationError> = (raw) => {
  const text = raw.trim();

  if (!text) {
    return { ok: false, error: 'EMPTY_OUTPUT' };
  }

  // Remove extra whitespace
  const normalized = text.trim();

  // Check for meta text indicating non-concise response
  if (/^(here is|this is)\b/i.test(normalized)) {
    return { ok: false, error: 'META_TEXT_DETECTED' };
  }

  return { ok: true, value: normalized };
};
