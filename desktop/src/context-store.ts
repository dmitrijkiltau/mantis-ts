import type { ContextSnapshot } from '../../assistant/src/context';
import type { PipelineResult } from '../../assistant/src/pipeline';

const MAX_HISTORY_CHARS = 400;
const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const pad2 = (value: number): string => String(value).padStart(2, '0');

const buildEnvironmentSnapshot = (): ContextSnapshot['environment'] => {
  const now = new Date();
  const os = typeof navigator === 'undefined'
    ? 'Unknown'
    : navigator.platform || navigator.userAgent || 'Unknown';
  return {
    date: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
    time: `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`,
    weekday: WEEKDAYS[now.getDay()] ?? 'Unknown',
    os,
  };
};

const clampText = (value: string): string => {
  if (value.length <= MAX_HISTORY_CHARS) {
    return value;
  }
  return `${value.slice(0, MAX_HISTORY_CHARS - 3)}...`;
};

const formatAssistantOutput = (result: PipelineResult): string => {
  if (!result.ok) {
    const errorText = result.error
      ? `${result.error.code}: ${result.error.message}`
      : 'Unknown error';
    return `Error: ${errorText}`;
  }

  if (result.kind === 'tool') {
    if (result.summary) {
      return result.summary;
    }
    if (typeof result.result === 'string') {
      return result.result;
    }
    try {
      return JSON.stringify(result.result);
    } catch {
      return String(result.result);
    }
  }

  return result.value;
};

/**
 * Maintains a rolling context snapshot for prompt injection.
 */
export class ContextStore {
  private snapshot: ContextSnapshot = {};

  getSnapshot(): ContextSnapshot {
    return {
      ...this.snapshot,
      environment: {
        ...this.snapshot.environment,
        ...buildEnvironmentSnapshot(),
      },
    };
  }

  /**
   * Updates the snapshot using the latest user input and pipeline result.
   */
  updateAfterRun(userInput: string, result: PipelineResult): void {
    const assistantOutput = clampText(formatAssistantOutput(result));
    this.snapshot.history = {
      lastUserInput: clampText(userInput),
      lastAssistantOutput: assistantOutput,
    };

    if (result.ok) {
      this.snapshot.user = {
        ...this.snapshot.user,
        language: result.language,
      };
    }

    if (result.ok && result.kind === 'tool') {
      this.snapshot.state = {
        lastToolUsed: result.tool,
        lastToolStatus: 'success',
        lastToolArgs: result.args,
      };
      return;
    }

    if (!result.ok && result.stage === 'tool_execution') {
      this.snapshot.state = {
        lastToolUsed: this.snapshot.state?.lastToolUsed ?? 'none',
        lastToolStatus: 'error',
        lastToolError: result.error?.message ?? 'Tool execution failed.',
      };
      return;
    }

    this.snapshot.state = {
      lastToolUsed: 'none',
      lastToolStatus: 'none',
      lastToolArgs: null,
    };
  }

  /**
   * Updates the working directory for prompt context.
   */
  setWorkingDirectory(path: string | null): void {
    const trimmed = typeof path === 'string' ? path.trim() : '';
    if (!trimmed) {
      if (this.snapshot.environment) {
        const { cwd, ...rest } = this.snapshot.environment;
        this.snapshot.environment = Object.keys(rest).length > 0 ? rest : undefined;
      }
      return;
    }

    this.snapshot.environment = {
      ...this.snapshot.environment,
      cwd: trimmed,
    };
  }
}
