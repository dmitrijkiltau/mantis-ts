import { renderMarkdown } from './markdown';
import { parseBubbleJson } from './parse';
import {
  isDirectoryPayload,
  isFilePayload,
  isHttpResponsePayload,
  isProcessListPayload,
  isSearchPayload,
} from './payloads/guards';
import { renderDirectoryPayload } from './payloads/directory';
import { renderFilePayload } from './payloads/file';
import { renderHttpResponsePayload } from './payloads/http';
import { renderProcessListPayload } from './payloads/process';
import { renderSearchPayload } from './payloads/search';
import { trimTrailingNewline } from './shared';

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

  return renderMarkdown(cleaned);
};
