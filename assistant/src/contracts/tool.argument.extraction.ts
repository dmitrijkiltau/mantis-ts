import { type ContractValidator } from '../types';
import { type FieldType } from './definition.js';

/**
 * Contract for tool argument extraction.
 */
export const CONTRACT_TOOL_ARGUMENT_EXTRACTION = {
  MODEL: 'qwen2.5:1.5b',
  SYSTEM_PROMPT: `You extract structured arguments.
You do not validate permissions.
You do not guess missing values.
If required data is missing, set it to null.
Output JSON only.

Output exactly (no formatting):
{{TOOL_SCHEMA}}`,
  USER_PROMPT: `Extract arguments for the tool "{{TOOL_NAME}}".

User input:
{{USER_INPUT}}`,
  RETRIES: {
    0: `Your output did not match the schema.
All fields must be present.
Use null for missing data.
Return JSON only.`,
    1: `Repeat the schema exactly and fill values.
Do not invent data.`,
  },
};

/**
 * Types of validation errors for tool argument extraction.
 */
export type ToolArgumentExtractionValidationError =
  | `NON_JSON_PREFIX:${string}`
  | `MISSING_FIELD:${string}`
  | `UNEXPECTED_FIELD:${string}`
  | `NULL_NOT_ALLOWED:${string}`
  | `INVALID_TYPE:${string}`
  | `INVALID_JSON:${string}`;

/**
 * Validator for tool argument extraction contract output.
 */
export const validateToolArguments = (
  schema: Record<string, FieldType>,
): ContractValidator<Record<string, unknown>, ToolArgumentExtractionValidationError> => (raw) => {
  // Validate JSON prefix
  if (!raw.trim().startsWith('{')) {
    return { ok: false, error: `NON_JSON_PREFIX:${raw}` };
  }

  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: `INVALID_JSON:${raw}` };
  }

  for (const parsedKey of Object.keys(parsed)) {
    // Validate unexpected fields
    if (!(parsedKey in schema)) {
      return { ok: false, error: `UNEXPECTED_FIELD:${parsedKey}` };
    }
  }

  for (const [schemaKey, type] of Object.entries(schema)) {
    // Validate missing fields
    if (!(schemaKey in parsed)) {
      return { ok: false, error: `MISSING_FIELD:${schemaKey}` };
    }

    const value = parsed[schemaKey];

    // Validate nullability and type
    if (value === null && !type.endsWith('|null')) {
      return { ok: false, error: `NULL_NOT_ALLOWED:${schemaKey}` };
    }

    // Validate type
    if (value !== null) {
      const actualType = type.includes('|') ? type.split('|')[0] : type;
      if (typeof value !== actualType) {
        return { ok: false, error: `INVALID_TYPE:${schemaKey}` };
      }
    }
  }

  return { ok: true, value: parsed };
};
