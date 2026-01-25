import type { ToolName } from "../tools/registry";

export type PipelineStage =
  | 'intent'
  | 'tool_arguments'
  | 'tool_execution'
  | 'image_recognition'
  | 'strict_answer';

export type PipelineError = {
  code: string;
  message: string;
};

export type ImageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  data: string;
  source: 'upload' | 'drop' | 'screenshot';
};

export type PipelineResult =
  | {
      ok: true;
      kind: 'strict_answer';
      value: string;
      intent?: string;
      language: string;
      attempts: number;
    }
  | {
      ok: true;
      kind: 'tool';
      tool: string;
      args: Record<string, unknown>;
      result: unknown;
      summary?: string;
      intent: string;
      language: string;
      attempts: number;
    }
  | {
      ok: false;
      kind: 'error';
      stage: PipelineStage;
      attempts: number;
      error?: PipelineError;
    };

export type PipelineRunOptions = {
  intentModelOverride?: string;
  allowLowScoreRetry?: boolean;
  signal?: AbortSignal;
};

export type DirectToolExecutionResult = {
  result: PipelineResult;
  metadata: {
    tool?: ToolName;
    reason: string;
  };
};

export type PipelineSummaryStage =
  | PipelineStage
  | 'direct_tool'
  | 'intent_failed'
  | 'non_tool_intent'
  | 'tool_not_found'
  | 'argument_extraction_failed'
  | 'null_tool_arguments';

export type PipelineSummaryExtras = {
  reason?: string;
  tool?: ToolName;
  intent?: string;
  imageCount?: number;
  error?: PipelineError;
};
