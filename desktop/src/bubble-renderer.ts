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
  sizeBytes?: number | null;
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

type ProcessInfo = {
  pid: number;
  name: string;
  cpu: number | null;
  memoryBytes: number | null;
  runtimeSeconds: number | null;
  command: string | null;
};

type ProcessListResult = {
  action: 'list';
  total: number;
  truncated: boolean;
  processes: ProcessInfo[];
};

type FileTreeRow = {
  name: string;
  kind: 'file' | 'folder' | 'other';
  depth: number;
  path?: string;
  sizeBytes?: number | null;
  itemCount?: number;
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
  'html',
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

/**
 * Truncates long paths for compact UI display.
 */
const truncatePathForDisplay = (value: string, maxLength = 52): string => {
  if (value.length <= maxLength) {
    return value;
  }
  const middle = '...';
  const keep = Math.max(8, Math.floor((maxLength - middle.length) / 2));
  return `${value.slice(0, keep)}${middle}${value.slice(value.length - keep)}`;
};

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

/**
 * Extracts a filename from a full path for display.
 */
const getFilenameFromPath = (path: string): string => {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/');
  return segments[segments.length - 1] ?? path;
};

const highlightHtmlAttributes = (raw: string): string => {
  if (!raw) {
    return '';
  }

  const attrRegex = /([^\s=]+)(\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(raw)) !== null) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      result += escapeHtml(raw.slice(lastIndex, matchIndex));
    }

    const name = match[1] ?? '';
    const value = match[2] ?? '';
    result += `<span class="token-attr-name">${escapeHtml(name)}</span>`;
    if (value) {
      result += `<span class="token-attr-value">${escapeHtml(value)}</span>`;
    }
    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < raw.length) {
    result += escapeHtml(raw.slice(lastIndex));
  }

  return result;
};

const highlightHtmlBlock = (code: string): string => {
  const tagPattern = /<\/?[a-zA-Z][^>\n]*>/g;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(code)) !== null) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      result += escapeHtml(code.slice(lastIndex, matchIndex));
    }

    const tagText = match[0] ?? '';
    const tagNameMatch = tagText.match(/^<\/?([a-zA-Z0-9:-]+)/);
    const tagName = tagNameMatch?.[1] ?? '';
    const tagStart = tagText.startsWith('</') ? '&lt;/' : '&lt;';
    const attrsStartIndex = tagNameMatch?.[0].length ?? 1;
    const attrs = tagText.slice(attrsStartIndex, -1);
    const attrsHtml = highlightHtmlAttributes(attrs);
    result += `${tagStart}<span class="token-tag-name">${escapeHtml(tagName)}</span>${attrsHtml}&gt;`;
    lastIndex = matchIndex + tagText.length;
  }

  if (lastIndex < code.length) {
    result += escapeHtml(code.slice(lastIndex));
  }

  return result;
};

const highlightCodeBlock = (code: string, language: string | null): string => {
  const normalizedLanguage = normalizeLanguage(language);
  const looksLikeJson = normalizedLanguage === null && /^[\s]*[\[{]/.test(code);
  const shouldHighlight = normalizedLanguage ? HIGHLIGHT_LANGS.has(normalizedLanguage) : looksLikeJson;

  if (!shouldHighlight) {
    return escapeHtml(code);
  }

  if (normalizedLanguage === 'html') {
    return highlightHtmlBlock(code);
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

/**
 * Wraps highlighted code lines for line-number styling.
 */
const addLineNumbers = (highlighted: string): string => {
  const lines = highlighted.split('\n');
  return lines
    .map((line) => `<span class="code-line">${line.length === 0 ? '&nbsp;' : line}</span>`)
    .join('');
};

const renderCodeBlock = (code: string, language: string | null, rawOverride?: string): string => {
  const normalizedLanguage = normalizeLanguage(language);
  const label = normalizedLanguage ? normalizedLanguage.toUpperCase() : 'TEXT';
  const highlighted = highlightCodeBlock(code, normalizedLanguage);
  const languageClass = normalizedLanguage ? `language-${normalizedLanguage}` : 'language-text';
  const rawAttr = encodeJsonForAttribute(rawOverride ?? code);

  // Check if this is markdown that should have preview
  const isMarkdown = normalizedLanguage === 'markdown';
  if (isMarkdown) {
    const preview = marked.parse(code, { renderer: bubbleRenderer }) as string;

    return `
      <div class="code-block code-block-markdown" data-view-root="true" data-view="preview" data-markdown-raw="${rawAttr}">
        <div class="code-block-header">
          <span class="code-block-lang">${escapeHtml(label)}</span>
          <div class="code-block-controls">
            <button
              type="button"
              class="code-block-button view-cycle-button"
              data-view-cycle="true"
              data-view-options="preview,raw"
              data-view-labels="PREVIEW,RAW"
              aria-label="Toggle markdown view"
            >
              <span class="view-button-text">PREVIEW</span>
            </button>
            <button type="button" class="code-block-button" data-code-action="copy" aria-label="Copy to clipboard">
              <span class="view-button-text">COPY</span>
            </button>
          </div>
        </div>
        <div class="code-block-body">
          <div class="code-block-preview" data-view-panel="preview">
            <div class="markdown-preview-content">${preview}</div>
          </div>
          <div class="code-block-raw" data-view-panel="raw">
            <pre><code class="${languageClass}">${highlighted}</code></pre>
          </div>
        </div>
      </div>
    `;
  }

  // Check if this is JSON that should have preview
  const isJson = normalizedLanguage === 'json';
  if (isJson) {
    let parsed: unknown = null;
    let viewer = '';
    try {
      parsed = JSON.parse(code);
      viewer = renderJsonViewer(parsed);
    } catch {
      // If parsing fails, fall back to regular code block
    }

    if (viewer) {
      const pretty = JSON.stringify(parsed, null, 2);
      const prettyHighlighted = highlightCodeBlock(pretty, 'json');
      return `
        <div class="code-block code-block-json" data-view-root="true" data-view="viewer" data-json-raw="${rawAttr}">
          <div class="code-block-header">
            <span class="code-block-lang">${escapeHtml(label)}</span>
            <div class="code-block-controls">
              <button
                type="button"
                class="code-block-button view-cycle-button"
                data-view-cycle="true"
                data-view-options="viewer,pretty"
                data-view-labels="STRUCTURED,PRETTY"
                aria-label="Toggle JSON view"
              >
                <span class="view-button-text">STRUCTURED</span>
              </button>
              <button type="button" class="code-block-button" data-code-action="copy" aria-label="Copy to clipboard">
                <span class="view-button-text">COPY</span>
              </button>
            </div>
          </div>
          <div class="code-block-body">
            <div class="code-block-json-pretty" data-view-panel="pretty">
              <pre><code class="${languageClass}">${prettyHighlighted}</code></pre>
            </div>
            <div class="code-block-json-viewer" data-view-panel="viewer">
              ${viewer}
            </div>
          </div>
        </div>
      `;
    }
  }

  return `
      <div class="code-block">
        <div class="code-block-header">
          <span class="code-block-lang">${escapeHtml(label)}</span>
          <div class="code-block-controls">
            <button type="button" class="code-block-button" data-code-action="copy" aria-label="Copy to clipboard">
              <span class="view-button-text">COPY</span>
            </button>
          </div>
        </div>
        <pre><code class="${languageClass}" data-raw="${rawAttr}">${highlighted}</code></pre>
      </div>
    `;
  };

/**
 * Builds file panels for accordion display.
 */
const renderFilePanels = (
  content: string,
  language: string | null,
): { html: string; view: string; viewOptions: Array<{ id: string; label: string }> } => {
  const normalizedLanguage = normalizeLanguage(language);
  const rawHighlighted = addLineNumbers(highlightCodeBlock(content, normalizedLanguage));
  const languageClass = normalizedLanguage ? `language-${normalizedLanguage}` : 'language-text';

  if (normalizedLanguage === 'markdown') {
    const preview = marked.parse(content, { renderer: bubbleRenderer }) as string;
    return {
      view: 'preview',
      viewOptions: [
        { id: 'preview', label: 'PREVIEW' },
        { id: 'raw', label: 'RAW' },
      ],
      html: `
        <div class="file-output-panel" data-view-panel="preview">
          <div class="markdown-preview-content">${preview}</div>
        </div>
        <div class="file-output-panel" data-view-panel="raw">
          <pre class="line-numbers"><code class="${languageClass}">${rawHighlighted}</code></pre>
        </div>
      `,
    };
  }

  if (normalizedLanguage === 'json') {
    try {
      const parsed = JSON.parse(content);
      const pretty = JSON.stringify(parsed, null, 2);
      const prettyHighlighted = addLineNumbers(highlightCodeBlock(pretty, 'json'));
      const viewer = renderJsonViewer(parsed);
      return {
        view: 'viewer',
        viewOptions: [
          { id: 'viewer', label: 'STRUCTURED' },
          { id: 'pretty', label: 'PRETTY' },
        ],
        html: `
          <div class="file-output-panel" data-view-panel="viewer">
            <div class="code-block-json-viewer">${viewer}</div>
          </div>
          <div class="file-output-panel" data-view-panel="pretty">
            <pre class="line-numbers"><code class="${languageClass}">${prettyHighlighted}</code></pre>
          </div>
        `,
      };
    } catch {
      // Fall back to raw view.
    }
  }

  return {
    view: 'raw',
    viewOptions: [],
    html: `
      <div class="file-output-panel" data-view-panel="raw">
        <pre class="line-numbers"><code class="${languageClass}">${rawHighlighted}</code></pre>
      </div>
    `,
  };
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
    if (!current) {
      continue;
    }
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

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const annotateFolderItemCounts = (rows: FileTreeRow[]): FileTreeRow[] => {
  const annotated = rows.map((row) => ({ ...row }));
  for (let index = 0; index < annotated.length; index += 1) {
    const current = annotated[index];
    if (!current || current.kind !== 'folder') {
      continue;
    }
    const baseDepth = Number.isFinite(current.depth) ? current.depth : 0;
    let childCount = 0;
    for (let nextIndex = index + 1; nextIndex < annotated.length; nextIndex += 1) {
      const next = annotated[nextIndex];
      if (!next) {
        continue;
      }
      const nextDepth = Number.isFinite(next.depth) ? next.depth : 0;
      if (nextDepth <= baseDepth) {
        break;
      }
      if (nextDepth === baseDepth + 1) {
        childCount += 1;
      }
    }

    if (childCount > 0) {
      annotated[index] = { ...current, itemCount: childCount };
    }
  }
  return annotated;
};

const renderFileTreeRows = (rows: FileTreeRow[]): string => {
  let html = '';
  const annotatedRows = annotateFolderItemCounts(rows);

  for (const row of annotatedRows) {
    const badge =
      row.kind === 'folder' ? 'DIR' : row.kind === 'file' ? 'FILE' : 'ITEM';
    const depth = Number.isFinite(row.depth) ? row.depth : 0;
    const pathHtml = row.path
      ? `<span class="file-node-path">${escapeHtml(row.path)}</span>`
      : '';
    const folderItemCountText =
      row.kind === 'folder' && typeof row.itemCount === 'number'
        ? `${row.itemCount} item${row.itemCount === 1 ? '' : 's'}`
        : null;
    const sizeText = row.sizeBytes === undefined
      ? folderItemCountText
      : row.sizeBytes === null
        ? 'N/A'
        : formatBytes(row.sizeBytes);
    const sizeHtml = sizeText
      ? `<span class="file-node-size">${escapeHtml(sizeText)}</span>`
      : '';

    html += `
      <div class="file-tree-row is-${row.kind}" style="--depth:${depth}">
        <span class="file-node-badge" data-kind="${row.kind}">${badge}</span>
        <div class="file-node-info">
          <span class="file-node-name">${escapeHtml(row.name)}</span>
          ${pathHtml}
        </div>
        ${sizeHtml}
      </div>
    `;
  }

  return html;
};

const renderFileTree = (
  rows: FileTreeRow[],
  header?: { title: string; path?: string; meta?: string; truncated?: boolean },
): string => {
  const metaHtml = header?.meta
    ? `<span class="file-tree-meta">${escapeHtml(header.meta)}</span>`
    : '';
  const warningHtml = header?.truncated
    ? '<span class="file-tree-warning">TRUNCATED</span>'
    : '';
  const headerMetaHtml = metaHtml || warningHtml
    ? `<div class="file-tree-header-meta">${metaHtml}${warningHtml}</div>`
    : '';
  const headerHtml = header
    ? `
      <div class="file-tree-header">
        <div class="file-tree-header-row">
          <span class="file-tree-title">${escapeHtml(header.title)}</span>
          ${headerMetaHtml}
        </div>
        ${header.path ? `<span class="file-tree-path">${escapeHtml(header.path)}</span>` : ''}
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
    const sizeBytes = entry.type === 'file' ? entry.sizeBytes ?? null : undefined;
    rows.push({ name: entry.name, kind, depth: 0, sizeBytes });
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

const formatRuntime = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
};

const renderProcessListPayload = (payload: ProcessListResult): string => {
  const header = `
    <div class="process-list-header">
      <span class="process-list-title">RUNNING PROCESSES</span>
      <span class="process-list-meta">${payload.processes.length} of ${payload.total} PROCESSES</span>
      ${payload.truncated ? '<span class="process-list-warning">TRUNCATED</span>' : ''}
    </div>
  `;

  const rows = payload.processes.map((proc) => {
    // Normalize CPU: if > 100, it's cumulative seconds, convert to display percentage
    // Use log scale for better visualization of high CPU time values
    let cpuBar = 0;
    let cpuText = 'N/A';
    if (proc.cpu !== null) {
      if (proc.cpu <= 100) {
        cpuBar = Math.max(0, proc.cpu);
        cpuText = `${proc.cpu.toFixed(1)}%`;
      } else {
        // Cumulative CPU seconds - use log scale for visualization (max at ~10000s = 100%)
        cpuBar = Math.min(100, (Math.log10(proc.cpu + 1) / 4) * 100);
        cpuText = `${proc.cpu.toFixed(1)}s`;
      }
    }
    const memText = proc.memoryBytes !== null ? formatBytes(proc.memoryBytes) : 'N/A';
    const runtimeText = proc.runtimeSeconds !== null ? formatRuntime(proc.runtimeSeconds) : 'N/A';
    const commandText = proc.command ? `<span class="process-command">${escapeHtml(proc.command)}</span>` : '';
    const cpuTextClass = cpuBar > 50 ? 'process-cpu-text-filled' : 'process-cpu-text-empty';

    return `
      <div class="process-row">
        <div class="process-main">
          <span class="process-pid">${proc.pid}</span>
          <span class="process-name">${escapeHtml(proc.name)}</span>
        </div>
        <div class="process-stats">
          <div class="process-stat">
            <span class="process-stat-label">CPU</span>
            <div class="process-cpu-bar">
              <div class="process-cpu-fill" style="width: ${cpuBar}%"></div>
              <span class="process-cpu-text ${cpuTextClass}">${cpuText}</span>
            </div>
          </div>
          <div class="process-stat">
            <span class="process-stat-label">MEM</span>
            <span class="process-stat-value">${memText}</span>
          </div>
          <div class="process-stat">
            <span class="process-stat-label">TIME</span>
            <span class="process-stat-value">${runtimeText}</span>
          </div>
        </div>
        ${commandText}
      </div>
    `;
  }).join('');

  return `
    <div class="process-list">
      ${header}
      <div class="process-list-body">
        ${rows}
      </div>
    </div>
  `;
};

const encodeJsonForAttribute = (value: string): string => encodeURIComponent(value);

/**
 * Encodes file paths for safe placement in HTML attributes.
 */
const encodePathForAttribute = (value: string): string => encodeURIComponent(value);

const renderJsonLiteral = (value: unknown): string => {
  if (typeof value === 'string') {
    return `<span class="json-value json-value-string">"${escapeHtml(value)}"</span>`;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<span class="json-value json-value-number">${escapeHtml(String(value))}</span>`;
  }

  if (typeof value === 'boolean') {
    return `<span class="json-value json-value-boolean">${escapeHtml(String(value))}</span>`;
  }

  if (value === null) {
    return '<span class="json-value json-value-null">null</span>';
  }

  return '<span class="json-value json-value-undefined">undefined</span>';
};

const renderJsonNode = (value: unknown, key?: string): string => {
  if (Array.isArray(value)) {
    const children = value
      .map((item, index) => renderJsonNode(item, `[${index}]`))
      .join('');

    return `
      <details open class="json-node json-node-array">
        <summary>
          ${key ? `<span class="json-node-key">${escapeHtml(key)}</span>: ` : ''}
          <span class="json-node-type">Array(${value.length})</span>
        </summary>
        <div class="json-node-children">
          ${children || '<div class="json-node-empty">Empty array</div>'}
        </div>
      </details>
    `;
  }

  if (isObjectRecord(value)) {
    const entries = Object.keys(value);
    const children = entries
      .map((entry) => renderJsonNode(value[entry], entry))
      .join('');

    return `
      <details open class="json-node json-node-object">
        <summary>
          ${key ? `<span class="json-node-key">${escapeHtml(key)}</span>: ` : ''}
          <span class="json-node-type">Object</span>
          <span class="json-node-count">${entries.length} keys</span>
        </summary>
        <div class="json-node-children">
          ${children || '<div class="json-node-empty">Empty object</div>'}
        </div>
      </details>
    `;
  }

  return `
    <div class="json-node json-node-primitive">
      ${key ? `<span class="json-node-key">${escapeHtml(key)}</span>: ` : ''}
      ${renderJsonLiteral(value)}
    </div>
  `;
};

const renderJsonViewer = (value: unknown): string => (
  `<div class="json-viewer-root">${renderJsonNode(value)}</div>`
);

const renderHttpJsonPreview = (content: string): string => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    return '';
  }

  const pretty = JSON.stringify(parsed, null, 2);
  const viewer = renderJsonViewer(parsed);
  const rawAttr = encodeJsonForAttribute(content);
  const toggleLabel = 'Structured JSON view';

  return `
    <div class="http-json-block" data-json-view="viewer" data-json-raw="${rawAttr}">
      <div class="http-json-body">
        <div class="http-json-pretty" data-json-mode="pretty">
          <pre><code class="language-json">${escapeHtml(pretty)}</code></pre>
        </div>
        <div class="http-json-viewer" data-json-mode="viewer">
          ${viewer}
        </div>
      </div>
      <div class="http-json-controls">
        <button type="button" class="http-json-button" data-http-json-action="toggle" aria-label="${toggleLabel}">
          <span class="http-json-button-text http-json-button-text--pretty">PRETTY</span>
          <span class="http-json-button-text http-json-button-text--viewer">STRUCTURED</span>
        </button>
        <button type="button" class="http-json-button" data-http-json-action="copy" aria-label="Copy JSON to clipboard">
          <span class="http-json-button-text">COPY</span>
        </button>
      </div>
    </div>
  `;
};

const renderFilePayload = (payload: BubbleFilePayload): string => {
  const language = inferLanguageFromPath(payload.path);
  const truncation = payload.truncated ? '<span class="file-tree-warning">TRUNCATED</span>' : '';
  const encodedPath = encodePathForAttribute(payload.path);

  return `
    <div class="file-preview">
      <div class="file-preview-header">
        <span class="file-preview-label">FILE</span>
        <button
          type="button"
          class="file-preview-path"
          data-file-path="${encodedPath}"
          aria-label="Open file in explorer"
          title="Open in file explorer"
        >${escapeHtml(payload.path)}</button>
        ${truncation}
      </div>
      ${renderCodeBlock(payload.content, language)}
    </div>
  `;
};

/**
 * Renders a file payload inside a tool output accordion.
 */
const renderFileOutputAccordion = (payload: BubbleFilePayload): string => {
  const language = inferLanguageFromPath(payload.path);
  const filename = getFilenameFromPath(payload.path);
  const truncatedPath = truncatePathForDisplay(payload.path);
  const pathTitle = escapeHtml(payload.path);
  const encodedPath = encodePathForAttribute(payload.path);
  const rawAttr = encodeJsonForAttribute(payload.content);
  const truncation = payload.truncated ? '<span class="file-tree-warning">TRUNCATED</span>' : '';
  const panels = renderFilePanels(payload.content, language);

  const viewOptions = panels.viewOptions;
  const viewButton = viewOptions.length > 1
    ? `
      <button
        type="button"
        class="code-block-button view-cycle-button"
        data-view-cycle="true"
        data-view-options="${viewOptions.map((option) => option.id).join(',')}"
        data-view-labels="${viewOptions.map((option) => option.label).join(',')}"
        aria-label="Toggle file view"
      >
        <span class="view-button-text">${viewOptions[0]?.label ?? 'VIEW'}</span>
      </button>
    `
    : '';

  const languageBadge = language
    ? `<span class="tool-output-file-lang">${escapeHtml(language.toUpperCase())}</span>`
    : '';

  return `
    <details
      class="tool-output-accordion tool-output-accordion--file"
      data-view-root="true"
      data-view="${escapeHtml(panels.view)}"
      data-raw-copy="${rawAttr}"
    >
      <summary class="tool-output-accordion-summary">
        <div class="tool-output-accordion-title">
          <div class="tool-output-file-title">
            <span class="tool-output-accordion-label">FILE</span>
            <span class="tool-output-file-name">${escapeHtml(filename)}</span>
            ${languageBadge}
            ${truncation}
          </div>
          <span class="tool-output-file-path" title="${pathTitle}">${escapeHtml(truncatedPath)}</span>
        </div>
        <div class="tool-output-accordion-controls" role="group" aria-label="File actions">
          ${viewButton}
          <button type="button" class="code-block-button" data-code-action="copy" aria-label="Copy file contents">
            <span class="view-button-text">COPY</span>
          </button>
          <button
            type="button"
            class="code-block-button"
            data-file-path="${encodedPath}"
            aria-label="Open file in explorer"
          >
            <span class="view-button-text">OPEN</span>
          </button>
        </div>
      </summary>
      <div class="tool-output-accordion-body">
        <div class="file-output-block">
          ${panels.html}
        </div>
      </div>
    </details>
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

const isProcessListPayload = (value: unknown): value is ProcessListResult => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return record.action === 'list'
    && typeof record.total === 'number'
    && typeof record.truncated === 'boolean'
    && Array.isArray(record.processes);
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

const formatHtmlContent = (content: string): string => {
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

const renderHttpResponsePayload = (
  payload: HttpResponseResult,
  options?: { compactHeader?: boolean },
): string => {
  const compactHeader = options?.compactHeader ?? false;
  const finalUrl = payload.finalUrl || payload.url;
  const statusLabel = `${payload.status}${payload.statusText ? ` ${payload.statusText.trim()}` : ''}`.trim();
  const language = deriveLanguageFromContentType(payload.contentType);
  const headerCount = Object.keys(payload.headers).length;
  const headerSummary = `${headerCount} entries`;
  const sizeText = `${formatBytes(payload.bytesRead)} read / ${formatBytes(payload.totalBytes)} total`;
  const jsonPreview = language === 'json' ? renderHttpJsonPreview(payload.content) : '';
  const formattedBody = language === 'html' ? formatHtmlContent(payload.content) : payload.content;
  const bodyContent = jsonPreview || renderCodeBlock(formattedBody, language, payload.content);

  const badges: string[] = [];
  if (payload.redirected) {
    badges.push('<span class="http-preview-badge">REDIRECTED</span>');
  }
  if (payload.truncated) {
    badges.push('<span class="http-preview-badge warning">TRUNCATED</span>');
  }

  const headerHtml = compactHeader
    ? ''
    : `
      <div class="http-preview-header">
        <span class="http-preview-label">HTTP RESPONSE</span>
        <span class="http-preview-status">${escapeHtml(statusLabel)}</span>
      </div>
    `;

  return `
    <div class="http-preview${compactHeader ? ' http-preview--compact' : ''}">
      ${headerHtml}
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
        ${bodyContent}
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

const safeJsonStringify = (value: unknown): string | null => {
  try {
    const serialized = JSON.stringify(value, null, 2);
    return typeof serialized === 'string' ? serialized : null;
  } catch {
    return null;
  }
};

const renderToolOutputPreview = (raw: unknown): string => {
  if (isFilePayload(raw)) {
    return renderFilePayload(raw);
  }

  if (isDirectoryPayload(raw)) {
    return renderDirectoryPayload(raw);
  }

  if (isSearchPayload(raw)) {
    return renderSearchPayload(raw);
  }

  if (isProcessListPayload(raw)) {
    return renderProcessListPayload(raw);
  }

  if (isHttpResponsePayload(raw)) {
    return renderHttpResponsePayload(raw);
  }

  const serialized = safeJsonStringify(raw);
  if (serialized) {
    return renderCodeBlock(serialized, 'json');
  }

  return renderCodeBlock(String(raw), 'text');
};

const renderToolJsonAccordion = (raw: unknown): string => {
  if (isFilePayload(raw)) {
    return renderFileOutputAccordion(raw);
  }

  if (isHttpResponsePayload(raw)) {
    const statusLabel = `${raw.status}${raw.statusText ? ` ${raw.statusText.trim()}` : ''}`.trim();
    const urlDisplay = truncatePathForDisplay(raw.finalUrl || raw.url);
    const urlTitle = escapeHtml(raw.finalUrl || raw.url);
    const rawAttr = encodeJsonForAttribute(raw.content);

    return `
      <details
        class="tool-output-accordion tool-output-accordion--http"
        data-view-root="true"
        data-view="preview"
        data-raw-copy="${rawAttr}"
      >
        <summary class="tool-output-accordion-summary">
          <div class="tool-output-accordion-title">
            <div class="tool-output-http-title">
              <span class="tool-output-accordion-label">HTTP</span>
              <span class="tool-output-http-status">${escapeHtml(statusLabel)}</span>
              <span class="tool-output-http-method">${escapeHtml(raw.method)}</span>
            </div>
            <span class="tool-output-http-url" title="${urlTitle}">${escapeHtml(urlDisplay)}</span>
          </div>
          <div class="tool-output-accordion-controls" role="group" aria-label="HTTP actions">
            <button type="button" class="code-block-button" data-code-action="copy" aria-label="Copy response body">
              <span class="view-button-text">COPY</span>
            </button>
          </div>
        </summary>
        <div class="tool-output-accordion-body">
          ${renderHttpResponsePayload(raw, { compactHeader: true })}
        </div>
      </details>
    `;
  }

  const serialized = safeJsonStringify(raw);
  const preview = renderToolOutputPreview(raw);
  const rawCopy = typeof raw === 'string' ? raw : serialized ?? String(raw);
  const rawAttr = encodeJsonForAttribute(rawCopy);

  return `
    <details class="tool-output-accordion" data-view-root="true" data-view="preview" data-raw-copy="${rawAttr}">
      <summary class="tool-output-accordion-summary">
        <div class="tool-output-accordion-title">
          <span class="tool-output-accordion-label">OUTPUT DATA</span>
          <span class="tool-output-accordion-hint">Preview output</span>
        </div>
        <div class="tool-output-accordion-controls" role="group" aria-label="Output actions">
          <button type="button" class="code-block-button" data-code-action="copy" aria-label="Copy output JSON">
            <span class="view-button-text">COPY</span>
          </button>
        </div>
      </summary>
      <div class="tool-output-accordion-body">
        <div class="tool-output-panel" data-view-panel="preview">
          <div class="tool-output-panel-label">PREVIEW</div>
          ${preview}
        </div>
      </div>
    </details>
  `;
};

/**
 * Renders a summary plus expandable JSON preview for structured tool output.
 */
export const renderToolOutputContent = (summary: string, raw: unknown): string => {
  const trimmed = summary.trim();
  const summaryHtml = marked.parse(trimmed, { renderer: bubbleRenderer }) as string;
  const jsonAccordion = renderToolJsonAccordion(raw);

  return `
    <div class="tool-output">
      <div class="tool-output-summary">${summaryHtml}</div>
      ${jsonAccordion}
    </div>
  `;
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
    if (isProcessListPayload(payload)) {
      return renderProcessListPayload(payload);
    }
    if (isHttpResponsePayload(payload)) {
      return renderHttpResponsePayload(payload);
    }
  }

  return marked.parse(cleaned, { renderer: bubbleRenderer }) as string;
};
