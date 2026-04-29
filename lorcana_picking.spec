# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for Lorcana Picking Tool.

Build with:
    pyinstaller lorcana_picking.spec --noconfirm

Output:
    dist/LorcanaPicking/LorcanaPicking.exe   (+ supporting files)

Why a folder build (not --onefile):
  - Faster startup (no extraction to %TEMP% on each launch)
  - Easier to inspect / antivirus-trust
  - The whole `dist/LorcanaPicking/` folder is portable: copy it anywhere.
"""

import sys
from pathlib import Path

block_cipher = None

# Hidden imports that PyInstaller's static analysis might miss.
hidden = [
    'pillow_avif',          # AVIF decoder for Lorcast images
    'pdfplumber',
    'PIL._tkinter_finder',  # sometimes needed for Tk image rendering
]

a = Analysis(
    ['app.py'],
    pathex=[],
    binaries=[],
    # Bundle the default config so first launch is not totally empty.
    # User data (locations.json, tags.json, cache/) is created next to the
    # .exe at runtime, never inside the bundle.
    datas=[
        ('config.json', '.'),
        ('update_config.json', '.'),
        ('VERSION', '.'),
        ('README.md', '.'),
    ],
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Trim some heavy stuff we don't use to keep the .exe smaller.
        'matplotlib',
        'numpy.random._examples',
        'pytest',
        'pandas',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='LorcanaPicking',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,           # GUI app: no console window on launch
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    # icon='icon.ico',       # uncomment if you add an icon file later
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='LorcanaPicking',
)
