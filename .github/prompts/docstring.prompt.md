# Task

## Objective

- Update any docstrings that need improvement so they follow the project’s Python docstring standards in `docs/agents/py.instructions.md`.

## Deliverables

- For each changed function/method:
  - Replace or rewrite the docstring using Google-style format.
  - Ensure the summary line appears first, then `Parameters:` and `Returns:` sections with hyphen-prefixed items.
  - Keep descriptions concise and actionable.
  - Add or confirm type hints on the function signature (use built-in types, e.g., `list`, `dict`, `|`).
- Limit behavioral changes to signatures/docstrings only; do not alter business logic.

## Acceptance criteria

- Docstrings for public functions/methods follow the Google-style format specified in py.instructions.md.
- Public function signatures include complete type hints.
- No prints—use logger where applicable (follow project conventions).
- Changes are small, reviewable, and include examples or notes only when necessary.

## Notes

- Follow PEP 8/257/484 conventions and the rules in py.instructions.md.
- If a docstring is already compliant, leave it unchanged.
