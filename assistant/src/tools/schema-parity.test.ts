import { describe, expect, it } from 'vitest';
import { z, type ZodTypeAny } from 'zod';
import { TOOLS } from './registry.js';
import type { FieldType } from '../contracts/definition.js';

type ZodObjectShape = Record<string, ZodTypeAny>;

/**
 * Extracts the shape from a Zod object schema.
 */
const getObjectShape = (schema: ZodTypeAny): ZodObjectShape => {
  if (!(schema instanceof z.ZodObject)) {
    throw new Error('argsSchema must be a Zod object');
  }

  const shape = schema.shape;
  if (typeof shape === 'function') {
    return shape();
  }

  return shape;
};

/**
 * Unwraps common Zod wrappers to detect nullability.
 */
const unwrapForNullability = (schema: ZodTypeAny): { nullable: boolean; inner: ZodTypeAny } => {
  let current = schema;
  let nullable = false;
  let updated = true;

  while (updated) {
    updated = false;
    if (current instanceof z.ZodNullable) {
      nullable = true;
      current = current.unwrap();
      updated = true;
      continue;
    }

    if (current instanceof z.ZodOptional) {
      current = current.unwrap();
      updated = true;
      continue;
    }

    if (current instanceof z.ZodDefault && typeof current.removeDefault === 'function') {
      current = current.removeDefault();
      updated = true;
      continue;
    }

    if (current instanceof z.ZodEffects) {
      current = current.innerType();
      updated = true;
    }
  }

  return { nullable, inner: current };
};

const isFieldNullable = (fieldType: FieldType): boolean => fieldType.includes('|null');

describe('tool schema parity', () => {
  it('matches argsSchema field names and nullability', () => {
    const issues: string[] = [];
    const toolEntries = Object.entries(TOOLS);

    for (let index = 0; index < toolEntries.length; index += 1) {
      const entry = toolEntries[index];
      if (!entry) {
        continue;
      }
      const [toolName, tool] = entry;
      if (!tool.argsSchema) {
        issues.push(`${toolName}: missing argsSchema`);
        continue;
      }

      const schemaKeys = Object.keys(tool.schema);
      const argShape = getObjectShape(tool.argsSchema);
      const argKeys = Object.keys(argShape);

      for (let keyIndex = 0; keyIndex < schemaKeys.length; keyIndex += 1) {
        const key = schemaKeys[keyIndex];
        if (!key) {
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(argShape, key)) {
          issues.push(`${toolName}: argsSchema missing field "${key}"`);
        }
      }

      for (let keyIndex = 0; keyIndex < argKeys.length; keyIndex += 1) {
        const key = argKeys[keyIndex];
        if (!key) {
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(tool.schema, key)) {
          issues.push(`${toolName}: schema missing field "${key}"`);
        }
      }

      for (let keyIndex = 0; keyIndex < schemaKeys.length; keyIndex += 1) {
        const key = schemaKeys[keyIndex];
        if (!key) {
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(argShape, key)) {
          continue;
        }

        const fieldType = tool.schema[key]!;
        const { nullable } = unwrapForNullability(argShape[key]!);
        const expectedNullable = isFieldNullable(fieldType);
        if (nullable !== expectedNullable) {
          issues.push(
            `${toolName}: "${key}" nullability mismatch (schema ${expectedNullable ? 'allows' : 'disallows'} null, argsSchema ${nullable ? 'allows' : 'disallows'} null)`,
          );
        }
      }
    }

    expect(issues).toEqual([]);
  });
});
