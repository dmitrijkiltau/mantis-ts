import { toUnorderedList } from "../helpers";
import { type ContractValidator } from "../types";

/**
 * Contract for scoring / evaluation.
 */
export const CONTRACT_SCORING_EVALUATION = {
  MODEL: 'ministral-3:3b',
  SYSTEM_PROMPT: `You evaluate content based on given criteria.
You return numeric scores only.
No explanations.`,
  USER_PROMPT: `Score the following text on these criteria (0-10):
{{CRITERIA}}

Text:
{{TEXT}}`,
  RETRIES: {
    0: `Return numbers only.
Integers from 0 to 10.
No text.`,
  },
  CRITERIA: toUnorderedList(['clarity', 'correctness', 'usefulness']),
};

/**
 * Types of validation errors for scoring contract.
 */
export type ScoringValidationError =
  | 'INVALID_JSON'
  | `INVALID_SCORE:${string}`;

/**
 * Validator for scoring contract output.
 */
export const validateScoring: ContractValidator = (raw) => {
  let parsed: Record<string, number>;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'INVALID_JSON' };
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (!Number.isInteger(value) || value < 0 || value > 10) {
      return { ok: false, error: `INVALID_SCORE:${key}` };
    }
  }

  return { ok: true, value: parsed };
};
