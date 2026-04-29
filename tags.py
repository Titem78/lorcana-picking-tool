"""
tags.py — Per-card free-form tags.

Tags are attached to a *card identity*, defined here as the pair
(set_code, collector_number). They survive across orders and PDFs.

Use cases:
    - mark a printing as "collec perso, ne jamais vendre"
    - mark "à vendre vite", "promo conv 2024", etc.

Tags participate in the location rule engine (a Rule may require tags).
"""

from __future__ import annotations

import json
from pathlib import Path


def _key(set_code: str, number: str) -> str:
    """Canonical key for a card identity, e.g. '10/23'."""
    n = number.lstrip("0") or "0"
    return f"{set_code}/{n}"


class TagStore:
    """Persistent set of tags per card."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        # mapping: "set/number" -> sorted list of tag strings
        self._tags: dict[str, list[str]] = {}
        self.load()

    def load(self) -> None:
        if not self.path.exists():
            return
        try:
            data = json.loads(self.path.read_text("utf-8"))
            self._tags = {k: sorted(set(v)) for k, v in data.items()}
        except (json.JSONDecodeError, AttributeError):
            self._tags = {}

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._tags, indent=2, ensure_ascii=False), "utf-8")
        tmp.replace(self.path)

    # -- public API -----------------------------------------------------------

    def get(self, set_code: str, number: str) -> list[str]:
        return list(self._tags.get(_key(set_code, number), []))

    def add(self, set_code: str, number: str, tag: str) -> None:
        tag = tag.strip()
        if not tag:
            return
        k = _key(set_code, number)
        existing = set(self._tags.get(k, []))
        existing.add(tag)
        self._tags[k] = sorted(existing)

    def remove(self, set_code: str, number: str, tag: str) -> None:
        k = _key(set_code, number)
        if k not in self._tags:
            return
        self._tags[k] = [t for t in self._tags[k] if t != tag]
        if not self._tags[k]:
            del self._tags[k]

    def set_tags(self, set_code: str, number: str, tags: list[str]) -> None:
        """Replace all tags for one card."""
        cleaned = sorted({t.strip() for t in tags if t and t.strip()})
        k = _key(set_code, number)
        if cleaned:
            self._tags[k] = cleaned
        elif k in self._tags:
            del self._tags[k]

    def all_known_tags(self) -> list[str]:
        """All distinct tag strings ever used — for autocomplete."""
        out: set[str] = set()
        for tags in self._tags.values():
            out.update(tags)
        return sorted(out)

    def all_tagged_cards(self) -> list[tuple[str, list[str]]]:
        """List of (key, tags) for browsing in the UI."""
        return sorted(self._tags.items())
