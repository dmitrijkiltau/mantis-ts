import { marked } from 'marked';
import { parseFileTreeText, looksLikeFileTree, renderFileTree } from './file-tree';
import { renderJsonViewer } from './json-viewer';
import {
  encodeForAttribute,
  escapeHtml,
  isPackageJsonPath,
  normalizeLanguage,
} from './shared';

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

export const renderCodeBlock = (
  code: string,
  language: string | null,
  rawOverride?: string,
  context?: { filePath?: string },
): string => {
  const normalizedLanguage = normalizeLanguage(language);
  const label = normalizedLanguage ? normalizedLanguage.toUpperCase() : 'TEXT';
  const highlighted = highlightCodeBlock(code, normalizedLanguage);
  const languageClass = normalizedLanguage ? `language-${normalizedLanguage}` : 'language-text';
  const rawAttr = encodeForAttribute(rawOverride ?? code);

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
      viewer = renderJsonViewer(parsed, {
        linkDependencies: isPackageJsonPath(context?.filePath ?? null),
      });
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
export const renderFilePanels = (
  content: string,
  language: string | null,
  filePath?: string,
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
      const viewer = renderJsonViewer(parsed, {
        linkDependencies: isPackageJsonPath(filePath ?? null),
      });
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

export const bubbleRenderer = new marked.Renderer();

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

export const renderMarkdown = (text: string): string => (
  marked.parse(text, { renderer: bubbleRenderer }) as string
);
