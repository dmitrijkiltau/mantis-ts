# MANTIS Coding Guide

## Purpose

_Minimal Adaptive Neural Tool-Integrated System_ is designed to facilitate seamless interactions with AI models and tools. This guide outlines the coding standards and architectural principles that developers should follow when contributing to the MANTIS codebase.

## Architectural Overview

Refer to the [ARCHITECTURE](docs/ARCHITECTURE.md) document for a comprehensive overview of the MANTIS architecture, including the roles of the Orchestrator, LLMs, Validators, and the communication pipelines.

## Coding Standards

### TypeScript

All code should be written in most recent TypeScript, leveraging its type safety features to ensure robust and maintainable code. Prefere `for` loops over `forEach` for better performance and readability.

### TailwindCSS 4

Prefer `@apply` in CSS with semantic class names, CSS nesting and avoid Tailwind utility classes in the HTML structure. Desktop styling uses `desktop/src/assets/css/theme.css` with a **Fallout-inspired retro-futuristic theme** featuring terminal green (#00ff88), scanline effects, and Vault-Tec aesthetics. Theme defined colors can be used as normal Tailwind colors.

### Modularity

Follow a modular design approach. Each component (e.g., Orchestrator, Contracts, Validators) should be encapsulated in its own module.

### Documentation

Ensure all functions, classes, and modules are well-documented using short JSDoc comments.

### Error Handling

Implement explicit error handling. Use validators to enforce contract compliance and handle failures gracefully.

### Testing

Write unit tests for all critical components, especially for the Orchestrator and Validators. Ensure that edge cases are covered.

### Commands

You are working on a win32 System, where `head` is an alias for `Get-Content -TotalCount`. Use `npm run` commands defined in `package.json` for testing, and type-checking the project.
