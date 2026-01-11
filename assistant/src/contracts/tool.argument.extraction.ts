import { type ContractValidator } from '../types';

type FieldType =
  | 'string'
  | 'boolean'
  | 'number'
  | 'string|null'
  | 'number|null'
  | 'boolean|null';

/**
 * Contract for tool argument extraction.
 */
export const CONTRACT_TOOL_ARGUMENT_EXTRACTION = {
  MODEL: 'ministral-3:3b',
  SYSTEM_PROMPT: `You extract structured arguments.
You do not validate permissions.
You do not guess missing values.
If required data is missing, set it to null.
Output JSON only.`,
  USER_PROMPT: `Extract arguments for the tool "{{TOOL_NAME}}".

Tool schema:
{{TOOL_SCHEMA}}

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
  | 'NON_JSON_PREFIX'
  | `MISSING_FIELD:${string}`
  | `UNEXPECTED_FIELD:${string}`
  | `NULL_NOT_ALLOWED:${string}`
  | `INVALID_TYPE:${string}`;

/**
 * Validator for tool argument extraction contract output.
 */
export const validateToolArguments = (schema: Record<string, FieldType>): ContractValidator => (raw) => {
  // Validate JSON prefix
  if (!raw.trim().startsWith('{')) {
    return { ok: false, error: 'NON_JSON_PREFIX' };
  }

  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'INVALID_JSON' };
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
    if (type === 'string|null') {
      if (value !== null && typeof value !== 'string') {
        return { ok: false, error: `INVALID_TYPE:${schemaKey}` };
      }
    } else if (typeof value !== type) {
      return { ok: false, error: `INVALID_TYPE:${schemaKey}` };
    }
  }

  return { ok: true, value: parsed };
};