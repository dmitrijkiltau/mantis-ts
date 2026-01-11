import { type IntentClassificationValidationError } from "./contracts/intent.classification";
import { type ToolArgumentExtractionValidationError } from "./contracts/tool.argument.extraction";
import { type TextTransformationValidationError } from "./contracts/text.transformation";
import { type ScoringValidationError } from "./contracts/scoring.evaluation";
import { type StrictAnswerValidationError } from "./contracts/strict.answer";
import { type ErrorChannelValidationError } from "./contracts/error.channel";

/**
 * Types of validation errors.
 */
type ValidationError =
  | IntentClassificationValidationError
  | ToolArgumentExtractionValidationError
  | TextTransformationValidationError
  | ScoringValidationError
  | StrictAnswerValidationError
  | ErrorChannelValidationError;

/**
 * Type of the result of validating a contract output.
 */
export type ValidationResult =
  | { ok: true; value: any }
  | { ok: false; error: ValidationError };

/**
 * Type of a function that validates the raw output of a contract.
 */
export type ContractValidator = (rawOutput: string) => ValidationResult;
