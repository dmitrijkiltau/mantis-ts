import { toUnorderedList } from "../helpers";
import { type ContractValidator } from "../types";
import { extractFirstJsonObject } from "./parsing.js";

/**
 * Contract for scoring / evaluation.
 */
export const CONTRACT_SCORING_EVALUATION = {
  MODEL: 'llama3.2:3b',
  EXPECTS_JSON: true,
  SYSTEM_PROMPT: `You evaluate content based on given criteria.
You return numeric scores only.
No explanations.
Answer with JSON only.
Use USER_GOAL and REFERENCE_CONTEXT to judge correctness and usefulness.

CONTEXT:
{{CONTEXT_BLOCK}}`,
  USER_PROMPT: `User goal:
{{USER_GOAL}}

Reference context:
{{REFERENCE_CONTEXT}}

Score the following text on these criteria (0-10):
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
export const validateScoring: ContractValidator<
  Record<string, number>,
  ScoringValidationError
> = (raw) => {
  let parsedCandidate: unknown;

  try {
    parsedCandidate = extractFirstJsonObject(raw);
  } catch {
    return { ok: false, error: 'INVALID_JSON' };
  }

  if (!parsedCandidate || typeof parsedCandidate !== 'object' || Array.isArray(parsedCandidate)) {
    return { ok: false, error: 'INVALID_JSON' };
  }

  const parsed = parsedCandidate as Record<string, unknown>;
  const entries = Object.entries(parsed);
  const typed: Record<string, number> = {};
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) {
      continue;
    }
    const [key, value] = entry;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10) {
      return { ok: false, error: `INVALID_SCORE:${key}` };
    }
    typed[key] = value;
  }

  return { ok: true, value: typed };
};
