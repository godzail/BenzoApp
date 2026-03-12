# CLAUDE.md

> **First action every session**: read `@AGENTS.md` completely before doing anything else.

---

## How to Start Any Task

Use this template to frame every request clearly:

```
I want to [TASK] so that [SUCCESS CRITERIA].
First, read: @AGENTS.md
DO NOT start executing yet — ask me any clarifying questions needed.
```

**Why this works**: task + success criteria up front eliminates ambiguous execution.
Claude must know what "done" looks like before the first keystroke.

---

## Session Checklist

Before executing any task, confirm:

- [ ] `@AGENTS.md` has been read in full
- [ ] Language-specific rules loaded if applicable (`@docs/agents/py.instructions.md` for Python)
- [ ] Requirements are unambiguous — if not, ask before proceeding
- [ ] Success criteria are explicit (tests pass, lint clean, types valid)

---

## Quick Reference

| Need                  | Command                              |
|-----------------------|--------------------------------------|
| Run app               | `uv run _main.py`                    |
| Run tests             | `uv run pytest tests/`               |
| Lint                  | `ruff check .`                       |
| Auto-fix lint         | `ruff check . --fix`                 |
| Type check            | `ty check .`                         |
| Search codebase       | `rg <pattern>`                       |
| Search Python files   | `rg <pattern> -t py`                 |
| Search frontend files | `rg <pattern> -t js,ts,tsx`          |

---

## Rules (non-negotiable)

1. **Ask, don't assume** — one focused question beats one wrong implementation.
2. **Verify chain** — every delivery must pass: `pytest` → `ruff check` → `ty check`.
3. **Simplest solution wins** — complexity is a cost, not a feature.
4. **Never touch secrets** — see `@AGENTS.md` § Security.
5. **Confidence matters** — state it; flag unknowns explicitly.

---

## Modular Rules

For domain-specific conventions, load on demand:

- `@docs/agents/py.instructions.md` — Python standards
- `@docs/agents/` — other language/domain rules as they are added
