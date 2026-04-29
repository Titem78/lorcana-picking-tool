"""
backup.py — Export / Import / Auto-backup of all user data.

Bundle format (single JSON file)
--------------------------------
{
  "format": "lorcana_picking_backup",
  "version": 1,
  "created_at": "2026-04-29T20:30:00",
  "app_version": "0.3",
  "contents": {
    "config":     {...} | null,   # what's in config.json
    "locations":  {...} | null,   # what's in locations.json
    "tags":       {...} | null,   # what's in tags.json
    "history":    {...} | null    # what's in history.json
  }
}

`null` means the user chose not to include that section.

Import strategies (per section)
-------------------------------
- "replace": discard current data, use imported data
- "merge"  : add imported items to current data (deduped where applicable)
- "ignore" : skip this section, keep current data

Auto-backup
-----------
On app launch, we check if a backup for "today" already exists in
`backups/`. If not, we copy all current data files there with a
date-stamped name. We keep the N most recent (default 30).
"""

from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path


BUNDLE_FORMAT = "lorcana_picking_backup"
BUNDLE_VERSION = 1
APP_VERSION = "0.3"

# Section names shown in dialogs
SECTION_CONFIG = "config"
SECTION_LOCATIONS = "locations"
SECTION_TAGS = "tags"
SECTION_HISTORY = "history"
ALL_SECTIONS = [SECTION_CONFIG, SECTION_LOCATIONS, SECTION_TAGS, SECTION_HISTORY]

SECTION_LABELS = {
    SECTION_CONFIG: "Options d'affichage (config)",
    SECTION_LOCATIONS: "Emplacements et règles",
    SECTION_TAGS: "Tags par carte",
    SECTION_HISTORY: "Historique des commandes",
}

# Strategies
STRATEGY_REPLACE = "replace"
STRATEGY_MERGE = "merge"
STRATEGY_IGNORE = "ignore"
STRATEGY_LABELS = {
    STRATEGY_REPLACE: "Remplacer (efface l'existant)",
    STRATEGY_MERGE: "Fusionner avec l'existant",
    STRATEGY_IGNORE: "Ignorer (ne rien faire)",
}


# =====================================================================
# Export
# =====================================================================

def build_bundle(
    *,
    here: Path,
    include_config: bool = True,
    include_locations: bool = True,
    include_tags: bool = True,
    include_history: bool = True,
) -> dict:
    """Read selected files from disk and assemble a portable bundle dict."""
    contents = {
        SECTION_CONFIG: _read_json(here / "config.json") if include_config else None,
        SECTION_LOCATIONS: _read_json(here / "locations.json") if include_locations else None,
        SECTION_TAGS: _read_json(here / "tags.json") if include_tags else None,
        SECTION_HISTORY: _read_json(here / "history.json") if include_history else None,
    }
    return {
        "format": BUNDLE_FORMAT,
        "version": BUNDLE_VERSION,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "app_version": APP_VERSION,
        "contents": contents,
    }


def export_to_file(bundle: dict, path: str | Path) -> None:
    """Write a bundle dict to disk as a pretty JSON file."""
    Path(path).write_text(
        json.dumps(bundle, indent=2, ensure_ascii=False), "utf-8"
    )


# =====================================================================
# Import
# =====================================================================

def load_bundle(path: str | Path) -> dict:
    """Read & validate a bundle file. Raises ValueError if not a valid bundle."""
    data = json.loads(Path(path).read_text("utf-8"))
    if data.get("format") != BUNDLE_FORMAT:
        raise ValueError(
            f"Ce fichier n'est pas une sauvegarde Lorcana Picking Tool valide.\n"
            f"Format attendu: {BUNDLE_FORMAT!r}, trouvé: {data.get('format')!r}")
    if data.get("version", 0) > BUNDLE_VERSION:
        raise ValueError(
            f"Cette sauvegarde a été créée avec une version plus récente "
            f"(v{data['version']}). Mets à jour le logiciel.")
    return data


def describe_bundle(bundle: dict) -> dict[str, str]:
    """One-line summary of what each section of the bundle contains."""
    out: dict[str, str] = {}
    contents = bundle.get("contents", {})
    for s in ALL_SECTIONS:
        d = contents.get(s)
        if d is None:
            out[s] = "(non inclus)"
        elif s == SECTION_CONFIG:
            out[s] = f"{len(d)} option(s)"
        elif s == SECTION_LOCATIONS:
            out[s] = f"{len(d.get('locations', []))} emplacement(s)"
        elif s == SECTION_TAGS:
            out[s] = f"{sum(len(v) for v in d.values())} tag(s) sur {len(d)} carte(s)"
        elif s == SECTION_HISTORY:
            out[s] = f"{len(d.get('orders', []))} commande(s)"
        else:
            out[s] = "?"
    return out


def apply_bundle(
    bundle: dict,
    here: Path,
    *,
    strategy_config: str = STRATEGY_IGNORE,
    strategy_locations: str = STRATEGY_IGNORE,
    strategy_tags: str = STRATEGY_IGNORE,
    strategy_history: str = STRATEGY_IGNORE,
) -> dict[str, str]:
    """
    Apply each section of the bundle according to its strategy. Returns a
    summary dict {section: human_message}.
    """
    contents = bundle.get("contents", {})
    summary: dict[str, str] = {}

    # config — always REPLACE if present (it's just a dict of options)
    if contents.get(SECTION_CONFIG) is not None and strategy_config != STRATEGY_IGNORE:
        if strategy_config == STRATEGY_MERGE:
            current = _read_json(here / "config.json") or {}
            current.update(contents[SECTION_CONFIG])
            _write_json(here / "config.json", current)
            summary[SECTION_CONFIG] = "Options fusionnées."
        else:  # REPLACE
            _write_json(here / "config.json", contents[SECTION_CONFIG])
            summary[SECTION_CONFIG] = "Options remplacées."

    # locations
    if contents.get(SECTION_LOCATIONS) is not None and strategy_locations != STRATEGY_IGNORE:
        if strategy_locations == STRATEGY_MERGE:
            cur = _read_json(here / "locations.json") or {"locations": []}
            existing_ids = {l.get("id") for l in cur.get("locations", [])}
            existing_names = {l.get("name") for l in cur.get("locations", [])}
            added = 0
            for loc in contents[SECTION_LOCATIONS].get("locations", []):
                # Skip if same id exists, or rename if name clashes
                if loc.get("id") in existing_ids:
                    continue
                if loc.get("name") in existing_names:
                    loc["name"] = loc["name"] + " (importé)"
                cur["locations"].append(loc)
                added += 1
            _write_json(here / "locations.json", cur)
            summary[SECTION_LOCATIONS] = f"{added} emplacement(s) ajouté(s)."
        else:  # REPLACE
            _write_json(here / "locations.json", contents[SECTION_LOCATIONS])
            n = len(contents[SECTION_LOCATIONS].get("locations", []))
            summary[SECTION_LOCATIONS] = f"{n} emplacement(s) importé(s) (remplacement)."

    # tags
    if contents.get(SECTION_TAGS) is not None and strategy_tags != STRATEGY_IGNORE:
        if strategy_tags == STRATEGY_MERGE:
            cur = _read_json(here / "tags.json") or {}
            for card_key, tags in contents[SECTION_TAGS].items():
                merged = sorted(set(cur.get(card_key, [])) | set(tags))
                cur[card_key] = merged
            _write_json(here / "tags.json", cur)
            summary[SECTION_TAGS] = f"Tags fusionnés ({len(cur)} cartes)."
        else:  # REPLACE
            _write_json(here / "tags.json", contents[SECTION_TAGS])
            summary[SECTION_TAGS] = f"Tags remplacés ({len(contents[SECTION_TAGS])} cartes)."

    # history
    if contents.get(SECTION_HISTORY) is not None and strategy_history != STRATEGY_IGNORE:
        if strategy_history == STRATEGY_MERGE:
            cur = _read_json(here / "history.json") or {"orders": []}
            existing_uids = {o.get("uid") for o in cur.get("orders", [])}
            existing_sales = {o.get("sale_id") for o in cur.get("orders", []) if o.get("sale_id")}
            added = 0
            for order in contents[SECTION_HISTORY].get("orders", []):
                if order.get("uid") in existing_uids:
                    continue
                if order.get("sale_id") and order["sale_id"] in existing_sales:
                    continue   # same sale already known, don't dup
                cur["orders"].append(order)
                added += 1
            _write_json(here / "history.json", cur)
            summary[SECTION_HISTORY] = f"{added} commande(s) ajoutée(s)."
        else:  # REPLACE
            _write_json(here / "history.json", contents[SECTION_HISTORY])
            n = len(contents[SECTION_HISTORY].get("orders", []))
            summary[SECTION_HISTORY] = f"{n} commande(s) importée(s) (remplacement)."

    return summary


# =====================================================================
# Auto-backup
# =====================================================================

def auto_backup_today(here: Path, keep_last: int = 30) -> Path | None:
    """
    Once per day, snapshot all data files into `here/backups/<date>/`.
    Returns the backup folder if a backup was created (else None).
    Also prunes old backups beyond `keep_last`.
    """
    backups_dir = here / "backups"
    backups_dir.mkdir(exist_ok=True)
    today_str = datetime.now().strftime("%Y-%m-%d")
    today_dir = backups_dir / today_str

    created = False
    if not today_dir.exists():
        today_dir.mkdir(parents=True, exist_ok=True)
        for fname in ["config.json", "locations.json", "tags.json", "history.json"]:
            src = here / fname
            if src.exists():
                shutil.copy2(src, today_dir / fname)
        created = True

    # prune old backups
    all_dirs = sorted(
        [d for d in backups_dir.iterdir() if d.is_dir()],
        key=lambda d: d.name,
        reverse=True,
    )
    for old in all_dirs[keep_last:]:
        try:
            shutil.rmtree(old)
        except OSError:
            pass

    return today_dir if created else None


def list_backups(here: Path) -> list[tuple[str, Path]]:
    """List existing backup folders, newest first. [(date_str, path), ...]"""
    backups_dir = here / "backups"
    if not backups_dir.exists():
        return []
    out: list[tuple[str, Path]] = []
    for d in sorted(backups_dir.iterdir(), key=lambda p: p.name, reverse=True):
        if d.is_dir():
            out.append((d.name, d))
    return out


# =====================================================================
# Internal helpers
# =====================================================================

def _read_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text("utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def _write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), "utf-8")
    tmp.replace(path)
