---
description: Python Project instructions for AI coding assistant
applyTo: "**/*.py"
---
# Python Coding Assistant — Project Instructions

## Objective

Deliver expert analysis, improvement, and optimization of Python code, and solve
Python-related engineering challenges by generating **high-quality, production-ready**
code. Follow these guidelines by default; if a specific prompt requires deviation,
state the rationale explicitly.

Scope includes: new codebase creation, refactoring/debugging existing code,
answering technical questions, and generating documentation.

---

## Language & Standards

1. Python version: **3.13+** — use modern syntax and standard‑library features.
2. Style: **PEP 8** (formatting), **PEP 257** (docstrings), **PEP 484** (typing).
3. Type hints: mandatory on **all** functions, methods, and class attributes.
4. Typing imports: use **built-in generics** (`list`, `dict`, `tuple`, `X | Y`) — never `typing.List`, `typing.Dict`, or `typing.Union`.

---

## Docstring Convention (MANDATORY)

Every function, method, and class **must** include a Pseudo-Google docstring
conforming exactly to the structure below.

```python
def function_name(param1: int | float, param2: dict[str, int] | None) -> list[str]:
    """Concise single-sentence summary of the function's purpose.

    Parameters:
    - param1: Description of the first parameter.
    - param2: Description of the second parameter. Accepts None.

    Returns:
    - Description of the return value.

    Raises:
    - ValueError: When param1 is negative.
    """
```

**Rules:**

- Summary line immediately follows the opening `"""` — no blank line before it.
- Section headers (`Parameters`, `Returns`, `Raises`, `Notes`) are followed by a
  colon and use a two-space-indented bullet list.
- A single summary sentence is acceptable **only** for trivial private helpers
  that cannot raise exceptions and have no parameters worth documenting.
- Never use one-liner placeholders like `"""TODO"""` or `"""Does stuff."""`.

---

## Code Patterns & Best Practices

### 1 — Respect the Existing Codebase

Before writing new code, inspect surrounding files to understand:

- Design patterns and architectural choices in use.
- Naming conventions (variables, classes, modules).
- Existing utilities and abstractions to reuse.

New code must blend seamlessly into the codebase — **no alien idioms**.

### 2 — Clean Code

- Use **descriptive names** for variables, functions, and classes.
- Add **inline comments only for non-obvious logic**; self-documenting code is preferred.
- Keep functions **small and single-purpose** (SRP).
- **DRY**: before implementing functionality, verify it does not already exist.
- Avoid deeply nested structures; favor early returns and guard clauses.
- Store configuration in dedicated files (e.g., `config.yaml`). **No hard-coded values.**
- Use **Loguru** for all logging — `print()` is forbidden in production code.
- **Never log sensitive data** (credentials, PII, tokens).

### 3 — Performance & Quality

- Optimize critical paths for speed and memory usage.
- Prefer **comprehensions and generators** over explicit loops where idiomatic.
- Use **context managers** for all resource management:

```python
  with Path(file_path).open("r", encoding="utf-8") as fh:
      ...
```

- Apply the **repository pattern** for data access layers.
- Design for **testability**: favor composition and dependency injection over
  tight coupling and global state.
- Avoid mutable default arguments.
- Annotate large collections in Pydantic models with `SkipValidation` where
  runtime validation would be prohibitively expensive.

---

## Mandatory Pre-Submission Checklist

Before finalizing any code output, verify:

- [ ] All public functions and methods have complete type hints.
- [ ] All public API has a conforming Pseudo-Google docstring.
- [ ] No `print()` calls — only `logger.*` (Loguru).
- [ ] No hard‑coded secrets, tokens, or environment‑specific values in source.
- [ ] No mutable default arguments (e.g. `def f(x=[]):`).
- [ ] Large collections in Pydantic models use `SkipValidation`.
- [ ] Code passes `ruff --select D,E,F,I,UP` without errors.
- [ ] Run `ty check` and fix any type issues before submitting.

---

## Contributing & Extending

- Keep new rule implementations **modular** and covered by unit tests.
- Document any new checks or conventions in this file under the relevant section.

---

## Exclusions

- Do **not** scan or reference `.env`, `secrets.*`, or any credentials file; these are explicitly off‑limits.
- If a deep automated refactor is requested, **ask for explicit approval** and
  provide a written plan before proceeding.
