"""
lorcast.py — Thin client for the Lorcast public API (https://lorcast.com).

Endpoint used: GET /cards/:set/:number  (one set+number → one card object)

A persistent on-disk JSON cache means each card is fetched at most once.
Images (AVIF) are also cached on disk under cache/images/.

If the network is unavailable or a card cannot be found, lookups return
None and the UI falls back to the data already extracted from the PDF.
"""

from __future__ import annotations

import json
import time
import urllib.request
import urllib.error
from dataclasses import dataclass
from pathlib import Path

API_BASE = "https://api.lorcast.com/v0"
USER_AGENT = "LorcanaPickingTool/1.0 (+local)"
REQUEST_TIMEOUT = 15  # seconds


@dataclass
class LorcastCard:
    """Subset of the Lorcast card model that we need."""
    name: str
    version: str | None
    ink: str | None              # "Amber", "Amethyst", ...
    rarity: str | None           # "Common", "Rare", ...
    set_code: str
    set_name: str | None
    collector_number: str
    image_small: str | None      # url
    image_normal: str | None     # url


class LorcastClient:
    def __init__(self, cache_dir: str | Path):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.image_dir = self.cache_dir / "images"
        self.image_dir.mkdir(parents=True, exist_ok=True)
        self.card_cache_file = self.cache_dir / "cards.json"
        self._card_cache: dict[str, dict] = {}
        if self.card_cache_file.exists():
            try:
                self._card_cache = json.loads(self.card_cache_file.read_text("utf-8"))
            except json.JSONDecodeError:
                self._card_cache = {}
        # remember misses too, with a timestamp so we can re-try later
        self._miss_cache: dict[str, float] = {}

    # ---- public lookups -----------------------------------------------------

    def get_card(self, set_code: str, number: str) -> LorcastCard | None:
        """Return the card or None on miss/network error."""
        key = f"{set_code}/{number}"
        # cache hit?
        if key in self._card_cache:
            return _card_from_dict(self._card_cache[key])
        # recent miss? (don't hammer the API for cards it doesn't know)
        last_miss = self._miss_cache.get(key)
        if last_miss and (time.time() - last_miss) < 3600:
            return None

        url = f"{API_BASE}/cards/{set_code}/{number}"
        try:
            data = self._http_get_json(url)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
            self._miss_cache[key] = time.time()
            return None

        self._card_cache[key] = data
        self._save_cache()
        return _card_from_dict(data)

    def get_image_path(self, card: LorcastCard, size: str = "small") -> Path | None:
        """Download (and cache) the card image, return its local path."""
        url = card.image_small if size == "small" else card.image_normal
        if not url:
            return None
        # filename = set + number + size + extension
        ext = url.rsplit("?", 1)[0].rsplit(".", 1)[-1].lower()
        if ext not in ("avif", "png", "jpg", "jpeg", "webp"):
            ext = "avif"
        fname = f"{card.set_code}_{card.collector_number}_{size}.{ext}"
        local = self.image_dir / fname
        if local.exists() and local.stat().st_size > 0:
            return local

        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as r:
                local.write_bytes(r.read())
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
            return None
        return local

    # ---- internals ----------------------------------------------------------

    def _http_get_json(self, url: str) -> dict:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as r:
            return json.loads(r.read())

    def _save_cache(self) -> None:
        tmp = self.card_cache_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._card_cache, ensure_ascii=False), "utf-8")
        tmp.replace(self.card_cache_file)


def _card_from_dict(d: dict) -> LorcastCard:
    img = (d.get("image_uris") or {}).get("digital") or {}
    s = d.get("set") or {}
    return LorcastCard(
        name=d.get("name", ""),
        version=d.get("version"),
        ink=d.get("ink"),
        rarity=d.get("rarity"),
        set_code=str(s.get("code", "")),
        set_name=s.get("name"),
        collector_number=str(d.get("collector_number", "")),
        image_small=img.get("small"),
        image_normal=img.get("normal"),
    )
