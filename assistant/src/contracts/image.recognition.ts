import { type ContractValidator } from '../types';

/**
 * Contract for image recognition / vision analysis.
 */
export const CONTRACT_IMAGE_RECOGNITION = {
  MODEL: 'qwen3-vl:2b',
  SYSTEM_PROMPT: `{{TONE_INSTRUCTIONS}}You analyze the attached image(s).
There are {{IMAGE_COUNT}} image(s) attached.
If the user asks a question, answer it using only what is visible.
If no question is provided, describe the image(s) concisely.
If the image is unclear or missing, say so.
CONTEXT:
{{CONTEXT_BLOCK}}

Always respond in {{LANGUAGE}}.
Output only the response.`,
  USER_PROMPT: `User request:
{{USER_INPUT}}`,
  RETRIES: {
    0: `Return only the response text with no extra formatting.`,
  },
};

/**
 * Types of validation errors for image recognition contract.
 */
export type ImageRecognitionValidationError =
  | 'EMPTY_OUTPUT';

/**
 * Validator for image recognition contract output.
 */
export const validateImageRecognition: ContractValidator<string, ImageRecognitionValidationError> = (raw) => {
  let text = raw.trim();

  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as { message?: { content?: unknown } };
      if (typeof parsed?.message?.content === 'string') {
        text = parsed.message.content.trim();
      }
    } catch {
      // Keep original text if it is not JSON.
    }
  }

  if (!text) {
    return { ok: false, error: 'EMPTY_OUTPUT' };
  }

  const normalized = text
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return { ok: false, error: 'EMPTY_OUTPUT' };
  }

  return { ok: true, value: normalized };
};
