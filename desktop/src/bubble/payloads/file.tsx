import type { Component } from 'solid-js';
import type { BubbleFilePayload } from '../bubble-types';
import {
  encodeJsonForAttribute,
  encodePathForAttribute,
  getFilenameFromPath,
  inferLanguageFromPath,
  truncatePathForDisplay,
} from '../shared';
import { renderCodeBlock, renderFilePanels } from '../markdown';

export const FilePayloadView: Component<{ payload: BubbleFilePayload }> = (props) => {
  const language = inferLanguageFromPath(props.payload.path);
  const encodedPath = encodePathForAttribute(props.payload.path);

  return (
    <div class="file-preview">
      <div class="file-preview-header">
        <span class="file-preview-label">FILE</span>
        <button
          type="button"
          class="button file-preview-path"
          data-file-path={encodedPath}
          aria-label="Open file in explorer"
          title="Open in file explorer"
        >
          {props.payload.path}
        </button>
        {props.payload.truncated ? <span class="file-tree-warning">TRUNCATED</span> : null}
      </div>
      <div innerHTML={renderCodeBlock(props.payload.content, language)} />
    </div>
  );
};

export const FileOutputAccordionView: Component<{ payload: BubbleFilePayload }> = (props) => {
  const language = inferLanguageFromPath(props.payload.path);
  const filename = getFilenameFromPath(props.payload.path);
  const truncatedPath = truncatePathForDisplay(props.payload.path);
  const rawAttr = encodeJsonForAttribute(props.payload.content);
  const encodedPath = encodePathForAttribute(props.payload.path);
  const panels = renderFilePanels(props.payload.content, language);
  const viewOptions = panels.viewOptions;
  const viewButton = viewOptions.length > 1 ? (
    <button
      type="button"
      class="code-block-button view-cycle-button"
      data-view-cycle="true"
      data-view-options={viewOptions.map((option) => option.id).join(',')}
      data-view-labels={viewOptions.map((option) => option.label).join(',')}
      aria-label="Toggle file view"
    >
      <span class="view-button-text">{viewOptions[0]?.label ?? 'VIEW'}</span>
    </button>
  ) : null;
  const languageBadge = language ? (
    <span class="tool-output-file-lang">{language.toUpperCase()}</span>
  ) : null;

  return (
    <details
      class="tool-output-accordion tool-output-accordion--file"
      data-view-root="true"
      data-view={panels.view}
      data-raw-copy={rawAttr}
    >
      <summary class="tool-output-accordion-summary">
        <div class="tool-output-accordion-title">
          <div class="tool-output-file-title">
            <span class="tool-output-accordion-label">FILE</span>
            <span class="tool-output-file-name">{filename}</span>
            {languageBadge}
            {props.payload.truncated ? <span class="file-tree-warning">TRUNCATED</span> : null}
          </div>
          <span class="tool-output-file-path" title={props.payload.path}>{truncatedPath}</span>
        </div>
        <div class="tool-output-accordion-controls" role="group" aria-label="File actions">
          {viewButton}
          <button type="button" class="code-block-button" data-code-action="copy" aria-label="Copy file contents">
            <span class="view-button-text">COPY</span>
          </button>
          <button
            type="button"
            class="code-block-button"
            data-file-path={encodedPath}
            aria-label="Open file in explorer"
          >
            <span class="view-button-text">OPEN</span>
          </button>
        </div>
      </summary>
      <div class="tool-output-accordion-body">
        <div class="file-output-block" innerHTML={panels.html}></div>
      </div>
    </details>
  );
};

