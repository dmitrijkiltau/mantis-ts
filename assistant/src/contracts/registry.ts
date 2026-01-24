import { CONTRACT_INTENT_CLASSIFICATION } from './intent.classification.js';
import { CONTRACT_LANGUAGE_DETECTION } from './language.detection.js';
import { CONTRACT_TOOL_ARGUMENT_EXTRACTION } from './tool.argument.extraction.js';
import { CONTRACT_ANSWER } from './answer.js';
import { CONTRACT_IMAGE_RECOGNITION } from './image.recognition.js';

/**
 * Aggregated contracts.
 * 
 * CORE CONTRACTS (always active):
 * - INTENT_CLASSIFICATION: Routes user intent
 * - TOOL_ARGUMENT_EXTRACTION: Extracts structured arguments
 * - ANSWER: Knowledge answers (strict/normal modes)
 * - CONVERSATIONAL_ANSWER: Small talk and greetings
 * 
 * MODALITY CONTRACTS (situational):
 * - IMAGE_RECOGNITION: Vision analysis
 * 
 * OPTIONAL CONTRACTS (off-path):
 * - RESPONSE_FORMATTING: Tool output presentation only
 * - LANGUAGE_DETECTION: Telemetry only
 */
export const CONTRACTS = {
  INTENT_CLASSIFICATION: CONTRACT_INTENT_CLASSIFICATION,
  LANGUAGE_DETECTION: CONTRACT_LANGUAGE_DETECTION,
  TOOL_ARGUMENT_EXTRACTION: CONTRACT_TOOL_ARGUMENT_EXTRACTION,
  ANSWER: CONTRACT_ANSWER,
  IMAGE_RECOGNITION: CONTRACT_IMAGE_RECOGNITION,
} as const;

