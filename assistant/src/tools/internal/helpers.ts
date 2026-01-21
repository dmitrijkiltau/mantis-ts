/* -------------------------------------------------------------------------
 * SHARED TOOL HELPERS
 * ------------------------------------------------------------------------- */

/**
 * Clamps a value to a positive integer within bounds.
 * Returns fallback if value is invalid (null, undefined, non-numeric, or <= 0).
 */
export const clampPositiveInteger = (
  value: number | null | undefined,
  fallback: number,
  max: number,
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  const normalized = Math.floor(value);
  return Math.min(normalized, max);
};

/**
 * Clamps a value to a non-negative integer within bounds.
 * Returns fallback if value is invalid (null, undefined, non-numeric, or < 0).
 */
export const clampNonNegativeInteger = (
  value: number | null | undefined,
  fallback: number,
  max: number,
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }

  const normalized = Math.floor(value);
  return Math.min(normalized, max);
};

/**
 * Detects the current platform using navigator.userAgent.
 * Returns 'win32', 'darwin', 'linux', or 'unknown'.
 */
export const getPlatform = (): string => {
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('win')) return 'win32';
    if (ua.includes('mac')) return 'darwin';
    if (ua.includes('linux')) return 'linux';
  }
  return 'unknown';
};

/**
 * Normalizes a file system path by:
 * - Converting all backslashes to forward slashes
 * - Removing trailing slashes
 */
export const normalizePath = (path: string): string => {
  return path.replace(/[\\/]+/g, '/').replace(/\/+$/, '');
};

/**
 * Validates that a path string is non-empty after trimming.
 * Throws an error if the path is empty or invalid.
 */
export const validatePath = (rawPath: string): string => {
  const candidate = rawPath.trim();
  if (!candidate) {
    throw new Error('Path is required for filesystem access.');
  }
  return candidate;
};

/**
 * Escapes single quotes in a PowerShell string by doubling them.
 * Used for safe string interpolation in PowerShell scripts.
 */
export const escapePowerShellString = (value: string): string => {
  return value.replace(/'/g, "''");
};

/**
 * Normalizes and validates action strings.
 * Converts to lowercase, removes separators, and checks against allowed set.
 */
type NormalizeActionOptions<T extends string> = {
  subject?: string;
  aliases?: Map<string, T>;
  allowedHint?: string;
};

export const normalizeAction = <T extends string>(
  action: string,
  allowedActions: Set<T>,
  options: NormalizeActionOptions<T> = {},
): T => {
  const normalized = action.trim().toLowerCase().replace(/[_\-\s]/g, '');

  for (const allowed of allowedActions) {
    if (normalized === allowed || normalized.includes(allowed)) {
      return allowed;
    }
  }

  if (options.aliases) {
    const aliasMatch = options.aliases.get(normalized);
    if (aliasMatch) {
      return aliasMatch;
    }
  }

  const subjectLabel = options.subject ? `${options.subject} action` : 'action';
  const allowedMessage =
    options.allowedHint ?? `Allowed: ${[...allowedActions].join(', ')}`;
  throw new Error(`Unsupported ${subjectLabel} "${action}". ${allowedMessage}`);
};
