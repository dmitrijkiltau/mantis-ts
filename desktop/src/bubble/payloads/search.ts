import type { BubbleSearchPayload, FileTreeRow } from '../bubble-types';
import { renderFileTree } from '../file-tree';

export const renderSearchPayload = (payload: BubbleSearchPayload): string => {
  const rows: FileTreeRow[] = [];

  for (const match of payload.matches) {
    const normalized = match.path.replace(/\\/g, '/');
    const segments = normalized.split('/');
    const name = segments[segments.length - 1] || normalized;
    const kind = match.type === 'directory' ? 'folder' : 'file';
    rows.push({ name, kind, depth: 0, path: match.path });
  }

  return renderFileTree(rows, {
    title: 'SEARCH RESULTS',
    path: payload.root,
    meta: `QUERY: ${payload.query} | ${payload.matches.length} MATCHES`,
    truncated: payload.truncated,
  });
};
