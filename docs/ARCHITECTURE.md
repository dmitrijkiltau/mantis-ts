# MANTIS Architecture

_Minimal Adaptive Neural Tool-Integrated System_ features a Fallout-inspired retro-futuristic interface with terminal green aesthetics, scanline effects, and a Vault-Tec-style avatar.

The Orchestrator is either a deterministic engine (e.g. BitNet) or a small language model
(e.g. Qwen 2.5 1.5B), used exclusively for routing and decision-making, not for content generation.

Contracts define strict input/output behavior for models and are enforced by validators,
not trusted to the model itself.

The `assistant/src/pipeline.ts` module implements the routing pipeline described below,
deriving allowed intents from the tool registry (`tool.<name>` plus `answer.general`).
If a tool schema is empty, the pipeline skips argument extraction and executes the tool
with `{}`. A predefined MANTIS personality tone preset (interactive, professional, slightly
cynical when warranted, creative, natural) is injected into strict answer and response
formatting prompts without relying on any selection contract, keeping tone steady while
avoiding extra model calls.

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
 -> (Has Attachments?)
   -> Yes -> Image Recognition (describe/answer based on image)
   -> No -> Language Detection
      -> Detected Language -> preserved through pipeline
      |
    -> Same-Context Check (Direct Tool Command?)
      -> Yes -> Execute Tool -> Format/Summarize
      -> No -> Intent Classification
          -> answer.conversation -> Conversational Answer (Small talk, greetings, no tool)
          -> answer.general (or low confidence) -> Strict Answer (in user's language, MANTIS tone)
          -> tool.* (with high confidence) -> Tool Args (schema from tool registry)
              -> invalid -> Return deterministic `PipelineError` and optionally reroute/abort
              -> valid -> Execute Tool -> Format/Summarize in user's language (MANTIS tone)
```

## Retry Pipeline

```
Intent -> invalid JSON
Retry 1 -> valid JSON, confidence missing
Retry 2 -> {"intent":"answer.general","confidence":0.0}
-> accept fallback
-> Orchestrator evaluates outcome and selects next contract
```

## Retry Matrix

| Contract-Type              | Max Retries | On Failure                                  | Strategy              |
| -------------------------- | ----------- | ------------------------------------------- | --------------------- |
| Language Detection         | 2           | Default to "unknown" language               | Best-Effort           |
| Intent Classification      | 2           | Default Intent                              | Constraint Tightening |
| Tool Argument Extraction   | 2           | Revalidate User or Cancel                   | Schema Reinforcement  |
| Tool Argument Verification | 1           | retry, clarify, abort                       | Schema Reinforcement  |
| Text Transformation        | 1           | Keep Original Text, Log Failure             | Hard Reminder         |
| Scoring / Evaluation       | 1           | Default Score (0), Flag "evaluation_failed" | Numeric Lock          |
| Strict Answer Mode         | 1           | Force "I don't know."                       | Fail Fast             |
| Conversational Answer      | 1           | Return brief text or ignore                 | Best-Effort           |
| Image Recognition          | 1           | Return "I cannot see the image."            | Fail Fast             |
| Response Formatting        | 0           | Keep Original Text, Continue                | Best-Effort           |

## Image Recognition

The `Image Recognition` stage is triggered immediately if the user attaches images. It bypasses the standard intent classification flow to focus solely on vision tasks. The `IMAGE_RECOGNITION` contract analyzes the image(s) using a vision-capable model (e.g., Qwen-VL) to answer the user's question or describe the content if no question is provided. It attempts one retry to enforce conciseness.

## Response Formatting

The `RESPONSE_FORMATTING` contract is an optional post-processing step applied after successful completion of strict answer or tool execution. It formats responses as concise answers in the user's detected language (one sentence preferred, two max), suitable for datetime queries (e.g., "It is 3:45 PM on Saturday") or other contextual information. When tool outputs are structured JSON, the formatter produces a brief summary while the raw output remains available in the UI. The predefined MANTIS tone instructions are injected ahead of the formatting constraints but do not override them.

Formatting failures are graceful: the original response is returned unchanged and the pipeline continues normally. This ensures the formatter never blocks the pipeline.

## Pipeline behavior and safeguards

- **Direct tool commands (single-line bypasses)**: The pipeline recognizes short single-line commands (no newlines) and will directly parse and execute a few common direct tool commands without running contracts. Examples: `read <path>` or `list <path>` (filesystems), `ps` / `processes [filter]` (process listing), and `get|fetch <url>` (HTTP GET). Direct requests bypass contract prompts, validate arguments against tool schemas, execute the tool directly, and the output is either formatted (strings) or summarized (structured outputs) and then scored. Direct tool executions return an intent of `tool.<name>` with confidence 1 and use the language fallback (`unknown`) when language detection is not applicable.

- **Tool intent guards**: Tool intents use the `tool.` prefix and require a minimum confidence (currently 0.6). The pipeline enforces an explicit trigger-guard (via `TOOL_TRIGGERS`) when confidence is moderate; if confidence is very high, it proceeds without triggers to avoid blocking non-English or terse requests. When triggers are missing and the pipeline falls back to a strict answer, it adds a short suggestion indicating the relevant tool can be used if the user asks explicitly.

- **Strict JSON validation for tool contracts**: Tool argument extraction and verification require JSON-only responses (after stripping Markdown fences). Any extra text or non-object payloads are rejected to reduce retries caused by chatty outputs.

- **Schema-aware argument extraction and skip heuristics**: If a tool's schema is empty the pipeline executes the tool with `{}`. Otherwise the pipeline extracts arguments using the `TOOL_ARGUMENT_EXTRACTION` contract, validates them, and may skip tool execution if the arguments are mostly null. Specifically, non-nullable (required) fields are counted and if the fraction of required fields that are null exceeds a threshold (0.5) the pipeline falls back to a strict answer; if all arguments are null it will also skip execution. This avoids running tools with insufficient intent.

- **Parallel language detection & tool execution**: When executing tools, the pipeline runs language detection in parallel with tool execution (Promise.all) to reduce latency; the detected language (or fallback) is then used for response formatting and summarization.

- **Scoring & evaluation**: The `SCORING_EVALUATION` contract is run for strict answers, conversational answers, tool outputs (including direct tools). A label is attached (e.g. `tool.<name>`, `strict_answer`, `conversational_answer`, `direct_tool.<name>`). If any numeric metric in the evaluation is below the configured low score threshold (currently 3) the pipeline sets an `evaluationAlert` of `low_scores`. Failures to evaluate are flagged as `scoring_failed`.

- **Attempts accounting & retries**: Attempts from each stage (intent, language detection, argument extraction, scoring, etc.) are tracked and summed into the overall `attempts` returned by pipeline results so callers can see how many contract invocations occurred.

- **Orchestrator prompt features and optimizations**: The `Orchestrator` injects optional tone instructions, includes a local timestamp block (current date/time/weekday) in certain prompts, caches a formatted tool reference string and formatted tool schema strings to avoid per-request allocations, and supports model overrides per difficulty level. It also exposes `getRetryInstruction` for staged retry guidance.

## Tool Categories

### Local Tools

- **Clipboard**: Read from and write to the system clipboard
- **Filesystem**: Read files and list directories with size and truncation limits
- **Search**: Recursively search for files and directories by name pattern

### Web Tools

- **Fetch**: Execute HTTP requests with custom headers, query parameters, and body (JSON-encoded args)
- **HTTP**: Execute HTTP requests with headers and query parameters (object-based args)

### System Tools

- **Process**: Read-only process inspection with optional name filter and result limit
- **Shell**: Execute safe shell commands (allowlisted binaries only)
- **PC Info**: Retrieve system metrics (CPU, memory, disk, uptime)

All tool schemas are derived from their `ToolDefinition` types and validated before execution. Empty schemas skip argument extraction and execute the tool with `{}`.
