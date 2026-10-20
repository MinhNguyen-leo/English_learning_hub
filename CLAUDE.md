# Claude Code Guidelines — English Learning Hub

Please adhere strictly to all project constraints, architecture rules, and safety principles defined in [AGENTS.md](./AGENTS.md).

## Installed Skills & Capabilities

Skills are installed in `.agents/skills/` (and available in `.claude/skills/`). Refer to each skill's `SKILL.md` when handling related tasks:

- **Ponytail (`ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help`)**: Minimalist senior engineering, avoiding bloat/over-engineering, diff reviews, debt ledgers, and repository audits.
- **OmniRoute (`omni-*`, `cli-*`)**: Unified local-first AI gateway, routing combos, API keys, RTK token compression, provider failover, MCP server, and proxy configuration.
- **Graphify (`graphify`)**: Knowledge graph and AST parsing for exploring codebases, structural relationships, dependency tracing, and `/graphify` queries.
- **Addy Osmani Agent Skills (`spec-driven-development`, `test-driven-development`, `code-review-and-quality`, `performance-optimization`, `debugging-and-error-recovery`, etc.)**: 25 modular production-grade engineering workflows with anti-rationalization tables.
- **Three.js & WebGL (`threejs-*`)**: Core scene setup, geometries, PBR materials, cameras, lighting, animation loops, shaders, loaders, WebGPU, and React Three Fiber.
- **GSAP & Motion Design (`gsap-*`)**: Timelines, ScrollTrigger, UI micro-interactions, layout morphing with Flip, React context cleanup, and 60fps performance optimization.
- **Project Domain Skills**: `frontend-development`, `database-security`, `systematic-debugging`, `testing`.
