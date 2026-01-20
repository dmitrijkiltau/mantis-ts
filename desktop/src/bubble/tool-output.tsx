import type { Component, JSX } from 'solid-js';
import { renderCodeBlock, renderMarkdown } from './markdown';
import { DirectoryPayloadView } from './payloads/directory';
import { FileOutputAccordionView, FilePayloadView } from './payloads/file';
import { HttpResponseView } from './payloads/http';
import { PcInfoPanel, buildPcInfoCompactCard, buildPcInfoSections } from './payloads/pcinfo';
import { ProcessListView } from './payloads/process';
import { SearchPayloadView } from './payloads/search';
import {
  isDirectoryPayload,
  isFilePayload,
  isHttpResponsePayload,
  isPcInfoPayload,
  isProcessListPayload,
  isSearchPayload,
} from './payloads/guards';
import { encodeJsonForAttribute, formatUptime, safeJsonStringify, truncatePathForDisplay } from './shared';

const renderToolOutputPreview = (raw: unknown): JSX.Element => {
  if (isFilePayload(raw)) {
    return <FilePayloadView payload={raw} />;
  }

  if (isDirectoryPayload(raw)) {
    return <DirectoryPayloadView payload={raw} />;
  }

  if (isSearchPayload(raw)) {
    return <SearchPayloadView payload={raw} />;
  }

  if (isProcessListPayload(raw)) {
    return <ProcessListView payload={raw} />;
  }

  if (isHttpResponsePayload(raw)) {
    return <HttpResponseView payload={raw} />;
  }

  if (isPcInfoPayload(raw)) {
    return <PcInfoPanel payload={raw} />;
  }

  const serialized = safeJsonStringify(raw);
  if (serialized) {
    return <div innerHTML={renderCodeBlock(serialized, 'json')} />;
  }

  return <div innerHTML={renderCodeBlock(String(raw), 'text')} />;
};

const renderToolJsonAccordion = (raw: unknown): JSX.Element => {
  if (isFilePayload(raw)) {
    return <FileOutputAccordionView payload={raw} />;
  }

  if (isDirectoryPayload(raw)) {
    return <DirectoryPayloadView payload={raw} />;
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
        return <PcInfoPanel payload={raw} />;
      }

      return (
        <div class="tool-output-card tool-output-card--pcinfo">
          <div class="tool-output-card-header">
            <div class="tool-output-accordion-title">
              <div class="tool-output-pcinfo-title">
                <span class="tool-output-accordion-label">{compact.label}</span>
                <span class="tool-output-pcinfo-host">{compact.title}</span>
              </div>
              <span class="tool-output-pcinfo-subtitle">{compact.subtitle}</span>
            </div>
          </div>
          <div class="tool-output-card-body">
            {compact.body}
          </div>
        </div>
      );
    }

    return (
      <details class="tool-output-accordion tool-output-accordion--pcinfo" data-view-root="true" data-view="preview">
        <summary class="tool-output-accordion-summary">
          <div class="tool-output-accordion-title">
            <div class="tool-output-pcinfo-title">
              <span class="tool-output-accordion-label">PC INFO</span>
              <span class="tool-output-pcinfo-host">{hostname}</span>
            </div>
            <span class="tool-output-pcinfo-subtitle">{subtitle}</span>
          </div>
        </summary>
        <div class="tool-output-accordion-body">
          <PcInfoPanel payload={raw} />
        </div>
      </details>
    );
  }

  if (isHttpResponsePayload(raw)) {
    const statusLabel = `${raw.status}${raw.statusText ? ` ${raw.statusText.trim()}` : ''}`.trim();
    const urlDisplay = truncatePathForDisplay(raw.finalUrl || raw.url);
    const rawAttr = encodeJsonForAttribute(raw.content);

    return (
      <details
        class="tool-output-accordion tool-output-accordion--http"
        data-view-root="true"
        data-view="preview"
        data-raw-copy={rawAttr}
      >
        <summary class="tool-output-accordion-summary">
          <div class="tool-output-accordion-title">
            <div class="tool-output-http-title">
              <span class="tool-output-accordion-label">HTTP</span>
              <span class="tool-output-http-status">{statusLabel}</span>
              <span class="tool-output-http-method">{raw.method}</span>
            </div>
            <span class="tool-output-http-url" title={raw.finalUrl || raw.url}>{urlDisplay}</span>
          </div>
          <div class="tool-output-accordion-controls" role="group" aria-label="HTTP actions">
            <button type="button" class="code-block-button" data-code-action="copy" aria-label="Copy response body">
              <span class="view-button-text">COPY</span>
            </button>
          </div>
        </summary>
        <div class="tool-output-accordion-body">
          <HttpResponseView payload={raw} compactHeader={true} />
        </div>
      </details>
    );
  }

  const serialized = safeJsonStringify(raw);
  const preview = renderToolOutputPreview(raw);
  const rawCopy = typeof raw === 'string' ? raw : serialized ?? String(raw);
  const rawAttr = encodeJsonForAttribute(rawCopy);

  return (
    <details class="tool-output-accordion" data-view-root="true" data-view="preview" data-raw-copy={rawAttr}>
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
          {preview}
        </div>
      </div>
    </details>
  );
};

export const ToolOutputContent: Component<{ summary: string; raw: unknown; summaryHtml?: string }> = (props) => {
  const summaryHtml = props.summaryHtml ?? renderMarkdown(props.summary.trim());

  return (
    <div class="tool-output">
      <div
        class="tool-output-summary"
        data-typewriter-target="summary"
        innerHTML={summaryHtml}
      ></div>
      {renderToolJsonAccordion(props.raw)}
    </div>
  );
};

