# MANTIS Architecture

_Minimal Adaptive Neural Tool-Integrated System_ is a contract-based AI assistant that routes user input to specialized tools or knowledge sources. The system uses small language models for routing decisions and larger models for content generation.

## Design Philosophy

MANTIS enforces strict decision boundaries through a contract system where each contract has one exclusive responsibility. The architecture eliminates retry cascades and makes routing deterministic:

- **Small models decide**: Routing, classification, and validation
- **Large models execute**: Answer generation, image recognition, content formatting
- **Validators enforce contracts**: Output structure is validated, not trusted to models
- **Decisions are final**: No retry loops or cascading fallbacks
- **Failures are explicit**: Each contract has a defined failure mode

The Orchestrator renders contract prompts with predefined MANTIS personality (interactive, professional, technically precise), enforces JSON schemas for tool contracts, and injects local context (timestamp, weekday) where relevant.

## Contract Set

The system uses 7 contracts organized into 3 categories:

### Core Contracts (4)

These contracts form the decision pipeline and are always active:

1. **INTENT_CLASSIFICATION** 
   - **Purpose**: Routes user input to tool or answer pipeline
   - **Input**: User message + tool registry
   - **Output**: Intent string (e.g., `tool.filesystem`, `answer.general`) with confidence (0-1)
   - **Retry**: Up to 2 attempts
   - **Failure**: Defaults to `answer.general` with confidence 0

2. **TOOL_ARGUMENT_EXTRACTION** 
   - **Purpose**: Extracts structured arguments for tool execution
   - **Input**: User message + tool schema
   - **Output**: JSON object matching tool schema
   - **Retry**: Up to 2 attempts
   - **Failure**: Returns empty object `{}`

3. **ANSWER** 
   - **Purpose**: Unified knowledge answer contract with mode support
   - **Input**: User question + context + mode (`strict` or `normal`)
   - **Output**: Natural language answer
   - **Modes**:
     - `strict`: Factual queries requiring precision (dates, calculations, technical definitions)
     - `normal`: Open-ended questions allowing broader interpretation
   - **Retry**: Up to 2 attempts
   - **Failure**: Returns "I don't know" message
   - **Output is final**: No formatting or external evaluation applied

4. **ANSWER (mode: conversational)** 
   - **Purpose**: Handles greetings, small talk, and social interactions
   - **Input**: User message
   - **Output**: Friendly conversational response
   - **Retry**: Up to 2 attempts
   - **Failure**: Returns generic error response
   - **Isolated path**: No fallback to other contracts; output is final

### Modality Contracts (1)

These contracts are triggered situationally based on input modality:

6. **IMAGE_RECOGNITION** 
   - **Purpose**: Analyzes attached images to answer questions or describe content
   - **Input**: Image(s) + optional user question
   - **Output**: Description or answer based on visual content
   - **Retry**: Up to 2 attempts to enforce conciseness
   - **Failure**: Returns "I cannot see the image" message
   - **Bypass**: Triggered immediately when images are attached, bypassing intent classification

### Optional Contracts (2)

These contracts provide auxiliary functionality and never affect routing decisions:

7. **LANGUAGE_DETECTION** 
   - **Purpose**: Detects user's language for telemetry and localization
   - **Input**: User message
   - **Output**: ISO 639-1 language code (e.g., `en`, `de`)
   - **Retry**: Up to 2 attempts
   - **Failure**: Defaults to `unknown`
   - **Usage**: Telemetry only; runs in parallel with tool execution to reduce latency

8. **ANSWER (mode: tool-formatting)** 
   - **Purpose**: Formats tool outputs into concise natural language
   - **Input**: Tool output + detected language
   - **Output**: 1-2 sentence natural language summary
   - **Retry**: None (best-effort, 0 retries)
   - **Failure**: Returns original tool output unchanged
   - **Scope**: Applied only to tool outputs, never to ANSWER or CONVERSATIONAL_ANSWER
   - **Best-effort**: Failures are graceful; pipeline never blocks

## Decision Boundaries

The pipeline enforces strict decision boundaries to maintain deterministic behavior:

### 1. Required fields & clarification

The pipeline uses schema validation and explicit clarification rules to ensure tool runs are safe and sensible:

- **Schema validation**: Extracted arguments are validated against a tool's schema and required fields are identified.
- **Required-field overrides**: For tools that can reasonably default common fields (for example `filesystem.path` defaulting to the current working directory), the pipeline tracks which fields may be auto-filled from context.
- **Clarification**: If required fields are missing and the intent confidence is high, the pipeline asks a concise clarification question. Otherwise it falls back to a non-tool answer.

This keeps tool execution deterministic while avoiding a separate verification contract.

### 2. Answer Outputs are Final

`ANSWER` contract output is returned directly to the user with no post-processing:

- No response formatting
- No additional contracts in the chain

This ensures knowledge answers remain accurate and unmodified.

### 3. Conversational Answers are Isolated

`CONVERSATIONAL_ANSWER` operates on a dedicated path:
- Triggered for greetings, small talk, and social interactions
- No fallback to other contracts if classification is confident
- Output is final with no scoring

### 4. Formatting Applies to Tools Only

`RESPONSE_FORMATTING` transforms tool outputs into natural language:
- Applied only to tool execution results
- Never applied to `ANSWER` or `CONVERSATIONAL_ANSWER` outputs
- Failures are graceful: original output is preserved

## Communication Pipeline

```
User Input (with optional images)
   |
   ├─ [Images attached?] ──Yes──> IMAGE_RECOGNITION ──> Output
   |                                   
   No
   |
   v
INTENT_CLASSIFICATION
   |
   ├─ tool.* intent (confidence ≥ 0.6)
   |  |
   |  v
   |  TOOL_ARGUMENT_EXTRACTION
   |  |
   |  v
   |  ├─ execute ──> Tool Execution ──> RESPONSE_FORMATTING ──> Output
   |  ├─ clarify ──> Clarification Request ──> Output
   |  └─ abort ──> Error Message ──> Output
   |
   ├─ conversational intent
   |  |
   |  v
   |  CONVERSATIONAL_ANSWER ──> Output
   |
   └─ answer.general or low confidence
      |
      v
      ANSWER (strict or normal mode) ──> Output

LANGUAGE_DETECTION runs in parallel with tool execution for telemetry
```


## Contract Invocation Modes

Contracts can use either **chat mode** or **raw mode** for LLM interaction:

- **Chat mode (`MODE: "chat"`)**: Uses chat API with separate system/user messages. Preserves role separation, supports multimodal attachments, and applies JSON prefill (`"{"`) for JSON-constrained contracts.
- **Raw mode (`MODE: "raw"`)**: Uses single prompt string (system + user concatenated) via generate-style API. Better for models that perform well without chat formatting. Skips JSON-prefill.

Validators remain mandatory regardless of mode and are the ultimate gatekeeper for contract compliance.

| Contract                   | Mode | Rationale                                                              |
|----------------------------|------|------------------------------------------------------------------------|
| INTENT_CLASSIFICATION      | raw  | Strict JSON output with compact intent + confidence                    |
| LANGUAGE_DETECTION         | raw  | Single-token ISO code output                                           |
| TOOL_ARGUMENT_EXTRACTION   | raw  | Schema-shaped JSON requires strict, tool-focused prompting             |

| ANSWER                     | chat | Natural-language answer with mode support and tone/language control    |
| CONVERSATIONAL_ANSWER      | chat | Chatty small-talk responses suit chat roles                            |
| RESPONSE_FORMATTING        | chat | Natural-language formatting grounded in tool output                    |
| IMAGE_RECOGNITION          | chat | Multimodal attachment support needed for vision                        |

## Pipeline Implementation

The `assistant/src/pipeline.ts` module implements the routing logic described above.

### Intent Classification

The pipeline derives allowed intents from the tool registry (`assistant/src/tools/registry.ts`):
- Tool intents: `tool.<name>` (e.g., `tool.filesystem`, `tool.http`)
- Answer intent: `answer.general`
- Conversational intent: `conversational.smalltalk`

Tool intents require minimum confidence (0.6). When confidence is moderate, explicit trigger guards verify intent. Very high confidence (≥ 0.8) bypasses trigger guards to avoid blocking non-English or terse requests.

### Direct Tool Commands

The pipeline recognizes short single-line commands and bypasses contracts for efficiency:
- `read <path>` or `list <path>` → filesystem tool
- `ps` or `processes [filter]` → process tool  
- `get <url>` or `fetch <url>` → http tool

Direct commands skip intent classification, validate arguments against schemas, execute immediately, and return formatted results.

### Tool Execution Path

When a tool intent is detected (confidence ≥ 0.6):

1. **Schema Check**: If tool schema is empty, execute immediately with `{}`
2. **Argument Extraction**: Use `TOOL_ARGUMENT_EXTRACTION` to parse structured arguments
3. **Schema Validation**: Validate extracted arguments against tool schema
4. **Skip Heuristics**: Skip execution if >50% of required fields are null
5. **Execution**: Run the tool
6. **Formatting**: Apply `RESPONSE_FORMATTING` (best-effort, failures preserve original output)

**Language Detection** runs in parallel with tool execution (Promise.all) to reduce latency.

### Answer Path

When `answer.general` intent is detected or confidence is low:

1. **Mode Selection**: 
   - `strict`: Factual queries (dates, calculations, technical definitions)
   - `normal`: Open-ended questions
2. **Answer Generation**: Call `ANSWER` contract with selected mode
3. **Direct Return**: Output is final (no formatting, no scoring)

When trigger guards are missing and the system falls back to answer, it adds a short suggestion indicating the relevant tool can be used if the user asks explicitly.

### Conversational Path

When `conversational.smalltalk` intent is detected:

1. **Isolated Execution**: Call `CONVERSATIONAL_ANSWER` contract
2. **Direct Return**: Output is final (no scoring, no fallback)

### Image Recognition Path

When images are attached:

1. **Immediate Trigger**: Bypass intent classification
2. **Vision Analysis**: Call `IMAGE_RECOGNITION` contract with image(s) and optional question
3. **Direct Return**: Output is final

## Orchestrator

The `assistant/src/orchestrator.ts` module renders contract prompts and exposes validators.

### Prompt Rendering

Key methods for generating contract prompts:

- `buildIntentClassificationPrompt(tools, userInput)` - Routing prompt with tool registry
- `buildToolArgumentPrompt(tool, userInput)` - Extraction prompt with tool schema
- `buildAnswerPrompt(question, mode)` - Answer prompt with mode-specific instructions
- `buildAnswerPrompt(input, 'conversational')` - Conversational response prompt
- `buildAnswerPrompt(toolOutput, 'tool-formatting', undefined, language, undefined, undefined, { requestContext, toolName, response: toolOutput })` - Formatting prompt


### Prompt Conventions

Tool routing prompts enforce structured tool preference:
- Prefer filesystem/search/process/http/pcinfo/clipboard over shell
- Treat shell as last resort
- Explicit negative constraints prevent shell usage when structured tools fit

Argument extraction prompts clarify schema requirements:
- Required vs optional fields derived from schema nullability
- Units/ranges/defaults must be provided by user or context (no inference)

Verification prompts distinguish error types:
- Missing user input → `clarify`
- Extraction mistakes → explain reasoning
- Only populate `missingFields`/`suggestedArgs` when decision warrants it

### Validators

Each contract has an associated validator that parses and validates LLM output:

- `validateIntentClassification(output)` - Parses intent and confidence
- `validateLanguageDetection(output)` - Parses ISO 639-1 language code
- `validateToolArguments(output, schema)` - Validates JSON structure against schema
- `validateToolVerification(output)` - Parses verification decision
- `validateAnswer(output)` - Validates answer structure
- `validateConversationalAnswer(output)` - Validates conversational response
- `validateImageRecognition(output)` - Validates image description
- `validateResponseFormatting(output)` - Validates formatted response
- `validateScoring(output)` - Validates numeric scores

Validators are strictly deterministic—they never involve further LLM calls and operate solely via regex, JSON parsing, and property checks.

### Features

- **Tone Injection**: Predefined MANTIS personality (interactive, professional, technically precise) injected into answer and formatting prompts
- **Context Injection**: Local timestamp (date, time, weekday) included in relevant prompts
- **Caching**: Tool reference strings and schemas cached to avoid per-request allocations
- **Model Overrides**: Supports different models per difficulty level (small for routing, large for execution)
- **Retry Guidance**: Exposes `getRetryInstruction` for stage-specific retry hints

## Runner

The `assistant/src/runner.ts` module bridges the orchestrator and LLM client.

### Execution Flow

1. **Build Invocation**: Create `ModelInvocation` from `ContractPrompt`
2. **LLM Call**: Send invocation to LLM client (via `LLMClient` interface)
3. **Store Result**: Record raw output in `AttemptRecord`
4. **Validate**: Pass output through contract validator
5. **Retry Logic**: If validation fails and retries remain, render retry instructions and repeat

The `ContractPrompt` envelope bundles prompt text, target model, and retry guidance for each contract. `Runner.executeContract` manages the retry budget implicitly, letting validators stay deterministic.

### Key Features

- **Retry Budget**: Each contract defines max retries; runner enforces limit
- **Retry Instructions**: Uses `getRetryInstruction` to provide stage-specific guidance
- **Attempt Tracking**: Records all attempts for debugging and telemetry
- **Deterministic Validation**: Validators are pure functions (no LLM calls)

## Tool Registry

The `assistant/src/tools/registry.ts` exports available tools organized by category.

### Local Tools

- **clipboard**: Read from and write to system clipboard
- **filesystem**: Read files and list directories with size and truncation limits
- **search**: Recursively search for files and directories by name pattern

### Web Tools

- **http**: Execute HTTP requests with custom headers, query parameters, and body

### System Tools

- **process**: Read-only process inspection with optional name filter and result limit
- **shell**: Execute safe shell commands (allowlisted binaries only)
- **pcinfo**: Retrieve system metrics (CPU, memory, disk, uptime)

Each tool definition includes:
- **name**: Tool identifier (e.g., `filesystem`, `http`)
- **description**: Human-readable purpose
- **schema**: Zod schema defining required and optional arguments
- **execute**: Async function that performs the tool operation

Tool schemas are derived from `ToolDefinition` types and validated before execution. Empty schemas skip argument extraction and execute the tool with `{}`.

## Safeguards and Optimizations

### JSON Validation for Tool Contracts

Tool argument extraction and verification require JSON-only responses:
- Strip Markdown fences (` ```json ... ``` `)
- Reject any extra text before or after JSON
- Reject non-object payloads
- Reduces retries caused by chatty outputs

### Skip Heuristics

The pipeline skips tool execution if arguments are insufficient:
- Count required (non-nullable) fields in schema
- Calculate null fraction: `nulls / required`
- Skip if null fraction > 0.5
- Skip if all arguments are null
- Fall back to answer instead of executing with incomplete data

### Parallel Execution

Language detection runs in parallel with tool execution (Promise.all) to reduce latency. The detected language (or fallback `unknown`) is then used for response formatting.

### Tool Intent Guards

Tool intents use explicit trigger guards when confidence is moderate:
- Required when confidence is 0.6 - 0.8
- Bypassed when confidence is very high (≥ 0.8)
- Avoids false positives for non-English or terse requests

### Scoring Thresholds



### Attempt Tracking

All contract invocations are tracked and summed:
- Intent classification attempts
- Language detection attempts
- Argument extraction attempts
- Verification attempts (always 1, no retries)
- Scoring attempts
- Total attempts returned in pipeline result for telemetry

## Desktop Application

The `desktop/` folder contains a Tauri/Vite UI that demonstrates the MANTIS architecture.

### Technology Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust + Tauri 2.0
- **LLM Client**: Ollama HTTP API
- **Styling**: Tailwind CSS v4 with custom theme

### UI Design

The interface features a **Fallout-inspired retro-futuristic theme**:
- Terminal green (#00ff88) primary color
- Scanline effects and CRT-style artifacts
- Vault-Tec-style avatar with animated expressions
- Monospace fonts and pixelated icons
- Pip-Boy-inspired tablet interface

Styling is centralized in [desktop/src/assets/css/theme.css](../desktop/src/assets/css/theme.css) using Tailwind CSS v4 with semantic class names, CSS nesting, and custom theme tokens. HTML uses minimal utility classes per the `@apply` directive pattern.

### Features

- **Speech Bubbles**: Renders assistant responses with markdown, code blocks, and tool outputs
- **Tool Catalog**: Displays available tools with descriptions and schemas
- **Contract Telemetry**: Shows contract invocations, attempts, and validation results
- **Tablet Panels**: Tabbed interface for tools, contract logs, and settings
- **Avatar Animations**: Idle chatter, eye blinks, and state transitions
- **Image Attachments**: Drag-and-drop image upload for vision queries
- **Screen Capture**: Capture screenshots for image recognition

### Running the Desktop App

1. Install Rust 1.72+ and Tauri CLI
2. `cd desktop && npm install`
3. `npm run tauri` (launches Vite dev server + Tauri dev mode)
4. `npm run tauri:build` after `npm run build` for production bundles

The UI expects Ollama to be listening on `http://127.0.0.1:11434` for LLM inference.

## Testing

### Unit Tests

Test files:
- [assistant/src/pipeline.test.ts](../assistant/src/pipeline.test.ts) - Pipeline routing and contract invocation
- [assistant/src/contracts/compiled-contracts.test.ts](../assistant/src/contracts/compiled-contracts.test.ts) - Contract prompt rendering
- [assistant/src/tools/schema-parity.test.ts](../assistant/src/tools/schema-parity.test.ts) - Tool schema validation

Run tests:
```bash
npm run test
```

### Type Checking

TypeScript strict mode is enabled for type safety:
```bash
npm run typecheck
```

### Contract Inspection

Print compiled contract prompts for review:
```bash
# All contracts
npm run print-contracts

# Specific contract
npm run print-contracts -- --contract INTENT_CLASSIFICATION
```

This outputs the exact `system` and `user` prompt text sent to LLMs, useful for debugging contract behavior.

## Summary

MANTIS is a deterministic, contract-based AI assistant that:

- **Routes intelligently**: Small models classify intent, large models generate content
- **Enforces boundaries**: Each contract has one responsibility; decisions are final
- **Fails explicitly**: Every contract has a defined failure mode
- **Eliminates cascades**: No retry loops in verification; decisions are honored immediately
- **Optimizes execution**: Parallel operations, cached strings, skip heuristics
- **Provides transparency**: All attempts tracked; contract telemetry available in UI

The architecture prioritizes correctness over creativity, determinism over flexibility, and explicit failures over silent degradation.

