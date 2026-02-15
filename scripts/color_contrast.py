"""WCAG color contrast checker utility.

Provides functions to calculate contrast ratios between colors for accessibility
compliance testing according to WCAG guidelines.
"""

from loguru import logger

from src.utils.color_contrast import WCAG_AA_MINIMUM, contrast_ratio


def main() -> None:
    """Run contrast ratio checks for candidate colors.

    Displays contrast ratios against light and dark backgrounds for
    WCAG AA compliance evaluation (minimum 4.5:1 required).
    """
    candidates = ["#39E079", "#0b6f3b", "#006e3b", "#1565c0", "#005a3e", "#0a6b3c"]
    bg_light = "#ffffff"
    bg_dark = "#1e1e1e"

    logger.info("Contrast vs white (>={} required):", WCAG_AA_MINIMUM)
    for color in candidates:
        ratio = contrast_ratio(color, bg_light)
        logger.info("{} {}", color, round(ratio, 3))

    logger.info("\nContrast vs dark (>={} required):", WCAG_AA_MINIMUM)
    for color in candidates:
        ratio = contrast_ratio(color, bg_dark)
        logger.info("{} {}", color, round(ratio, 3))


if __name__ == "__main__":
    main()
