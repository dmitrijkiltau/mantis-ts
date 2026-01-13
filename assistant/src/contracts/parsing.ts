/**
 * Removes Markdown code fences (including ```json) from a string.
 */
export const stripMarkdownFences = (input: string): string => {
  return input
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();
};

/**
 * Extracts the first valid JSON object from a string, ignoring Markdown fences.
 * Throws if no valid object can be parsed.
 */
export const extractFirstJsonObject = (input: string): unknown => {
  const cleaned = stripMarkdownFences(input);

  let depth = 0;
  let start = -1;

  for (let index = 0; index < cleaned.length; index += 1) {
    const char = cleaned[index];

    if (char === '{') {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        const candidate = cleaned.slice(start, index + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          start = -1;
        }
      }
    }
  }

  throw new Error('No valid JSON object found');
};
