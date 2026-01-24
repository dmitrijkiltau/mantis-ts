import { type ContractValidator } from '../types';

/**
 * Contract for intent classification.
 */
export const CONTRACT_INTENT_CLASSIFICATION = {
  MODEL: 'llama3.2:3b',
  MODE: 'raw',
  EXPECTS_JSON: false,
  PROMPT: `You are executing a single, isolated contract.

RULES:
- Output MUST be the single intent name from the allowed list and nothing else.
- Output MUST be a bare string (no JSON, no markup, no explanation).
- Do NOT add explanations, comments, or natural language.
- Do NOT infer missing information.
- If unsure, follow the fallback rule defined below.

TASK:
Return the single most appropriate intent name for the input text.

SELECTION RULES:
- Prefer specific structured tools over generic tools.
- If the request is about current time, date, or weekday, return "answer.general".
- Use the CONTEXT block to resolve pronouns or follow-up references when available.

NEGATIVE CONSTRAINTS:
- Do not invoke "tool.shell" unless no other tool can fulfill the request.
- Do not choose "answer.general" or any conversational fallback while a tool clearly matches the intent.

CONTEXT:
{{CONTEXT_BLOCK}}

ALLOWED INTENTS:
{{TOOL_REFERENCE}}

Return only the intent name for the following input.

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
