import { type ContractValidator } from "../types";
import { extractFirstJsonObject } from "./parsing.js";

export type ScoringCriterion = {
  name: string;
  definition: string;
};

export type ScoringCriteria = ReadonlyArray<ScoringCriterion>;

export const SCORING_CRITERIA: ScoringCriteria = [
  {
    name: 'clarity',
    definition: 'How clear and understandable the text is.',
  },
  {
    name: 'correctness',
    definition: 'How factually and logically correct the text is relative to the reference context.',
  },
  {
    name: 'usefulness',
    definition: 'How well the text helps achieve the user goal.',
  },
];

/**
 * Contract for scoring / evaluation.
 */
export const CONTRACT_SCORING_EVALUATION = {
  MODEL: 'llama3.2:3b',
  MODE: 'raw',
  EXPECTS_JSON: true,
  PROMPT: `You are executing a single, isolated contract.

RULES:
- Output MUST be valid JSON.
- Output MUST strictly match the provided schema.
- Return numeric values ONLY.
- Scores MUST be integers from 0 to 10.
- Do NOT add explanations, comments, or additional keys.
- Do NOT include markdown.
- Do NOT infer criteria beyond those provided.

SCHEMA:
{{CRITERIA_SCHEMA}}

TASK:
{{CRITERIA_TASK}}

CONTEXT:
{{CONTEXT_BLOCK}}

USER_GOAL:
{{USER_GOAL}}

REFERENCE_CONTEXT:
{{REFERENCE_CONTEXT}}

CRITERIA DEFINITIONS:
{{CRITERIA_DEFINITIONS}}

TEXT:
{{TEXT}}`,
  RETRIES: {
    0: `Return numbers only.
Integers from 0 to 10.
No text.`,
  },
  CRITERIA: SCORING_CRITERIA,
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
