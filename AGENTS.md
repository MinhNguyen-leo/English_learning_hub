
# English Learning Hub — Agent Instructions

## Project Overview

Build a local-first English vocabulary learning web app.

Users can:
- Manage vocabulary in an Excel-like table.
- Import and export XLSX files.
- Study vocabulary using flashcards.
- Take multiple-choice quizzes.
- Track vocabulary learning progress.
- Use the website without registering.

## Technology Stack

- React
- TypeScript (strict mode)
- Vite
- Tailwind CSS
- IndexedDB with Dexie.js
- ExcelJS
- React Router
- Vitest
- React Testing Library

## Architecture

Use feature-based architecture:

src/
  app/
  components/
  features/
    vocabulary/
    flashcards/
    quiz/
    progress/
    backup/
  db/
  hooks/
  lib/
  types/

## Core Rules

1. Always inspect existing files before editing.
2. Make minimal, focused changes.
3. Use TypeScript strict mode.
4. Avoid `any` unless absolutely necessary.
5. Use reusable React components.
6. Separate business logic from UI.
7. Use a repository layer for IndexedDB.
8. Never store vocabulary only in React state.
9. Never introduce a backend without approval.
10. Never add authentication.
11. Never use paid AI APIs without approval.
12. Do not upload vocabulary to external servers.
13. Never delete user data without confirmation.
14. Keep the UI responsive and accessible.

## Data Safety

- Persist vocabulary in IndexedDB.
- Use UUIDs for vocabulary records.
- Validate imported Excel files.
- Support backup and restore.
- Handle storage errors gracefully.
- Do not clear IndexedDB during development.

## Coding Workflow

For each task:
1. Read relevant project files.
2. Explain the implementation plan.
3. Implement only the requested feature.
4. Run lint, typecheck and tests.
5. Fix errors introduced by the changes.
6. Summarize modified files.
7. Stop and wait for the next instruction.

## Agent Skills

All agent skills are installed in `.agents/skills/<skill_name>/SKILL.md` (and interoperable with Antigravity, Claude Code, Gemini, and Codex):

- **Ponytail**: Minimalist senior engineering, YAGNI, diff reviews, debt tracking (`ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help`).
- **OmniRoute**: API gateway, routing combos, API keys, RTK token compression, provider failover, MCP server, and proxy configuration (`omni-*`, `cli-*`).
- **Graphify**: Knowledge graph and AST parsing for exploring codebases, structural relationships, dependency tracing, and `/graphify` queries (`graphify`).
- **Addy Osmani Agent Skills**: 25 modular production-grade engineering workflows with anti-rationalization tables (`spec-driven-development`, `test-driven-development`, `code-review-and-quality`, `performance-optimization`, `debugging-and-error-recovery`, etc.).
- **Three.js & WebGL**: 3D scene setup, geometries, materials, lighting, cameras, animation, shaders, loaders, WebGPU, and React Three Fiber (`threejs-*`).
- **GSAP & Motion Design**: Timelines, ScrollTrigger, UI micro-interactions, layout morphing with Flip, React context cleanup, and 60fps performance optimization (`gsap-*`).
- **Project Custom Skills**: `frontend-development`, `database-security`, `systematic-debugging`, `testing`.

## Git Rules

- Do not force push.
- Do not run git reset --hard.
- Do not automatically commit.
- Do not delete unrelated files.
