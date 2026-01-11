/**
 * Type of the result of validating a contract output.
 */
export type ValidationResult<Value = unknown, ErrorCode = string> =
  | { ok: true; value: Value }
  | { ok: false; error: ErrorCode };

/**
 * Type of a function that validates the raw output of a contract.
 */
export type ContractValidator<Value = unknown, ErrorCode = string> = (
  rawOutput: string,
) => ValidationResult<Value, ErrorCode>;
