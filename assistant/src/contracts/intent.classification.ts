import { type ContractValidator } from '../types';
import { extractFirstJsonObject } from './parsing.js';

/**
 * Contract for intent classification.
 */
export const CONTRACT_INTENT_CLASSIFICATION = {
  MODEL: 'qwen2.5:1.5b',
  EXPECTS_JSON: true,
  SYSTEM_PROMPT: `You classify the intent of the input based on the allowed list.
Pick one tool intent when the request matches that tool's capability.

**Priority Rule:**
Always prefer specific structured tools (filesystem, process, http) over generic tools (shell) if they can fulfill the request. Use 'tool.shell' only as a last resort.
If the request is about current time, date, or weekday, use "answer.general".
Use the CONTEXT block to resolve pronouns or follow-up references when available.

CONTEXT:
{{CONTEXT_BLOCK}}

Allowed intents:
{{TOOL_REFERENCE}}

Confidence range:
0.0 (no confidence) to 1.0 (full confidence).

Output JSON exactly (no formatting):
{"intent":"<intent>","confidence":<number>}`,
  USER_PROMPT: `Classify the intent of the following input.

Input:
{{USER_INPUT}}`,
  RETRIES: {
    0: `Your previous output violated the contract.
Return exactly one intent from the allowed list.
Return valid JSON only.`,
    1: `If you are unsure, return:
{"intent":"answer.general","confidence":0.0}`
  },
};

/**
 * Types of validation errors for intent classification contract.
 */
export type IntentClassificationValidationError =
  | `INVALID_JSON:${string}`
  | `INVALID_SHAPE:${string}`
  | 'CONFIDENCE_OUT_OF_RANGE';

export type IntentClassificationResult = {
  intent: string;
  confidence: number;
};

export const validateIntentClassification: ContractValidator<
  IntentClassificationResult,
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

  const parsed = parsedCandidate as {
    intent: unknown;
    confidence: unknown;
  };

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
