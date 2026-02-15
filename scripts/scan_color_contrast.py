"""Scan codebase for color values and check WCAG contrast compliance.

Searches through source files to find hex color values and reports their
contrast ratios against light and dark backgrounds for accessibility evaluation.
"""

import re
from pathlib import Path

from loguru import logger

from src.utils.color_contrast import WCAG_AA_MINIMUM, contrast_ratio


def scan_files_for_colors(
    directories: list[str],
    extensions: tuple[str, ...],
) -> dict[str, set[str]]:
    """Scan files in directories for hex color values.

    Parameters:
    - directories: List of directory paths to scan recursively.
    - extensions: File extensions to include in scan.

    Returns:
    - Dictionary mapping hex colors to sets of file paths where found.
    """
    color_pattern = re.compile(r"#([0-9a-fA-F]{6})")
    seen: dict[str, set[str]] = {}

    for directory in directories:
        base_path = Path(directory)
        if not base_path.exists():
            continue

        for file_path in base_path.rglob("*"):
            if not file_path.is_file():
                continue
            if not file_path.name.endswith(extensions):
                continue

            try:
                content = file_path.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue

            for match in color_pattern.finditer(content):
                hex_val = "#" + match.group(1).upper()
                seen.setdefault(hex_val, set()).add(str(file_path))

    return seen


def main() -> None:
    """Scan codebase for colors and display contrast ratio report.

    Reports all found hex colors with their contrast ratios against
    light (#ffffff) and dark (#1e1e1e) backgrounds, flagging values
    below WCAG AA minimum of 4.5:1.
    """
    directories = ["src", "static"]
    extensions = (".css", ".html", ".js", ".ts", ".md")

    seen = scan_files_for_colors(directories, extensions)

    logger.info("Found colors:")
    logger.info("Color | contrast vs white | contrast vs dark | files (sample)")
    logger.info("------|------------------:|---------------:|-------")

    bg_light = "#ffffff"
    bg_dark = "#1e1e1e"

    for hex_val, file_set in sorted(seen.items()):
        c_light = contrast_ratio(hex_val, bg_light)
        c_dark = contrast_ratio(hex_val, bg_dark)

        flags: list[str] = []
        if c_light < WCAG_AA_MINIMUM:
            flags.append("low-light")
        if c_dark < WCAG_AA_MINIMUM:
            flags.append("low-dark")

        sample = ",".join(sorted(file_set)[:2])
        flag_str = " ".join(flags)
        logger.info("{} | {:.2f} | {:.2f} | {} {}", hex_val, c_light, c_dark, sample, flag_str)


if __name__ == "__main__":
    main()
