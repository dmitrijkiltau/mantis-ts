import { Orchestrator } from '../src/orchestrator.js';
import { TOOLS } from '../src/tools/registry.js';
import { CONTRACTS } from '../src/contracts/registry.js';

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

// Simple CLI: allow `--contract <name>` or `-c <name>` to print one contract
const argv = process.argv.slice(2);
let contractArg: string | undefined;
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === '--contract' || a === '-c') {
    contractArg = argv[i + 1];
    break;
  }
}

const printPrompt = (p: typeof prompts[number]) => {
  console.log('---', p.contractName, '---');
  console.log('SYSTEM:\n', p.systemPrompt || '(none)');
  console.log('USER:\n', p.userPrompt || '(none)');
  console.log('\n');
};

if (contractArg) {
  const normalized = contractArg.replace(/[^a-z0-9]+/gi, '_').toUpperCase();
  if (!(normalized in CONTRACTS)) {
    console.error(`Unknown contract: ${contractArg}`);
    console.error('Available contracts: ', Object.keys(CONTRACTS).join(', '));
    process.exitCode = 2;
  } else {
    const single = orchestrator.buildCompiledContract(normalized as any);
    printPrompt(single);
  }
} else {
  for (const p of prompts) {
    printPrompt(p);
  }
}