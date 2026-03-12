---
name: python
# This skill is triggered for any request involving Python code in this workspace.
description: |
  Act as a senior Python engineer for the project codebase.  When working on
  `.py` files or Python-related prompts you must:
  - load and **strictly follow** the guidance contained in
     `docs/agents/py.instructions.md`
allowed-tools: [Read, Grep, Glob]
---

# Workflow

Refer to `docs/agents/py.instructions.md` and verify the code against the guidelines.
