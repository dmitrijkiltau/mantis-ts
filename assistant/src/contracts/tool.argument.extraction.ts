import { type ContractValidator } from '../types';
import { type FieldType } from './definition.js';
import { extractFirstJsonObject, stripMarkdownFences } from './parsing.js';

/**
 * Contract for tool argument extraction.
 */
export const CONTRACT_TOOL_ARGUMENT_EXTRACTION = {
  MODEL: 'granite3-dense:2b',
  EXPECTS_JSON: true,
  SYSTEM_PROMPT: `You extract structured arguments for the tool "{{TOOL_NAME}}".
You do not validate permissions.
You do not guess missing values.
If required data is missing, set it to null.
Output JSON only.

Tool description:
{{TOOL_DESCRIPTION}}

Output exactly (no formatting):
{{TOOL_SCHEMA}}`,
  USER_PROMPT: `Extract arguments from the following user input.

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
  const cleaned = stripMarkdownFences(raw);
  if (!cleaned.includes('{')) {
    return { ok: false, error: `NON_JSON_PREFIX:${raw}` };
  }

  let parsedCandidate: unknown;
  try {
    parsedCandidate = extractFirstJsonObject(raw);
  } catch {
    return { ok: false, error: `INVALID_JSON:${raw}` };
  }

  if (!parsedCandidate || typeof parsedCandidate !== 'object' || Array.isArray(parsedCandidate)) {
    return { ok: false, error: `INVALID_JSON:${raw}` };
  }

  const parsed = parsedCandidate as Record<string, unknown>;
  const parsedKeys = Object.keys(parsed);
  for (let index = 0; index < parsedKeys.length; index += 1) {
    const parsedKey = parsedKeys[index];
    // Validate unexpected fields
    if (!(parsedKey in schema)) {
      return { ok: false, error: `UNEXPECTED_FIELD:${parsedKey}` };
    }
  }

  const schemaEntries = Object.entries(schema);
  for (let index = 0; index < schemaEntries.length; index += 1) {
    const [schemaKey, type] = schemaEntries[index];
    // Validate missing fields
    if (!Object.prototype.hasOwnProperty.call(parsed, schemaKey)) {
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
