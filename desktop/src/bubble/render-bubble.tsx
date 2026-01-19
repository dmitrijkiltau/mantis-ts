import type { JSX } from 'solid-js';
import { renderMarkdown } from './markdown';
import { parseBubbleJson } from './parse';
import {
  isDirectoryPayload,
  isFilePayload,
  isHttpResponsePayload,
  isProcessListPayload,
  isSearchPayload,
} from './payloads/guards';
import { DirectoryPayloadView } from './payloads/directory';
import { FilePayloadView } from './payloads/file';
import { HttpResponseView } from './payloads/http';
import { ProcessListView } from './payloads/process';
import { SearchPayloadView } from './payloads/search';
import { trimTrailingNewline } from './shared';

export const renderBubbleContent = (text: string): JSX.Element => {
  const cleaned = trimTrailingNewline(text);
  const payload = parseBubbleJson(cleaned);

  if (payload) {
    if (isFilePayload(payload)) {
      return <FilePayloadView payload={payload} />;
    }
    if (isDirectoryPayload(payload)) {
      return <DirectoryPayloadView payload={payload} />;
    }
    if (isSearchPayload(payload)) {
      return <SearchPayloadView payload={payload} />;
    }
    if (isProcessListPayload(payload)) {
      return <ProcessListView payload={payload} />;
    }
    if (isHttpResponsePayload(payload)) {
      return <HttpResponseView payload={payload} />;
    }
  }

  return <div innerHTML={renderMarkdown(cleaned)} />;
};
