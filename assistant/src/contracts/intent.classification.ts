import { type ContractValidator } from '../types';

/**
 * Contract for intent classification.
 */
export const CONTRACT_INTENT_CLASSIFICATION = {
  MODEL: 'llama3.2:3b',
  MODE: 'raw',
  EXPECTS_JSON: false,
  PROMPT: `You are executing a single, isolated contract.

TASK:
Return the single most appropriate intent name for the input text.

RULES:
- The intent name MUST be one of the allowed intents listed below.
- Return ONLY the intent name as a BARE STRING with no formatting, quotes, or punctuation.
- If the input is ambiguous or does not clearly match any allowed intent, return "answer.general".
- Use the CONTEXT block to resolve pronouns or follow-up references when available and clearly intended.

CONTEXT:
{{CONTEXT_BLOCK}}

ALLOWED INTENTS:
{{TOOL_REFERENCE}}

INPUT:
{{USER_INPUT}}`,
  RETRIES: {
    0: `Your previous output violated the contract. 
Return exactly one intent name from the allowed list as a bare string only.`,
    1: `If you are unsure, return:
answer.general`
  },
};

/**
 * Types of validation errors for intent classification contract.
 */
export type IntentClassificationValidationError =
  | `INVALID_SHAPE:${string}`;

export type IntentClassificationResult = string;

export const validateIntentClassification: ContractValidator<
  IntentClassificationResult,
  IntentClassificationValidationError
> = (raw) => {
  const trimmed = raw.trim();

  // Reject empty or JSON-like outputs
  if (!trimmed || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return { ok: false, error: `INVALID_SHAPE:${raw}` };
  }

  // Accept the trimmed string as the intent name
  return { ok: true, value: trimmed };
};
