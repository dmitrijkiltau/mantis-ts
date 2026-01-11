import { type ContractValidator } from '../types.js';

/**
 * Contract for language detection.
 */
export const CONTRACT_LANGUAGE_DETECTION = {
  MODEL: 'qwen2.5:1.5b',
  SYSTEM_PROMPT: `You are a language detection system.
You do not explain.
You do not chat.
You only output valid JSON.
Detect the language of the user input and return its ISO 639-1 code and full name.`,
  USER_PROMPT: `Detect the language of the following input.

Output exactly:
{"language":"<ISO_639_1_CODE>","name":"<LANGUAGE_NAME>"}

Input:
{{USER_INPUT}}`,
  RETRIES: {
    0: `Your previous output violated the contract.
Return valid JSON with "language" (ISO 639-1 code) and "name" (language name) fields.
Choose the most likely language if uncertain.`,
    1: `If you cannot determine the language, return:
{"language":"unknown","name":"Unknown"}`,
  },
};

/**
 * Types of validation errors for language detection contract.
 */
export type LanguageDetectionValidationError =
  | `INVALID_JSON:${string}`
  | `INVALID_SHAPE:${string}`
  | 'MISSING_LANGUAGE_CODE'
  | 'MISSING_LANGUAGE_NAME';

/**
 * Validator for language detection contract output.
 */
export const validateLanguageDetection: ContractValidator<
  { language: string; name: string },
  LanguageDetectionValidationError
> = (raw) => {
  let parsed: { language: string; name: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: `INVALID_JSON:${raw}` };
  }

  // Validate shape
  if (typeof parsed.language !== 'string' || typeof parsed.name !== 'string') {
    return { ok: false, error: `INVALID_SHAPE:${JSON.stringify(parsed)}` };
  }

  // Validate language code is not empty
  if (!parsed.language) {
    return { ok: false, error: 'MISSING_LANGUAGE_CODE' };
  }

  // Validate language name is not empty
  if (!parsed.name) {
    return { ok: false, error: 'MISSING_LANGUAGE_NAME' };
  }

  return { ok: true, value: parsed };
};
