"""Download CSVs from MIMIT carburanti dataset page and save them to data/ with timestamped filenames.

Usage:
    python scripts/download_mimit_csvs.py

Options:
    --url URL            MIMIT dataset page URL (default: the official page)
    --outdir DIR         Output directory (default: data)
    --timestamp FORMAT   Timestamp format (default: %%Y%%m%%d_%%H%%M%%S)
    --timeout SECONDS    HTTP timeout in seconds (default: 30)
    -v / --verbose       Enable debug logging

Behavior:
- Download CSV files and save them as <original-name>_<timestamp>.csv
- Create the output directory if missing

Note: ZIP archives are not handled — MIMIT provides pure CSV files at the official URLs.
"""

from __future__ import annotations

import argparse
import logging
import re
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse

import httpx

DEFAULT_LINKS: list[str] = [
    "https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv",
    "https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv",
]

logger = logging.getLogger("download_mimit_csvs")

# Note: HTML scraping and link discovery removed to keep the script focused and
# deterministic. Use `--url` to provide extra files to download if needed.


def sanitize_filename(name: str) -> str:
    """Return a filesystem-safe version of ``name`` by replacing unsafe chars with underscores."""
    # Keep safe characters for filenames
    return re.sub(r"[^A-Za-z0-9._-]", "_", name)


def timestamp_str(fmt: str = "%Y%m%d_%H%M%S") -> str:
    """Return current UTC timestamp formatted using ``fmt``."""
    return datetime.now(tz=UTC).strftime(fmt)


def save_bytes_to_file(b: bytes, path: Path) -> None:
    """Write bytes to ``path`` creating parent directories as needed."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b)
    logger.info("Saved: %s", path)


def download_and_save_csv(client: httpx.Client, url: str, outdir: Path, ts: str, timeout: float) -> Path:
    """Stream-download a CSV at ``url`` and save it into ``outdir`` with timestamp ``ts``.

    Writes to a temporary ``.part`` file and atomically renames it after completion.
    The ``timeout`` is passed to ``client.stream`` and controls read/connect timeouts.
    Returns the saved ``Path``.
    """
    parsed = urlparse(url)
    name = Path(parsed.path).name or "download.csv"
    name = sanitize_filename(name)
    outname = f"{Path(name).stem}_{ts}{Path(name).suffix}"
    outpath = outdir / outname
    temp_path = outpath.with_suffix(outpath.suffix + ".part")

    with client.stream("GET", url, timeout=timeout) as resp:
        resp.raise_for_status()
        temp_path.parent.mkdir(parents=True, exist_ok=True)
        with temp_path.open("wb") as fh:
            for chunk in resp.iter_bytes():
                if chunk:
                    fh.write(chunk)

    temp_path.replace(outpath)
    logger.info("Saved: %s", outpath)
    return outpath


# ZIP archive handling removed because MIMIT provides pure CSV files. If you need
# ZIP support in the future we can reintroduce a small extractor function here.


@dataclass
class DownloadOptions:
    """Options controlling download behavior.

    Attributes:
        timeout: per-request timeout in seconds
        retries: number of retry attempts for transient errors
        backoff: base backoff seconds used for exponential backoff
        ts_fmt: timestamp format for saved filenames
    """

    timeout: float = 30.0
    retries: int = 3
    backoff: float = 1.0
    ts_fmt: str = "%Y%m%d_%H%M%S"


def run(
    urls: list[str] | None = None,
    outdir: str = "data",
    opts: DownloadOptions | None = None,
) -> list[Path]:
    """Download each URL in ``urls`` (or the default list) and save CSVs into ``outdir``.

    ``opts`` controls timeout, retry/backoff and timestamp formatting.
    Returns a list of saved file paths.
    """
    opts = opts or DownloadOptions()
    urls_to_fetch = urls or DEFAULT_LINKS
    outdir_p = Path(outdir)
    outdir_p.mkdir(parents=True, exist_ok=True)

    saved: list[Path] = []
    ts = timestamp_str(opts.ts_fmt)
    with httpx.Client(follow_redirects=True) as client:
        for url in urls_to_fetch:
            logger.info("Downloading %s", url)
            for attempt in range(1, opts.retries + 1):
                try:
                    saved.append(download_and_save_csv(client, url, outdir_p, ts, opts.timeout))
                    break
                except httpx.ReadTimeout:
                    logger.warning(
                        "Read timeout while downloading %s (attempt %d/%d)",
                        url,
                        attempt,
                        opts.retries,
                    )
                except httpx.HTTPError:
                    logger.warning(
                        "HTTP error while downloading %s (attempt %d/%d)",
                        url,
                        attempt,
                        opts.retries,
                    )
                except Exception:
                    logger.exception(
                        "Unexpected error while processing %s (attempt %d/%d)",
                        url,
                        attempt,
                        opts.retries,
                    )

                if attempt < opts.retries:
                    sleep_for = opts.backoff * (2 ** (attempt - 1))
                    logger.info("Retrying %s after %.1fs", url, sleep_for)
                    time.sleep(sleep_for)
                else:
                    logger.error("Failed to download %s after %d attempts", url, opts.retries)
    return saved


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint: parse arguments and run the downloader.

    Returns 0 on success, 1 on failure.
    """
    parser = argparse.ArgumentParser(description="Download CSVs from the MIMIT carburanti dataset page.")
    parser.add_argument(
        "-u",
        "--url",
        action="append",
        help=("One or more URLs to download (can be repeated). If omitted the official CSVs are used."),
    )
    parser.add_argument("--outdir", default="data", help="Output directory for downloaded CSVs")
    parser.add_argument("--timeout", type=float, default=30.0, help="Per-request timeout seconds")
    parser.add_argument("--retries", type=int, default=3, help="Number of retries for transient errors")
    parser.add_argument("--backoff", type=float, default=1.0, help="Base backoff seconds for retries")
    parser.add_argument("--timestamp", default="%Y%m%d_%H%M%S", help="Timestamp format for filenames")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable debug logging")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s: %(message)s")

    try:
        opts = DownloadOptions(
            timeout=args.timeout,
            retries=args.retries,
            backoff=args.backoff,
            ts_fmt=args.timestamp,
        )
        saved = run(args.url, args.outdir, opts)
    except Exception:  # pragma: no cover - top level
        logger.exception("Error during download")
        return 1
    else:
        if saved:
            logger.info("Downloaded and saved %d file(s).", len(saved))
            for p in saved:
                logger.info("Saved file: %s", p)
        else:
            logger.info("No files were saved.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
