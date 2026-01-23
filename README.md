# MANTIS

_Minimal Adaptive Neural Tool-Integrated System_ is a versatile AI assistant designed to be a user-friendly interface for various AI models and tools. It aims to simplify interactions with AI technologies, making them accessible to a broader audience.

## Design Principles

- Deterministic over creative
- Contracts over prompts
- Failure is explicit
- Small models decide, larger models execute
- Retries are bounded

## Orchestrator

`assistant/src/orchestrator.ts` contains an `Orchestrator` class that renders contract prompts and exposes the associated validators so the decision logic described in `ARCHITECTURE` can be exercised programmatically.

The bridge between the orchestrator and the contracts lives in the `ContractPrompt` envelope, which bundles the prompt text, the target model, and the retry guidance for each contract. `ToolSchema` provides the shape for tool argument extraction schemas, and the orchestrator ships helpers like `buildIntentClassificationPrompt`, `buildToolArgumentPrompt`, `buildAnswerPrompt`, and `buildResponseFormattingPrompt` so callers do not need to re-implement the template logic. Each `validate*` helper feeds the raw model output through the contract validators before progressing.

Tone is fixed: the orchestrator injects the predefined MANTIS personality instructions into answer and response formatting prompts so every response keeps the same concise, technically steady voice without an extra selection contract.

## Runner

`assistant/src/runner.ts` glues the orchestrator to a model client (via the `LLMClient` interface) and replays the retry hints defined inside each contract. `Runner.executeContract` builds the `ModelInvocation`, waits for the client to return raw text, stores the result inside `AttemptRecord` entries, and re-renders the retry instructions before every new attempt using `getRetryInstruction`. That keeps the retry budget implicit, lets validators stay deterministic.

## Tools

`assistant/src/tools/registry.ts` exports the registry of available tools organized by category:

- **Local**: `clipboard`, `filesystem`, `search`
- **Web**: `http`
- **System**: `process`, `shell`, `pcinfo`

Each tool definition includes a name, description, schema for arguments, and an execute function. The pipeline derives tool intents from this registry (e.g., `tool.http`, `tool.pcinfo`) and extracts arguments according to each tool's schema.

## Contracts

`assistant/src/contracts/registry.ts` aggregates all validators that enforce strict input/output behavior.

### Core Contracts (5)

These contracts form the decision pipeline and are always active:

- **Intent Classification**: Routes user input to appropriate tool or answer path
- **Tool Argument Extraction**: Extracts structured arguments for tool execution
- **Answer**: Unified knowledge answer contract with mode support (strict/normal)
- **Conversational Answer**: Handles small talk and greetings (isolated, no fallback)

### Modality Contracts (1)

Triggered situationally based on input modality:

- **Image Recognition**: Analyzes attached images to answer questions or describe content

### Optional Contracts (3)

Auxiliary functionality that never affects routing:

- **Language Detection**: Detects user's language (telemetry only)
- **Response Formatting**: Formats tool output only (best-effort, not used for text answers)

### Design Principles

- **One contract = one responsibility**: No overlap or ambiguity
- **Clarification on missing fields**: When required tool arguments are missing, the pipeline will ask a concise clarification question when confidence is high; otherwise it falls back to a non-tool answer
- **Answer outputs are final**: Not post-processed, formatted, or scored
- **Scoring is off-path**: Quality metrics logged but never affect routing
## Pipeline

`assistant/src/pipeline.ts` implements the decision pipeline. It routes user input through intent classification, extracts tool arguments when needed, verifies execution safety (with decisions being final—no retry cascades), executes tools, and formats/scores tool outputs. Answer contract output is final and not post-processed. Tool outputs are formatted and scored. The predefined MANTIS tone is applied to answer and formatting prompts.

### Key Features

- **Direct tool commands**: Recognizes single-line commands like `read <path>`, `ps`, `fetch <url>` and bypasses contracts for efficiency
- **Tool intent guards**: Enforces confidence thresholds (0.6 minimum) and trigger guards to avoid false positives
- **Skip heuristics**: Skips tool execution if >50% of required arguments are null
- **Parallel execution**: Runs language detection in parallel with tool execution to reduce latency
- **Final decisions**: Verification returns execute/clarify/abort with no retry loop; answer outputs are never formatted or scored
- **Attempt tracking**: All contract invocations tracked and summed for telemetry

## Desktop App

`desktop` contains a Tauri/Vite UI that wires `Orchestrator`, `Runner`, and `OllamaClient` together. The renderer lets you type a question, pushes it through the strict answer contract, and renders each attempt so you can watch the retry guidance overlaying the result. The Rust backend (`desktop/src-tauri`) is a minimal host that simply launches the webview and exposes no custom commands.

The UI features a **Fallout-inspired retro-futuristic theme** with terminal green colors, scanline effects, and a Vault-Tec-style avatar. Styling is centralized in `desktop/src/assets/css/theme.css` using Tailwind CSS v4 with custom theme tokens.

To run the desktop experience:
1. Ensure Rust 1.72+ and the Tauri CLI are installed.
2. `cd desktop && npm install` (installs Vite and the @tauri-apps toolchain).
3. `npm run tauri` (launches the Vite dev server, then `tauri dev`).
4. `npm run tauri:build` after `npm run build` to produce bundles.

The UI expects Ollama to be listening on `http://127.0.0.1:11434` so `OllamaClient` can resolve the prompts generated by the orchestrator.

## Further Documentation

- [ARCHITECTURE](docs/ARCHITECTURE.md) - Overview of the system architecture and design principles.
