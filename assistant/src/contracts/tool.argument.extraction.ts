import { type ContractValidator } from '../types';
import { type FieldType } from './definition.js';
import { parseJsonObjectStrict, stripMarkdownFences } from './parsing.js';

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

CONTEXT:
{{CONTEXT_BLOCK}}

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
  if (!cleaned.trim().startsWith('{')) {
    return { ok: false, error: `NON_JSON_PREFIX:${raw}` };
  }

  let parsedCandidate: unknown;
  try {
    parsedCandidate = parseJsonObjectStrict(cleaned);
  } catch {
    return { ok: false, error: `INVALID_JSON:${raw}` };
  }

  const parsed = parsedCandidate as Record<string, unknown>;
  const parsedKeys = Object.keys(parsed);
  for (let index = 0; index < parsedKeys.length; index += 1) {
    const parsedKey = parsedKeys[index];
    if (!parsedKey) {
      continue;
    }
    // Validate unexpected fields
    if (!(parsedKey in schema)) {
      return { ok: false, error: `UNEXPECTED_FIELD:${parsedKey}` };
    }
  }

  const schemaEntries = Object.entries(schema);
  for (let index = 0; index < schemaEntries.length; index += 1) {
    const entry = schemaEntries[index];
    if (!entry) {
      continue;
    }
    const [schemaKey, type] = entry;
    // Validate missing fields
    if (!Object.prototype.hasOwnProperty.call(parsed, schemaKey)) {
      return { ok: false, error: `MISSING_FIELD:${schemaKey}` };
    }

    const value = parsed[schemaKey];
    const allowsNull = type.endsWith('|null');
    const baseType = allowsNull ? type.slice(0, -5) : type;

    // Validate nullability and type
    if (value === null) {
      if (!allowsNull) {
        return { ok: false, error: `NULL_NOT_ALLOWED:${schemaKey}` };
      }
      continue;
    }

    if (baseType === 'array') {
      if (!Array.isArray(value)) {
        return { ok: false, error: `INVALID_TYPE:${schemaKey}` };
      }
      continue;
    }

    if (baseType.endsWith('[]')) {
      if (!Array.isArray(value)) {
        return { ok: false, error: `INVALID_TYPE:${schemaKey}` };
      }
      const elementType = baseType.slice(0, -2);
      for (let valueIndex = 0; valueIndex < value.length; valueIndex += 1) {
        const element = value[valueIndex];
        if (element === null || element === undefined) {
          return { ok: false, error: `INVALID_TYPE:${schemaKey}` };
        }
        if (elementType === 'object') {
          if (typeof element !== 'object') {
            return { ok: false, error: `INVALID_TYPE:${schemaKey}` };
          }
          continue;
        }
        if (typeof element !== elementType) {
          return { ok: false, error: `INVALID_TYPE:${schemaKey}` };
        }
      }
      continue;
    }

    if (baseType === 'object') {
      if (typeof value !== 'object') {
        return { ok: false, error: `INVALID_TYPE:${schemaKey}` };
      }
      continue;
    }

    if (typeof value !== baseType) {
      return { ok: false, error: `INVALID_TYPE:${schemaKey}` };
    }
  }

  return { ok: true, value: parsed };
};
