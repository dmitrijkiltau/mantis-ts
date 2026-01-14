import { marked } from 'marked';
import type { HttpResponseResult } from '../../assistant/src/tools/web/http-core';

type BubbleFilePayload = {
  action: 'file';
  path: string;
  content: string;
  truncated?: boolean;
};

type BubbleDirectoryEntry = {
  name: string;
  type: 'file' | 'directory' | 'other';
};

type BubbleDirectoryPayload = {
  action: 'directory';
  path: string;
  entries: BubbleDirectoryEntry[];
  truncated?: boolean;
};

type BubbleSearchMatch = {
  path: string;
  type: 'file' | 'directory';
};

type BubbleSearchPayload = {
  root: string;
  query: string;
  matches: BubbleSearchMatch[];
  truncated?: boolean;
};

type FileTreeRow = {
  name: string;
  kind: 'file' | 'folder' | 'other';
  depth: number;
  path?: string;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isObjectRecord(value) && Object.values(value).every((item) => typeof item === 'string');

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

const HIGHLIGHT_LANGS = new Set([
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'json',
  'bash',
  'powershell',
]);

const FILE_TREE_LANGS = new Set([
  'tree',
  'filesystem',
  'files',
  'folders',
  'dir',
  'directory',
  'filetree',
]);

const trimTrailingNewline = (value: string): string => value.replace(/\n$/, '');

const escapeHtml = (value: string): string =>
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

const normalizeLanguage = (language: string | null | undefined): string | null => {
  if (!language) {
    return null;
  }

  const trimmed = language.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  return LANGUAGE_ALIASES[trimmed] ?? trimmed;
};

const inferLanguageFromPath = (path: string): string | null => {
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

const highlightCodeBlock = (code: string, language: string | null): string => {
  const normalizedLanguage = normalizeLanguage(language);
  const looksLikeJson = normalizedLanguage === null && /^[\s]*[\[{]/.test(code);
  const shouldHighlight = normalizedLanguage ? HIGHLIGHT_LANGS.has(normalizedLanguage) : looksLikeJson;

  if (!shouldHighlight) {
    return escapeHtml(code);
  }

  const tokenPattern =
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
  const keywords = [
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
    'switch', 'case', 'break', 'continue', 'import', 'from', 'export', 'default', 'class',
    'new', 'try', 'catch', 'finally', 'throw', 'await', 'async', 'typeof', 'instanceof',
    'extends', 'implements', 'interface', 'type', 'enum', 'public', 'private', 'protected',
    'readonly', 'static', 'yield', 'in', 'of', 'as',
  ];
  const keywordRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
  const constantRegex = /\b(true|false|null|undefined)\b/g;
  const numberRegex = /\b(0x[\da-fA-F]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/g;

  const highlightPlainSegment = (segment: string): string =>
    escapeHtml(segment)
      .replace(keywordRegex, '<span class="token-keyword">$1</span>')
      .replace(constantRegex, '<span class="token-constant">$1</span>')
      .replace(numberRegex, '<span class="token-number">$1</span>');

  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(code)) !== null) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      const plainSegment = code.slice(lastIndex, matchIndex);
      result += highlightPlainSegment(plainSegment);
    }

    const tokenValue = match[0];
    const tokenClass = tokenValue.startsWith('//') || tokenValue.startsWith('/*')
      ? 'token-comment'
      : 'token-string';
    result += `<span class="${tokenClass}">${escapeHtml(tokenValue)}</span>`;
    lastIndex = matchIndex + tokenValue.length;
  }

  if (lastIndex < code.length) {
    const tail = code.slice(lastIndex);
    result += highlightPlainSegment(tail);
  }

  return result;
};

const renderCodeBlock = (code: string, language: string | null): string => {
  const normalizedLanguage = normalizeLanguage(language);
  const label = normalizedLanguage ? normalizedLanguage.toUpperCase() : 'TEXT';
  const highlighted = highlightCodeBlock(code, normalizedLanguage);
  const languageClass = normalizedLanguage ? `language-${normalizedLanguage}` : 'language-text';

  return `
    <div class="code-block">
      <div class="code-block-header">
        <span class="code-block-lang">${escapeHtml(label)}</span>
      </div>
      <pre><code class="${languageClass}">${highlighted}</code></pre>
    </div>
  `;
};

const getTreeDepth = (line: string): number => {
  const branchMatch = line.match(/(?:\u251c|\u2514|\+|\\|\|)?(?:\u2500|-){2,}/);
  const prefix = branchMatch && branchMatch.index !== undefined
    ? line.slice(0, branchMatch.index)
    : (line.match(/^[\s|`\u2502]+/)?.[0] ?? '');
  const verticals = prefix.match(/[|\u2502]/g);
  if (verticals) {
    return verticals.length;
  }

  const normalized = prefix.replace(/\t/g, '  ');
  return Math.floor(normalized.length / 2);
};

const stripTreeDecorations = (line: string): string => {
  const withoutLeading = line.replace(/^[\s|`\u2502]+/, '');
  const withoutBranch = withoutLeading.replace(/^(?:\u251c|\u2514|\+|\\|\|)?(?:\u2500|-){2,}\s*/, '');
  return withoutBranch.trim();
};

const parseFileTreeText = (text: string): FileTreeRow[] => {
  const lines = text.split(/\r?\n/);
  const rows: Array<{ name: string; depth: number; hasTrailingSlash: boolean }> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const depth = getTreeDepth(line);
    const name = stripTreeDecorations(line);
    if (!name) {
      continue;
    }

    rows.push({
      name: name.replace(/[\\/]+$/, ''),
      depth,
      hasTrailingSlash: /[\\/]$/.test(name),
    });
  }

  const result: FileTreeRow[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const current = rows[index];
    const next = rows[index + 1];
    const hasChildren = next ? next.depth > current.depth : false;
    const isFolder = current.hasTrailingSlash || hasChildren;

    result.push({
      name: current.name,
      depth: current.depth,
      kind: isFolder ? 'folder' : 'file',
    });
  }

  return result;
};

const looksLikeFileTree = (text: string): boolean =>
  /(?:\u251c|\u2514|\u2502)|(?:\|--|\\--|\+--|`--)/.test(text);

const renderFileTreeRows = (rows: FileTreeRow[]): string => {
  let html = '';

  for (const row of rows) {
    const badge =
      row.kind === 'folder' ? 'DIR' : row.kind === 'file' ? 'FILE' : 'ITEM';
    const depth = Number.isFinite(row.depth) ? row.depth : 0;
    const pathHtml = row.path
      ? `<span class="file-node-path">${escapeHtml(row.path)}</span>`
      : '';

    html += `
      <div class="file-tree-row is-${row.kind}" style="--depth:${depth}">
        <span class="file-node-badge" data-kind="${row.kind}">${badge}</span>
        <div class="file-node-info">
          <span class="file-node-name">${escapeHtml(row.name)}</span>
          ${pathHtml}
        </div>
      </div>
    `;
  }

  return html;
};

const renderFileTree = (
  rows: FileTreeRow[],
  header?: { title: string; path?: string; meta?: string; truncated?: boolean },
): string => {
  const headerHtml = header
    ? `
      <div class="file-tree-header">
        <span class="file-tree-title">${escapeHtml(header.title)}</span>
        ${header.path ? `<span class="file-tree-path">${escapeHtml(header.path)}</span>` : ''}
        ${header.meta ? `<span class="file-tree-meta">${escapeHtml(header.meta)}</span>` : ''}
        ${header.truncated ? '<span class="file-tree-warning">TRUNCATED</span>' : ''}
      </div>
    `
    : '';

  return `
    <div class="file-tree">
      ${headerHtml}
      <div class="file-tree-list">
        ${renderFileTreeRows(rows)}
      </div>
    </div>
  `;
};

const renderDirectoryPayload = (payload: BubbleDirectoryPayload): string => {
  const rows: FileTreeRow[] = [];

  for (const entry of payload.entries) {
    const kind = entry.type === 'directory' ? 'folder' : entry.type === 'file' ? 'file' : 'other';
    rows.push({ name: entry.name, kind, depth: 0 });
  }

  return renderFileTree(rows, {
    title: 'DIRECTORY',
    path: payload.path,
    meta: `${payload.entries.length} ITEMS`,
    truncated: payload.truncated,
  });
};

const renderSearchPayload = (payload: BubbleSearchPayload): string => {
  const rows: FileTreeRow[] = [];

  for (const match of payload.matches) {
    const normalized = match.path.replace(/\\/g, '/');
    const segments = normalized.split('/');
    const name = segments[segments.length - 1] || normalized;
    const kind = match.type === 'directory' ? 'folder' : 'file';
    rows.push({ name, kind, depth: 0, path: match.path });
  }

  return renderFileTree(rows, {
    title: 'SEARCH RESULTS',
    path: payload.root,
    meta: `QUERY: ${payload.query} | ${payload.matches.length} MATCHES`,
    truncated: payload.truncated,
  });
};

const renderFilePayload = (payload: BubbleFilePayload): string => {
  const language = inferLanguageFromPath(payload.path);
  const truncation = payload.truncated ? '<span class="file-tree-warning">TRUNCATED</span>' : '';

  return `
    <div class="file-preview">
      <div class="file-preview-header">
        <span class="file-preview-label">FILE</span>
        <span class="file-preview-path">${escapeHtml(payload.path)}</span>
        ${truncation}
      </div>
      ${renderCodeBlock(payload.content, language)}
    </div>
  `;
};

const isFilePayload = (value: unknown): value is BubbleFilePayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return record.action === 'file'
    && typeof record.path === 'string'
    && typeof record.content === 'string';
};

const isDirectoryPayload = (value: unknown): value is BubbleDirectoryPayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return record.action === 'directory'
    && typeof record.path === 'string'
    && Array.isArray(record.entries);
};

const isSearchPayload = (value: unknown): value is BubbleSearchPayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.root === 'string'
    && typeof record.query === 'string'
    && Array.isArray(record.matches);
};

const parseBubbleJson = (text: string): unknown | null => {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
};

const deriveLanguageFromContentType = (contentType: string | null): string | null => {
  if (!contentType) {
    return null;
  }

  const normalized = contentType.split(';')[0].trim().toLowerCase();
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

const formatBytes = (value: number): string => `${Math.max(0, Math.floor(value))} B`;

const renderHttpResponsePayload = (payload: HttpResponseResult): string => {
  const finalUrl = payload.finalUrl || payload.url;
  const statusLabel = `${payload.status}${payload.statusText ? ` ${payload.statusText.trim()}` : ''}`.trim();
  const language = deriveLanguageFromContentType(payload.contentType);
  const headerCount = Object.keys(payload.headers).length;
  const headerSummary = `${headerCount} entries`;
  const sizeText = `${formatBytes(payload.bytesRead)} read / ${formatBytes(payload.totalBytes)} total`;

  const badges: string[] = [];
  if (payload.redirected) {
    badges.push('<span class="http-preview-badge">REDIRECTED</span>');
  }
  if (payload.truncated) {
    badges.push('<span class="http-preview-badge warning">TRUNCATED</span>');
  }

  return `
    <div class="http-preview">
      <div class="http-preview-header">
        <span class="http-preview-label">HTTP RESPONSE</span>
        <span class="http-preview-status">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="http-preview-meta">
        <div class="http-meta-method">
          <span class="http-meta-key">METHOD</span>
          <span class="http-meta-value">${escapeHtml(payload.method)}</span>
        </div>
        <div class="http-meta-size">
          <span class="http-meta-key">SIZE</span>
          <span class="http-meta-value">${escapeHtml(sizeText)}</span>
        </div>
        <div class="http-meta-headers">
          <span class="http-meta-key">HEADERS</span>
          <span class="http-meta-value">${escapeHtml(headerSummary)}</span>
        </div>
        <div class="http-meta-content-type">
          <span class="http-meta-key">CONTENT-TYPE</span>
          <span class="http-meta-value">${escapeHtml(payload.contentType ?? 'UNKNOWN')}</span>
        </div>
        <div class="http-meta-url">
          <span class="http-meta-key">URL</span>
          <span class="http-meta-value">${escapeHtml(finalUrl)}</span>
        </div>
      </div>
      <div class="http-preview-body">
        ${renderCodeBlock(payload.content, language)}
      </div>
      <div class="http-preview-footer">
        ${badges.join('')}
      </div>
    </div>
  `;
};

const isHttpResponsePayload = (value: unknown): value is HttpResponseResult => {
  if (!isObjectRecord(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.url === 'string'
    && typeof record.finalUrl === 'string'
    && typeof record.method === 'string'
    && typeof record.status === 'number'
    && Number.isFinite(record.status)
    && typeof record.statusText === 'string'
    && isStringRecord(record.headers)
    && (typeof record.contentType === 'string' || record.contentType === null)
    && typeof record.content === 'string'
    && typeof record.bytesRead === 'number'
    && Number.isFinite(record.bytesRead)
    && typeof record.totalBytes === 'number'
    && Number.isFinite(record.totalBytes)
    && typeof record.truncated === 'boolean'
    && typeof record.redirected === 'boolean'
  );
};

const bubbleRenderer = new marked.Renderer();

bubbleRenderer.code = ({ text, lang }) => {
  const language = normalizeLanguage(lang ?? '');
  const isTreeLang = language ? FILE_TREE_LANGS.has(language) : false;

  if (isTreeLang || looksLikeFileTree(text)) {
    const rows = parseFileTreeText(text);
    if (rows.length > 0) {
      return renderFileTree(rows, { title: 'FILE TREE' });
    }
  }

  return renderCodeBlock(text, language);
};

bubbleRenderer.codespan = ({ text }) => `<code class="inline-code">${escapeHtml(text)}</code>`;

export const renderBubbleContent = (text: string): string => {
  const cleaned = trimTrailingNewline(text);
  const payload = parseBubbleJson(cleaned);

  if (payload) {
    if (isFilePayload(payload)) {
      return renderFilePayload(payload);
    }
    if (isDirectoryPayload(payload)) {
      return renderDirectoryPayload(payload);
    }
    if (isSearchPayload(payload)) {
      return renderSearchPayload(payload);
    }
    if (isHttpResponsePayload(payload)) {
      return renderHttpResponsePayload(payload);
    }
  }

  return marked.parse(cleaned, { renderer: bubbleRenderer }) as string;
};
