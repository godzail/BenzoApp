# AGENTS.md — Project Contribution Standards

> **Mission**: Every contribution must meet or exceed the project's quality bar.
> Trust user input, but verify independently. Fill knowledge gaps through research before acting.

---

## Environment

| Concern    | Tool                                                     |
|------------|----------------------------------------------------------|
| OS         | Windows — PowerShell (`pwsh`)                            |
| Python     | `uv` (deps + execution), `ruff` (lint/fmt), `ty` (types) |
| Frontend   | `bun` (package mgr + scripts), `biome` (lint/fmt)        |
| Search     | `rg` (ripgrep)                                           |
| Virtualenv | `.venv/` — Python 3.13+ — always use `uv run`            |

---

## Commands

### Navigation

```powershell
rg <pattern>              # search codebase
rg <pattern> -t py        # Python files only
rg <pattern> -t js,ts,tsx # Frontend files only
```

### Python

NOTE: ruff and ty are global tools

```powershell
uv run _main.py           # run application
uv run pytest tests/      # run all tests
ruff check .              # lint
ruff check . --fix        # auto-fix lint
ty check .                # type check
```

---

## Project Structure

```workspace
src/          # Source code
docs/         # Documentation
tests/        # Tests
pyproject.toml
```

---

## Language-Specific Rules

- **Python** → read and follow `@docs/agents/py.instructions.md` before any Python work

---

## Problem-Solving Approach

Before writing a single line of code, apply this sequence:

1. **Clarify** — If requirements are ambiguous, ask targeted questions. Do not assume intent.
2. **Constrain** — Define explicit success criteria: *"Done means: tests pass, lint clean, types valid."*
3. **Simplify** — The simplest working solution is the correct solution.
4. **Compose** — Prefer pure functions, composition, and immutability over OOP hierarchies.
5. **Verify** — Mandatory before delivery: `pytest` → `ruff check` → `ty check`. No exceptions.
6. **Conform** — Follow existing codebase patterns. Identify conventions via `rg` before introducing new ones.

---

## Multi-Perspective Review

Before delivering any significant change, validate across three lenses:

| Lens             | Questions to answer                                                 |
|------------------|---------------------------------------------------------------------|
| System Architect | Does this align with the overall design? Is it scalable/extensible? |
| Senior Engineer  | Follows best practices? Efficient, reliable, testable?              |
| Code Reviewer    | Edge cases handled? Documentation clear? Standards met?             |

---

## Communication

- **Default**: concise, actionable responses (1–3 sentences).
- **Expand** detail only when complexity genuinely requires it.
- **Ask** before implementing when requirements are uncertain — one focused question at a time.
- **Flag** blockers and missing information immediately; do not silently assume.
- **Reference** files with line numbers: e.g. `src/foo.py:42`.
- **Format**: Markdown. No unnecessary preamble or postamble.
- **Confidence**: When making a significant recommendation, state confidence qualitatively
  (e.g., *"High confidence — based on established patterns in the codebase"*) and flag
  anything that requires external validation.

---

## Security

### Protected files — NEVER read, modify, or expose

- `*.env` files
- `*/config/secrets.*`
- Private keys or credentials
- Any file containing sensitive information

### Rules

- No hardcoded API keys, passwords, or tokens — use environment variables.
- Never log or commit sensitive information.
- Never expose secrets in responses, diffs, or logs.
