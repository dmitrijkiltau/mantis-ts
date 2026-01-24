import type { Component } from 'solid-js';
import type { HttpResponseResult } from '../../../../assistant/src/tools/web/http';
import { renderCodeBlock } from '../markdown';
import { renderHttpJsonPreview } from '../json-viewer';
import { deriveLanguageFromContentType, formatBytes, formatHtmlContent } from '../shared';

export const HttpResponseView: Component<{ payload: HttpResponseResult; compactHeader?: boolean }> = (props) => {
  const payload = props.payload;
  const compactHeader = props.compactHeader ?? false;
  const finalUrl = payload.finalUrl || payload.url;
  const statusLabel = `${payload.status}${payload.statusText ? ` ${payload.statusText.trim()}` : ''}`.trim();
  const language = deriveLanguageFromContentType(payload.contentType);
  const headerCount = Object.keys(payload.headers).length;
  const headerSummary = `${headerCount} entries`;
  const sizeText = `${formatBytes(payload.bytesRead)} read / ${formatBytes(payload.totalBytes)} total`;
  const jsonPreview = language === 'json' ? renderHttpJsonPreview(payload.content) : '';
  const formattedBody = language === 'html' ? formatHtmlContent(payload.content) : payload.content;
  const bodyContent = jsonPreview || renderCodeBlock(formattedBody, language, payload.content);

  return (
    <div class={`http-preview${compactHeader ? ' http-preview--compact' : ''}`}>
      {compactHeader ? null : (
        <div class="http-preview-header">
          <span class="http-preview-label">HTTP RESPONSE</span>
          <span class="http-preview-status">{statusLabel}</span>
        </div>
      )}
      <div class="http-preview-meta">
        <div class="http-meta-method">
          <span class="http-meta-key">METHOD</span>
          <span class="http-meta-value">{payload.method}</span>
        </div>
        <div class="http-meta-size">
          <span class="http-meta-key">SIZE</span>
          <span class="http-meta-value">{sizeText}</span>
        </div>
        <div class="http-meta-headers">
          <span class="http-meta-key">HEADERS</span>
          <span class="http-meta-value">{headerSummary}</span>
        </div>
        <div class="http-meta-content-type">
          <span class="http-meta-key">CONTENT-TYPE</span>
          <span class="http-meta-value">{payload.contentType ?? 'UNKNOWN'}</span>
        </div>
        <div class="http-meta-url">
          <span class="http-meta-key">URL</span>
          <span class="http-meta-value">{finalUrl}</span>
        </div>
      </div>
      <div class="http-preview-body" innerHTML={bodyContent}></div>
      <div class="http-preview-footer">
        {payload.redirected ? <span class="http-preview-badge">REDIRECTED</span> : null}
        {payload.truncated ? <span class="http-preview-badge warning">TRUNCATED</span> : null}
      </div>
    </div>
  );
};

