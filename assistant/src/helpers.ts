/**
 * Converts an array of strings into a markdown unordered list.
 */
export const toUnorderedList = (items: string[]): string => {
  return items.map((item) => `- ${item}`).join('\n');
};

/**
 * Renders a template using `{{PLACEHOLDER}}` syntax and returns the interpolated text.
 */
export const renderTemplate = (template: string, context: Record<string, string> = {}): string => {
  return template.replace(/{{\s*([A-Z0-9_]+)\s*}}/g, (_, key) => {
    return context[key] ?? '';
  });
};
