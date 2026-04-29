"""
parser.py — Extract Cardmarket order data from PDF invoices.

The Cardmarket PDF table for Lorcana cards has 9 columns:
  [qty, name, number, language, condition, set+color, rarity, state, price]

Example: ['3', 'Mickey Mouse - Amber Champion', '023', 'FR', 'NM', '10WHI',
          'R', 'booster to sleeve', '0,50 EUR']

The 6th column (e.g. '10WHI') is "<set_number><color_code>" where:
  - set_number = the chapter (e.g. 10)
  - color_code = 3-letter ink color (AMB / AME / EME / RUB / SAP / STE / WHI)

Note: Lorcana ink colors normally are Amber/Amethyst/Emerald/Ruby/Sapphire/Steel.
Cardmarket uses 'WHI' (White) historically for Amber in some sets — we map it
to the canonical Lorcast ink ("Amber") via the api lookup, not by guessing.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

import pdfplumber


# -- color codes used on Cardmarket --------------------------------------------
# These map the 3-letter Cardmarket suffix to a canonical color label.
# Used as a *fallback* when the Lorcast API lookup fails; the API answer wins.
COLOR_CODE_TO_LABEL = {
    "AMB": "Amber",
    "AME": "Amethyst",
    "EME": "Emerald",
    "RUB": "Ruby",
    "SAP": "Sapphire",
    "STE": "Steel",
    # Cardmarket has historically used 'WHI' (white) as a stand-in
    # for Amber printings on certain sets — we display whatever Lorcast says.
    "WHI": "Amber",
}

SET_COLOR_RE = re.compile(r"^(\d+)([A-Z]{3})$")

# Detect foil-ness from the "comment/state" column.
# Cardmarket users typically write "FOIL", "Foil", "Cold Foil", "Holo".
# We match case-insensitively, as a whole-word so "foilage" wouldn't match.
FOIL_RE = re.compile(r"\b(foil|holo|cold\s*foil)\b", re.IGNORECASE)


@dataclass
class CardLine:
    """One line item from one Cardmarket order."""
    quantity: int
    name: str            # full name as printed: "Mickey Mouse - Amber Champion"
    number: str          # collector number, e.g. "023"
    language: str        # "FR", "EN", ...
    condition: str       # "NM", "EX", ...
    set_code: str        # chapter number as string, e.g. "10"
    color_code: str      # 3-letter cardmarket code, e.g. "WHI"
    color_label: str     # human-readable color, e.g. "Amber" (fallback)
    rarity_code: str     # "C", "U", "R", "L", ...
    price: str           # "0,50 EUR"
    comment: str = ""         # raw "comment / state" text from PDF (e.g. "booster to sleeve, FOIL")
    is_foil: bool = False     # parsed from `comment`
    # filled in by app:
    buyer: str = ""           # "MonsieurN"
    buyer_name: str = ""      # "Jerome Nevado"
    sale_id: str = ""         # "1266636419"


@dataclass
class Order:
    """A whole Cardmarket order parsed from one PDF."""
    sale_id: str
    buyer: str               # username, e.g. "MonsieurN"
    buyer_name: str          # real name, e.g. "Jerome Nevado"
    seller: str              # username, e.g. "Made4Game"
    sent_date: str           # human-readable date string from PDF
    total: str               # "5,42 EUR"
    cards: list[CardLine] = field(default_factory=list)
    source_pdf: str = ""


# -- header parsing ------------------------------------------------------------

_SALE_RE = re.compile(r"Vente\s*#(\d+)")
_BUYER_RE = re.compile(r"Acheteur\s*-\s*(\S+)")
_SELLER_RE = re.compile(r"Vendeur\s*-\s*(\S+)")
_SENT_RE = re.compile(r"Envoy.{1,3}e:?\s*([\d.\s:]+)")
_TOTAL_RE = re.compile(r"Total\s+([\d.,]+\s*EUR)")


def _parse_header(text: str) -> dict:
    """Extract the metadata block from raw page text."""
    m_sale = _SALE_RE.search(text)
    m_buyer = _BUYER_RE.search(text)
    m_seller = _SELLER_RE.search(text)
    m_sent = _SENT_RE.search(text)
    m_total = _TOTAL_RE.search(text)

    # The "real name" sits on the line right after "Acheteur - <user>".
    # That line typically contains "<seller real name>   <buyer real name>"
    # separated by 2+ spaces. Take the rightmost chunk; fall back to the
    # latter half of the words if pdfplumber collapsed the spaces.
    buyer_name = ""
    if m_buyer:
        lines = text.splitlines()
        for i, ln in enumerate(lines):
            if "Acheteur" in ln and m_buyer.group(1) in ln:
                if i + 1 < len(lines):
                    next_line = lines[i + 1].strip()
                    parts = re.split(r"\s{2,}", next_line)
                    if len(parts) >= 2:
                        buyer_name = parts[-1]
                    else:
                        words = next_line.split()
                        buyer_name = " ".join(words[len(words) // 2:]) if words else ""
                break

    return {
        "sale_id": m_sale.group(1) if m_sale else "",
        "buyer": m_buyer.group(1) if m_buyer else "",
        "buyer_name": buyer_name,
        "seller": m_seller.group(1) if m_seller else "",
        "sent_date": (m_sent.group(1).strip() if m_sent else ""),
        "total": m_total.group(1) if m_total else "",
    }


# -- card line parsing ---------------------------------------------------------

def _parse_card_row(row: list[str]) -> CardLine | None:
    """Turn one extracted table row into a CardLine. Returns None if invalid."""
    # Filter empty cells
    cells = [c.strip() if c else "" for c in row]
    if len(cells) < 7:
        return None

    # Quantity must be numeric
    try:
        qty = int(cells[0])
    except (ValueError, TypeError):
        return None

    # Find set+color cell (matches \d+[A-Z]{3})
    set_idx = None
    for i, c in enumerate(cells):
        if SET_COLOR_RE.match(c):
            set_idx = i
            break
    if set_idx is None:
        return None

    m = SET_COLOR_RE.match(cells[set_idx])
    set_code, color_code = m.group(1), m.group(2)

    # name is everything between qty (cell 0) and number (cell before language)
    # Standard layout:
    #   [qty, name, number, lang, cond, set+color, rarity, comment, price]
    # The "comment" cell holds free-form notes like "booster to sleeve" and,
    # critically, "FOIL" / "Cold Foil" / "Holo" when the card is foiled.
    name = cells[1]
    number = cells[2] if len(cells) > 2 else ""
    language = cells[3] if len(cells) > 3 else ""
    condition = cells[4] if len(cells) > 4 else ""
    rarity = cells[set_idx + 1] if set_idx + 1 < len(cells) else ""
    price = cells[-1] if cells[-1].endswith("EUR") else ""

    # Comment cell: the cell(s) between rarity and price.
    # We join them so we don't lose info if Cardmarket splits comments oddly.
    comment_cells = cells[set_idx + 2 : -1] if cells[-1].endswith("EUR") else cells[set_idx + 2 :]
    comment = " ".join(c for c in comment_cells if c).strip()
    is_foil = bool(FOIL_RE.search(comment))

    return CardLine(
        quantity=qty,
        name=name,
        number=number.lstrip("0") or "0",  # normalize "023" -> "23" for API
        language=language,
        condition=condition,
        set_code=set_code,
        color_code=color_code,
        color_label=COLOR_CODE_TO_LABEL.get(color_code, color_code),
        rarity_code=rarity,
        price=price,
        comment=comment,
        is_foil=is_foil,
    )


# -- public API ----------------------------------------------------------------

def parse_pdf(path: str | Path) -> Order:
    """Parse one Cardmarket order PDF into an Order object."""
    path = Path(path)
    full_text_parts: list[str] = []
    rows: list[list[str]] = []

    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            txt = page.extract_text() or ""
            full_text_parts.append(txt)
            for table in page.extract_tables() or []:
                for row in table:
                    if row:
                        rows.append(row)

    full_text = "\n".join(full_text_parts)
    header = _parse_header(full_text)

    cards: list[CardLine] = []
    for row in rows:
        cl = _parse_card_row(row)
        if cl is None:
            continue
        cl.buyer = header["buyer"]
        cl.buyer_name = header["buyer_name"]
        cl.sale_id = header["sale_id"]
        cards.append(cl)

    return Order(
        sale_id=header["sale_id"],
        buyer=header["buyer"],
        buyer_name=header["buyer_name"],
        seller=header["seller"],
        sent_date=header["sent_date"],
        total=header["total"],
        cards=cards,
        source_pdf=str(path),
    )


def parse_many(paths: list[str | Path]) -> list[Order]:
    """Parse a batch of PDFs."""
    return [parse_pdf(p) for p in paths]


if __name__ == "__main__":
    import sys, json
    for p in sys.argv[1:]:
        o = parse_pdf(p)
        print(f"Sale #{o.sale_id} — buyer {o.buyer} ({o.buyer_name})")
        for c in o.cards:
            foil = " ✨FOIL" if c.is_foil else ""
            print(f"  {c.quantity}× [{c.set_code}/{c.color_label}] "
                  f"#{c.number} {c.name} ({c.rarity_code}){foil}"
                  + (f"  // {c.comment!r}" if c.comment else ""))
