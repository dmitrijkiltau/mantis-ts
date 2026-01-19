import type { FileTreeRow } from './bubble-types';
import { escapeHtml, formatBytes } from './shared';

const getTreeDepth = (line: string): number => {
  const branchMatch = line.match(/(?:\u251c|\u2514|\+|\\|\|)?(?:\u2500|-){2,}/);
  const prefix = branchMatch && branchMatch.index !== undefined
    ? line.slice(0, branchMatch.index)
    : (line.match(/^[\s|`\u2502]+/)?.[0] ?? '');
  const verticals = prefix.match(/[|\u2502]/g);
  if (verticals) {
    return verticals.length;
  }

  const normalized = prefix.replace(/\t/g, '  ');
  return Math.floor(normalized.length / 2);
};

const stripTreeDecorations = (line: string): string => {
  const withoutLeading = line.replace(/^[\s|`\u2502]+/, '');
  const withoutBranch = withoutLeading.replace(/^(?:\u251c|\u2514|\+|\\|\|)?(?:\u2500|-){2,}\s*/, '');
  return withoutBranch.trim();
};

export const parseFileTreeText = (text: string): FileTreeRow[] => {
  const lines = text.split(/\r?\n/);
  const rows: Array<{ name: string; depth: number; hasTrailingSlash: boolean }> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const depth = getTreeDepth(line);
    const name = stripTreeDecorations(line);
    if (!name) {
      continue;
    }

    rows.push({
      name: name.replace(/[\\/]+$/, ''),
      depth,
      hasTrailingSlash: /[\\/]$/.test(name),
    });
  }

  const result: FileTreeRow[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const current = rows[index];
    if (!current) {
      continue;
    }
    const next = rows[index + 1];
    const hasChildren = next ? next.depth > current.depth : false;
    const isFolder = current.hasTrailingSlash || hasChildren;

    result.push({
      name: current.name,
      depth: current.depth,
      kind: isFolder ? 'folder' : 'file',
    });
  }

  return result;
};

export const looksLikeFileTree = (text: string): boolean =>
  /(?:\u251c|\u2514|\u2502)|(?:\|--|\\--|\+--|`--)/.test(text);

const annotateFolderItemCounts = (rows: FileTreeRow[]): FileTreeRow[] => {
  const annotated = rows.map((row) => ({ ...row }));
  for (let index = 0; index < annotated.length; index += 1) {
    const current = annotated[index];
    if (!current || current.kind !== 'folder') {
      continue;
    }
    const baseDepth = Number.isFinite(current.depth) ? current.depth : 0;
    let childCount = 0;
    for (let nextIndex = index + 1; nextIndex < annotated.length; nextIndex += 1) {
      const next = annotated[nextIndex];
      if (!next) {
        continue;
      }
      const nextDepth = Number.isFinite(next.depth) ? next.depth : 0;
      if (nextDepth <= baseDepth) {
        break;
      }
      if (nextDepth === baseDepth + 1) {
        childCount += 1;
      }
    }

    if (childCount > 0) {
      annotated[index] = { ...current, itemCount: childCount };
    }
  }
  return annotated;
};

const renderFileTreeRows = (rows: FileTreeRow[]): string => {
  let html = '';
  const annotatedRows = annotateFolderItemCounts(rows);

  for (const row of annotatedRows) {
    const badge =
      row.kind === 'folder' ? 'DIR' : row.kind === 'file' ? 'FILE' : 'ITEM';
    const depth = Number.isFinite(row.depth) ? row.depth : 0;
    const pathHtml = row.path
      ? `<span class="file-node-path">${escapeHtml(row.path)}</span>`
      : '';
    const folderItemCountText =
      row.kind === 'folder' && typeof row.itemCount === 'number'
        ? `${row.itemCount} item${row.itemCount === 1 ? '' : 's'}`
        : null;
    const sizeText = row.sizeBytes === undefined
      ? folderItemCountText
      : row.sizeBytes === null
        ? 'N/A'
        : formatBytes(row.sizeBytes);
    const sizeHtml = sizeText
      ? `<span class="file-node-size">${escapeHtml(sizeText)}</span>`
      : '';

    html += `
      <div class="file-tree-row is-${row.kind}" style="--depth:${depth}">
        <span class="file-node-badge" data-kind="${row.kind}">${badge}</span>
        <div class="file-node-info">
          <span class="file-node-name">${escapeHtml(row.name)}</span>
          ${pathHtml}
        </div>
        ${sizeHtml}
      </div>
    `;
  }

  return html;
};

export const renderFileTree = (
  rows: FileTreeRow[],
  header?: { title: string; path?: string; meta?: string; truncated?: boolean },
): string => {
  const metaHtml = header?.meta
    ? `<span class="file-tree-meta">${escapeHtml(header.meta)}</span>`
    : '';
  const warningHtml = header?.truncated
    ? '<span class="file-tree-warning">TRUNCATED</span>'
    : '';
  const headerMetaHtml = metaHtml || warningHtml
    ? `<div class="file-tree-header-meta">${metaHtml}${warningHtml}</div>`
    : '';
  const headerHtml = header
    ? `
      <div class="file-tree-header">
        <div class="file-tree-header-row">
          <span class="file-tree-title">${escapeHtml(header.title)}</span>
          ${headerMetaHtml}
        </div>
        ${header.path ? `<span class="file-tree-path">${escapeHtml(header.path)}</span>` : ''}
      </div>
    `
    : '';

  return `
    <div class="file-tree">
      ${headerHtml}
      <div class="file-tree-list">
        ${renderFileTreeRows(rows)}
      </div>
    </div>
  `;
};
