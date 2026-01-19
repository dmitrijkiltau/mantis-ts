import type { Component } from 'solid-js';
import type { BubbleDirectoryPayload, FileTreeRow } from '../bubble-types';
import { renderFileTree } from '../file-tree';

export const DirectoryPayloadView: Component<{ payload: BubbleDirectoryPayload }> = (props) => {
  const rows: FileTreeRow[] = [];

  for (const entry of props.payload.entries) {
    const kind = entry.type === 'directory' ? 'folder' : entry.type === 'file' ? 'file' : 'other';
    const sizeBytes = entry.type === 'file' ? entry.sizeBytes ?? null : undefined;
    rows.push({ name: entry.name, kind, depth: 0, sizeBytes });
  }

  return (
    <div
      innerHTML={renderFileTree(rows, {
        title: 'DIRECTORY',
        path: props.payload.path,
        meta: `${props.payload.entries.length} ITEMS`,
        truncated: props.payload.truncated,
      })}
    />
  );
};

