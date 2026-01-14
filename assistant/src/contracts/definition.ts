/**
 * Types of fields used in tool argument schemas.
 */
export type FieldType =
  | 'string'
  | 'boolean'
  | 'number'
  | 'object'
  | 'string|null'
  | 'number|null'
  | 'boolean|null'
  | 'object|null';

/**
 * Type defining the structure of a contract.
 */
export type ContractDefinition = {
  MODEL: string;
  SYSTEM_PROMPT: string;
  USER_PROMPT?: string;
  RETRIES?: Record<number, string>;
};

/**
 * Type defining a contract with additional custom properties.
 */
export type ContractWithExtras = ContractDefinition & Record<string, unknown>;
