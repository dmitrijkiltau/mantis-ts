import { CONTRACT_INTENT_CLASSIFICATION } from './intent.classification.js';
import { CONTRACT_LANGUAGE_DETECTION } from './language.detection.js';
import { CONTRACT_TOOL_ARGUMENT_EXTRACTION } from './tool.argument.extraction.js';
import { CONTRACT_TOOL_ARGUMENT_VERIFICATION } from './tool.argument.verification.js';
import { CONTRACT_SCORING_EVALUATION } from './scoring.evaluation.js';
import { CONTRACT_ANSWER } from './answer.js';
import { CONTRACT_CONVERSATIONAL_ANSWER } from './conversational.answer.js';
import { CONTRACT_RESPONSE_FORMATTING } from './response.formatting.js';
import { CONTRACT_IMAGE_RECOGNITION } from './image.recognition.js';

/**
 * Aggregated contracts.
 * 
 * CORE CONTRACTS (always active):
 * - INTENT_CLASSIFICATION: Routes user intent
 * - TOOL_ARGUMENT_EXTRACTION: Extracts structured arguments
 * - TOOL_ARGUMENT_VERIFICATION: Validates tool execution safety
 * - ANSWER: Knowledge answers (strict/normal modes)
 * - CONVERSATIONAL_ANSWER: Small talk and greetings
 * 
 * MODALITY CONTRACTS (situational):
 * - IMAGE_RECOGNITION: Vision analysis
 * 
 * OPTIONAL CONTRACTS (off-path):
 * - RESPONSE_FORMATTING: Tool output presentation only
 * - SCORING_EVALUATION: Debug/QA only
 * - LANGUAGE_DETECTION: Telemetry only
 */
export const CONTRACTS = {
  INTENT_CLASSIFICATION: CONTRACT_INTENT_CLASSIFICATION,
  LANGUAGE_DETECTION: CONTRACT_LANGUAGE_DETECTION,
  TOOL_ARGUMENT_EXTRACTION: CONTRACT_TOOL_ARGUMENT_EXTRACTION,
  TOOL_ARGUMENT_VERIFICATION: CONTRACT_TOOL_ARGUMENT_VERIFICATION,
  SCORING_EVALUATION: CONTRACT_SCORING_EVALUATION,
  ANSWER: CONTRACT_ANSWER,
  CONVERSATIONAL_ANSWER: CONTRACT_CONVERSATIONAL_ANSWER,
  RESPONSE_FORMATTING: CONTRACT_RESPONSE_FORMATTING,
  IMAGE_RECOGNITION: CONTRACT_IMAGE_RECOGNITION,
} as const;

