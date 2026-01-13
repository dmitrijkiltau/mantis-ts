import { type ContractValidator } from "../types";

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
  let parsed: { error: { code: string; message: string } };

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'INVALID_JSON' };
  }

  if (!parsed.error || typeof parsed.error.code !== 'string' || typeof parsed.error.message !== 'string') {
    return { ok: false, error: 'INVALID_ERROR_FORMAT' };
  }

  return { ok: true, value: parsed };
};
