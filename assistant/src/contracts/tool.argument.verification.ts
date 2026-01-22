import { type ContractValidator } from '../types';
import { parseJsonObjectStrict, stripMarkdownFences } from './parsing.js';

/**
 * Contract for verifying extracted tool arguments against the user intent.
 */
export const CONTRACT_TOOL_ARGUMENT_VERIFICATION = {
  MODEL: 'llama3.2:3b',
  MODE: 'raw',
  EXPECTS_JSON: true,
  SYSTEM_PROMPT: `You verify extracted arguments for the tool "{{TOOL_NAME}}".
Check that the tool is appropriate and that the arguments align with the user input and schema.

CONTEXT:
{{CONTEXT_BLOCK}}

Decisions:
- execute: arguments are correct and sufficient.
- retry: arguments are likely wrong or incomplete but can be re-extracted.
- clarify: the tool is clearly intended but required info is missing or ambiguous.
- abort: the tool appears incorrect or unsafe for this request.

Only use "clarify" if you are confident the tool is the correct choice.

Return JSON only.

Expected schema (no formatting):
{
  "decision": "<execute|retry|clarify|abort>",
  "confidence": <number between 0.0 and 1.0>,
  "reason": "<brief explanation>",
  "missingFields": ["<field name>", ...],
  "suggestedArgs": { "<field>": "<value>", ... }
}`,
  USER_PROMPT: `User input:
{{USER_INPUT}}

Tool description:
{{TOOL_DESCRIPTION}}

Tool schema:
{{TOOL_SCHEMA}}

Extracted arguments:
{{EXTRACTED_ARGS}}`,
  RETRIES: {
    0: `Return valid JSON only with required fields.
Do not include extra keys.`,
  },
};

export type ToolArgumentVerificationDecision = 'execute' | 'retry' | 'clarify' | 'abort';

export type ToolArgumentVerificationResult = {
  decision: ToolArgumentVerificationDecision;
  confidence: number;
  reason: string;
  missingFields?: string[];
  suggestedArgs?: Record<string, unknown>;
};

/**
 * Types of validation errors for tool argument verification.
 */
export type ToolArgumentVerificationValidationError =
  | `INVALID_JSON:${string}`
  | `INVALID_SHAPE:${string}`
  | `INVALID_DECISION:${string}`
  | 'CONFIDENCE_OUT_OF_RANGE';

const allowedDecisions = new Set<ToolArgumentVerificationDecision>([
  'execute',
  'retry',
  'clarify',
  'abort',
]);

/**
 * Validator for tool argument verification contract output.
 */
export const validateToolArgumentVerification: ContractValidator<
  ToolArgumentVerificationResult,
  ToolArgumentVerificationValidationError
> = (raw) => {
  const cleaned = stripMarkdownFences(raw);
  if (!cleaned.trim().startsWith('{')) {
    return { ok: false, error: `INVALID_JSON:${raw}` };
  }

  let parsedCandidate: unknown;
  try {
    parsedCandidate = parseJsonObjectStrict(cleaned);
  } catch {
    return { ok: false, error: `INVALID_JSON:${raw}` };
  }

  const parsed = parsedCandidate as {
    decision?: unknown;
    confidence?: unknown;
    reason?: unknown;
    missingFields?: unknown;
    suggestedArgs?: unknown;
  };

  if (typeof parsed.decision !== 'string' || !allowedDecisions.has(parsed.decision as ToolArgumentVerificationDecision)) {
    return { ok: false, error: `INVALID_DECISION:${String(parsed.decision)}` };
  }

  if (typeof parsed.confidence !== 'number' || !Number.isFinite(parsed.confidence)) {
    return { ok: false, error: `INVALID_SHAPE:${String(parsed.confidence)}` };
  }

  if (parsed.confidence < 0 || parsed.confidence > 1) {
    return { ok: false, error: 'CONFIDENCE_OUT_OF_RANGE' };
  }

  if (typeof parsed.reason !== 'string' || !parsed.reason.trim()) {
    return { ok: false, error: `INVALID_SHAPE:${String(parsed.reason)}` };
  }

  if (parsed.missingFields !== undefined) {
    if (!Array.isArray(parsed.missingFields)) {
      return { ok: false, error: `INVALID_SHAPE:${String(parsed.missingFields)}` };
    }
    for (let index = 0; index < parsed.missingFields.length; index += 1) {
      if (typeof parsed.missingFields[index] !== 'string') {
        return { ok: false, error: `INVALID_SHAPE:${String(parsed.missingFields[index])}` };
      }
    }
  }

  if (parsed.suggestedArgs !== undefined) {
    if (
      !parsed.suggestedArgs ||
      typeof parsed.suggestedArgs !== 'object' ||
      Array.isArray(parsed.suggestedArgs)
    ) {
      return { ok: false, error: `INVALID_SHAPE:${String(parsed.suggestedArgs)}` };
    }
  }

  return {
    ok: true,
    value: {
      decision: parsed.decision as ToolArgumentVerificationDecision,
      confidence: parsed.confidence,
      reason: parsed.reason.trim(),
      missingFields: parsed.missingFields as string[] | undefined,
      suggestedArgs: parsed.suggestedArgs as Record<string, unknown> | undefined,
    },
  };
};
