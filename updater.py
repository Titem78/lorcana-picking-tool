"""
updater.py — Self-update system using GitHub Releases.

How it works
------------
1. App reads `update_config.json` to find the GitHub repo to check.
2. Calls https://api.github.com/repos/<owner>/<repo>/releases/latest
   → gets the latest tag name (e.g. "v0.4") and the list of release assets.
3. Compares with the local VERSION file.
4. If a newer version exists, the user is shown a banner. On confirm:
   a. Downloads the release zip + its `manifest.json`
   b. Verifies that every file inside the zip matches the SHA-256 hash
      declared in the manifest. ANY mismatch aborts the update.
   c. Backs up the current `.py` files to `versions_backup/v_<old>_<timestamp>/`
   d. Writes the new files in place
   e. Rewrites the local VERSION file
   f. On any unexpected error during write → rollback from the backup.
5. App must be restarted for changes to take effect (Tk-loaded modules
   stay cached until process exits).

Manifest format (JSON file inside the release zip)
--------------------------------------------------
{
  "version": "0.4",
  "released_at": "2026-05-15T10:00:00",
  "min_app_version": "0.3",
  "release_notes": "Bug fixes and a new feature",
  "files": {
    "app.py":      "<sha256-hex>",
    "picking.py":  "<sha256-hex>",
    "theme.py":    "<sha256-hex>",
    ...
  }
}

Files NOT in `files` are left untouched on the user's disk. So the
manifest is also the way to ship partial updates ("just app.py changed").

Files that the user owns (config.json, locations.json, tags.json,
history.json, cache/, backups/, versions_backup/) are NEVER overwritten.
"""

from __future__ import annotations

import hashlib
import io
import json
import shutil
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

USER_AGENT = "LorcanaPickingTool-Updater/1.0"
REQUEST_TIMEOUT = 20  # seconds
GITHUB_API = "https://api.github.com"
MANIFEST_NAME = "manifest.json"

# Files we will NEVER overwrite even if they're in the release zip.
# These belong to the user.
PROTECTED_FILES = {
    "config.json",
    "locations.json",
    "tags.json",
    "history.json",
    "update_config.json",   # contains user's repo URL, don't overwrite
    "VERSION",              # we write this ourselves
}
PROTECTED_DIRS = {
    "cache",
    "backups",
    "versions_backup",
    "dist", "build",        # PyInstaller output
    "__pycache__",
}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class UpdateInfo:
    """What we know about an available update."""
    available: bool
    current_version: str
    latest_version: str
    release_notes: str = ""
    release_url: str = ""
    asset_zip_url: str = ""
    asset_manifest_url: str = ""
    error: str = ""           # populated when we couldn't check (offline, etc.)

    @property
    def is_error(self) -> bool:
        return bool(self.error)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def read_local_version(here: Path) -> str:
    """Read the local VERSION file. Falls back to '0.0' if missing/invalid."""
    f = here / "VERSION"
    if not f.exists():
        return "0.0"
    return f.read_text("utf-8").strip() or "0.0"


def read_update_config(here: Path) -> dict:
    """Load update_config.json. Returns {} if missing."""
    f = here / "update_config.json"
    if not f.exists():
        return {}
    try:
        return json.loads(f.read_text("utf-8"))
    except json.JSONDecodeError:
        return {}


def check_for_update(here: Path) -> UpdateInfo:
    """
    Query GitHub for the latest release. Returns an UpdateInfo describing
    whether an update is available; on network errors, returns
    UpdateInfo(error=...) instead of raising.
    """
    cfg = read_update_config(here)
    owner = cfg.get("github_owner")
    repo = cfg.get("github_repo")
    if not owner or not repo:
        return UpdateInfo(False, read_local_version(here), "",
                          error="Le fichier update_config.json est absent ou incomplet "
                                "(clés 'github_owner' et 'github_repo' requises).")

    url = f"{GITHUB_API}/repos/{owner}/{repo}/releases/latest"
    try:
        data = _http_get_json(url)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return UpdateInfo(False, read_local_version(here), "",
                              error=f"Aucune release publiée sur {owner}/{repo}.")
        return UpdateInfo(False, read_local_version(here), "",
                          error=f"Erreur HTTP {e.code} en interrogeant GitHub.")
    except (urllib.error.URLError, TimeoutError) as e:
        return UpdateInfo(False, read_local_version(here), "",
                          error=f"Pas de connexion à GitHub : {e}")
    except Exception as e:
        return UpdateInfo(False, read_local_version(here), "",
                          error=f"Erreur inattendue : {e}")

    latest_tag = (data.get("tag_name") or "").lstrip("v").strip()
    if not latest_tag:
        return UpdateInfo(False, read_local_version(here), "",
                          error="La release GitHub n'a pas de numéro de version.")

    # Find assets we need: a .zip and the manifest.json
    zip_url = ""
    manifest_url = ""
    for asset in data.get("assets") or []:
        name = asset.get("name", "")
        url = asset.get("browser_download_url", "")
        if name.endswith(".zip"):
            zip_url = url
        elif name == MANIFEST_NAME:
            manifest_url = url

    if not zip_url or not manifest_url:
        return UpdateInfo(False, read_local_version(here), latest_tag,
                          release_url=data.get("html_url", ""),
                          error=f"La release v{latest_tag} ne contient pas les fichiers "
                                f"requis (un .zip et {MANIFEST_NAME}).")

    current = read_local_version(here)
    available = _version_tuple(latest_tag) > _version_tuple(current)

    return UpdateInfo(
        available=available,
        current_version=current,
        latest_version=latest_tag,
        release_notes=(data.get("body") or "")[:2000],
        release_url=data.get("html_url", ""),
        asset_zip_url=zip_url,
        asset_manifest_url=manifest_url,
    )


def apply_update(info: UpdateInfo, here: Path,
                 progress_cb=None) -> tuple[bool, str]:
    """
    Download, verify, and install the update described by `info`.

    progress_cb: optional callable(step:str, pct:int)

    Returns (ok, message). On failure, attempts to roll back any partial
    changes from the backup.
    """
    def progress(step: str, pct: int) -> None:
        if progress_cb:
            try:
                progress_cb(step, pct)
            except Exception:
                pass

    if not info.available or not info.asset_zip_url or not info.asset_manifest_url:
        return False, "Pas de mise à jour à appliquer."

    try:
        # 1) download manifest
        progress("Téléchargement du manifest…", 5)
        manifest_bytes = _http_get_bytes(info.asset_manifest_url)
        try:
            manifest = json.loads(manifest_bytes.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            return False, f"Manifest invalide : {e}"

        if not isinstance(manifest.get("files"), dict) or not manifest["files"]:
            return False, "Le manifest ne contient pas de liste de fichiers."

        manifest_version = str(manifest.get("version", "")).lstrip("v").strip()
        if manifest_version != info.latest_version:
            return False, (f"Incohérence de version : tag GitHub v{info.latest_version}, "
                           f"manifest v{manifest_version}.")

        # 2) download zip
        progress("Téléchargement de la mise à jour…", 25)
        zip_bytes = _http_get_bytes(info.asset_zip_url)

        # 3) extract to memory + verify each file's SHA-256
        progress("Vérification des signatures…", 55)
        extracted: dict[str, bytes] = {}   # arcname -> bytes
        try:
            with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
                for arcname in zf.namelist():
                    # ignore folders + protected names
                    if arcname.endswith("/"):
                        continue
                    if _is_protected(arcname):
                        continue
                    if arcname not in manifest["files"]:
                        # Files not declared in the manifest are silently skipped.
                        # This is intentional: only what's signed gets installed.
                        continue
                    data = zf.read(arcname)
                    expected = manifest["files"][arcname].lower().strip()
                    actual = hashlib.sha256(data).hexdigest()
                    if actual != expected:
                        return False, (f"Échec de vérification SHA-256 pour {arcname}.\n"
                                       f"Attendu : {expected}\nObtenu  : {actual}\n"
                                       "Mise à jour abandonnée.")
                    extracted[arcname] = data
        except zipfile.BadZipFile:
            return False, "Le fichier téléchargé n'est pas un zip valide."

        # Sanity check: every file declared in manifest must be present in zip
        missing = set(manifest["files"]) - set(extracted)
        if missing:
            return False, ("Le zip ne contient pas tous les fichiers du manifest :\n"
                           + ", ".join(sorted(missing)))

        if not extracted:
            return False, "Aucun fichier installable dans la mise à jour."

        # 4) backup current files we're about to overwrite
        progress("Sauvegarde de la version actuelle…", 75)
        backup_dir = _backup_current(here, list(extracted.keys()),
                                      old_version=info.current_version)

        # 5) write new files in place
        progress("Installation…", 90)
        try:
            for arcname, data in extracted.items():
                target = here / arcname
                target.parent.mkdir(parents=True, exist_ok=True)
                tmp = target.with_suffix(target.suffix + ".tmp")
                tmp.write_bytes(data)
                tmp.replace(target)
            # update VERSION
            (here / "VERSION").write_text(info.latest_version, "utf-8")
        except Exception as e:
            # ROLLBACK
            _rollback(here, backup_dir)
            return False, (f"Erreur pendant l'écriture : {e}\n"
                           f"L'ancienne version a été restaurée.")

        progress("Mise à jour terminée !", 100)
        notes = manifest.get("release_notes") or info.release_notes or ""
        return True, (f"Mise à jour vers v{info.latest_version} installée.\n\n"
                      f"Sauvegarde de l'ancienne version : {backup_dir.name}\n\n"
                      f"Redémarre l'application pour que les changements prennent effet."
                      + (f"\n\nNotes de version :\n{notes}" if notes else ""))

    except Exception as e:
        return False, f"Erreur inattendue pendant la mise à jour : {e}"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _version_tuple(v: str) -> tuple:
    """Parse '1.2.3' or 'v0.4' into a sortable tuple. Unknowns become 0."""
    v = (v or "").lstrip("v").strip()
    parts: list[int] = []
    for chunk in v.split("."):
        digits = "".join(ch for ch in chunk if ch.isdigit())
        try:
            parts.append(int(digits) if digits else 0)
        except ValueError:
            parts.append(0)
    # Pad to length 4 so (1,2) < (1,2,1)
    while len(parts) < 4:
        parts.append(0)
    return tuple(parts)


def _is_protected(arcname: str) -> bool:
    """Return True if the arcname must NEVER be written by the updater."""
    name = arcname.replace("\\", "/")
    # Refuse absolute paths and any path-traversal segment up-front
    if name.startswith("/"):
        return True
    parts = [p for p in name.split("/") if p]   # drop empty segments
    if any(p == ".." for p in parts):
        return True
    if not parts:
        return True
    # Strip leading "./" then check first segment + filename
    if parts[0] == ".":
        parts = parts[1:]
    if not parts:
        return True
    if parts[0] in PROTECTED_DIRS:
        return True
    if "/".join(parts) in PROTECTED_FILES or parts[-1] in PROTECTED_FILES:
        return True
    return False


def _http_get_json(url: str) -> dict:
    req = urllib.request.Request(
        url, headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/vnd.github+json",
        })
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as r:
        return json.loads(r.read())


def _http_get_bytes(url: str) -> bytes:
    req = urllib.request.Request(
        url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as r:
        return r.read()


def _backup_current(here: Path, files: list[str], old_version: str) -> Path:
    """Copy each file (if it exists) into versions_backup/v<old>_<timestamp>/."""
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = here / "versions_backup" / f"v{old_version}_{stamp}"
    backup_dir.mkdir(parents=True, exist_ok=True)
    for f in files:
        src = here / f
        if src.exists():
            dst = backup_dir / f
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
    # Also backup VERSION
    if (here / "VERSION").exists():
        shutil.copy2(here / "VERSION", backup_dir / "VERSION")
    return backup_dir


def _rollback(here: Path, backup_dir: Path) -> None:
    """Copy every file from backup_dir back into here."""
    if not backup_dir or not backup_dir.exists():
        return
    for src in backup_dir.rglob("*"):
        if src.is_dir():
            continue
        rel = src.relative_to(backup_dir)
        dst = here / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


# ---------------------------------------------------------------------------
# Manifest builder (used when YOU publish a new version)
# ---------------------------------------------------------------------------

def build_manifest(version: str, files: dict[str, Path],
                   release_notes: str = "") -> dict:
    """
    Compute SHA-256 hashes of each file and assemble a manifest dict.
    Use this in your release script to generate manifest.json.
    """
    out_files: dict[str, str] = {}
    for arcname, path in files.items():
        out_files[arcname] = hashlib.sha256(Path(path).read_bytes()).hexdigest()
    return {
        "version": version.lstrip("v"),
        "released_at": datetime.now().isoformat(timespec="seconds"),
        "release_notes": release_notes,
        "files": out_files,
    }
