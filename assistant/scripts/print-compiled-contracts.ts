import { Orchestrator } from '../src/orchestrator.js';
import { TOOLS } from '../src/tools/registry.js';

const orchestrator = new Orchestrator();
const filesystem = TOOLS.filesystem;

if (!filesystem) {
  throw new Error('filesystem tool is required');
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
  orchestrator.buildTextTransformationPrompt('Fix this text'),
  orchestrator.buildScoringPrompt('Sample output', 'Sample goal', 'Sample context'),
  orchestrator.buildStrictAnswerPrompt('What is MANTIS?'),
  orchestrator.buildConversationalAnswerPrompt('Hi there'),
  orchestrator.buildResponseFormattingPrompt(
    'Here is a response',
    { language: 'en', name: 'English' },
  ),
  orchestrator.buildImageRecognitionPrompt('Describe the image', 1),
];

for (const p of prompts) {
  console.log('---', p.contractName, '---');
  console.log('SYSTEM:\n', p.systemPrompt || '(none)');
  console.log('USER:\n', p.userPrompt || '(none)');
  console.log('\n');
}