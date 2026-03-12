"""Shared CSV utilities."""


def strip_bom(text: str) -> str:
    """Strip UTF-8 BOM from CSV text (handles both decoded and mis-decoded forms)."""
    if text.startswith("\ufeff"):
        text = text[1:]
    elif text.startswith("ï»¿"):
        text = text[3:]
    return text
