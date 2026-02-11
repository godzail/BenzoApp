"""Scan codebase for color values and check WCAG contrast compliance.

Searches through source files to find hex color values and reports their
contrast ratios against light and dark backgrounds for accessibility evaluation.
"""

import re
from pathlib import Path

# WCAG luminance calculation constants
SRGB_THRESHOLD = 0.03928
SRGB_DIVISOR = 12.92
SRGB_OFFSET = 0.055
SRGB_EXPONENT = 2.4

# WCAG AA minimum contrast ratio
WCAG_AA_MINIMUM = 4.5


def hex_to_rgb(hex_color: str) -> tuple[float, float, float]:
    """Convert a hexadecimal color code to normalized RGB values.

    Parameters:
    - hex_color: Hexadecimal color string (with or without leading #).

    Returns:
    - Tuple of normalized RGB values (0.0 to 1.0).
    """
    hex_clean = hex_color.lstrip("#")
    r = int(hex_clean[0:2], 16) / 255.0
    g = int(hex_clean[2:4], 16) / 255.0
    b = int(hex_clean[4:6], 16) / 255.0
    return (r, g, b)


def linearize(channel: float) -> float:
    """Convert sRGB channel value to linear RGB.

    Parameters:
    - channel: sRGB channel value (0.0 to 1.0).

    Returns:
    - Linear RGB channel value.
    """
    if channel <= SRGB_THRESHOLD:
        return channel / SRGB_DIVISOR
    return ((channel + SRGB_OFFSET) / (1 + SRGB_OFFSET)) ** SRGB_EXPONENT


def luminance(rgb: tuple[float, float, float]) -> float:
    """Calculate relative luminance from RGB values.

    Parameters:
    - rgb: Tuple of normalized RGB values (0.0 to 1.0).

    Returns:
    - Relative luminance value according to WCAG 2.1 specification.
    """
    r, g, b = rgb
    return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)


def contrast_ratio(hex1: str, hex2: str) -> float:
    """Calculate WCAG contrast ratio between two colors.

    Parameters:
    - hex1: First hexadecimal color string.
    - hex2: Second hexadecimal color string.

    Returns:
    - Contrast ratio (1:1 to 21:1 range).
    """
    l1 = luminance(hex_to_rgb(hex1))
    l2 = luminance(hex_to_rgb(hex2))
    l_max = max(l1, l2)
    l_min = min(l1, l2)
    return (l_max + 0.05) / (l_min + 0.05)


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

    print("Found colors:")  # noqa: T201
    print("Color | contrast vs white | contrast vs dark | files (sample)")  # noqa: T201
    print("------|------------------:|---------------:|-------")  # noqa: T201

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
        print(f"{hex_val} | {c_light:.2f} | {c_dark:.2f} | {sample} {flag_str}")  # noqa: T201


if __name__ == "__main__":
    main()
