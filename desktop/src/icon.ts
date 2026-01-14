import MarkdownPreviewIcon from './assets/icons/markdown-preview.svg?react';
import CodeRawIcon from './assets/icons/code-raw.svg?react';
import CopyIcon from './assets/icons/copy.svg?react';
import JsonPrettyIcon from './assets/icons/json-pretty.svg?react';
import JsonTreeIcon from './assets/icons/json-tree.svg?react';

export type IconName = 'markdown-preview' | 'code-raw' | 'copy' | 'json-pretty' | 'json-tree';

const iconMap: Record<IconName, typeof MarkdownPreviewIcon> = {
  'markdown-preview': MarkdownPreviewIcon,
  'code-raw': CodeRawIcon,
  copy: CopyIcon,
  'json-pretty': JsonPrettyIcon,
  'json-tree': JsonTreeIcon,
};

export const getIconSvg = (name: IconName): string => {
  const IconComponent = iconMap[name];
  if (!IconComponent) {
    return '';
  }

  // For SSR or cases where we need the SVG string directly,
  // we render to a temporary container
  const tempDiv = document.createElement('div');
  try {
    const svg = IconComponent({});
    if (svg instanceof HTMLElement) {
      tempDiv.appendChild(svg);
      return tempDiv.innerHTML;
    }
    return '';
  } catch {
    return '';
  }
};

export const renderIcon = (name: IconName, className?: string): string => {
  const svgString = getIconSvg(name);
  if (!svgString) {
    return '';
  }

  // Add class attribute if provided
  if (className) {
    return svgString.replace('<svg ', `<svg class="${className}" `);
  }

  return svgString;
};
