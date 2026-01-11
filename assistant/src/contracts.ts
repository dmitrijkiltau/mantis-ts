import { CONTRACT_INTENT_CLASSIFICATION } from './contracts/intent.classification.js';
import { CONTRACT_TOOL_ARGUMENT_EXTRACTION } from './contracts/tool.argument.extraction.js';
import { CONTRACT_TEXT_TRANSFORMATION } from './contracts/text.transformation.js';
import { CONTRACT_SCORING_EVALUATION } from './contracts/scoring.evaluation.js';
import { CONTRACT_STRICT_ANSWER } from './contracts/strict.answer.js';
import { CONTRACT_ERROR_CHANNEL } from './contracts/error.channel.js';

/**
 * Aggregated contracts.
 */
export const CONTRACTS = {
  INTENT_CLASSIFICATION: CONTRACT_INTENT_CLASSIFICATION,
  TOOL_ARGUMENT_EXTRACTION: CONTRACT_TOOL_ARGUMENT_EXTRACTION,
  TEXT_TRANSFORMATION: CONTRACT_TEXT_TRANSFORMATION,
  SCORING_EVALUATION: CONTRACT_SCORING_EVALUATION,
  STRICT_ANSWER: CONTRACT_STRICT_ANSWER,
  ERROR_CHANNEL: CONTRACT_ERROR_CHANNEL,
};
