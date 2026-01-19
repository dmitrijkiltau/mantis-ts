import { renderCodeBlock, renderMarkdown } from './markdown';
import { renderDirectoryPayload } from './payloads/directory';
import { renderFileOutputAccordion, renderFilePayload } from './payloads/file';
import { renderHttpResponsePayload } from './payloads/http';
import {
  buildPcInfoCompactCard,
  buildPcInfoSections,
  renderPcInfoPayload,
} from './payloads/pcinfo';
import { renderProcessListPayload } from './payloads/process';
import { renderSearchPayload } from './payloads/search';
import {
  isDirectoryPayload,
  isFilePayload,
  isHttpResponsePayload,
  isPcInfoPayload,
  isProcessListPayload,
  isSearchPayload,
} from './payloads/guards';
import {
  encodeJsonForAttribute,
  escapeHtml,
  safeJsonStringify,
  truncatePathForDisplay,
  formatUptime,
} from './shared';

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

  if (isPcInfoPayload(raw)) {
    return renderPcInfoPayload(raw);
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

  if (isPcInfoPayload(raw)) {
    const platform = raw.system?.platform ? raw.system.platform.toUpperCase() : 'SYSTEM';
    const hostname = raw.system?.hostname ?? platform;
    const subtitle = raw.system ? `UPTIME ${formatUptime(raw.system.uptime)}` : platform;
    const sections = buildPcInfoSections(raw);
    const useCompactCard = sections.totalCount === 1;

    if (useCompactCard) {
      const compact = buildPcInfoCompactCard(raw);
      if (!compact) {
        return renderPcInfoPayload(raw);
      }

      return `
        <div class="tool-output-card tool-output-card--pcinfo">
          <div class="tool-output-card-header">
            <div class="tool-output-accordion-title">
              <div class="tool-output-pcinfo-title">
                <span class="tool-output-accordion-label">${escapeHtml(compact.label)}</span>
                <span class="tool-output-pcinfo-host">${escapeHtml(compact.title)}</span>
              </div>
              <span class="tool-output-pcinfo-subtitle">${escapeHtml(compact.subtitle)}</span>
            </div>
          </div>
          <div class="tool-output-card-body">
            ${compact.body}
          </div>
        </div>
      `;
    }

    return `
      <details class="tool-output-accordion tool-output-accordion--pcinfo" data-view-root="true" data-view="preview">
        <summary class="tool-output-accordion-summary">
          <div class="tool-output-accordion-title">
            <div class="tool-output-pcinfo-title">
              <span class="tool-output-accordion-label">PC INFO</span>
              <span class="tool-output-pcinfo-host">${escapeHtml(hostname)}</span>
            </div>
            <span class="tool-output-pcinfo-subtitle">${escapeHtml(subtitle)}</span>
          </div>
        </summary>
        <div class="tool-output-accordion-body">
          ${renderPcInfoPayload(raw)}
        </div>
      </details>
    `;
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
  const summaryHtml = renderMarkdown(trimmed);
  const jsonAccordion = renderToolJsonAccordion(raw);

  return `
    <div class="tool-output">
      <div class="tool-output-summary">${summaryHtml}</div>
      ${jsonAccordion}
    </div>
  `;
};
