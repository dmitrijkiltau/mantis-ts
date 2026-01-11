# MANTIS Architecture

The Orchestrator is either a deterministic engine (e.g. BitNet) or a small language model
(e.g. Qwen 2.5 1.5B), used exclusively for routing and decision-making, not for content generation.

Contracts define strict input/output behavior for models and are enforced by validators,
not trusted to the model itself.

The `assistant/src/pipeline.ts` module implements the routing pipeline described below,
deriving allowed intents from the tool registry (`tool.<name>` plus `unknown`).
If a tool schema is empty, the pipeline skips argument extraction and executes the tool
with `{}`.

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
   ↓
Orchestrator (Routing & Decision)
   ↓
LLM (Task Execution)
   ↓
Validator (mandatory)
   ↓
(Optional: Formatter)
   ↓
Output
```

## Contract Validator Pipeline

```
LLM → Raw Output
   ↓
Validator
   ↓
Valid → proceed
Invalid → retry (if allowed) or abort
```

## Orchestrator Decision Graph

```
Input
 → Intent Classification
   → unknown → Strict Answer
   → tool.* → Tool Args (schema from tool registry)
       → invalid → Error Channel → Abort or Re-route
       → valid → Execute Tool
```

## Retry Pipeline

```
Intent → invalid JSON
Retry 1 → valid JSON, confidence missing
Retry 2 → {"intent":"unknown","confidence":0.0}
→ accept fallback
→ Orchestrator evaluates outcome and selects next contract
```

## Retry Matrix

| Contract-Type            | Max Retries | On Failure                                              | Strategy              |
| ------------------------ | ----------- | ------------------------------------------------------- | --------------------- |
| Intent Classification    | 2           | Default Intent                                          | Constraint Tightening |
| Tool Argument Extraction | 2           | Revalidate User or Cancel                               | Schema Reinforcement  |
| Text Transformation      | 1           | Keep Original Text, Log Failure                         | Hard Reminder         |
| Scoring / Evaluation     | 1           | Default Score (0), Flag "evaluation_failed"             | Numeric Lock          |
| Strict Answer Mode       | 0           | Force "I don’t know."                                   | Fail Fast             |
| Error Channel            | 0           | Signal Orchestrator: New Decision or Different Contract | Abort & Re-route      |
