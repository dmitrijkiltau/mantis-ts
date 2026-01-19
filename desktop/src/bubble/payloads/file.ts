import type { BubbleFilePayload } from '../bubble-types';
import {
  encodeJsonForAttribute,
  encodePathForAttribute,
  escapeHtml,
  getFilenameFromPath,
  inferLanguageFromPath,
  truncatePathForDisplay,
} from '../shared';
import { renderCodeBlock, renderFilePanels } from '../markdown';

export const renderFilePayload = (payload: BubbleFilePayload): string => {
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
export const renderFileOutputAccordion = (payload: BubbleFilePayload): string => {
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
