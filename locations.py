"""
locations.py — Physical storage locations & assignment rules.

Concepts
--------
A **Location** is a place where you physically store cards (e.g. "Bac 7",
"Deck box légendaires", "Classeur Foils Rouge"). It has a name, an optional
visual color, and an ordered list of **Rules**.

A **Rule** is a set of criteria that a card must satisfy to live in this
location. All criteria use AND logic; an empty criterion means "any value".

Criteria supported per rule:
  - colors          : list[str]    e.g. ["Ruby"] or ["Amber", "Steel"]
  - rarities        : list[str]    e.g. ["Common", "Uncommon", "Rare"]
  - chapters        : list[int]    e.g. [1,2,3,4,5]   (parsed from "1-5" or "1,2,3")
  - foil            : bool|None    True / False / None (=both)
  - languages       : list[str]    e.g. ["FR"]  (empty = any)
  - tags            : list[str]    card must carry ALL of these tags

Resolution
----------
Locations are stored in a USER-DEFINED ORDER. For each card, we walk the
locations top-to-bottom, evaluating every rule of every location in order,
and assign the card to the FIRST matching rule. A card is therefore in
exactly one place.

If no rule matches, the card lands in a virtual "Non assigné" bucket so
the user can spot misconfigurations.
"""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Iterable


# Canonical rarities, mirrors what Lorcast returns:
RARITIES = ["Common", "Uncommon", "Rare", "Super_rare", "Legendary", "Enchanted", "Promo"]

# Map the short codes Cardmarket uses in PDFs to canonical names.
RARITY_CODE_TO_LABEL = {
    "C": "Common",
    "U": "Uncommon",
    "R": "Rare",
    "SR": "Super_rare",
    "L": "Legendary",
    "E": "Enchanted",
    "P": "Promo",
}


@dataclass
class Rule:
    """One assignment rule belonging to a Location."""
    colors: list[str] = field(default_factory=list)
    rarities: list[str] = field(default_factory=list)
    chapters: list[int] = field(default_factory=list)
    foil: bool | None = None
    languages: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    note: str = ""               # free-form description, shown in UI

    def matches(self, card: "CardFacts") -> bool:
        if self.colors and card.color not in self.colors:
            return False
        if self.rarities and card.rarity not in self.rarities:
            return False
        if self.chapters and card.chapter not in self.chapters:
            return False
        if self.foil is not None and card.is_foil != self.foil:
            return False
        if self.languages and card.language not in self.languages:
            return False
        if self.tags and not all(t in card.tags for t in self.tags):
            return False
        return True

    def describe(self) -> str:
        """Human-readable summary, for the UI."""
        bits: list[str] = []
        if self.colors:
            bits.append("Couleurs: " + ", ".join(self.colors))
        if self.rarities:
            bits.append("Raretés: " + ", ".join(self.rarities))
        if self.chapters:
            bits.append("Chapitres: " + _compact_int_ranges(self.chapters))
        if self.foil is True:
            bits.append("Foil uniquement")
        elif self.foil is False:
            bits.append("Non-foil uniquement")
        if self.languages:
            bits.append("Langues: " + ", ".join(self.languages))
        if self.tags:
            bits.append("Tags: " + ", ".join(self.tags))
        return "  •  ".join(bits) if bits else "(toutes cartes)"


@dataclass
class Location:
    """A physical storage location with a list of rules."""
    name: str
    color_hex: str = "#888888"          # accent color in the UI
    rules: list[Rule] = field(default_factory=list)
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])

    def matches(self, card: "CardFacts") -> bool:
        return any(r.matches(card) for r in self.rules)


@dataclass
class CardFacts:
    """
    The bag of facts a Rule needs to evaluate. We build one per CardLine,
    enriched with whatever the API gave us (canonical rarity, etc.).
    """
    color: str               # canonical, e.g. "Amber"
    rarity: str              # canonical, e.g. "Common" / "Legendary"
    chapter: int             # int chapter number, e.g. 10
    is_foil: bool
    language: str            # "FR" / "EN" / ...
    tags: list[str] = field(default_factory=list)


# -- helpers -----------------------------------------------------------------

_CHAPTERS_RE = re.compile(r"^\s*(\d+)\s*(?:-\s*(\d+))?\s*$")


def parse_chapters_input(text: str) -> list[int]:
    """
    Parse a user-typed chapter spec like "1-5, 8, 10" into [1,2,3,4,5,8,10].
    Empty input returns [].
    """
    out: set[int] = set()
    if not text or not text.strip():
        return []
    for part in text.split(","):
        m = _CHAPTERS_RE.match(part)
        if not m:
            continue
        a = int(m.group(1))
        b = int(m.group(2)) if m.group(2) else a
        if b < a:
            a, b = b, a
        for n in range(a, b + 1):
            out.add(n)
    return sorted(out)


def _compact_int_ranges(nums: Iterable[int]) -> str:
    """[1,2,3,5,7,8] -> '1-3, 5, 7-8'"""
    nums = sorted(set(nums))
    if not nums:
        return ""
    runs: list[tuple[int, int]] = []
    start = prev = nums[0]
    for n in nums[1:]:
        if n == prev + 1:
            prev = n
        else:
            runs.append((start, prev))
            start = prev = n
    runs.append((start, prev))
    return ", ".join(f"{a}-{b}" if a != b else f"{a}" for a, b in runs)


# -- LocationStore: load/save + assignment engine ----------------------------

class LocationStore:
    """Holds the ordered list of locations + persistence + assignment."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.locations: list[Location] = []
        self.load()

    def load(self) -> None:
        if not self.path.exists():
            self.locations = []
            return
        try:
            data = json.loads(self.path.read_text("utf-8"))
        except json.JSONDecodeError:
            self.locations = []
            return
        self.locations = []
        for d in data.get("locations", []):
            rules = [Rule(**{k: v for k, v in r.items() if k in Rule.__annotations__})
                     for r in d.get("rules", [])]
            loc = Location(
                name=d.get("name", "Sans nom"),
                color_hex=d.get("color_hex", "#888888"),
                rules=rules,
                id=d.get("id", uuid.uuid4().hex[:8]),
            )
            self.locations.append(loc)

    def save(self) -> None:
        out = {
            "locations": [
                {
                    "id": loc.id,
                    "name": loc.name,
                    "color_hex": loc.color_hex,
                    "rules": [asdict(r) for r in loc.rules],
                }
                for loc in self.locations
            ]
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(out, indent=2, ensure_ascii=False), "utf-8")
        tmp.replace(self.path)

    # -- ordering operations --------------------------------------------------

    def move_up(self, idx: int) -> None:
        if 0 < idx < len(self.locations):
            self.locations[idx - 1], self.locations[idx] = self.locations[idx], self.locations[idx - 1]

    def move_down(self, idx: int) -> None:
        if 0 <= idx < len(self.locations) - 1:
            self.locations[idx + 1], self.locations[idx] = self.locations[idx], self.locations[idx + 1]

    def remove(self, idx: int) -> None:
        if 0 <= idx < len(self.locations):
            self.locations.pop(idx)

    # -- assignment -----------------------------------------------------------

    def find_location(self, card: CardFacts) -> Location | None:
        """Return the first Location whose rule list matches this card."""
        for loc in self.locations:
            for rule in loc.rules:
                if rule.matches(card):
                    return loc
        return None
