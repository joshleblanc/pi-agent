#!/usr/bin/env python3
"""read_pdf_vision.py — image-vision PDF read (pi-native).

Renders selected pages with pdf2image (poppler), stitches them vertically into
byte-bounded PNG chunks, and writes each chunk to a spill directory along with
a JSON manifest. The calling agent then calls the vision MCP tool
(`mcp__matrix__describe_images`, or the equivalent tool on the matrix MCP
server) once per chunk and aggregates the descriptions.

This is the only wrapped read script in minimax-pdf: vision needs page
rendering, byte-budget chunking, and shape that don't fit in a cookbook
recipe. Other read scenarios (text / tables / coordinates / raster /
decrypt / metadata) live as inline recipes in docs/read-guide.md.

Usage (run from the minimax-pdf skill root):
    python3 -m scripts.read_pdf_vision --input file.pdf [--pages 1-20]
                                       [--dpi 150] [--max-bytes 3000000]
                                       [--prompt "..."] [--out-dir DIR]
                                       [--json]

The script writes per-chunk PNGs to <out-dir>/chunks/ and a JSON manifest to
<out-dir>/manifest.json. On stdout it emits a marker line:

    __VISION_CHUNKS_READY__ <out-dir>/manifest.json

The calling agent should:
  1. parse the manifest
  2. for each chunk, call mcp__matrix__describe_images (or the loaded matrix
     MCP's vision tool) with the chunk's base64 PNG and the prompt
  3. aggregate the per-chunk descriptions back into the final markdown

Dependencies (all `pip3 install --user`):
  - pdf2image (also needs poppler for the pdftoppm backend)
  - Pillow

In the mavis era this script called the local mavis daemon's HTTP API to
invoke the matrix MCP. pi has no daemon — MCP tools are registered directly
in the agent's tool list. The script therefore splits responsibility:
deterministic chunking happens here, the actual MCP call happens in the agent.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from scripts._pdf_read_lib import (
    add_common_args,
    cache_dir,
    die,
    emit,
    format_pages,
    info,
    resolve_input_or_exit,
    resolve_pages_or_exit,
    to_ranges,
    warn,
)

try:
    from pdf2image import convert_from_path  # type: ignore
except ImportError:
    die("pdf2image not installed. Install: pip3 install --user pdf2image (and brew install poppler)")

try:
    from PIL import Image  # type: ignore
except ImportError:
    die("Pillow not installed. Install: pip3 install --user pillow")

DEFAULT_DPI = 150
FALLBACK_DPI = 100
DEFAULT_MAX_BYTES = 3_000_000
DEFAULT_PROMPT = (
    "请把这张图里的全部文字按阅读顺序输出，保留段落、列表、表格等结构。"
    "如有图表请简要描述。"
)
MANIFEST_FILENAME = "manifest.json"
CHUNKS_DIRNAME = "chunks"
STDOUT_MARKER = "__VISION_CHUNKS_READY__"


def _safe_tmp_root() -> Path:
    env_tmp = os.environ.get("TMPDIR", "")
    if env_tmp and not env_tmp.startswith("/tmp"):
        return Path(env_tmp)
    return cache_dir().parent  # ~/.cache/pi/


def _render(pdf: Path, pages: list[int], dpi: int, tmp_root: Path) -> list[tuple[int, Image.Image, int]]:
    rendered: list[tuple[int, Image.Image, int]] = []
    for lo, hi in to_ranges(pages):
        imgs = convert_from_path(
            str(pdf),
            dpi=dpi,
            first_page=lo,
            last_page=hi,
            fmt="png",
            output_folder=str(tmp_root),
            paths_only=False,
        )
        for i, img in enumerate(imgs):
            page_num = lo + i
            buf = io.BytesIO()
            img.save(buf, format="PNG", optimize=False)
            rendered.append((page_num, img, len(buf.getvalue())))
    return rendered


def _stitch(images: list[Image.Image]) -> tuple[Image.Image, bytes, int]:
    if len(images) == 1:
        only = images[0]
        buf = io.BytesIO()
        only.save(buf, format="PNG", optimize=True)
        data = buf.getvalue()
        return only, data, len(data)
    target_w = max(img.width for img in images)
    total_h = sum(img.height for img in images)
    stitched = Image.new("RGB", (target_w, total_h), color=(255, 255, 255))
    y = 0
    for img in images:
        stitched.paste(img.convert("RGB"), (0, y))
        y += img.height
    buf = io.BytesIO()
    stitched.save(buf, format="PNG", optimize=True)
    data = buf.getvalue()
    return stitched, data, len(data)


def _stitch_and_grow(
    rendered: list[tuple[int, Image.Image, int]],
    max_bytes: int,
) -> tuple[list[dict], list[int]]:
    chunks: list[dict] = []
    oversize_indices: list[int] = []
    i = 0
    n = len(rendered)
    while i < n:
        count = 1
        imgs = [rendered[i][1]]
        stitched_img, data, sz = _stitch(imgs)
        if sz > max_bytes:
            chunks.append(
                {
                    "pages": [rendered[i][0]],
                    "buffer": data,
                    "width": stitched_img.width,
                    "height": stitched_img.height,
                    "bytes": sz,
                }
            )
            oversize_indices.append(len(chunks) - 1)
            i += 1
            continue
        while i + count < n:
            trial_imgs = imgs + [rendered[i + count][1]]
            trial_img, trial_data, trial_sz = _stitch(trial_imgs)
            if trial_sz > max_bytes:
                break
            imgs = trial_imgs
            stitched_img = trial_img
            data = trial_data
            sz = trial_sz
            count += 1
        chunks.append(
            {
                "pages": [rendered[i + k][0] for k in range(count)],
                "buffer": data,
                "width": stitched_img.width,
                "height": stitched_img.height,
                "bytes": sz,
            }
        )
        i += count
    return chunks, oversize_indices


def _downscale_oversize(
    pdf: Path,
    rendered: list[tuple[int, Image.Image, int]],
    max_bytes: int,
    tmp_root: Path,
) -> list[tuple[int, Image.Image, int]]:
    out: list[tuple[int, Image.Image, int]] = []
    for n, img, sz in rendered:
        if sz <= max_bytes:
            out.append((n, img, sz))
            continue
        warn(f"page {n} {sz} bytes > {max_bytes}; re-rendering at {FALLBACK_DPI} DPI")
        re_imgs = convert_from_path(
            str(pdf),
            dpi=FALLBACK_DPI,
            first_page=n,
            last_page=n,
            fmt="png",
            output_folder=str(tmp_root),
            paths_only=False,
        )
        if not re_imgs:
            die(f"failed to re-render page {n}")
        re_img = re_imgs[0]
        buf = io.BytesIO()
        re_img.save(buf, format="PNG", optimize=False)
        out.append((n, re_img, len(buf.getvalue())))
    return out


def _write_manifest(
    pdf: Path,
    out_dir: Path,
    total_pages: int,
    selected: list[int],
    dpi: int,
    prompt: str,
    chunks: list[dict],
    oversize_idx: list[int],
) -> Path:
    """Write the chunk PNGs and the manifest JSON. Returns manifest path."""
    chunks_dir = out_dir / CHUNKS_DIRNAME
    chunks_dir.mkdir(parents=True, exist_ok=True)

    manifest_chunks: list[dict] = []
    for i, c in enumerate(chunks, 1):
        first, last = c["pages"][0], c["pages"][-1]
        png_name = f"chunk_{i:02d}_p{first:04d}-p{last:04d}.png"
        png_path = chunks_dir / png_name
        png_path.write_bytes(c["buffer"])
        manifest_chunks.append(
            {
                "id": i,
                "pages": c["pages"],
                "pages_label": format_pages(c["pages"]),
                "png_path": str(png_path),
                "png_base64": base64.b64encode(c["buffer"]).decode("ascii"),
                "mime_type": "image/png",
                "width": c["width"],
                "height": c["height"],
                "bytes": c["bytes"],
                "oversize": i - 1 in oversize_idx,
            }
        )

    manifest = {
        "schema": "minimax-pdf/vision-chunks/v1",
        "pdf": str(pdf),
        "pageCount": total_pages,
        "selectedPages": selected,
        "selectedPagesLabel": format_pages(selected),
        "dpi": dpi,
        "prompt": prompt,
        "chunks": manifest_chunks,
        "next_step": {
            "tool": "mcp__matrix__describe_images",
            "call_shape": {
                "image_info": [
                    {
                        "data": "<png_base64 from chunk>",
                        "mime_type": "image/png",
                        "prompt": "<prompt from manifest>",
                    }
                ]
            },
            "instruction": "For each chunk in this manifest, call the vision MCP tool with the chunk's png_base64 and the manifest's prompt. Aggregate the per-chunk descriptions back into the final markdown.",
        },
    }
    manifest_path = out_dir / MANIFEST_FILENAME
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest_path


def main() -> None:
    p = argparse.ArgumentParser(
        description="Image-vision PDF read — chunks pages for the agent to send to a vision MCP tool.",
    )
    add_common_args(p)
    p.add_argument(
        "--dpi", type=int, default=DEFAULT_DPI, help=f"Render DPI (default {DEFAULT_DPI})."
    )
    p.add_argument(
        "--max-bytes",
        type=int,
        default=DEFAULT_MAX_BYTES,
        help=f"Per-chunk byte budget (default {DEFAULT_MAX_BYTES}).",
    )
    p.add_argument(
        "--prompt",
        default=DEFAULT_PROMPT,
        help="Prompt sent to the vision MCP per chunk.",
    )
    p.add_argument(
        "--out-dir",
        default=None,
        help="Directory to write chunks/ and manifest.json (default: a temp dir under ~/.cache/pi/pdf-vision/).",
    )
    args = p.parse_args()

    if shutil.which("pdftoppm") is None:
        die("'pdftoppm' (poppler) not found. Install: brew install poppler")

    pdf_path = resolve_input_or_exit(args.input)

    if shutil.which("pdfinfo") is None:
        die("'pdfinfo' (poppler) not found. Install: brew install poppler")
    try:
        out = subprocess.check_output(
            ["pdfinfo", str(pdf_path)], stderr=subprocess.STDOUT
        ).decode("utf-8", errors="ignore")
    except subprocess.CalledProcessError as e:
        err_tail = (e.output or b"").decode("utf-8", errors="ignore").strip()[-300:]
        die(
            f"pdfinfo failed on {pdf_path} (exit {e.returncode}). "
            f"PDF may be corrupt or password-protected. pdfinfo said: {err_tail}"
        )
    except FileNotFoundError:
        die("'pdfinfo' (poppler) not found. Install: brew install poppler")

    total_pages = next(
        (int(line.split(":", 1)[1].strip()) for line in out.splitlines() if line.startswith("Pages:")),
        0,
    )
    if total_pages == 0:
        die(f"Could not determine page count for {pdf_path} (pdfinfo output had no 'Pages:' line)")
    info(f"PDF probe: {total_pages} page(s) total")

    selected = resolve_pages_or_exit(args.pages, total_pages)

    if args.out_dir:
        out_dir = Path(args.out_dir).expanduser().resolve()
        out_dir.mkdir(parents=True, exist_ok=True)
    else:
        out_dir = cache_dir().parent / "pdf-vision" / pdf_path.stem
        out_dir.mkdir(parents=True, exist_ok=True)

    tmp_root = _safe_tmp_root()
    tmp_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="pdf-vis-", dir=tmp_root) as tmp:
        info(f"Rendering {len(selected)} page(s) at {args.dpi} DPI…")
        rendered = _render(pdf_path, selected, args.dpi, Path(tmp))
        rendered = _downscale_oversize(pdf_path, rendered, args.max_bytes, Path(tmp))

        info("Stitching pages into chunks…")
        chunks, oversize_idx = _stitch_and_grow(rendered, args.max_bytes)
        info(f"Built {len(chunks)} chunk(s)")
        if oversize_idx:
            warn(
                f"{len(oversize_idx)} chunk(s) still exceed {args.max_bytes} bytes; "
                f"vision MCP may reject them."
            )

        manifest_path = _write_manifest(
            pdf_path, out_dir, total_pages, selected, args.dpi, args.prompt, chunks, oversize_idx
        )
        info(f"Manifest: {manifest_path}")

    summary = {
        "mode": "vision-chunks-ready",
        "pdf": str(pdf_path),
        "out_dir": str(out_dir),
        "manifest": str(manifest_path),
        "chunk_count": len(chunks),
        "page_count": total_pages,
        "selected_pages": selected,
        "marker": STDOUT_MARKER,
    }

    if args.json:
        emit(
            json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
            "json",
            args.max_stdout_bytes,
        )
    else:
        # Always emit the marker on the last stdout line so the agent can detect it.
        print(
            f"vision chunks ready: {len(chunks)} chunk(s) for {format_pages(selected)} pages "
            f"of {pdf_path.name}"
        )
        print(f"  manifest: {manifest_path}")
        print(f"  out_dir:  {out_dir}")
        print(f"{STDOUT_MARKER} {manifest_path}")


if __name__ == "__main__":
    main()
