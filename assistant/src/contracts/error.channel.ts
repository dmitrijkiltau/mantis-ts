import { type ContractValidator } from "../types";
import { extractFirstJsonObject } from "./parsing.js";

/**
 * Contract for error channel.
 */
export const CONTRACT_ERROR_CHANNEL = {
  MODEL: 'gemma3:1b',
  SYSTEM_PROMPT: `You output a JSON error.
Do not attempt a partial answer.
Output JSON only.

Output exactly (no formatting):
{"error":{"code":<string>,"message":<string>}}`,
  USER_PROMPT: `Generate an error for the following context:

Stage: {{STAGE}}
Context: {{ERROR_CONTEXT}}`,
  RETRIES: {
    0: `Output valid JSON only.
Format: {"error":{"code":"ERROR_CODE","message":"description"}}`,
  },
};

/**
 * Types of validation errors for error channel contract.
 */
export type ErrorChannelValidationError =
  | 'INVALID_JSON'
  | 'INVALID_ERROR_FORMAT';

/**
 * Validator for error channel contract output.
 */
export const validateErrorChannel: ContractValidator<
  { error: { code: string; message: string } },
  ErrorChannelValidationError
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

  const parsed = parsedCandidate as { error?: { code?: unknown; message?: unknown } };

  if (!parsed.error || typeof parsed.error.code !== 'string' || typeof parsed.error.message !== 'string') {
    return { ok: false, error: 'INVALID_ERROR_FORMAT' };
  }

  const value = {
    error: {
      code: parsed.error.code,
      message: parsed.error.message,
    },
  };

  return { ok: true, value };
};
