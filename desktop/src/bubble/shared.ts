const LANGUAGE_ALIASES: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  json: 'json',
  md: 'markdown',
  yml: 'yaml',
  sh: 'bash',
  shell: 'bash',
  ps1: 'powershell',
};

export const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const isStringRecord = (value: unknown): value is Record<string, string> =>
  isObjectRecord(value) && Object.values(value).every((item) => typeof item === 'string');

export const trimTrailingNewline = (value: string): string => value.replace(/\n$/, '');

/**
 * Truncates long paths for compact UI display.
 */
export const truncatePathForDisplay = (value: string, maxLength = 52): string => {
  if (value.length <= maxLength) {
    return value;
  }
  const middle = '...';
  const keep = Math.max(8, Math.floor((maxLength - middle.length) / 2));
  return `${value.slice(0, keep)}${middle}${value.slice(value.length - keep)}`;
};

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return character;
    }
  });

export const normalizeLanguage = (language: string | null | undefined): string | null => {
  if (!language) {
    return null;
  }

  const trimmed = language.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  return LANGUAGE_ALIASES[trimmed] ?? trimmed;
};

export const inferLanguageFromPath = (path: string): string | null => {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/');
  const filename = segments[segments.length - 1];
  if (!filename || !filename.includes('.')) {
    return null;
  }

  const extension = filename.split('.').pop();
  if (!extension) {
    return null;
  }

  return normalizeLanguage(extension);
};

/**
 * Extracts a filename from a full path for display.
 */
export const getFilenameFromPath = (path: string): string => {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/');
  return segments[segments.length - 1] ?? path;
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

export const formatRuntime = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
};

/**
 * Formats uptime seconds into a human-readable short string.
 */
export const formatUptime = (seconds: number | null): string => {
  if (seconds === null || !Number.isFinite(seconds)) {
    return 'N/A';
  }

  const totalSeconds = Math.max(0, Math.floor(seconds));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);

  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0 || days > 0) {
    parts.push(`${hours}h`);
  }
  parts.push(`${minutes}m`);
  return parts.join(' ');
};

export const encodeJsonForAttribute = (value: string): string => encodeURIComponent(value);

/**
 * Encodes file paths for safe placement in HTML attributes.
 */
export const encodePathForAttribute = (value: string): string => encodeURIComponent(value);

export const safeJsonStringify = (value: unknown): string | null => {
  try {
    const serialized = JSON.stringify(value, null, 2);
    return typeof serialized === 'string' ? serialized : null;
  } catch {
    return null;
  }
};

export const deriveLanguageFromContentType = (contentType: string | null): string | null => {
  if (!contentType) {
    return null;
  }

  const normalized = (contentType.split(';')[0] ?? '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.includes('json') || normalized.endsWith('+json')) {
    return 'json';
  }

  if (normalized.includes('html')) {
    return 'html';
  }

  if (normalized.includes('xml')) {
    return 'xml';
  }

  if (normalized.includes('javascript')) {
    return 'javascript';
  }

  if (normalized.startsWith('text/')) {
    return 'text';
  }

  return null;
};

const VOID_HTML_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

export const formatHtmlContent = (content: string): string => {
  if (!content.includes('<')) {
    return content;
  }

  const tokenPattern = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>/g;
  const lines: string[] = [];
  let indent = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let inScriptStyle = false;

  const pushText = (text: string): void => {
    if (!text) {
      return;
    }
    if (inScriptStyle) {
      const parts = text.split(/\r?\n/);
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed) {
          lines.push(`${'  '.repeat(indent)}${trimmed}`);
        }
      }
      return;
    }
    const trimmed = text.replace(/\s+/g, ' ').trim();
    if (trimmed) {
      lines.push(`${'  '.repeat(indent)}${trimmed}`);
    }
  };

  while ((match = tokenPattern.exec(content)) !== null) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      pushText(content.slice(lastIndex, matchIndex));
    }

    const tagText = match[0] ?? '';
    const tagNameMatch = tagText.match(/^<\/?([a-zA-Z0-9:-]+)/);
    const tagName = (tagNameMatch?.[1] ?? '').toLowerCase();
    const isClosing = tagText.startsWith('</');
    const isSelfClosing = tagText.endsWith('/>') || VOID_HTML_TAGS.has(tagName);

    if (tagName === 'script' || tagName === 'style') {
      if (isClosing) {
        inScriptStyle = false;
      } else if (!isSelfClosing) {
        inScriptStyle = true;
      }
    }

    if (isClosing) {
      indent = Math.max(0, indent - 1);
    }

    lines.push(`${'  '.repeat(indent)}${tagText.trim()}`);

    if (!isClosing && !isSelfClosing) {
      indent += 1;
    }

    lastIndex = matchIndex + tagText.length;
  }

  if (lastIndex < content.length) {
    pushText(content.slice(lastIndex));
  }

  return lines.join('\n');
};
