---
name: python-design-principles
description: Analyze Python code for adherence to project design principles (single-responsibility, modularity, testability, portability, defensibility, simplicity). Use when reviewing Python code, preparing PR reviews, or asking for a design-principles compliance report.
allowed-tools: [Read, Grep, Glob]
---

# Python Design Principles Analyzer

Purpose: Scan a Python codebase against project design principles and produce a concise JSON report plus actionable recommendations.

## Quick summary

- Runs an automated analysis script to detect common design and style issues.
- Produces a JSON-compatible report with per-file findings and a short natural-language summary.
- Intended for review workflows and creating prioritized fix lists; it does not auto-modify source files unless explicitly authorized.

## Requirements

- Python 3.13+
- ruff / ty globally installed
- pytest available in the environment for optional validation steps
- Script assumes repository root context (adjust --path if needed)

## Behavior & Scope

1. Use `Glob` to find relevant Python files (usually under `src/`, `tests/`, and `docs/`).
2. Use `Read` to fetch file contents when needed for detail.
3. Use `RipGrep (rg)` for fast, repository-wide pattern searches to build file lists and surface likely issues quickly.
4. Use `Pyright` (LSP) for precise, incremental type analysis; prefer editor LSP integration for developers and `pyright` CLI in CI.

- Produce a JSON report including:
  - summary: high-level compliance score
  - files: list of file results with issues and recommended fixes
  - recommendations: prioritized action list

## Code Style & Patterns

1. **Python Version:** **Use Python 3.13+ features** and libraries for optimal quality and efficiency.
2. **Coding Standards:** **Apply PEP 8, PEP 257, and PEP 484** rigorously. Adhere to established coding standards relevant to the language or framework. Enforce these standards when reviewing or generating code.
3. **Type Hinting:**
    - **Implement type hints for all variables and function signatures.**
    - **Use built-in types** (e.g., `list`, `dict`, `tuple`, `|`) instead of deprecated `typing` module equivalents (e.g., `List`, `Dict`, `Tuple`, `Optional`).
4. **Docstrings:**
    - **Use Google's standard docstring format.**
    - Place the summary line immediately after the opening quotes.
    - Use `Parameters:` and `Returns:`, describing items with a leading hyphen (`-`).
    - *Example:*

      ```python
      def function_name(param1: int | float, param2: dict[str] | None) -> list:
          """Summary line: Concise description of the function's purpose.

          Parameters:
          - param1: Description of the first parameter.
          - param2: Description of the second parameter. Accepts None.

          Returns:
          - Description of the return value.
          """
      ```

5. **Adherence to Existing Code:** Before writing new code, analyze the surrounding files to understand and adopt existing design patterns, naming conventions, and architectural choices. New code should blend in seamlessly with the existing codebase.
6. **Clean Code:** When writing meaningful code (e.g. NOT snippet or partial code), follow these guidelines:
    - Apply clean code best practices: meaningful names, proper error handling, maintainability, readability.
    - Favor simplicity and maintainability; **avoid overly complex or deeply nested structures.**
    - Keep configuration in separate files (e.g., `.env`, `config.yaml`). **Avoid Hard-Coded values.**
    - Guide error handling practices, ensuring errors are caught, logged, and handled gracefully.
    - Use Loguru for logging; no print() calls.
7. **Code Quality and Performance:**
    - **Avoid code duplication.** Check if similar functionality exists elsewhere. Follow the DRY Principle.
    - Improve code quality by optimizing critical code paths for speed and resource consumption.
    - Use comprehensions, generators where appropriate.
    - Use context managers for resource management, like `with Path(file_path).open(...)` for file management.
    - Prefer composition, dependency injection for easier testing.
    - Use repository pattern for data access and manipulation.

### Key checks to include

- Missing or incomplete type hints on public functions and methods.
- Absent or non-Google docstrings for public API.
- Use of `print()` instead of `logger` (Loguru).
- Mutable default arguments and other anti-patterns.
- Large lists/dicts in Pydantic models without `SkipValidation`.
- Hard-coded secrets or config in source (skip `.env` and secrets files).

## How to Interpret Results

- The report includes prioritized items (high/medium/low).
- Each finding includes a suggested remediation and references to relevant project standards.
- The skill will not apply fixes automatically. Request explicit permission for any automated edits.

## Validation & Follow-up

Recommended quick checks after running:

- Run `ruff check .` to see style violations.
- Run `ruff check . --fix` only after review.
- Run `ty check .` for type checking.
- Run `uv run pytest` for failing tests (if available).

## Contributing / Extending

- Keep rule implementations modular and test-covered.
- Document any new checks in this file.

## Notes

- Keep configuration and secrets out of analysis (do not scan `.env`, config/secrets.*).
- If deeper automated refactors are requested, ask for permission and provide a plan first.
