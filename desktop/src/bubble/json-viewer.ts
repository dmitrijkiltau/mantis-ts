import { encodeJsonForAttribute, escapeHtml, isObjectRecord } from './shared';

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

export const renderJsonViewer = (value: unknown): string => (
  `<div class="json-viewer-root">${renderJsonNode(value)}</div>`
);

export const renderHttpJsonPreview = (content: string): string => {
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
