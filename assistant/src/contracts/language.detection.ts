import { type ContractValidator } from '../types.js';

/**
 * Contract for language detection.
 */
export const CONTRACT_LANGUAGE_DETECTION = {
  MODEL: 'qwen2.5:0.5b',
  SYSTEM_PROMPT: `Detect the language of the user input and return its ISO 639-1 code only.
If you cannot determine the language, respond with "unknown".
Do not add extra text or formatting.`,
  USER_PROMPT: `Detect the language of the following input.

Input:
{{USER_INPUT}}`,
  RETRIES: {
    0: 'Your previous output violated the contract. Return only the two-letter ISO 639-1 code (e.g., "en"). No extra text or formatting.',
    1: 'If you cannot determine the language, return "unknown".',
  },
};

/**
 * Types of validation errors for language detection contract.
 */
export type LanguageDetectionValidationError =
  | 'EMPTY_OUTPUT'
  | `INVALID_CODE:${string}`;

/**
 * Validator for language detection contract output.
 */
export const validateLanguageDetection: ContractValidator<
  string,
  LanguageDetectionValidationError
> = (raw) => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'EMPTY_OUTPUT' };
  }

  const normalized = trimmed.toLowerCase();
  if (normalized === 'unknown') {
    return { ok: true, value: 'unknown' };
  }

  const firstToken = normalized.split(/\s+/)[0];
  if (!firstToken) {
    return { ok: false, error: `INVALID_CODE:${normalized}` };
  }
  const baseToken = firstToken.split(/[-_]/)[0];
  if (!baseToken) {
    return { ok: false, error: `INVALID_CODE:${normalized}` };
  }
  const candidate = baseToken.replace(/[^a-z]/g, '');
  if (/^[a-z]{2}$/.test(candidate)) {
    return { ok: true, value: candidate };
  }

  return { ok: false, error: `INVALID_CODE:${normalized}` };
};
