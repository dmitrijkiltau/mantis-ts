import { describe, expect, it } from 'vitest';
import { Orchestrator } from '../orchestrator.js';
import { TOOLS } from '../tools/registry.js';

const assertCompiled = (value: string | undefined, label: string): void => {
  if (value === undefined) {
    return;
  }

  expect(value, `${label} should not be empty`).toBeTruthy();
  expect(value, `${label} should not include template tokens`).not.toMatch(/\{\{[^}]+\}\}/);
};

describe('compiled contract prompts', () => {
  it('renders all contract prompts without template placeholders', () => {
    const orchestrator = new Orchestrator();
    const filesystem = TOOLS.filesystem;

    if (!filesystem) {
      throw new Error('filesystem tool is required for prompt compilation tests');
    }

    const prompts = [
      orchestrator.buildIntentClassificationPrompt('Show me README.md'),
      orchestrator.buildLanguageDetectionPrompt('Bonjour'),
      orchestrator.buildToolArgumentPrompt(
        'filesystem',
        filesystem.description,
        filesystem.schema,
        'Read ./README.md',
      ),
      orchestrator.buildToolArgumentVerificationPrompt(
        'filesystem',
        filesystem.description,
        filesystem.schema,
        'Read ./README.md',
        { action: 'read', path: './README.md', limit: null, maxBytes: null },
      ),
      orchestrator.buildScoringPrompt('Sample output', 'Sample goal', 'Sample context'),
      orchestrator.buildAnswerPrompt('What is MANTIS?'),
      orchestrator.buildConversationalAnswerPrompt('Hi there'),
      orchestrator.buildResponseFormattingPrompt(
        'Here is a response',
        { language: 'en', name: 'English' },
      ),
      orchestrator.buildImageRecognitionPrompt('Describe the image', 1),
    ];

    for (let index = 0; index < prompts.length; index += 1) {
      const prompt = prompts[index]!;
      if (prompt.mode === 'raw') {
        assertCompiled(prompt.rawPrompt, `${prompt.contractName} raw`);
        continue;
      }
      assertCompiled(prompt.systemPrompt, `${prompt.contractName} system`);
      assertCompiled(prompt.userPrompt, `${prompt.contractName} user`);
    }
  });
});
