import type { BubbleDirectoryPayload, FileTreeRow } from '../bubble-types';
import { renderFileTree } from '../file-tree';

export const renderDirectoryPayload = (payload: BubbleDirectoryPayload): string => {
  const rows: FileTreeRow[] = [];

  for (const entry of payload.entries) {
    const kind = entry.type === 'directory' ? 'folder' : entry.type === 'file' ? 'file' : 'other';
    const sizeBytes = entry.type === 'file' ? entry.sizeBytes ?? null : undefined;
    rows.push({ name: entry.name, kind, depth: 0, sizeBytes });
  }

  return renderFileTree(rows, {
    title: 'DIRECTORY',
    path: payload.path,
    meta: `${payload.entries.length} ITEMS`,
    truncated: payload.truncated,
  });
};
