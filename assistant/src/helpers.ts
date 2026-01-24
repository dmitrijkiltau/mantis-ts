/**
 * Converts an array of strings into a markdown unordered list.
 */
export const toUnorderedList = (items: string[]): string => {
  return items.map((item) => `- ${item}`).join('\n');
};

/**
 * Renders a template using `{{PLACEHOLDER}}` syntax and returns the interpolated text.
 *
 * Special handling: when the `QUESTION` or `RESPONSE` placeholder contains JSON (e.g. tool outputs),
 * it is converted to a compact YAML-like representation to reduce token usage.
 */
const isPlainObject = (v: unknown): v is Record<string, unknown> => (
  v !== null && typeof v === 'object' && !Array.isArray(v)
);

const escapeScalar = (v: string): string => {
  // Keep it compact: avoid quotes where possible. If the string contains a newline,
  // represent it as a block scalar for readability; otherwise return as-is.
  if (/\n/.test(v)) {
    const lines = v.split(/\r?\n/).map((ln) => ln.trimEnd());
    return `|\n${lines.map((ln) => `  ${ln}`).join('\n')}`;
  }
  return v;
};

const jsonToYamlCompact = (value: unknown, indent = 0): string => {
  const indentStr = ' '.repeat(indent);

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return escapeScalar(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    // If all scalars, render in-line to save tokens: [a, b, c]
    if (value.every((v) => ['string', 'number', 'boolean'].includes(typeof v) || v === null)) {
      const items = value.map((v) => (v === null ? 'null' : typeof v === 'string' ? escapeScalar(String(v)) : String(v)));
      return `[${items.join(', ')}]`;
    }

    // Complex arrays: build dash items and normalize indentation so that nested lines align nicely.
    return value.map((item) => {
      const block = jsonToYamlCompact(item, indent + 2);
      const lines = block.split(/\r?\n/);
      const first = lines[0]!.trimStart();
      const rest = lines.slice(1).map((ln) => ' '.repeat(indent + 2) + ln);
      return `${indentStr}- ${first}${rest.length ? '\n' + rest.join('\n') : ''}`;
    }).join('\n');
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    return entries.map(([k, v]) => {
      if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
        const scalar = v === null ? 'null' : typeof v === 'string' ? escapeScalar(String(v)) : String(v);
        return `${indentStr}${k}: ${scalar}`;
      }

      // Inline arrays of scalars when possible to reduce tokens: `key: [a, b]`
      if (Array.isArray(v) && v.every((it) => ['string', 'number', 'boolean'].includes(typeof it) || it === null)) {
        const arrItems = v.map((it) => (it === null ? 'null' : typeof it === 'string' ? escapeScalar(String(it)) : String(it)));
        return `${indentStr}${k}: [${arrItems.join(', ')}]`;
      }

      // nested structure (objects or complex arrays)
      return `${indentStr}${k}:\n${jsonToYamlCompact(v, indent + 2)}`;
    }).join('\n');
  }

  // Fallback: stringify
  try {
    return String(value);
  } catch {
    return '';
  }
};

export const renderTemplate = (template: string, context: Record<string, string> = {}): string => {
  return template.replace(/{{\s*([A-Z0-9_]+)\s*}}/g, (_, key) => {
    const raw = context[key];

    if ((key === 'QUESTION' || key === 'RESPONSE') && typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return '';

      // Try parsing JSON; if successful, convert to compact YAML-like text
      try {
        const parsed = JSON.parse(trimmed);
        return jsonToYamlCompact(parsed);
      } catch {
        // Not JSON: return as-is
        return raw;
      }
    }

    return raw ?? '';
  });
};
