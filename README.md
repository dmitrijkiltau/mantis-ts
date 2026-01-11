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

The bridge between the orchestrator and the contracts lives in the `ContractPrompt` envelope, which bundles the prompt text, the target model, and the retry guidance for each contract. `ToolSchema` provides the shape for tool argument extraction schemas, and the orchestrator ships helpers like `buildIntentClassificationPrompt`, `buildToolArgumentPrompt`, and `buildStrictAnswerPrompt` so callers do not need to re-implement the template logic. Each `validate*` helper feeds the raw model output through the contract validators before progressing.

## Runner

`assistant/src/runner.ts` glues the orchestrator to a model client (via the `LLMClient` interface) and replays the retry hints defined inside each contract. `Runner.executeContract` builds the `ModelInvocation`, waits for the client to return raw text, stores the result inside `AttemptRecord` entries, and re-renders the retry instructions before every new attempt using `getRetryInstruction`. That keeps the retry budget implicit, lets validators stay deterministic.

## Further Documentation

- [ARCHITECTURE](docs/ARCHITECTURE.md) - Overview of the system architecture and design principles.
