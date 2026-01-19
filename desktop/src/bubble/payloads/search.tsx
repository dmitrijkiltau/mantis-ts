import type { Component } from 'solid-js';
import type { BubbleSearchPayload, FileTreeRow } from '../bubble-types';
import { renderFileTree } from '../file-tree';

export const SearchPayloadView: Component<{ payload: BubbleSearchPayload }> = (props) => {
  const rows: FileTreeRow[] = [];

  for (const match of props.payload.matches) {
    const normalized = match.path.replace(/\\/g, '/');
    const segments = normalized.split('/');
    const name = segments[segments.length - 1] || normalized;
    const kind = match.type === 'directory' ? 'folder' : 'file';
    rows.push({ name, kind, depth: 0, path: match.path });
  }

  return (
    <div
      innerHTML={renderFileTree(rows, {
        title: 'SEARCH RESULTS',
        path: props.payload.root,
        meta: `QUERY: ${props.payload.query} | ${props.payload.matches.length} MATCHES`,
        truncated: props.payload.truncated,
      })}
    />
  );
};

