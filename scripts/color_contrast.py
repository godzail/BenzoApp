"""WCAG color contrast checker utility.

Provides functions to calculate contrast ratios between colors for accessibility
compliance testing according to WCAG guidelines.
"""

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


def main() -> None:
    """Run contrast ratio checks for candidate colors.

    Displays contrast ratios against light and dark backgrounds for
    WCAG AA compliance evaluation (minimum 4.5:1 required).
    """
    candidates = ["#39E079", "#0b6f3b", "#006e3b", "#1565c0", "#005a3e", "#0a6b3c"]
    bg_light = "#ffffff"
    bg_dark = "#1e1e1e"

    print(f"Contrast vs white (>={WCAG_AA_MINIMUM} required):")  # noqa: T201
    for color in candidates:
        ratio = contrast_ratio(color, bg_light)
        print(f"{color} {round(ratio, 3)}")  # noqa: T201

    print(f"\nContrast vs dark (>={WCAG_AA_MINIMUM} required):")  # noqa: T201
    for color in candidates:
        ratio = contrast_ratio(color, bg_dark)
        print(f"{color} {round(ratio, 3)}")  # noqa: T201


if __name__ == "__main__":
    main()
