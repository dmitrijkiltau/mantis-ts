/**
 * Converts an array of strings into a markdown unordered list.
 */
export const toUnorderedList = (items: string[]): string => {
  return items.map((item) => `- ${item}`).join('\n');
};
