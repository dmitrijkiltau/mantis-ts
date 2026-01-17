import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Imports all SVG icons from the assets/icons directory.
 */
const icons = import.meta.glob<
  React.FC<React.SVGProps<SVGSVGElement>>
>('./assets/icons/*.svg', {
  eager: true,
  import: 'default',
});

type SvgIconComponent = React.FC<React.SVGProps<SVGSVGElement>>;

/**
 * Maps icon names to their corresponding SVG React components.
 */
const iconMap = Object.fromEntries(
  Object.entries(icons).map(([path, component]) => {
    const name = path
      .split('/')
      .pop()!
      .replace('.svg', '');

    return [name, component];
  }),
) as Record<string, SvgIconComponent>;

export type IconName = keyof typeof iconMap;

/**
 * Renders an SVG icon to a static markup string.
 */
export const getIconSvg = (
  name: IconName,
  className?: string,
): string => {
  const IconComponent = iconMap[name];
  if (!IconComponent) return '';

  return renderToStaticMarkup(
    <IconComponent
      className={className}
      focusable={false}
      aria-hidden="true"
    />,
  );
};

export const renderIcon = getIconSvg;
