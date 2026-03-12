#!/usr/bin/env python3
"""Claude Code — PreToolUse hook: Bash Command Guard.

Reads rules from ../.claude/hooks.toml (relative to this script).
"""

from __future__ import annotations

import json
import re
import sys
import tomllib
from pathlib import Path
from typing import Any

from loguru import logger

logger.remove()  # disable default stderr logger
logger.add(sys.stderr, level="DEBUG", format="<level>{message}</level>")

CONFIG_PATH = Path(__file__).parent / "hooks.toml"
Rule = dict[str, Any]


def load_rules() -> list[Rule]:
    """Load the list of bash guard rules from the project's hooks.toml file.

    The TOML file lives alongside this script in the `.claude/hooks` directory.
    If the file cannot be parsed we let the caller handle the exception so that
    the hook fails open and does not block Claude.

    Returns:
    - A list of dictionaries representing the rules. The caller should treat the
      contents as untrusted and access keys safely.
    """
    with CONFIG_PATH.open("rb") as fp:
        config = tomllib.load(fp)

    return config.get("bash_rules", [])


def normalize(cmd: str) -> str:
    """Prepare a bash command string for regex checking.

    This helper removes escaped newline continuations and squashes multiple
    whitespace characters into a single space. The resulting string is
    stripped of leading/trailing space for consistent matching.

    Parameters:
    - cmd: The raw command text provided by the Bash tool.

    Returns:
    - A normalized single-line command string.
    """
    # collapse line continuations such as "\\\n"
    cmd = re.sub(r"\\\s*\n\s*", " ", cmd)
    # compress any remaining whitespace runs
    cmd = re.sub(r"\s+", " ", cmd)
    return cmd.strip()


def main() -> None:
    """Entry point for the pre-tool-use hook.

    The hook reads a JSON object from stdin describing the command that Claude
    intends to run. If the command is a Bash invocation it is compared against
    the guard rules loaded from configuration. When a rule matches we emit its
    message on stdout and exit with code 2 (per the existing protocol). Any
    unexpected condition results in a normal exit (0) so that the hook does not
    inadvertently block Claude.
    """
    raw_input = sys.stdin.read().strip()
    if not raw_input:
        # nothing to process
        sys.exit(0)

    try:
        payload = json.loads(raw_input)
    except json.JSONDecodeError:
        logger.debug("stdin did not contain valid JSON, ignoring")
        sys.exit(0)

    if payload.get("tool_name") != "Bash":
        logger.debug("tool_name is not Bash; skipping hook")
        sys.exit(0)

    cmd_raw = payload.get("tool_input", {}).get("command", "") or ""
    if not cmd_raw:
        logger.debug("no command field present in payload")
        sys.exit(0)

    cmd_norm = normalize(cmd_raw)

    try:
        rules = load_rules()
    except Exception as exc:  # pylint: disable=broad-except
        # failing to load the config should not abort Claude's operation
        logger.warning("could not load rules: %s", exc)
        sys.exit(0)

    for rule in rules:
        use_raw = bool(rule.get("use_raw", False))
        target = cmd_raw if use_raw else cmd_norm

        pattern = rule.get("pattern")
        if not pattern or not re.search(pattern, target):
            continue

        exclude = rule.get("exclude_pattern")
        if exclude and re.search(exclude, target):
            continue

        message = rule.get("message", "").strip()
        logger.info("blocking Bash command; matched rule: %s", pattern)
        # emit the block message per hook protocol
        # ruff: noqa: T201
        print(message)
        sys.exit(2)

    sys.exit(0)


if __name__ == "__main__":
    main()
