import { type ContractValidator } from '../types.js';

/**
 * Contract for language detection.
 */
export const CONTRACT_LANGUAGE_DETECTION = {
  MODEL: 'qwen2.5:0.5b',
  MODE: 'raw',
  PROMPT: `You are executing a single, isolated contract.

RULES:
- Output MUST be a single lowercase string.
- Output MUST be a valid ISO 639-1 language code.
- Do NOT add explanations, examples, or formatting.
- Do NOT include whitespace or additional characters.
- If the language cannot be determined with confidence, return "en".

TASK:
Detect the primary language of the input text.

INPUT:
{{USER_INPUT}}`,
  RETRIES: {
    0: 'Your previous output violated the contract. Return only the two-letter ISO 639-1 code (e.g., "en"). No extra text or formatting.',
    1: 'If you cannot determine the language, return "en".',
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
