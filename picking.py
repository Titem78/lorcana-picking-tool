"""
picking.py — Build an optimized picking list from one or several orders.

Pipeline
--------
1. Take all CardLine objects from N orders.
2. Group identical "products" together (same set + number + language +
   condition + foil status). Foil and non-foil of the same card are TWO
   distinct picking lines (different storage often, different prices).
3. Build a CardFacts for each entry (color, rarity, chapter, foil, language,
   tags) and ask the LocationStore which Location it belongs to.
4. Output: list[PickingSection], one per location (in user-defined order),
   plus a final "Non assigné" section for cards no rule matched.

Each PickingEntry inside a section keeps the buyer breakdown intact, so the
picker sees "5x Mickey #23 — 3x for client A, 2x for client B".
"""

from __future__ import annotations

from dataclasses import dataclass, field

from parser import CardLine, Order
from locations import (
    CardFacts,
    Location,
    LocationStore,
    RARITY_CODE_TO_LABEL,
)
from tags import TagStore


DEFAULT_COLOR_ORDER = ["Amber", "Amethyst", "Emerald", "Ruby", "Sapphire", "Steel"]


@dataclass
class BuyerShare:
    """One buyer's share of a picking entry, plus the live pick state."""
    buyer: str
    buyer_name: str
    sale_id: str
    quantity: int
    # link back to history so we can persist pick state
    order_uid: str = ""        # OrderRecord.uid in HistoryStore
    card_index: int = -1       # index inside that record's `cards` list
    picked: int = 0            # how many of this buyer's `quantity` are picked

    @property
    def fully_picked(self) -> bool:
        return self.picked >= self.quantity


@dataclass
class PickingEntry:
    """One physical pick: how many of which card, and to whom each copy goes."""
    set_code: str
    color_label: str
    color_code: str
    number: str
    name: str
    language: str
    condition: str
    rarity_code: str
    is_foil: bool
    total_qty: int
    shares: list[BuyerShare] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    # filled in by API enrichment:
    api_image: str | None = None
    api_ink: str | None = None
    api_rarity: str | None = None
    api_set_name: str | None = None

    @property
    def total_picked(self) -> int:
        return sum(s.picked for s in self.shares)

    @property
    def fully_picked(self) -> bool:
        return self.total_picked >= self.total_qty

    @property
    def display_color(self) -> str:
        return self.api_ink or self.color_label

    @property
    def display_rarity(self) -> str:
        return self.api_rarity or RARITY_CODE_TO_LABEL.get(self.rarity_code, self.rarity_code)

    def to_facts(self) -> CardFacts:
        try:
            ch = int(self.set_code)
        except ValueError:
            ch = 0
        return CardFacts(
            color=self.display_color,
            rarity=self.display_rarity,
            chapter=ch,
            is_foil=self.is_foil,
            language=self.language,
            tags=list(self.tags),
        )


@dataclass
class PickingSection:
    """A bucket of entries that all live in the same physical location."""
    location: Location | None       # None == "Non assigné"
    entries: list[PickingEntry] = field(default_factory=list)

    @property
    def title(self) -> str:
        return self.location.name if self.location else "Non assigné"

    @property
    def color_hex(self) -> str:
        return self.location.color_hex if self.location else "#bbbbbb"

    @property
    def total_cards(self) -> int:
        return sum(e.total_qty for e in self.entries)


# -- entry construction -------------------------------------------------------

def build_picking_entries_from_records(
    records: list,                    # list[OrderRecord] — typed as list to avoid circular import
    tag_store: TagStore | None = None,
    group_orders: bool = True,
) -> list[PickingEntry]:
    """
    Build picking entries directly from OrderRecord objects (the persistent
    history layer). This is the modern path: each BuyerShare carries the
    `order_uid` + `card_index` so the UI can write back pick counts.
    """
    def key_for(c) -> tuple:
        if group_orders:
            return (c.set_code, c.number, c.language, c.condition, c.is_foil)
        # one entry per (card, order)
        return (c.set_code, c.number, c.language, c.condition, c.is_foil, "_unique_")

    grouped: dict[tuple, PickingEntry] = {}
    for rec in records:
        for idx, c in enumerate(rec.cards):
            k = key_for(c) if group_orders else \
                (c.set_code, c.number, c.language, c.condition, c.is_foil, rec.uid)
            if k not in grouped:
                tags = tag_store.get(c.set_code, c.number) if tag_store else []
                grouped[k] = PickingEntry(
                    set_code=c.set_code,
                    color_label=c.color_label,
                    color_code=c.color_code,
                    number=c.number,
                    name=c.name,
                    language=c.language,
                    condition=c.condition,
                    rarity_code=c.rarity_code,
                    is_foil=c.is_foil,
                    total_qty=0,
                    tags=tags,
                )
            entry = grouped[k]
            entry.total_qty += c.quantity
            entry.shares.append(BuyerShare(
                buyer=rec.buyer, buyer_name=rec.buyer_name,
                sale_id=rec.sale_id, quantity=c.quantity,
                order_uid=rec.uid, card_index=idx, picked=c.picked,
            ))
    return list(grouped.values())


def build_picking_entries(
    orders: list[Order],
    tag_store: TagStore | None = None,
    group_orders: bool = True,
) -> list[PickingEntry]:
    """Legacy path: build entries from raw Order objects (no pick state)."""
    def key_for(c: CardLine) -> tuple:
        if group_orders:
            return (c.set_code, c.number, c.language, c.condition, c.is_foil)
        return (c.set_code, c.number, c.language, c.condition, c.is_foil, c.sale_id)

    grouped: dict[tuple, PickingEntry] = {}
    for order in orders:
        for c in order.cards:
            k = key_for(c)
            if k not in grouped:
                tags = tag_store.get(c.set_code, c.number) if tag_store else []
                grouped[k] = PickingEntry(
                    set_code=c.set_code,
                    color_label=c.color_label,
                    color_code=c.color_code,
                    number=c.number,
                    name=c.name,
                    language=c.language,
                    condition=c.condition,
                    rarity_code=c.rarity_code,
                    is_foil=c.is_foil,
                    total_qty=0,
                    tags=tags,
                )
            entry = grouped[k]
            entry.total_qty += c.quantity
            entry.shares.append(BuyerShare(
                buyer=c.buyer, buyer_name=c.buyer_name,
                sale_id=c.sale_id, quantity=c.quantity,
            ))
    return list(grouped.values())


# -- section assignment + intra-sort -----------------------------------------

def _entry_sort_key(e: PickingEntry, color_order: list[str]) -> tuple:
    """Within a section, sort by color → chapter → foil-first → number."""
    try:
        c_rank = color_order.index(e.display_color)
    except ValueError:
        c_rank = len(color_order)
    try:
        ch_num = int(e.set_code)
    except ValueError:
        ch_num = 99999
    digits = "".join(ch for ch in e.number if ch.isdigit())
    n_num = int(digits) if digits else 99999
    return (c_rank, ch_num, 0 if e.is_foil else 1, n_num, e.number)


def assign_to_sections(
    entries: list[PickingEntry],
    store: LocationStore,
    color_order: list[str] | None = None,
) -> list[PickingSection]:
    """Step 2: route each entry to a Location, in the user-defined order."""
    color_order = color_order or DEFAULT_COLOR_ORDER

    sections: dict[str, PickingSection] = {}
    for loc in store.locations:
        sections[loc.id] = PickingSection(location=loc)
    unassigned = PickingSection(location=None)

    for entry in entries:
        loc = store.find_location(entry.to_facts())
        if loc is None:
            unassigned.entries.append(entry)
        else:
            sections[loc.id].entries.append(entry)

    for section in sections.values():
        section.entries.sort(key=lambda e: _entry_sort_key(e, color_order))
    unassigned.entries.sort(key=lambda e: _entry_sort_key(e, color_order))

    out = [s for s in sections.values() if s.entries]
    if unassigned.entries:
        out.append(unassigned)
    return out


# -- convenience wrapper ------------------------------------------------------

def build_picking_from_records(
    records: list,
    store: LocationStore,
    tag_store: TagStore | None = None,
    color_order: list[str] | None = None,
    group_orders: bool = True,
) -> list[PickingSection]:
    """Modern path: from history records (preserves pick state)."""
    entries = build_picking_entries_from_records(
        records, tag_store=tag_store, group_orders=group_orders)
    return assign_to_sections(entries, store, color_order=color_order)


def build_picking(
    orders: list[Order],
    store: LocationStore,
    tag_store: TagStore | None = None,
    color_order: list[str] | None = None,
    group_orders: bool = True,
) -> list[PickingSection]:
    """Legacy path (no pick state)."""
    entries = build_picking_entries(orders, tag_store=tag_store, group_orders=group_orders)
    return assign_to_sections(entries, store, color_order=color_order)
