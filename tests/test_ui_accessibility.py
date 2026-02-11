import re

BASE_CSS = "src/static/css/base.css"
COMPONENTS_CSS = "src/static/css/components.css"

HEX_RE = re.compile(r"#([0-9a-fA-F]{6})")
VAR_RE = re.compile(r"--([a-zA-Z0-9-]+):\s*([^;]+);")
RGBA_RE = re.compile(r"rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)")


def hex_to_rgb(hex_str: str):
    h = hex_str.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def srgb_to_linear(c: float) -> float:
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(rgb: tuple) -> float:
    r, g, b = rgb
    lr = srgb_to_linear(r)
    lg = srgb_to_linear(g)
    lb = srgb_to_linear(b)
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb


def contrast_ratio(rgb1: tuple, rgb2: tuple) -> float:
    l1 = luminance(rgb1)
    l2 = luminance(rgb2)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def blend_rgba_over(bg_rgb: tuple, fg_rgba: tuple) -> tuple:
    fr, fg, fb, fa = fg_rgba
    br, bg, bb = bg_rgb
    r = round((1 - fa) * br + fa * fr)
    g = round((1 - fa) * bg + fa * fg)
    b = round((1 - fa) * bb + fa * fb)
    return (r, g, b)


def parse_css_variable(file_path: str, var_name: str) -> str:
    with open(file_path, encoding="utf-8") as f:
        text = f.read()
    # Find --var: value; occurrences
    m = re.search(rf"--{re.escape(var_name)}:\s*([^;]+);", text)
    if not m:
        raise RuntimeError(f"Variable --{var_name} not found in {file_path}")
    return m.group(1).strip()


def parse_rgba_string(s: str):
    m = RGBA_RE.search(s)
    if not m:
        raise RuntimeError(f"No rgba() in string: {s}")
    r, g, b, a = m.groups()
    return (int(r), int(g), int(b), float(a))


def parse_hex_string(s: str):
    m = HEX_RE.search(s)
    if not m:
        raise RuntimeError(f"No hex color in string: {s}")
    return "#" + m.group(1)


def test_metano_fuel_badge_contrast_dark():
    # Read dark surface from base.css
    bg_surface = parse_css_variable(BASE_CSS, "bg-surface")
    bg_surface_hex = parse_hex_string(bg_surface)
    bg_rgb = hex_to_rgb(bg_surface_hex)

    # The components.css defines a dark override for the metano badge background and text
    with open(COMPONENTS_CSS, encoding="utf-8") as f:
        comp = f.read()

    # Find the dark-theme metano background rgba and text color
    m_bg = re.search(r"\[data-theme=\"dark\"\]\s*\.fuel-badge\.metano\s*\{([^}]+)\}", comp)
    assert m_bg, "No dark theme override for .fuel-badge.metano found"
    block = m_bg.group(1)
    m_rgba = RGBA_RE.search(block)
    assert m_rgba, "No rgba background in .fuel-badge.metano dark override"
    rgba = parse_rgba_string(m_rgba.group(0))

    # Text color should be white (#ffffff)
    m_color = re.search(r"color:\s*(#[0-9a-fA-F]{6})", block)
    assert m_color, "No color found in .fuel-badge.metano dark override"
    text_hex = m_color.group(1)
    text_rgb = hex_to_rgb(text_hex)

    # Blend background over surface and compute contrast
    comp_bg_rgb = blend_rgba_over(bg_rgb, rgba)
    ratio = contrast_ratio(text_rgb, comp_bg_rgb)

    assert ratio >= 4.5, f"Contrast ratio {ratio:.2f} for .fuel-badge.metano is below 4.5"


def test_best_price_badge_contrast_dark():
    # color-primary from base
    color_primary = parse_css_variable(BASE_CSS, "color-primary")
    color_primary_hex = parse_hex_string(color_primary)
    primary_rgb = hex_to_rgb(color_primary_hex)

    # Read the components.css override
    with open(COMPONENTS_CSS, encoding="utf-8") as f:
        comp = f.read()

    m = re.search(r"\[data-theme=\"dark\"\]\s*\.best-price-badge-inline\s*\{([^}]+)\}", comp)
    assert m, "No dark theme override for .best-price-badge-inline found"
    block = m.group(1)
    m_color = re.search(r"color:\s*(#[0-9a-fA-F]{6})", block)
    assert m_color, "No color found in .best-price-badge-inline dark override"
    text_rgb = hex_to_rgb(m_color.group(1))

    ratio = contrast_ratio(text_rgb, primary_rgb)
    assert ratio >= 4.5, f"Contrast ratio {ratio:.2f} for .best-price-badge-inline is below 4.5"


def test_price_fuel_metano_contrast_dark():
    # price-fuel.metano text should be white in dark theme
    with open(COMPONENTS_CSS, encoding="utf-8") as f:
        comp = f.read()

    m = re.search(r"\[data-theme=\"dark\"\]\s*\.price-fuel\.metano\s*\{([^}]+)\}", comp)
    assert m, "No dark theme override for .price-fuel.metano found"
    block = m.group(1)
    m_color = re.search(r"color:\s*(#[0-9a-fA-F]{6})", block)
    assert m_color and m_color.group(1).lower() == "#ffffff", "price-fuel.metano should be white in dark theme"

    # Contrast vs station surface
    bg_surface = parse_css_variable(BASE_CSS, "bg-surface")
    bg_surface_hex = parse_hex_string(bg_surface)
    bg_rgb = hex_to_rgb(bg_surface_hex)

    text_rgb = hex_to_rgb("#ffffff")
    ratio = contrast_ratio(text_rgb, bg_rgb)
    assert ratio >= 4.5, f"Contrast ratio {ratio:.2f} for .price-fuel.metano is below 4.5"
