import { type ContractValidator } from '../types';

/**
 * Contract for intent classification.
 */
export const CONTRACT_INTENT_CLASSIFICATION = {
  MODEL: 'qwen2.5:1.5b',
  SYSTEM_PROMPT: `Classify the intent of the input based on the allowed list.
Output JSON only.

Allowed intents (choose exactly one):
{{ALLOWED_INTENTS}}

Output exactly (no formatting):
{"intent":"<intent>","confidence":<number>}`,
  USER_PROMPT: `Classify the intent of the following input.

Input:
{{USER_INPUT}}`,
  RETRIES: {
    0: `Your previous output violated the contract.
Return exactly one intent from the allowed list.
Return valid JSON only.`,
    1: `If you are unsure, return:
{"intent":"unknown","confidence":0.0}`
  },
};

/**
 * Types of validation errors for intent classification contract.
 */
export type IntentClassificationValidationError = 
  | `INVALID_JSON:${string}`
  | `INVALID_SHAPE:${string}`
  | 'CONFIDENCE_OUT_OF_RANGE';

/**
 * Validator for intent classification contract output.
 */
export const validateIntentClassification: ContractValidator<
  { intent: string; confidence: number },
  IntentClassificationValidationError
> = (raw) => {
  let parsed: { intent: string; confidence: number };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: `INVALID_JSON:${raw}` };
  }

  // Validate shape
  if (typeof parsed.intent !== 'string' || typeof parsed.confidence !== 'number') {
    return { ok: false, error: `INVALID_SHAPE:${parsed.intent}` };
  }

  // Validate confidence range
  if (parsed.confidence < 0 || parsed.confidence > 1) {
    return { ok: false, error: 'CONFIDENCE_OUT_OF_RANGE' };
  }

  return { ok: true, value: parsed };
};
