/**
 * Types of fields used in tool argument schemas.
 */
export type FieldType =
  | 'string'
  | 'boolean'
  | 'number'
  | 'object'
  | 'array'
  | 'string[]'
  | 'number[]'
  | 'boolean[]'
  | 'object[]'
  | 'string|null'
  | 'number|null'
  | 'boolean|null'
  | 'object|null'
  | 'array|null'
  | 'string[]|null'
  | 'number[]|null'
  | 'boolean[]|null'
  | 'object[]|null';

/**
 * Contract invocation mode.
 */
export type ContractMode = 'chat' | 'raw';

/**
 * Type defining the structure of a contract.
 */
export type ContractDefinition = {
  MODEL: string;
  SYSTEM_PROMPT: string;
  USER_PROMPT?: string;
  RETRIES?: Record<number, string>;
  EXPECTS_JSON?: boolean;
  MODE?: ContractMode;
};

/**
 * Type defining a contract with additional custom properties.
 */
export type ContractWithExtras = ContractDefinition & Record<string, unknown>;
