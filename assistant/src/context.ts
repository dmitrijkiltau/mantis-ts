export type ContextEnvironment = {
  date?: string;
  time?: string;
  weekday?: string;
  os?: string;
  cwd?: string;
};

export type ContextState = {
  lastToolUsed?: string;
  lastToolStatus?: 'success' | 'error' | 'skipped' | 'none';
  lastToolError?: string;
  lastToolArgs?: Record<string, unknown> | null;
};

export type ContextUser = {
  language?: string;
  name?: string;
};

export type ContextHistory = {
  lastUserInput?: string;
  lastAssistantOutput?: string;
};

export type ContextSnapshot = {
  environment?: ContextEnvironment;
  state?: ContextState;
  user?: ContextUser;
  history?: ContextHistory;
};

const pruneUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(pruneUndefined);
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const next: Record<string, unknown> = {};
    for (let index = 0; index < entries.length; index += 1) {
      const [key, entryValue] = entries[index]!;
      if (entryValue === undefined) {
        continue;
      }
      next[key] = pruneUndefined(entryValue);
    }
    return next;
  }

  return value;
};

/**
 * Builds a stable JSON block for prompt context injection.
 */
export const buildContextBlock = (snapshot: ContextSnapshot): string => {
  const payload = {
    ENVIRONMENT: snapshot.environment ?? {},
    STATE: snapshot.state ?? {},
    USER: snapshot.user ?? {},
    HISTORY: snapshot.history ?? {},
  };

  return JSON.stringify(pruneUndefined(payload), null, 2);
};
