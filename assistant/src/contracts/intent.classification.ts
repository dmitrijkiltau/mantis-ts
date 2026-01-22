import { type ContractValidator } from '../types';
import { extractFirstJsonObject } from './parsing.js';

/**
 * Contract for intent classification.
 */
export const CONTRACT_INTENT_CLASSIFICATION = {
  MODEL: 'llama3.2:3b',
  MODE: 'raw',
  EXPECTS_JSON: true,
  PROMPT: `You are executing a single, isolated contract.

RULES:
- Output MUST be valid JSON.
- Output MUST strictly match the provided schema.
- Return exactly ONE intent from the allowed list.
- Do NOT add explanations, comments, or natural language.
- Do NOT infer missing information.
- Do NOT include markdown.
- If unsure, follow the fallback rule defined below.

SCHEMA:
{
  "intent": "string",
  "confidence": "number"
}

TASK:
Classify the intent of the input text.
Select the single most appropriate intent based on the allowed intents and rules.

SELECTION RULES:
- Prefer specific structured tools over generic tools.
- If the request is about current time, date, or weekday, use "answer.general".
- Use the CONTEXT block to resolve pronouns or follow-up references when available.

CONTEXT:
{{CONTEXT_BLOCK}}

ALLOWED INTENTS:
{{TOOL_REFERENCE}}

CONFIDENCE SCALE:
0.0 = no confidence
1.0 = full confidence

INPUT:
{{USER_INPUT}}`,
  RETRIES: {
    0: `Your previous output violated the contract.
Return exactly one intent from the allowed list.
Return valid JSON only.`,
    1: `If you are unsure, return:
{
  "intent": "answer.general",
  "confidence": 0.1
}`
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
