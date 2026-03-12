#!/usr/bin/env python3
"""Reminders for file-related tool operations.

This module is invoked by the Claude pre-tool-use hook mechanism. It loads
rules from a TOML configuration file, then inspects the incoming tool
payload (via stdin) to determine whether a reminder message should be
printed. Rules are keyed by a regular expression on the target file path and
can fire only once per session if requested.

The code follows the project's Python conventions: modern syntax, explicit
type hints, and Loguru for logging.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import tempfile
import tomllib
from pathlib import Path

from loguru import logger

CONFIG_PATH: Path = Path(__file__).parent / "hooks.toml"

TOOL_TO_PATH_KEY: dict[str, str] = {
    "Write": "file_path",
    "Edit": "file_path",
    "MultiEdit": "file_path",
    "NotebookEdit": "notebook_path",
}

logger.remove()  # disable default stderr logger
logger.add(sys.stderr, level="DEBUG", format="<level>{message}</level>")


def load_rules() -> list[dict]:
    """Load and validate [[file_rules]] from the TOML configuration.

    Returns:
    - A list of rule dictionaries. If the key is absent, an empty list is
      returned.

    Raises:
    - RuntimeError: if the configuration cannot be parsed or rules are
      malformed.
    """
    try:
        with CONFIG_PATH.open("rb") as f:
            data = tomllib.load(f)
    except Exception as exc:  # IO, parse errors, etc.
        logger.warning(f"could not load {CONFIG_PATH}: {exc}")
        msg = "failed to read rules"
        raise RuntimeError(msg) from exc

    rules = data.get("file_rules", [])
    if not isinstance(rules, list):
        msg = "file_rules must be a list"
        logger.warning(msg)
        raise TypeError(msg)

    # simple validation of each rule
    validated: list[dict] = []
    for rule in rules:
        if not isinstance(rule, dict):
            logger.debug("skipping invalid rule (not a dict): %r", rule)
            continue
        if "id" not in rule or "file_pattern" not in rule or "tools" not in rule:
            logger.debug("skipping incomplete rule: %r", rule)
            continue
        validated.append(rule)

    return validated


def get_target_file(tool_name: str, tool_input: dict) -> str | None:
    """Extract and normalize the file path from the tool payload.

    The structure of ``tool_input`` varies depending on the tool; the
    ``TOOL_TO_PATH_KEY`` map defines which key to inspect.  The returned
    string is the normalized path (forward slashes) or ``None`` if the tool is
    unrecognized or the key is missing.

    Parameters:
    - tool_name: name of the invoked tool (e.g. "Edit").
    - tool_input: dictionary payload read from stdin.

    Returns:
    - Normalized file path or None.
    """
    key = TOOL_TO_PATH_KEY.get(tool_name)
    if not key or key not in tool_input:
        return None

    path = str(tool_input[key])
    # unify separators to allow regexes written with forward slash
    return path.replace("\\", "/")


def session_flag(rule_id: str) -> Path:
    """Compute a filesystem flag used to mark a rule as fired.

    Each project (current working directory) gets a unique hash so that
    different repositories do not share flags.  The flag is simply a file
    path under the system temporary directory; its existence indicates the
    message has already been shown this session.

    Parameters:
    - rule_id: unique identifier of the rule (from config)

    Returns:
    - Path object pointing to the flag file for this rule and project.
    """
    cwd_hash = hashlib.sha256(str(Path.cwd()).encode()).hexdigest()[:12]
    return Path(tempfile.gettempdir()) / f"claude_filerule_{rule_id}_{cwd_hash}"


def main() -> None:
    """Hook entrypoint invoked by the Claude tool system.

    Reads a JSON blob from stdin containing ``tool_name`` and ``tool_input``.
    If a matching rule is found the associated message is written to stdout
    and the process exits with status code ``2`` to signal the reminder.
    Otherwise the function returns and the interpreter exits normally.
    """
    raw = sys.stdin.read().strip()
    if not raw:
        return

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        logger.debug("invalid JSON payload, aborting")
        return

    tool_name: str = payload.get("tool_name", "")
    tool_input: dict = payload.get("tool_input", {})

    target = get_target_file(tool_name, tool_input)
    if not target:
        # unsupported tool or missing path
        return

    try:
        rules = load_rules()
    except Exception:
        # warning already logged in load_rules or by Python; bail gracefully
        return

    for rule in rules:
        if tool_name not in rule.get("tools", []):
            continue
        pattern = rule.get("file_pattern", "")
        if not pattern or not re.search(pattern, target):
            continue

        once = bool(rule.get("once_per_session", True))
        if once:
            flag = session_flag(rule["id"])
            if flag.exists():
                continue
            try:
                flag.touch()
            except Exception:  # pragma: no cover - unlikely
                logger.debug("failed to touch flag %s", flag)

        # write message and exit with special code
        message = str(rule.get("message", "")).strip()
        sys.stdout.write(message)
        sys.exit(2)

    # normal return;


if __name__ == "__main__":
    main()
