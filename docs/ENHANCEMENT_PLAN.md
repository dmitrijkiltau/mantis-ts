# Enhancement Plan: MANTIS Assistant Optimization

## Goals
- Reduce unnecessary model/tool calls without reducing assistant capability.
- Improve tool routing accuracy and consistency.
- Clean up and document architectural behavior so implementation and docs match.

## Phase 1: Routing & Call Reduction (Immediate)
- **Trigger-guard enforcement**: Require per-tool trigger keywords before executing tool intents to avoid accidental tool calls when confidence is high but intent is ambiguous.
- **Lower low-score retry threshold**: Align retry threshold to reduce unnecessary intent retries while maintaining quality signals.
- **Direct tool validation**: Validate direct tool arguments against `argsSchema` before execution to prevent wasted tool runs.
- **Schema cache correctness**: Fix tool schema cache keying to include field types to prevent cross-tool collisions.

## Phase 2: Cleanup & Consistency
- **Documentation alignment**: Ensure architecture docs match runtime behavior (threshold values, trigger guards, direct tool validation).
- **Schema parity checks**: Add a lightweight unit test or script that compares tool `schema` vs `argsSchema` field names/nullability to prevent drift.
- **Contract output strictness**: Tighten JSON-only validation (optional) for high-risk contracts to reduce retries caused by chatty outputs.

## Phase 3: Experience Improvements
- **Tool clarification UX**: Improve clarification questions with tool-specific context (path, URL, or query hints).
- **Telemetry reductions**: Consolidate redundant logging in the pipeline to reduce noise and cost.
- **Smart fallbacks**: If tool triggers are missing, provide a short suggestion that a tool could help when user clarifies intent.

## Measurement
- Track tool call count per conversation.
- Track average contract attempts per request.
- Track tool execution failures caused by schema mismatch.
