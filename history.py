"""
history.py — Persistent order history + per-card pick state + stats.

Lifecycle of an order
---------------------
1. User loads a PDF → an OrderRecord is created, status = "to_pick".
2. User checks cards in the picking list as they grab them physically.
   The check-state is persisted per (order, card-line) so closing/reopening
   the app doesn't lose progress.
3. When ALL cards of one order are fully picked, status flips to "sent"
   and `sent_date` is set; the order disappears from the active picking
   view but stays in the history forever.
4. The history can be browsed in a dedicated tab; any order can be reopened
   (status → "to_pick" / "in_progress") for re-picking or reference.

Storage layout (history.json)
-----------------------------
{
  "orders": [
    {
      "uid": "<unique id>",
      "sale_id": "1266636419",
      "buyer": "MonsieurN",
      "buyer_name": "Jerome Nevado",
      "seller": "Made4Game",
      "loaded_date": "2026-04-29T18:30:00",   # ISO
      "sent_date": "2026-04-30T09:12:00",     # null while not done
      "total": "5,42 EUR",
      "status": "to_pick" | "in_progress" | "sent",
      "source_pdf": "...path...",             # for reference only
      "cards": [
        {
          "name": "Mickey Mouse - Amber Champion",
          "number": "23",
          "set_code": "10",
          "color_code": "WHI",
          "color_label": "Amber",
          "rarity_code": "R",
          "language": "FR",
          "condition": "NM",
          "is_foil": false,
          "price": "0,50 EUR",
          "quantity": 3,
          "picked": 0     # how many copies have been ticked off
        },
        ...
      ]
    },
    ...
  ]
}
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path

from parser import Order, CardLine


# ------- data model ---------------------------------------------------------

STATUS_TO_PICK = "to_pick"
STATUS_IN_PROGRESS = "in_progress"
STATUS_SENT = "sent"


@dataclass
class HistoryCard:
    """A snapshot of a CardLine + its current pick progress."""
    name: str
    number: str
    set_code: str
    color_code: str
    color_label: str
    rarity_code: str
    language: str
    condition: str
    is_foil: bool
    price: str
    quantity: int
    picked: int = 0

    @property
    def fully_picked(self) -> bool:
        return self.picked >= self.quantity

    def to_card_line(self, buyer: str, buyer_name: str, sale_id: str) -> CardLine:
        """Reconstruct a CardLine for re-feeding the picking engine."""
        return CardLine(
            quantity=self.quantity,
            name=self.name,
            number=self.number,
            language=self.language,
            condition=self.condition,
            set_code=self.set_code,
            color_code=self.color_code,
            color_label=self.color_label,
            rarity_code=self.rarity_code,
            price=self.price,
            comment="",
            is_foil=self.is_foil,
            buyer=buyer,
            buyer_name=buyer_name,
            sale_id=sale_id,
        )


@dataclass
class OrderRecord:
    """A persistent record of one Cardmarket order."""
    uid: str
    sale_id: str
    buyer: str
    buyer_name: str
    seller: str
    loaded_date: str          # ISO date string
    total: str
    status: str = STATUS_TO_PICK
    sent_date: str | None = None
    source_pdf: str = ""
    cards: list[HistoryCard] = field(default_factory=list)

    # ---- progress helpers
    @property
    def total_qty(self) -> int:
        return sum(c.quantity for c in self.cards)

    @property
    def picked_qty(self) -> int:
        return sum(c.picked for c in self.cards)

    @property
    def progress_ratio(self) -> float:
        if self.total_qty == 0:
            return 1.0
        return self.picked_qty / self.total_qty

    @property
    def is_complete(self) -> bool:
        return all(c.fully_picked for c in self.cards) and self.cards

    def recompute_status(self) -> None:
        """Update status based on current pick progress."""
        if self.is_complete:
            if self.status != STATUS_SENT:
                self.status = STATUS_SENT
                self.sent_date = datetime.now().isoformat(timespec="seconds")
        elif self.picked_qty > 0:
            self.status = STATUS_IN_PROGRESS
            self.sent_date = None
        else:
            self.status = STATUS_TO_PICK
            self.sent_date = None

    def to_order(self) -> Order:
        """Reconstruct an Order object usable by the picking engine."""
        return Order(
            sale_id=self.sale_id,
            buyer=self.buyer,
            buyer_name=self.buyer_name,
            seller=self.seller,
            sent_date=self.sent_date or "",
            total=self.total,
            cards=[c.to_card_line(self.buyer, self.buyer_name, self.sale_id)
                   for c in self.cards],
            source_pdf=self.source_pdf,
        )


# ------- store --------------------------------------------------------------

class HistoryStore:
    """Persistent list of all orders ever loaded, with picking state."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.orders: list[OrderRecord] = []
        self.load()

    def load(self) -> None:
        if not self.path.exists():
            return
        try:
            data = json.loads(self.path.read_text("utf-8"))
        except json.JSONDecodeError:
            return
        self.orders = []
        for d in data.get("orders", []):
            cards = [HistoryCard(**{k: v for k, v in c.items()
                                    if k in HistoryCard.__annotations__})
                     for c in d.get("cards", [])]
            self.orders.append(OrderRecord(
                uid=d.get("uid") or uuid.uuid4().hex[:12],
                sale_id=d.get("sale_id", ""),
                buyer=d.get("buyer", ""),
                buyer_name=d.get("buyer_name", ""),
                seller=d.get("seller", ""),
                loaded_date=d.get("loaded_date", ""),
                sent_date=d.get("sent_date"),
                total=d.get("total", ""),
                status=d.get("status", STATUS_TO_PICK),
                source_pdf=d.get("source_pdf", ""),
                cards=cards,
            ))

    def save(self) -> None:
        out = {"orders": [_record_to_dict(r) for r in self.orders]}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(out, indent=2, ensure_ascii=False), "utf-8")
        tmp.replace(self.path)

    # ---- import a freshly parsed Order, dedupe by sale_id -----------------

    def add_or_get(self, order: Order) -> OrderRecord:
        """Return the existing record for this sale_id, or create a new one."""
        if order.sale_id:
            for r in self.orders:
                if r.sale_id == order.sale_id:
                    return r  # already known, keep as-is (preserve pick state)
        rec = OrderRecord(
            uid=uuid.uuid4().hex[:12],
            sale_id=order.sale_id,
            buyer=order.buyer,
            buyer_name=order.buyer_name,
            seller=order.seller,
            loaded_date=datetime.now().isoformat(timespec="seconds"),
            total=order.total,
            source_pdf=order.source_pdf,
            cards=[
                HistoryCard(
                    name=c.name, number=c.number, set_code=c.set_code,
                    color_code=c.color_code, color_label=c.color_label,
                    rarity_code=c.rarity_code, language=c.language,
                    condition=c.condition, is_foil=c.is_foil, price=c.price,
                    quantity=c.quantity, picked=0,
                )
                for c in order.cards
            ],
        )
        self.orders.append(rec)
        return rec

    # ---- queries -----------------------------------------------------------

    def active(self) -> list[OrderRecord]:
        """Orders that still need picking (status != 'sent')."""
        return [r for r in self.orders if r.status != STATUS_SENT]

    def sent(self) -> list[OrderRecord]:
        return [r for r in self.orders if r.status == STATUS_SENT]

    def by_uid(self, uid: str) -> OrderRecord | None:
        for r in self.orders:
            if r.uid == uid:
                return r
        return None

    def remove(self, uid: str) -> None:
        self.orders = [r for r in self.orders if r.uid != uid]

    def reopen(self, uid: str) -> None:
        """Move a 'sent' order back to active, preserving pick counts."""
        rec = self.by_uid(uid)
        if rec:
            # leave pick counts untouched; just flip status if appropriate
            rec.recompute_status()
            if rec.status == STATUS_SENT:
                # everything still ticked → reset picks so user can re-pick
                for c in rec.cards:
                    c.picked = 0
                rec.status = STATUS_TO_PICK
                rec.sent_date = None

    # ---- pick state mutation ----------------------------------------------

    def set_picked(self, order_uid: str, card_index: int, picked: int) -> None:
        """Set the picked count for one card line (clamped to 0..quantity)."""
        rec = self.by_uid(order_uid)
        if not rec or not (0 <= card_index < len(rec.cards)):
            return
        c = rec.cards[card_index]
        c.picked = max(0, min(picked, c.quantity))
        rec.recompute_status()

    def find_card_index(self, order_uid: str, set_code: str, number: str,
                         language: str, condition: str, is_foil: bool) -> int | None:
        """Find the index in rec.cards of the line matching this product."""
        rec = self.by_uid(order_uid)
        if not rec:
            return None
        for i, c in enumerate(rec.cards):
            if (c.set_code == set_code and c.number == number
                    and c.language == language and c.condition == condition
                    and c.is_foil == is_foil):
                return i
        return None


# ------- internal helper ---------------------------------------------------

def _record_to_dict(r: OrderRecord) -> dict:
    return {
        "uid": r.uid,
        "sale_id": r.sale_id,
        "buyer": r.buyer,
        "buyer_name": r.buyer_name,
        "seller": r.seller,
        "loaded_date": r.loaded_date,
        "sent_date": r.sent_date,
        "total": r.total,
        "status": r.status,
        "source_pdf": r.source_pdf,
        "cards": [asdict(c) for c in r.cards],
    }
