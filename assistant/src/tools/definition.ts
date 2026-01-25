import type { FieldType } from '../contracts/definition.js';
import type { ZodType } from 'zod';

/**
 * Schema describing tool arguments.
 */
export type ToolSchema = Record<string, FieldType>;

/**
 * Definition for a tool that can be invoked by the orchestrator.
 */
export type ToolDefinition<Args extends Record<string, unknown>, Result> = {
  name: string;
  description: string;
  triggers: string[];
  schema: ToolSchema;
  argsSchema?: ZodType<Args>;
  execute(args: Args): Promise<Result> | Result;
};

/**
 * Base tool definition shape for runtime dispatch.
 */
export type ToolDefinitionBase = ToolDefinition<Record<string, unknown>, unknown>;
