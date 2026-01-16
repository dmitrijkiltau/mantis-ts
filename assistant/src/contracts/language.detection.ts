import { type ContractValidator } from '../types.js';
import { extractFirstJsonObject } from './parsing.js';

/**
 * Contract for language detection.
 */
export const CONTRACT_LANGUAGE_DETECTION = {
  MODEL: 'qwen2.5:0.5b',
  EXPECTS_JSON: true,
  SYSTEM_PROMPT: `Detect the language of the user input and return its ISO 639-1 code and full name.
Output JSON only.

Output exactly (no formatting):
{"language":"<ISO_639_1_CODE>","name":"<LANGUAGE_NAME>"}`,
  USER_PROMPT: `Detect the language of the following input.

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
  let parsedCandidate: unknown;
  try {
    parsedCandidate = extractFirstJsonObject(raw);
  } catch {
    return { ok: false, error: `INVALID_JSON:${raw}` };
  }

  if (!parsedCandidate || typeof parsedCandidate !== 'object' || Array.isArray(parsedCandidate)) {
    return { ok: false, error: `INVALID_SHAPE:${JSON.stringify(parsedCandidate)}` };
  }

  const parsed = parsedCandidate as { language: unknown; name: unknown };

  // Validate and extract values in a single pass
  if (typeof parsed.language !== 'string' || !parsed.language) {
    return { ok: false, error: parsed.language ? `INVALID_SHAPE:${JSON.stringify(parsed)}` : 'MISSING_LANGUAGE_CODE' };
  }

  if (typeof parsed.name !== 'string' || !parsed.name) {
    return { ok: false, error: parsed.name ? `INVALID_SHAPE:${JSON.stringify(parsed)}` : 'MISSING_LANGUAGE_NAME' };
  }

  return { ok: true, value: { language: parsed.language, name: parsed.name } };
};
