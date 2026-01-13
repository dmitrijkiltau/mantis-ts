import { type ContractValidator } from '../types';
import { extractFirstJsonObject } from './parsing.js';

/**
 * Contract for intent classification.
 */
export const CONTRACT_INTENT_CLASSIFICATION = {
  MODEL: 'qwen2.5:1.5b',
  SYSTEM_PROMPT: `You classify the intent of the input based on the allowed list.
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
  let parsedCandidate: unknown;
  try {
    parsedCandidate = extractFirstJsonObject(raw);
  } catch {
    return { ok: false, error: `INVALID_JSON:${raw}` };
  }

  if (!parsedCandidate || typeof parsedCandidate !== 'object' || Array.isArray(parsedCandidate)) {
    return { ok: false, error: `INVALID_SHAPE:${JSON.stringify(parsedCandidate)}` };
  }

  const parsed = parsedCandidate as { intent: unknown; confidence: unknown };

  // Validate shape
  if (typeof parsed.intent !== 'string' || typeof parsed.confidence !== 'number') {
    return { ok: false, error: `INVALID_SHAPE:${parsed.intent}` };
  }

  const value = {
    intent: parsed.intent,
    confidence: parsed.confidence,
  };

  // Validate confidence range
  if (value.confidence < 0 || value.confidence > 1) {
    return { ok: false, error: 'CONFIDENCE_OUT_OF_RANGE' };
  }

  return { ok: true, value };
};
