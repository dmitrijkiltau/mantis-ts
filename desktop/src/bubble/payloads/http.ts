import type { HttpResponseResult } from '../../../../assistant/src/tools/web/http-core';
import { renderCodeBlock } from '../markdown';
import { renderHttpJsonPreview } from '../json-viewer';
import {
  deriveLanguageFromContentType,
  escapeHtml,
  formatBytes,
  formatHtmlContent,
} from '../shared';

export const renderHttpResponsePayload = (
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
