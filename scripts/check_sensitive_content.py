"""Block commits that stage secrets, personal data, or local-only control files."""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from loguru import logger

REPO_ROOT = Path(__file__).resolve().parent.parent
SENSITIVE_PATH_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(r"(^|/)(AGENTS\.md|CLAUDE\.md)$"),
        "Assistant instruction files must stay local-only.",
    ),
    (
        re.compile(
            r"(^|/)(\.agent/|\.agents/|\.claude/|\.codex/|\.github/(agents|chatmodes|instructions|prompts)/|docs/agents/)",
        ),
        "Assistant-control directories must stay local-only.",
    ),
    (
        re.compile(r"(^|/)\.env($|\.)|(^|/)config/secrets\.|(^|/)(id_rsa|id_dsa|\.npmrc|\.pypirc|\.netrc)$"),
        "Sensitive config or credential files must never be committed.",
    ),
    (
        re.compile(r"(^|/).+\.(pem|key|p12|pfx)$", re.IGNORECASE),
        "Key and certificate files must never be committed.",
    ),
)
SENSITIVE_LINE_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
        "Private key material detected.",
    ),
    (
        re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
        "GitHub token detected.",
    ),
    (
        re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
        "AWS access key detected.",
    ),
    (
        re.compile(r"\bsk-[A-Za-z0-9]{20,}\b"),
        "API key-style secret detected.",
    ),
    (
        re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b"),
        "JWT-style token detected.",
    ),
    (
        re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._\-+/=]{16,}"),
        "Bearer token detected.",
    ),
    (
        re.compile(
            r"(?i)\b(password|passwd|pwd|secret|token|api[_-]?key)\b\s*[:=]\s*['\"]?[A-Za-z0-9._\-+/=]{8,}",
        ),
        "Credential assignment detected.",
    ),
    (
        re.compile(r"(?i)\b[A-Z]:\\Users\\[^\\/\s]+\\"),
        "Windows user profile path detected.",
    ),
    (
        re.compile(r"(?i)\b/Users/[^/\s]+/"),
        "macOS user profile path detected.",
    ),
    (
        re.compile(r"(?i)\b[a-z0-9._%+-]+@(gmail|outlook|hotmail|live|icloud|yahoo)\.[a-z]{2,}\b"),
        "Personal email address detected.",
    ),
)


@dataclass(slots=True)
class Finding:
    """Represent one blocked sensitive-content match."""

    path: str
    reason: str
    line_number: int | None = None
    excerpt: str | None = None


def run_git_command(args: list[str]) -> subprocess.CompletedProcess[str]:
    """Run a git command from the repository root and return the completed process.

    Parameters:
    - args: Git CLI arguments excluding the leading `git`.

    Returns:
    - Completed git subprocess with captured text output.

    Raises:
    - subprocess.CalledProcessError: When git exits with a non-zero status.
    """
    git_executable = shutil.which("git")
    if git_executable is None:
        msg = "git executable not found in PATH"
        raise FileNotFoundError(msg)

    return subprocess.run(  # noqa: S603
        [git_executable, *args],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=True,
    )


def normalize_git_path(path: str) -> str:
    """Normalize a git path to forward-slash form for matching.

    Parameters:
    - path: Raw path string returned by git.

    Returns:
    - Path normalized with forward slashes and no leading `./`.
    """
    return path.replace("\\", "/").lstrip("./")


def list_staged_paths() -> list[str]:
    """Return staged file paths that are being added, copied, modified, or renamed.

    Returns:
    - List of normalized git paths currently staged for commit.

    Raises:
    - subprocess.CalledProcessError: When the staged file list cannot be retrieved.
    """
    result = run_git_command(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])
    return [normalize_git_path(line) for line in result.stdout.splitlines() if line.strip()]


def get_staged_patch(path: str) -> str:
    """Fetch the staged patch for one path with zero lines of context.

    Parameters:
    - path: Normalized git path to inspect.

    Returns:
    - Unified diff text for the staged version of the file.

    Raises:
    - subprocess.CalledProcessError: When git cannot render the staged patch.
    """
    result = run_git_command(["diff", "--cached", "--unified=0", "--no-color", "--", path])
    return result.stdout


def extract_added_lines(patch: str) -> list[tuple[int, str]]:
    """Extract added lines and their target line numbers from a unified diff.

    Parameters:
    - patch: Unified diff text.

    Returns:
    - Ordered `(line_number, line_text)` tuples for staged added lines.
    """
    added_lines: list[tuple[int, str]] = []
    new_line_number = 0

    for line in patch.splitlines():
        if line.startswith("@@"):
            match = re.search(r"\+(\d+)(?:,(\d+))?", line)
            if match is None:
                continue
            new_line_number = int(match.group(1))
            continue
        if line.startswith("+++"):
            continue
        if line.startswith("+"):
            added_lines.append((new_line_number, line[1:]))
            new_line_number += 1
            continue
        if line.startswith("-"):
            continue
        if line.startswith(("diff --git", "index ")):
            continue
        new_line_number += 1

    return added_lines


def scan_path(path: str) -> list[Finding]:
    """Scan a staged file path against blocked path rules.

    Parameters:
    - path: Normalized git path to scan.

    Returns:
    - Findings triggered by the path itself.
    """
    findings: list[Finding] = []

    for pattern, reason in SENSITIVE_PATH_RULES:
        if pattern.search(path):
            findings.append(Finding(path=path, reason=reason))

    return findings


def scan_added_lines(path: str, added_lines: list[tuple[int, str]]) -> list[Finding]:
    """Scan added lines for secrets, personal data, and machine-specific details.

    Parameters:
    - path: Normalized git path containing the added lines.
    - added_lines: Added `(line_number, line_text)` tuples from the staged diff.

    Returns:
    - Findings triggered by added content.
    """
    findings: list[Finding] = []

    for line_number, line_text in added_lines:
        for pattern, reason in SENSITIVE_LINE_RULES:
            if pattern.search(line_text):
                findings.append(
                    Finding(
                        path=path,
                        reason=reason,
                        line_number=line_number,
                        excerpt=line_text.strip()[:160],
                    ),
                )

    return findings


def collect_findings(paths: list[str]) -> list[Finding]:
    """Collect all path-based and content-based findings for the given staged paths.

    Parameters:
    - paths: Staged git paths to scan.

    Returns:
    - Flat list of all findings across the provided paths.
    """
    findings: list[Finding] = []

    # ponytail: skip self and its tests — their regex literals / fixtures are not real secrets
    _skip = {"scripts/check_sensitive_content.py", "tests/test_sensitive_scan.py"}
    for path in paths:
        if path.replace("\\", "/") in _skip:
            continue
        findings.extend(scan_path(path))
        patch = get_staged_patch(path)
        findings.extend(scan_added_lines(path, extract_added_lines(patch)))

    return findings


def format_finding(finding: Finding) -> str:
    """Format one finding for terminal output.

    Parameters:
    - finding: Finding to render.

    Returns:
    - Human-readable single-line message.
    """
    location = finding.path if finding.line_number is None else f"{finding.path}:{finding.line_number}"
    excerpt = "" if not finding.excerpt else f" | {finding.excerpt}"
    return f"{location} | {finding.reason}{excerpt}"


def parse_args(argv: list[str]) -> argparse.Namespace:
    """Parse CLI arguments for the sensitive content scanner.

    Parameters:
    - argv: Raw CLI argument vector excluding the executable name.

    Returns:
    - Parsed argparse namespace.
    """
    parser = argparse.ArgumentParser(
        description="Scan staged git changes for secrets, personal data, and local-only assistant files.",
    )
    parser.add_argument(
        "--staged",
        action="store_true",
        help="Scan staged files in the current repository.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Run the staged-content scanner and return a process exit code.

    Parameters:
    - argv: Optional CLI arguments. Defaults to `sys.argv[1:]`.

    Returns:
    - `0` when no findings are detected, otherwise `1`.

    Raises:
    - subprocess.CalledProcessError: When required git commands fail unexpectedly.
    """
    parse_args(sys.argv[1:] if argv is None else argv)
    paths = list_staged_paths()
    if not paths:
        logger.info("No staged files to scan.")
        return 0

    findings = collect_findings(paths)
    if not findings:
        logger.info("Sensitive content scan passed.")
        return 0

    logger.error("Sensitive content scan failed. Remove or redact these findings before commit:")
    for finding in findings:
        logger.error("  {}", format_finding(finding))
    logger.error("Local assistant files should stay untracked; secrets and personal data should stay out of git.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
