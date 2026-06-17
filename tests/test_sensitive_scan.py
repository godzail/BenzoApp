"""Tests for the staged sensitive content scanner."""

from scripts.check_sensitive_content import (
    extract_added_lines,
    format_finding,
    scan_added_lines,
    scan_path,
)

WINDOWS_PROFILE_LINE = 7


def test_extract_added_lines_tracks_target_line_numbers() -> None:
    """Verify added lines are extracted with their destination line numbers."""
    patch = """diff --git a/demo.txt b/demo.txt
index 1111111..2222222 100644
--- a/demo.txt
+++ b/demo.txt
@@ -0,0 +1,2 @@
+first line
+second line
"""

    assert extract_added_lines(patch) == [(1, "first line"), (2, "second line")]


def test_scan_path_blocks_local_assistant_files() -> None:
    """Verify assistant-control paths are blocked before commit."""
    findings = scan_path(".claude/settings.json")

    assert len(findings) == 1
    assert findings[0].reason == "Assistant-control directories must stay local-only."


def test_scan_added_lines_blocks_windows_profile_paths() -> None:
    """Verify machine-specific Windows profile paths are blocked."""
    findings = scan_added_lines("notes.md", [(WINDOWS_PROFILE_LINE, r"C:\Users\nisot\AppData\Local\Temp")])

    assert len(findings) == 1
    assert findings[0].line_number == WINDOWS_PROFILE_LINE
    assert findings[0].reason == "Windows user profile path detected."


def test_scan_added_lines_blocks_credential_assignments() -> None:
    """Verify obvious secret assignments are blocked."""
    findings = scan_added_lines("config.py", [(3, 'API_KEY = "supersecretvalue123"')])

    assert len(findings) == 1
    assert findings[0].reason == "Credential assignment detected."


def test_format_finding_includes_excerpt_for_line_matches() -> None:
    """Verify formatted findings include line number and excerpt when present."""
    findings = scan_added_lines("config.py", [(3, 'password = "supersecretvalue123"')])

    assert len(findings) == 1
    formatted = format_finding(findings[0])
    assert formatted.startswith("config.py:3 | Credential assignment detected.")
    assert "supersecretvalue123" in formatted
