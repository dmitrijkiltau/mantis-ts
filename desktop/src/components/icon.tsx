const icons = import.meta.glob('../assets/icons/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default'
});

type SvgIconMap = Record<string, string>;

/**
 * Maps icon names to their raw SVG markup.
 */
const iconMap = Object.fromEntries(
  Object.entries(icons).map(([path, source]) => {
    const name = path.split('/').pop()?.replace('.svg', '') ?? '';
    return [name, String(source)];
  }),
) as SvgIconMap;

export type IconName = keyof typeof iconMap;

/**
 * Adds a class name to the root SVG element.
 */
const mergeClassName = (svg: string, className: string): string => {
  const match = svg.match(/<svg\b[^>]*>/);
  if (!match) {
    return svg;
  }

  const openTag = match[0];
  if (openTag.includes('class=')) {
    const updated = openTag.replace(/class="([^"]*)"/, (_, existing) => {
      const merged = `${String(existing)} ${className}`.trim();
      return `class="${merged}"`;
    });
    return svg.replace(openTag, updated);
  }

  const updated = openTag.replace('<svg', `<svg class="${className}"`);
  return svg.replace(openTag, updated);
};

/**
 * Renders an SVG icon to a static markup string.
 */
export const getIconSvg = (name: IconName, className?: string): string => {
  const svg = iconMap[name];
  if (!svg) {
    return '';
  }

  if (!className) {
    return svg;
  }

  return mergeClassName(svg, className);
};

export const renderIcon = getIconSvg;
