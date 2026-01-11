import { type ContractValidator } from "../types";

/**
 * Contract for error channel.
 */
export const CONTRACT_ERROR_CHANNEL = {
  MODEL: 'ministral-3:3b',
  SYSTEM_PROMPT: `If the task cannot be completed, output a JSON error.
Do not attempt a partial answer.`,
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
export const validateErrorChannel: ContractValidator = (raw) => {
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
