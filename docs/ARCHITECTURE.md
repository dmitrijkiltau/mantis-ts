# MANTIS Architecture

_Minimal Adaptive Neural Tool-Integrated System_ features a Fallout-inspired retro-futuristic interface with terminal green aesthetics, scanline effects, and a Vault-Tec-style avatar.

The Orchestrator is either a deterministic engine (e.g. BitNet) or a small language model
(e.g. Qwen 2.5 1.5B), used exclusively for routing and decision-making, not for content generation.

Contracts define strict input/output behavior for models and are enforced by validators,
not trusted to the model itself.

The `assistant/src/pipeline.ts` module implements the routing pipeline described below,
deriving allowed intents from the tool registry (`tool.<name>` plus `unknown`).
If a tool schema is empty, the pipeline skips argument extraction and executes the tool
with `{}`. A predefined MANTIS personality tone preset is injected into strict answer and
response formatting prompts without relying on any selection contract, keeping tone steady
while avoiding extra model calls.

## Decision logic

Orchestrator decides:
- What is the goal?
- Which schema?
- Which tool?
- What are the limits?

LLM decides:
- How to implement it linguistically correctly?

## Communication Pipeline

```
User Input
   |
Language Detection
   |
Orchestrator (Routing & Decision)
   |
LLM (Task Execution)
   |
Validator (mandatory)
   |
(Optional: Formatter in User's Language)
   |
Output
```

## Contract Validator Pipeline

```
LLM -> Raw Output
   |
Validator
   |
Valid -> proceed
Invalid -> retry (if allowed) or abort
```

## Orchestrator Decision Graph

```
Input
 -> Language Detection
   -> Detected Language -> preserved through pipeline
   |
 -> Intent Classification
   -> unknown -> Strict Answer (in user's language, MANTIS tone)
   -> tool.* -> Tool Args (schema from tool registry)
       -> invalid -> Error Channel -> Abort or Re-route
       -> valid -> Execute Tool -> Format in user's language (MANTIS tone)
```

## Retry Pipeline

```
Intent -> invalid JSON
Retry 1 -> valid JSON, confidence missing
Retry 2 -> {"intent":"unknown","confidence":0.0}
-> accept fallback
-> Orchestrator evaluates outcome and selects next contract
```

## Retry Matrix

| Contract-Type            | Max Retries | On Failure                                              | Strategy              |
| ------------------------ | ----------- | ------------------------------------------------------- | --------------------- |
| Language Detection       | 2           | Default to "unknown"                                    | Best-Effort           |
| Intent Classification    | 2           | Default Intent                                          | Constraint Tightening |
| Tool Argument Extraction | 2           | Revalidate User or Cancel                               | Schema Reinforcement  |
| Text Transformation      | 1           | Keep Original Text, Log Failure                         | Hard Reminder         |
| Scoring / Evaluation     | 1           | Default Score (0), Flag "evaluation_failed"             | Numeric Lock          |
| Strict Answer Mode       | 0           | Force "I don't know."                                   | Fail Fast             |
| Response Formatting      | 0           | Keep Original Text, Continue                            | Best-Effort           |
| Error Channel            | 0           | Signal Orchestrator: New Decision or Different Contract | Abort & Re-route      |

## Response Formatting

The `RESPONSE_FORMATTING` contract is an optional post-processing step applied after successful completion of strict answer or tool execution. It formats responses as concise single sentences in the user's detected language, suitable for datetime queries (e.g., "It is 3:45 PM on Saturday") or other contextual information. The predefined MANTIS tone instructions are injected ahead of the formatting constraints but do not override them.

Formatting failures are graceful: the original response is returned unchanged and the pipeline continues normally. This ensures the formatter never blocks the pipeline.

## Tool Categories

### Local Tools

- **Clipboard**: Read from and write to the system clipboard
- **Filesystem**: Read files and list directories with size and truncation limits
- **Search**: Recursively search for files and directories by name pattern

### Web Tools

- **Fetch**: Execute HTTP requests with custom headers, query parameters, and body (JSON-encoded args)
- **HTTP**: Execute HTTP requests with headers and query parameters (object-based args)

### System Tools

- **DateTime**: Retrieve current date/time in specified timezone with flexible formatting (ISO, local, weekday)

All tool schemas are derived from their `ToolDefinition` types and validated before execution. Empty schemas skip argument extraction and execute the tool with `{}`.
