"""Tests for UI accessibility including color contrast and theme variables."""

import re
from pathlib import Path

from src.utils.color_contrast import contrast_ratio as _contrast_ratio_hex
from src.utils.color_contrast import hex_to_rgb as _hex_to_rgb
from src.utils.color_contrast import linearize
from src.utils.color_contrast import luminance as _luminance

BASE_CSS = "src/static/css/base.css"
CUSTOM_CSS = "src/static/css/custom.css"

HEX_RE = re.compile(r"#([0-9a-fA-F]{6})")
RGBA_RE = re.compile(r"rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)")


def hex_to_rgb(hex_str: str):
    """Convert a hex color string to an RGB tuple (0-255)."""
    normalized = _hex_to_rgb(hex_str)
    return tuple(int(c * 255) for c in normalized)


def srgb_to_linear(c: float) -> float:
    """Convert sRGB color component (0-255) to linear value."""
    return linearize(c / 255.0)


def luminance(rgb: tuple):
    """Calculate the relative luminance of an RGB color (0-255)."""
    normalized = tuple(c / 255.0 for c in rgb)
    return _luminance(normalized)


def contrast_ratio(rgb1: tuple, rgb2: tuple) -> float:
    """Calculate the contrast ratio between two RGB color tuples (0-255)."""
    hex1 = "#{:02x}{:02x}{:02x}".format(*rgb1)
    hex2 = "#{:02x}{:02x}{:02x}".format(*rgb2)
    return _contrast_ratio_hex(hex1, hex2)


def blend_rgba_over(bg_rgb: tuple, fg_rgba: tuple) -> tuple:
    """Blend a RGBA foreground over an RGB background."""
    fr, fg, fb, fa = fg_rgba
    br, bg, bb = bg_rgb
    r = round((1 - fa) * br + fa * fr)
    g = round((1 - fa) * bg + fa * fg)
    b = round((1 - fa) * bb + fa * fb)
    return (r, g, b)


def parse_css_variable(file_path: str, var_name: str) -> str:
    """Read a CSS variable value from a file."""
    with Path.open(Path(file_path), encoding="utf-8") as f:
        text = f.read()
    match = re.search(rf"--{re.escape(var_name)}:\s*([^;]+);", text)
    if not match:
        msg = f"Variable --{var_name} not found in {file_path}"
        raise RuntimeError(msg)
    return match.group(1).strip()


def parse_rgba_string(s: str) -> tuple:
    """Parse an RGBA color string into a tuple."""
    match = RGBA_RE.search(s)
    if not match:
        msg = f"No rgba() in string: {s}"
        raise RuntimeError(msg)
    r, g, b, a = match.groups()
    return (int(r), int(g), int(b), float(a))


def parse_hex_string(s: str) -> str:
    """Parse a hex color string."""
    match = HEX_RE.search(s)
    if not match:
        msg = f"No hex color in string: {s}"
        raise RuntimeError(msg)
    return "#" + match.group(1)


def test_base_css_variables_defined():
    """Test that base CSS defines required theme variables."""
    with Path.open(Path(BASE_CSS), encoding="utf-8") as f:
        css = f.read()

    required_vars = ["--bg-primary", "--bg-surface", "--text-primary", "--color-primary", "--color-primary-hover"]
    for var in required_vars:
        assert var in css, f"Required CSS variable {var} not found in base.css"


def test_custom_css_has_theme_overrides():
    """Test that custom.css has theme-related styles."""
    with Path.open(Path(CUSTOM_CSS), encoding="utf-8") as f:
        css = f.read()

    assert "[data-theme=" in css, "Theme selectors should be present in custom.css"
    assert "color-primary" in css, "Primary color should be referenced in custom.css"


MIN_CONTRAST_THRESHOLD = 2.0


def test_primary_color_contrast_possible():
    """Test that primary color has minimum contrast for visibility."""
    color_primary = parse_css_variable(CUSTOM_CSS, "color-primary")
    color_primary_hex = parse_hex_string(color_primary)
    primary_rgb = hex_to_rgb(color_primary_hex)

    white_rgb = (255, 255, 255)
    ratio = contrast_ratio(primary_rgb, white_rgb)

    assert ratio >= MIN_CONTRAST_THRESHOLD, (
        f"Primary color contrast against white is {ratio:.2f}, below {MIN_CONTRAST_THRESHOLD}"
    )
