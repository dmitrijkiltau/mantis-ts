import { type ContractValidator } from '../types';

/**
 * Contract for personality selection.
 */
export const CONTRACT_PERSONALITY_SELECTION = {
  MODEL: 'ministral-3:3b',
  SYSTEM_PROMPT: `Select the best personality of the input for the response tone only.
Output JSON only.

Allowed personalities (choose exactly one):
{{ALLOWED_PERSONALITIES}}

Output exactly (no formatting):
{"personality":"<personality>","confidence":<number>}`,
  USER_PROMPT: `Select the personality of the input for generating the response.

Input:
{{USER_INPUT}}`,
  RETRIES: {
    0: `Your previous output violated the contract.
Return exactly one personality from the allowed list.
Return valid JSON only.`,
    1: `If you are unsure, return:
{"personality":"DEFAULT","confidence":0.1}`,
  },
};

/**
 * Types of validation errors for personality selection contract.
 */
export type PersonalitySelectionValidationError =
  | 'INVALID_JSON'
  | 'INVALID_SHAPE'
  | 'CONFIDENCE_OUT_OF_RANGE'
  | `UNKNOWN_PERSONALITY:${string}`;

/**
 * Validator for personality selection contract output.
 */
export const validatePersonalitySelection = (
  allowedPersonalities: string[],
): ContractValidator<
  { personality: string; confidence: number },
  PersonalitySelectionValidationError
> => {
  return (raw) => {
    let parsed: { personality: string; confidence: number };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'INVALID_JSON' };
    }

    // Validate shape and constraints.
    if (typeof parsed.personality !== 'string' || typeof parsed.confidence !== 'number') {
      return { ok: false, error: 'INVALID_SHAPE' };
    }

    // Validate confidence range and personality membership.
    if (parsed.confidence < 0 || parsed.confidence > 1) {
      return { ok: false, error: 'CONFIDENCE_OUT_OF_RANGE' };
    }

    // Validate personality is in allowed list.
    if (!allowedPersonalities.includes(parsed.personality)) {
      return { ok: false, error: `UNKNOWN_PERSONALITY:${parsed.personality}` };
    }

    return { ok: true, value: parsed };
  };
};
