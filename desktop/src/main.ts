import { OllamaClient } from '../../assistant/src/models/ollama';
import { Orchestrator } from '../../assistant/src/orchestrator';
import { Pipeline } from '../../assistant/src/pipeline';
import { Runner } from '../../assistant/src/runner';
import { Logger } from '../../assistant/src/logger';
import { getToolDefinition } from '../../assistant/src/tools/registry';
import './styles.css';
import { AssistantAvatar, AvatarMood } from './avatar';
import { marked } from 'marked';

const orchestrator = new Orchestrator();
const runner = new Runner(orchestrator, new OllamaClient());
const pipeline = new Pipeline(orchestrator, runner);

const form = document.getElementById('prompt-form') as HTMLFormElement | null;
const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement | null;
const historyElement = document.getElementById('history');
const avatarMount = document.getElementById('assistant-avatar') as HTMLDivElement | null;
const moodLabel = document.getElementById('avatar-mood-label');
const speechBubble = document.getElementById('speech-bubble');
const bubbleAnswer = document.getElementById('bubble-answer');
const logsConsole = document.getElementById('logs');
const avatar = avatarMount ? new AssistantAvatar(avatarMount) : null;
const toolResults = document.getElementById('tool-results');
const toolSearchForm = document.getElementById('tool-search-form') as HTMLFormElement | null;
const toolOpenForm = document.getElementById('tool-open-form') as HTMLFormElement | null;

// Status display elements
const statusSystem = document.getElementById('status-system');
const statusState = document.getElementById('status-state');
const statusAction = document.getElementById('status-action');

// Stats elements
const statQueries = document.getElementById('stat-queries');
const statRuntime = document.getElementById('stat-runtime');

let queryCount = 0;
let sessionStart = Date.now();

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

/**
 * Removes a trailing newline for cleaner markdown rendering.
 */
const trimTrailingNewline = (value: string): string => value.replace(/\n$/, '');

/**
 * Escapes HTML entities for safe rendering.
 */
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

/**
 * Normalizes language labels coming from markdown fences or file extensions.
 */
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

/**
 * Infers a language name from a file path.
 */
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
 * Extracts syntax-highlighted HTML for code blocks.
 */
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

  /**
   * Highlights non-string/comment segments while escaping HTML.
   */
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
 * Creates a consistent HTML wrapper for highlighted code blocks.
 */
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

/**
 * Computes indentation depth for tree-style listings.
 */
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

/**
 * Removes tree drawing characters from a listing line.
 */
const stripTreeDecorations = (line: string): string => {
  const withoutLeading = line.replace(/^[\s|`\u2502]+/, '');
  const withoutBranch = withoutLeading.replace(/^(?:\u251c|\u2514|\+|\\|\|)?(?:\u2500|-){2,}\s*/, '');
  return withoutBranch.trim();
};

/**
 * Parses tree-like text into a list of file rows.
 */
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

/**
 * Detects whether a code block looks like a file tree listing.
 */
const looksLikeFileTree = (text: string): boolean =>
  /(?:\u251c|\u2514|\u2502)|(?:\|--|\\--|\+--|`--)/.test(text);

/**
 * Renders file tree rows to HTML.
 */
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

/**
 * Renders a file tree listing with optional header metadata.
 */
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

/**
 * Renders a directory payload in a structured file list.
 */
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

/**
 * Renders a search payload in a structured file list.
 */
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

/**
 * Renders a file payload with syntax highlighting.
 */
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

/**
 * Checks if the payload looks like a file preview.
 */
const isFilePayload = (value: unknown): value is BubbleFilePayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return record.action === 'file'
    && typeof record.path === 'string'
    && typeof record.content === 'string';
};

/**
 * Checks if the payload looks like a directory listing.
 */
const isDirectoryPayload = (value: unknown): value is BubbleDirectoryPayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return record.action === 'directory'
    && typeof record.path === 'string'
    && Array.isArray(record.entries);
};

/**
 * Checks if the payload looks like a search result.
 */
const isSearchPayload = (value: unknown): value is BubbleSearchPayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.root === 'string'
    && typeof record.query === 'string'
    && Array.isArray(record.matches);
};

/**
 * Attempts to parse JSON payloads emitted by tools.
 */
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

/**
 * Renders markdown with custom speech bubble enhancements.
 */
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

/**
 * Renders the bubble payload into HTML.
 */
const renderBubbleContent = (text: string): string => {
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
  }

  return marked.parse(cleaned, { renderer: bubbleRenderer }) as string;
};

/**
 * Updates stats display
 */
const updateStats = () => {
  const runtimeSeconds = Math.floor((Date.now() - sessionStart) / 1000);
  if (statQueries) statQueries.textContent = `Q:${queryCount}`;
  if (statRuntime) statRuntime.textContent = `RT:${runtimeSeconds}s`;
};

/**
 * Adds log entry to the logs console
 */
const addLog = (message: string) => {
  if (logsConsole) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}] ${message}`;
    logsConsole.appendChild(entry);
    logsConsole.scrollTop = logsConsole.scrollHeight;
  }
};

/**
 * Shows answer in speech bubble with markdown support
 */
const showBubble = (text: string) => {
  if (speechBubble && bubbleAnswer) {
    bubbleAnswer.innerHTML = renderBubbleContent(text);
    speechBubble.classList.remove('hidden');
  }
};

/**
 * Hides speech bubble
 */
const hideBubble = () => {
  if (speechBubble) {
    speechBubble.classList.add('hidden');
  }
};

/**
 * Updates tablet status display
 */
const setStatus = (system: string, state: string, action: string) => {
  if (statusSystem) statusSystem.textContent = system;
  if (statusState) statusState.textContent = state;
  if (statusAction) statusAction.textContent = action;
};

const setMood = (mood: AvatarMood) => {
  avatar?.setMood(mood);
  if (moodLabel) {
    const title = mood.toUpperCase();
    moodLabel.textContent = title;
    moodLabel.setAttribute('data-mood', mood);
  }
};

setMood('idle');
setStatus('OPERATIONAL', 'AWAITING_INPUT', 'NONE');

/**
 * Formats tool output for display
 */
const formatPayload = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const renderToolResult = (title: string, payload: unknown, meta?: Record<string, unknown>) => {
  if (!toolResults) {
    return;
  }

  const placeholder = toolResults.querySelector('.tool-placeholder');
  if (placeholder) {
    placeholder.remove();
  }

  const card = document.createElement('div');
  card.className = 'tool-result-card';

  const heading = document.createElement('div');
  heading.className = 'tool-result-title';
  heading.textContent = title;
  card.appendChild(heading);

  if (meta && Object.keys(meta).length > 0) {
    const metaBlock = document.createElement('div');
    metaBlock.className = 'tool-result-meta';
    metaBlock.textContent = formatPayload(meta);
    card.appendChild(metaBlock);
  }

  const body = document.createElement('pre');
  body.textContent = formatPayload(payload);
  card.appendChild(body);

  toolResults.prepend(card);
};

const parseNumberField = (value: string | null | undefined): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
};

/**
 * Executes the search tool with UI-provided arguments.
 */
const handleSearchTool = async (event: Event) => {
  event.preventDefault();

  const queryInput = document.getElementById('search-query') as HTMLInputElement | null;
  const baseInput = document.getElementById('search-base') as HTMLInputElement | null;
  const startInput = document.getElementById('search-start') as HTMLInputElement | null;
  const maxResultsInput = document.getElementById('search-max-results') as HTMLInputElement | null;
  const maxDepthInput = document.getElementById('search-max-depth') as HTMLInputElement | null;
  const filesInput = document.getElementById('search-files') as HTMLInputElement | null;
  const dirsInput = document.getElementById('search-dirs') as HTMLInputElement | null;

  const query = queryInput?.value.trim() ?? '';
  const baseDir = baseInput?.value.trim() ?? '';
  if (!query || !baseDir) {
    return;
  }

  const args = {
    query,
    baseDir,
    startPath: startInput?.value.trim() || null,
    maxResults: parseNumberField(maxResultsInput?.value),
    maxDepth: parseNumberField(maxDepthInput?.value),
    includeFiles: filesInput ? filesInput.checked : true,
    includeDirectories: dirsInput ? dirsInput.checked : true,
  };

  try {
    setMood('thinking');
    setStatus('OPERATIONAL', 'PROCESSING', 'TOOL_SEARCH');
    addLog('Executing filesystem search tool...');

    const tool = getToolDefinition('search');
    const result = await tool.execute(args as Record<string, unknown>);

    setMood('speaking');
    setStatus('OPERATIONAL', 'COMPLETE', 'TOOL_SEARCH');
    addLog(`Search completed (${(result as { matches?: unknown[] }).matches?.length ?? 0} matches)`);

    renderToolResult('Filesystem Search', result, { args });
  } catch (error) {
    setMood('concerned');
    setStatus('ERROR', 'FAILED', 'TOOL_SEARCH');
    addLog(`Search error: ${String(error)}`);
    renderToolResult('Filesystem Search Error', String(error));
  } finally {
    window.setTimeout(() => setMood('idle'), 500);
  }
};

/**
 * Executes the filesystem open tool with UI-provided arguments.
 */
const handleOpenTool = async (event: Event) => {
  event.preventDefault();

  const actionSelect = document.getElementById('open-action') as HTMLSelectElement | null;
  const pathInput = document.getElementById('open-path') as HTMLInputElement | null;
  const limitInput = document.getElementById('open-limit') as HTMLInputElement | null;
  const maxBytesInput = document.getElementById('open-max-bytes') as HTMLInputElement | null;

  const action = actionSelect?.value ?? '';
  const path = pathInput?.value.trim() ?? '';
  if (!action || !path) {
    return;
  }

  const args = {
    action,
    path,
    limit: parseNumberField(limitInput?.value),
    maxBytes: parseNumberField(maxBytesInput?.value),
  };

  try {
    setMood('thinking');
    setStatus('OPERATIONAL', 'PROCESSING', 'TOOL_FILESYSTEM');
    addLog(`Executing filesystem tool (${action})...`);

    const tool = getToolDefinition('filesystem');
    const result = await tool.execute(args as Record<string, unknown>);

    setMood('speaking');
    setStatus('OPERATIONAL', 'COMPLETE', 'TOOL_FILESYSTEM');
    addLog(`Filesystem ${action} completed`);

    renderToolResult('Filesystem Open', result, { args });
  } catch (error) {
    setMood('concerned');
    setStatus('ERROR', 'FAILED', 'TOOL_FILESYSTEM');
    addLog(`Filesystem error: ${String(error)}`);
    renderToolResult('Filesystem Open Error', String(error));
  } finally {
    window.setTimeout(() => setMood('idle'), 500);
  }
};

/**
 * Handles user question submission
 */
async function handleQuestion(event: Event) {
  event.preventDefault();

  if (!promptInput || !form || !historyElement) {
    return;
  }

  const question = promptInput.value.trim();
  if (!question) {
    return;
  }

  queryCount++;
  updateStats();

  const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
  submitButton?.setAttribute('disabled', 'true');
  hideBubble();
  setStatus('OPERATIONAL', 'PROCESSING', 'QUERY_RECEIVED');
  setMood('listening');
  addLog(`Query received: "${question.substring(0, 50)}..."`);
  Logger.info('ui', 'User submitted question', { questionLength: question.length });

  const settle = () => {
    submitButton?.removeAttribute('disabled');
    setStatus('OPERATIONAL', 'AWAITING_INPUT', 'COMPLETE');
    window.setTimeout(() => {
      setMood('idle');
    }, 650);
  };

  try {
    setMood('thinking');
    setStatus('OPERATIONAL', 'ANALYZING', 'CONTRACT_VALIDATION');
    addLog('Analyzing query with contracts...');
    const result = await pipeline.run(question);

    const record = document.createElement('div');
    record.className = 'answer-card';
    if (result.ok) {
      if (result.kind === 'tool') {
        Logger.info('ui', `Tool result received: ${result.tool}`);
        setMood('speaking');
        setStatus('OPERATIONAL', 'COMPLETE', `TOOL_${result.tool.toUpperCase()}`);
        addLog(`Tool executed: ${result.tool}`);
        
        // Don't show 'Tool: time Result:' - just show the actual result
        const answerText = formatPayload(result.result);
        showBubble(answerText);
        
        record.innerHTML = `
          <h3>Tool: ${result.tool}</h3>
          <pre>${formatPayload(result.result)}</pre>
          <p>Args: ${formatPayload(result.args)}</p>
          <p>Attempts: ${result.attempts}</p>
        `;
      } else {
        Logger.info('ui', 'Strict answer generated');
        setMood('speaking');
        setStatus('OPERATIONAL', 'COMPLETE', 'ANSWER_GENERATED');
        addLog('Answer generated successfully');
        
        showBubble(result.value);
        
        record.innerHTML = `
          <h3>Answer</h3>
          <pre>${result.value}</pre>
          <p>Attempts: ${result.attempts}</p>
        `;
      }
    } else {
      Logger.error('ui', `Pipeline failed at stage: ${result.stage}`);
      setMood('concerned');
      setStatus('ERROR', 'FAILED', result.stage.toUpperCase());
      const errorDetail = result.error
        ? `${result.error.code}: ${result.error.message}`
        : 'No valid response after retries.';
      addLog(`ERROR: ${errorDetail}`);
      
      showBubble(`Error: ${errorDetail}`);
      
      record.innerHTML = `
        <h3>Error (${result.stage})</h3>
        <pre>${errorDetail}</pre>
        <p>Attempts: ${result.attempts}</p>
      `;
    }
    historyElement.prepend(record);
  } catch (error) {
    Logger.error('ui', 'Unhandled exception in pipeline', error);
    setMood('concerned');
    setStatus('ERROR', 'EXCEPTION', 'UNHANDLED');
    addLog(`FATAL ERROR: ${String(error)}`);
    
    const errCard = document.createElement('div');
    errCard.className = 'answer-card';
    errCard.innerHTML = `<h3>Error</h3><pre>${String(error)}</pre>`;
    historyElement.prepend(errCard);
    
    showBubble(`Critical Error: ${String(error)}`);
  } finally {
    settle();
    updateStats();
  }
}

// Tab switching functionality
const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.tablet-panel');

for (const button of tabButtons) {
  button.addEventListener('click', () => {
    const targetTab = button.getAttribute('data-tab');
    
    // Update active states
    for (const btn of tabButtons) {
      btn.classList.remove('active');
    }
    button.classList.add('active');
    
    for (const panel of tabPanels) {
      panel.classList.remove('active');
    }
    
    const targetPanel = document.getElementById(`panel-${targetTab}`);
    if (targetPanel) {
      targetPanel.classList.add('active');
    }
    
    addLog(`Switched to ${targetTab!.toUpperCase()} panel`);
  });
}

form?.addEventListener('submit', handleQuestion);
toolSearchForm?.addEventListener('submit', handleSearchTool);
toolOpenForm?.addEventListener('submit', handleOpenTool);

// Update runtime counter every second
setInterval(updateStats, 1000);

addLog('MANTIS Desktop initialized successfully');
addLog('System ready for queries');
