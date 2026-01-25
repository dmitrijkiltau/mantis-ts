import { describe, expect, it } from 'vitest';
import { TOOLS } from './registry.js';

describe('tool triggers', () => {
  it('each tool declares non-empty triggers and triggers are normalized and unique', () => {
    const entries = Object.entries(TOOLS) as Array<[string, any]>;

    const issues: string[] = [];

    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (!entry) continue;
      const [name, def] = entry;

      if (!Array.isArray(def.triggers)) {
        issues.push(`${name}: missing 'triggers' array`);
        continue;
      }

      if (def.triggers.length === 0) {
        issues.push(`${name}: 'triggers' array is empty`);
        continue;
      }

      const normalized = def.triggers;
      if (!Array.isArray(normalized) || normalized.length === 0) {
        issues.push(`${name}: triggers returned empty or invalid value`);
        continue;
      }

      const badFormat = normalized.some((t) => typeof t !== 'string' || t !== t.toLowerCase() || t.trim() !== t || t.length === 0);
      if (badFormat) {
        issues.push(`${name}: triggers are not normalized (lowercase/trimmed)`);
      }

      const unique = new Set(normalized);
      if (unique.size !== normalized.length) {
        issues.push(`${name}: triggers contain duplicates`);
      }
    }

    expect(issues).toEqual([]);
  });
});
