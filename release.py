"""
release.py — Build a release package for GitHub.

Run from the project folder:

    python release.py 0.5

This produces in `release_output/`:
    - lorcana_v0.5.zip       (all the .py files + theme.py + etc.)
    - manifest.json          (declares each file with its SHA-256)

Then on GitHub:
    1. Bump the VERSION file (commit it).
    2. Create a new Release with tag 'v0.5'.
    3. Upload BOTH `lorcana_v0.5.zip` AND `manifest.json` as release assets.
    4. Publish.

Users' apps will detect the new release at next startup.

What gets included
------------------
- All .py files in the project root
- VERSION file
- README.md, BUILD_WINDOWS.md, PUBLISHING_UPDATES.md (docs)
- requirements.txt, lorcana_picking.spec, build_exe.bat (rebuild support)

What gets EXCLUDED (never patched on user machines)
---------------------------------------------------
- config.json, locations.json, tags.json, history.json (user data)
- update_config.json (user-customized)
- cache/, backups/, versions_backup/, dist/, build/, __pycache__/
"""

from __future__ import annotations

import sys
import zipfile
from pathlib import Path

from updater import build_manifest, PROTECTED_FILES, PROTECTED_DIRS


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage : python release.py <version>")
        print("Exemple : python release.py 0.5")
        return 1

    version = sys.argv[1].lstrip("v").strip()
    here = Path(__file__).parent
    out_dir = here / "release_output"
    out_dir.mkdir(exist_ok=True)

    # Collect files
    include_extensions = {".py", ".md", ".txt", ".spec", ".bat", ""}  # "" for VERSION
    excluded_files = PROTECTED_FILES | {"release.py", "update_config.json"}

    files_to_include: dict[str, Path] = {}
    for p in sorted(here.iterdir()):
        if not p.is_file():
            continue
        if p.name in excluded_files:
            continue
        # Match VERSION (no extension) or known doc/code extensions
        if p.suffix not in include_extensions and p.name != "VERSION":
            continue
        files_to_include[p.name] = p

    if not files_to_include:
        print("Aucun fichier a inclure. Vérifie que tu es dans le bon dossier.")
        return 1

    print(f"Construction de la release v{version}...")
    print(f"Fichiers inclus ({len(files_to_include)}) :")
    for name in files_to_include:
        print(f"  - {name}")

    # Optional release notes from a CHANGELOG.md if present, or stdin
    notes = ""
    cl = here / "CHANGELOG.md"
    if cl.exists():
        # Take the first section of the changelog
        content = cl.read_text("utf-8")
        notes = content[:1500]
    else:
        print("\nNotes de version (optionnel, fin avec Ctrl-D ou Ctrl-Z+Enter sous Windows) :")
        try:
            notes = sys.stdin.read().strip()
        except KeyboardInterrupt:
            notes = ""

    # 1) Build the zip
    zip_path = out_dir / f"lorcana_v{version}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for arcname, path in files_to_include.items():
            zf.write(path, arcname)
    print(f"\n[OK] Zip cree : {zip_path}")

    # 2) Build the manifest
    manifest = build_manifest(version, files_to_include, release_notes=notes)
    manifest_path = out_dir / "manifest.json"
    import json
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), "utf-8")
    print(f"[OK] Manifest cree : {manifest_path}")
    print(f"     ({len(manifest['files'])} fichiers signes en SHA-256)")

    print("\n=================================================================")
    print(f"  Release v{version} prete !")
    print("=================================================================")
    print()
    print("Etapes suivantes (a faire UNE FOIS) :")
    print()
    print("  1. Modifie VERSION pour mettre", version)
    print("  2. Commit + push sur GitHub")
    print(f"     git add VERSION && git commit -m 'v{version}' && git push")
    print(f"     git tag v{version} && git push --tags")
    print()
    print("  3. Sur https://github.com/<toi>/<repo>/releases :")
    print(f"     - Cree une nouvelle release pour le tag v{version}")
    print(f"     - Upload CES DEUX fichiers comme assets :")
    print(f"         {zip_path}")
    print(f"         {manifest_path}")
    print(f"     - Clique 'Publish release'")
    print()
    print("Les utilisateurs verront la mise a jour au prochain demarrage.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
