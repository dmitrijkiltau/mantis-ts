import { describe, it, expect } from 'vitest';
import { renderTemplate } from './helpers.js';

describe('renderTemplate', () => {
  it('replaces a simple QUESTION without modification', () => {
    const template = 'Question:\n{{QUESTION}}';
    const out = renderTemplate(template, { QUESTION: 'When is the meeting?' });
    expect(out).toBe('Question:\nWhen is the meeting?');
  });

  it('converts JSON QUESTION to compact YAML-like format (flat object)', () => {
    const template = 'Question:\n{{QUESTION}}';
    const json = JSON.stringify({ name: 'Alice', age: 30, active: true });
    const out = renderTemplate(template, { QUESTION: json });
    expect(out).toContain('name: Alice');
    expect(out).toContain('age: 30');
    expect(out).toContain('active: true');
  });

  it('formats arrays of scalars inline', () => {
    const template = 'Question:\n{{QUESTION}}';
    const json = JSON.stringify({ tags: ['x', 'y', 'z'] });
    const out = renderTemplate(template, { QUESTION: json });
    expect(out).toContain('tags: [x, y, z]');
  });

  it('formats nested objects with indentation and dashes for arrays of objects', () => {
    const template = 'Question:\n{{QUESTION}}';
    const json = JSON.stringify({ user: { name: 'Bob', meta: { score: 42 } }, items: [{ id: 1 }, { id: 2 }] });
    const out = renderTemplate(template, { QUESTION: json });
    expect(out).toContain('user:');
    expect(out).toContain('name: Bob');
    expect(out).toContain('meta:');
    expect(out).toContain('score: 42');
    // items array should become a dash list since it's array of objects
    expect(out).toContain('- id: 1');
  });

  it('returns original when QUESTION is non-JSON text', () => {
    const template = 'Question:\n{{QUESTION}}';
    const out = renderTemplate(template, { QUESTION: 'This is a normal sentence.' });
    expect(out).toBe('Question:\nThis is a normal sentence.');
  });
});
