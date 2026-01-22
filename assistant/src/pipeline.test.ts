import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Pipeline } from './pipeline.js';
import { createMockOrchestrator, createMockRunner } from './test-helpers/pipeline-mocks.js';

/**
 * Unit tests for Pipeline class, focusing on:
 * - Direct tool parsing logic
 * - Null-argument skip logic
 * - Tool execution and formatting
 */

describe('Pipeline', () => {
  let pipeline: Pipeline;
  let mockOrchestrator: ReturnType<typeof createMockOrchestrator>;
  let mockRunner: ReturnType<typeof createMockRunner>;

  beforeEach(() => {
    mockOrchestrator = createMockOrchestrator();
    mockRunner = createMockRunner();
    pipeline = new Pipeline(mockOrchestrator, mockRunner);
  });

  describe('parseDirectToolRequest', () => {
    it('should return null for empty input', () => {
      const result = (pipeline as any).parseDirectToolRequest('');
      expect(result).toBeNull();
    });

    it('should return null for multiline input', () => {
      const result = (pipeline as any).parseDirectToolRequest('line1\nline2');
      expect(result).toBeNull();
    });

    it('should parse direct filesystem: "read <path>" command', () => {
      const result = (pipeline as any).parseDirectToolRequest('read /etc/hosts');
      expect(result).not.toBeNull();
      expect(result?.tool).toBe('filesystem');
      expect(result?.args.action).toBe('read');
      expect(result?.args.path).toBe('/etc/hosts');
      expect(result?.reason).toBe('direct_read_filesystem');
    });

    it('should parse direct filesystem: "read <quoted path>" command', () => {
      const result = (pipeline as any).parseDirectToolRequest('read "/path/with spaces"');
      expect(result).not.toBeNull();
      expect(result?.tool).toBe('filesystem');
      expect(result?.args.action).toBe('read');
      expect(result?.args.path).toBe('/path/with spaces');
    });

    it('should parse direct filesystem: "list <path>" command', () => {
      const result = (pipeline as any).parseDirectToolRequest('list C:\\Users\\Documents');
      expect(result).not.toBeNull();
      expect(result?.tool).toBe('filesystem');
      expect(result?.args.action).toBe('list');
      expect(result?.args.path).toBe('C:\\Users\\Documents');
      expect(result?.reason).toBe('direct_list_filesystem');
    });

    it('should return null for filesystem command with invalid path', () => {
      const result = (pipeline as any).parseDirectToolRequest('read notapath');
      expect(result).toBeNull();
    });

    it('should parse direct fetch: "get <url>" command', () => {
      const result = (pipeline as any).parseDirectToolRequest('get https://example.com');
      expect(result).not.toBeNull();
      expect(result?.tool).toBe('http');
      expect(result?.args.method).toBe('GET');
      expect(result?.args.url).toBe('https://example.com');
      expect(result?.reason).toBe('direct_get_http');
    });

    it('should parse direct fetch: "fetch <url>" command', () => {
      const result = (pipeline as any).parseDirectToolRequest('fetch http://example.com');
      expect(result).not.toBeNull();
      expect(result?.tool).toBe('http');
      expect(result?.args.method).toBe('GET');
      expect(result?.args.url).toBe('http://example.com');
    });

    it('should parse direct fetch: "get <quoted url>" command', () => {
      const result = (pipeline as any).parseDirectToolRequest('get "https://example.com/path?param=value"');
      expect(result).not.toBeNull();
      expect(result?.tool).toBe('http');
      expect(result?.args.url).toBe('https://example.com/path?param=value');
    });

    it('should parse direct fetch: scheme-less URL is accepted', () => {
      const result = (pipeline as any).parseDirectToolRequest('get kiltau.com');
      expect(result).not.toBeNull();
      expect(result?.tool).toBe('http');
      expect(result?.args.url).toBe('kiltau.com');
      expect(result?.reason).toBe('direct_get_http');
    });

    it('should return null for fetch command with invalid URL', () => {
      const result = (pipeline as any).parseDirectToolRequest('get notaurl');
      expect(result).toBeNull();
    });

    it('should parse direct process: "ps" command', () => {
      const result = (pipeline as any).parseDirectToolRequest('ps');
      expect(result).not.toBeNull();
      expect(result?.tool).toBe('process');
      expect(result?.args.action).toBe('list');
      expect(result?.args.query).toBeNull();
      expect(result?.reason).toBe('direct_process');
    });

    it('should parse direct process: "processes" command', () => {
      const result = (pipeline as any).parseDirectToolRequest('processes');
      expect(result).not.toBeNull();
      expect(result?.tool).toBe('process');
      expect(result?.args.action).toBe('list');
      expect(result?.reason).toBe('direct_process');
    });

    it('should parse direct process: "list processes" command', () => {
      const result = (pipeline as any).parseDirectToolRequest('list processes');
      expect(result).not.toBeNull();
      expect(result?.tool).toBe('process');
      expect(result?.args.action).toBe('list');
    });

    it('should parse direct process: "ps <filter>" command', () => {
      const result = (pipeline as any).parseDirectToolRequest('ps node');
      expect(result).not.toBeNull();
      expect(result?.tool).toBe('process');
      expect(result?.args.action).toBe('list');
      expect(result?.args.query).toBe('node');
      expect(result?.reason).toBe('direct_process_with_filter');
    });

    it('should parse direct process: "processes <filter>" command', () => {
      const result = (pipeline as any).parseDirectToolRequest('processes chrome');
      expect(result).not.toBeNull();
      expect(result?.tool).toBe('process');
      expect(result?.args.query).toBe('chrome');
    });

    it('should be case-insensitive for process commands', () => {
      const result = (pipeline as any).parseDirectToolRequest('PS');
      expect(result).not.toBeNull();
      expect(result?.tool).toBe('process');
    });

    it('should be case-insensitive for filesystem commands', () => {
      const result = (pipeline as any).parseDirectToolRequest('READ ./file.txt');
      expect(result).not.toBeNull();
      expect(result?.tool).toBe('filesystem');
      expect(result?.args.action).toBe('read');
    });
  });

  describe('stripWrappingQuotes', () => {
    it('should strip double quotes', () => {
      const result = (pipeline as any).stripWrappingQuotes('"hello world"');
      expect(result).toBe('hello world');
    });

    it('should strip single quotes', () => {
      const result = (pipeline as any).stripWrappingQuotes("'hello world'");
      expect(result).toBe('hello world');
    });

    it('should strip backticks', () => {
      const result = (pipeline as any).stripWrappingQuotes('`hello world`');
      expect(result).toBe('hello world');
    });

    it('should not strip mismatched quotes', () => {
      const result = (pipeline as any).stripWrappingQuotes('"hello world\'');
      expect(result).toBe('"hello world\'');
    });

    it('should return as-is for unquoted strings', () => {
      const result = (pipeline as any).stripWrappingQuotes('hello world');
      expect(result).toBe('hello world');
    });

    it('should trim whitespace after stripping', () => {
      const result = (pipeline as any).stripWrappingQuotes('"  hello  "  ');
      expect(result).toBe('hello');
    });
  });

  describe('looksLikePath', () => {
    it('should return true for Unix-style absolute path', () => {
      const result = (pipeline as any).looksLikePath('/etc/hosts');
      expect(result).toBe(true);
    });

    it('should return true for Unix-style relative path', () => {
      const result = (pipeline as any).looksLikePath('./file.txt');
      expect(result).toBe(true);
    });

    it('should return true for Windows-style path', () => {
      const result = (pipeline as any).looksLikePath('C:\\Users\\Documents');
      expect(result).toBe(true);
    });

    it('should return true for path with dots', () => {
      const result = (pipeline as any).looksLikePath('file.txt');
      expect(result).toBe(true);
    });

    it('should return true for relative path starting with dot', () => {
      const result = (pipeline as any).looksLikePath('../../file.txt');
      expect(result).toBe(true);
    });

    it('should return false for HTTP URLs', () => {
      const result = (pipeline as any).looksLikePath('http://example.com');
      expect(result).toBe(false);
    });

    it('should return false for HTTPS URLs', () => {
      const result = (pipeline as any).looksLikePath('https://example.com');
      expect(result).toBe(false);
    });

    it('should return false for empty string', () => {
      const result = (pipeline as any).looksLikePath('');
      expect(result).toBe(false);
    });

    it('should return false for plain word without extension', () => {
      const result = (pipeline as any).looksLikePath('notapath');
      expect(result).toBe(false);
    });
  });

  describe('isHttpUrl', () => {
    it('should recognize valid HTTP URL', () => {
      const result = (pipeline as any).isHttpUrl('http://example.com');
      expect(result).toBe(true);
    });

    it('should recognize valid HTTPS URL', () => {
      const result = (pipeline as any).isHttpUrl('https://example.com');
      expect(result).toBe(true);
    });

    it('should recognize HTTPS URL with path and query', () => {
      const result = (pipeline as any).isHttpUrl('https://example.com/path?query=value');
      expect(result).toBe(true);
    });

    it('should reject invalid URLs', () => {
      const result = (pipeline as any).isHttpUrl('not a url');
      expect(result).toBe(false);
    });

    it('should reject file:// protocol', () => {
      const result = (pipeline as any).isHttpUrl('file:///etc/hosts');
      expect(result).toBe(false);
    });

    it('should reject ftp:// protocol', () => {
      const result = (pipeline as any).isHttpUrl('ftp://example.com');
      expect(result).toBe(false);
    });
  });

  describe('shouldSkipToolExecution', () => {
    it('should skip when all arguments are null', () => {
      const schema = { query: 'string', limit: 'number|null' };
      const args = { query: null, limit: null };
      const result = (pipeline as any).shouldSkipToolExecution('http', schema, args);
      expect(result).toBe(true);
    });

    it('should skip when all required arguments are null', () => {
      const schema = { path: 'string', action: 'string' };
      const args = { path: null, action: null };
      const result = (pipeline as any).shouldSkipToolExecution('http', schema, args);
      expect(result).toBe(true);
    });

    it('should not skip when at least one required argument is present', () => {
      const schema = { path: 'string', action: 'string' };
      const args = { path: '/etc/hosts', action: null };
      const result = (pipeline as any).shouldSkipToolExecution('http', schema, args);
      expect(result).toBe(false);
    });

    it('should allow optional arguments (string|null) to be null', () => {
      const schema = { path: 'string', maxBytes: 'number|null' };
      const args = { path: '/etc/hosts', maxBytes: null };
      const result = (pipeline as any).shouldSkipToolExecution('http', schema, args);
      expect(result).toBe(false);
    });

    it('should skip when more than 50% of required arguments are null', () => {
      const schema = {
        arg1: 'string',
        arg2: 'string',
        arg3: 'string|null',
        arg4: 'string|null',
      };
      const args = { arg1: 'value', arg2: null, arg3: null, arg4: null };
      // 2 required args, 1 null = 50% threshold, should NOT skip (needs > 50%)
      const result = (pipeline as any).shouldSkipToolExecution('http', schema, args);
      expect(result).toBe(false);
    });

    it('should skip when more than 50% of required arguments are null (60% case)', () => {
      const schema = {
        arg1: 'string',
        arg2: 'string',
        arg3: 'string',
        arg4: 'string',
        arg5: 'string|null',
      };
      // 4 required args, 3 null = 75% null
      const args = { arg1: 'value', arg2: null, arg3: null, arg4: null, arg5: null };
      const result = (pipeline as any).shouldSkipToolExecution('http', schema, args);
      expect(result).toBe(true);
    });

    it('should return false for empty schema', () => {
      const schema = {};
      const args = {};
      const result = (pipeline as any).shouldSkipToolExecution('http', schema, args);
      expect(result).toBe(false);
    });

    it('should treat undefined same as null', () => {
      const schema = { path: 'string', limit: 'number|null' };
      const args = { path: undefined, limit: undefined };
      const result = (pipeline as any).shouldSkipToolExecution('http', schema, args);
      expect(result).toBe(true);
    });
  });

  describe('areAllArgumentsNull', () => {
    it('should return true for empty object', () => {
      const result = (pipeline as any).areAllArgumentsNull({});
      expect(result).toBe(true);
    });

    it('should return true when all values are null', () => {
      const args = { a: null, b: null, c: null };
      const result = (pipeline as any).areAllArgumentsNull(args);
      expect(result).toBe(true);
    });

    it('should return true when all values are undefined', () => {
      const args = { a: undefined, b: undefined };
      const result = (pipeline as any).areAllArgumentsNull(args);
      expect(result).toBe(true);
    });

    it('should return false when at least one value is present', () => {
      const args = { a: null, b: 'value', c: null };
      const result = (pipeline as any).areAllArgumentsNull(args);
      expect(result).toBe(false);
    });

    it('should return false when any value is truthy', () => {
      const args = { a: 0, b: null };
      const result = (pipeline as any).areAllArgumentsNull(args);
      expect(result).toBe(false);
    });

    it('should return false for empty string', () => {
      const args = { a: '', b: null };
      const result = (pipeline as any).areAllArgumentsNull(args);
      expect(result).toBe(false);
    });

    it('should return false for false value', () => {
      const args = { a: false, b: null };
      const result = (pipeline as any).areAllArgumentsNull(args);
      expect(result).toBe(false);
    });

    it('should return false for object value', () => {
      const args = { a: {}, b: null };
      const result = (pipeline as any).areAllArgumentsNull(args);
      expect(result).toBe(false);
    });
  });

  describe('isToolIntent', () => {
    it('should return false for GENERAL_ANSWER intent', () => {
      const result = (pipeline as any).isToolIntent('general_answer');
      expect(result).toBe(false);
    });

    it('should return true for tool intents with prefix', () => {
      const result = (pipeline as any).isToolIntent('tool.search');
      expect(result).toBe(true);
    });

    it('should return true for tool.search intent', () => {
      const result = (pipeline as any).isToolIntent('tool.search');
      expect(result).toBe(true);
    });

    it('should return false for non-tool intents', () => {
      const result = (pipeline as any).isToolIntent('other_intent');
      expect(result).toBe(false);
    });
  });

  describe('resolveToolName', () => {
    it('should return null for non-tool intent', () => {
      const result = (pipeline as any).resolveToolName('general_answer');
      expect(result).toBeNull();
    });

    it('should extract tool name from tool intent', () => {
      const result = (pipeline as any).resolveToolName('tool.search');
      expect(result).toBe('search');
    });

    it('should return null for unknown tool', () => {
      const result = (pipeline as any).resolveToolName('tool.unknownTool');
      expect(result).toBeNull();
    });
  });

  describe('meetsToolConfidence', () => {
    it('should return true for confidence >= 0.6', () => {
      const result = (pipeline as any).meetsToolConfidence(0.6);
      expect(result).toBe(true);
    });

    it('should return true for confidence > 0.6', () => {
      const result = (pipeline as any).meetsToolConfidence(0.9);
      expect(result).toBe(true);
    });

    it('should return false for confidence < 0.6', () => {
      const result = (pipeline as any).meetsToolConfidence(0.59);
      expect(result).toBe(false);
    });

    it('should return true for confidence = 1', () => {
      const result = (pipeline as any).meetsToolConfidence(1);
      expect(result).toBe(true);
    });

    it('should return false for confidence = 0', () => {
      const result = (pipeline as any).meetsToolConfidence(0);
      expect(result).toBe(false);
    });
  });

  describe('runScoringEvaluation', () => {
    it('skips scoring when the text is blank', async () => {
      mockRunner.executeContract = vi.fn();
      const result = await (pipeline as any).runScoringEvaluation('stage', '   ');
      expect(result).toEqual({ attempts: 0 });
      expect(mockRunner.executeContract).not.toHaveBeenCalled();
    });

    it('returns evaluation when runner succeeds', async () => {
      const evaluationPayload = { clarity: 8, correctness: 9, usefulness: 7 };
      mockRunner.executeContract = vi.fn().mockResolvedValue({
        ok: true,
        value: evaluationPayload,
        attempts: 1,
        history: [],
      });
      const result = await (pipeline as any).runScoringEvaluation('stage', 'Evaluate this text');
      expect(mockOrchestrator.buildScoringPrompt).toHaveBeenCalledWith('Evaluate this text', undefined, undefined, undefined);
      expect(result).toEqual({ evaluation: evaluationPayload, attempts: 1, alert: undefined });
    });

    it('returns attempts when runner fails to validate output', async () => {
      mockRunner.executeContract = vi.fn().mockResolvedValue({
        ok: false,
        attempts: 2,
        history: [],
      });
      const result = await (pipeline as any).runScoringEvaluation('stage', 'Another text');
      expect(result).toEqual({ attempts: 2, alert: 'scoring_failed' });
    });

    it('marks low scores when a criterion is under threshold', async () => {
      const evaluationPayload = { clarity: 2, correctness: 6, usefulness: 5 };
      mockRunner.executeContract = vi.fn().mockResolvedValue({
        ok: true,
        value: evaluationPayload,
        attempts: 1,
        history: [],
      });
      const result = await (pipeline as any).runScoringEvaluation('stage', 'Check low score');
      expect(result).toEqual({
        evaluation: evaluationPayload,
        attempts: 1,
        alert: 'low_scores',
      });
    });
  });
});
