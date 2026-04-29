"""
theme.py — Centralized look & feel.

Loaded once at app startup via `apply_theme(root)`. Modifies ttk styles
in place. Colors inspired by Lorcana's warm gold + deep blue palette.

Why custom ttk styles instead of a third-party theme package
------------------------------------------------------------
Keeps the .exe small and removes a dependency. ttk's "clam" base theme
is the most flexible to override on Windows.
"""

from __future__ import annotations

import tkinter as tk
from tkinter import font as tkfont, ttk


# ---------------------------------------------------------------------------
# Color palette
# ---------------------------------------------------------------------------

class C:
    """All UI colors live here; reference them everywhere."""
    # Backgrounds
    BG_APP        = "#f7f5f0"      # warm off-white, easy on the eyes
    BG_SURFACE    = "#ffffff"      # cards, panels
    BG_SURFACE_2  = "#fbf8f1"      # subtle alt rows
    BG_HEADER     = "#1f2937"      # deep blue-gray, for top banners
    BG_SIDEBAR    = "#ede8dc"      # gentle warm gray for left panels

    # Text
    TEXT_PRIMARY    = "#1f2937"
    TEXT_SECONDARY  = "#6b7280"
    TEXT_MUTED      = "#9ca3af"
    TEXT_ON_DARK    = "#f9fafb"
    TEXT_ON_ACCENT  = "#ffffff"

    # Accent (Lorcana-ish gold)
    ACCENT          = "#c9982e"
    ACCENT_HOVER    = "#b08423"
    ACCENT_LIGHT    = "#f5e9c3"

    # Status colors
    OK              = "#16a34a"
    OK_LIGHT        = "#dcfce7"
    WARN            = "#d97706"
    WARN_LIGHT      = "#fef3c7"
    DANGER          = "#dc2626"
    INFO            = "#2563eb"
    INFO_LIGHT      = "#dbeafe"

    # Borders / separators
    BORDER          = "#e5e7eb"
    BORDER_STRONG   = "#d1d5db"

    # Lorcana ink colors (used as accents on locations/sections)
    AMBER     = "#f5c945"
    AMETHYST  = "#b569d6"
    EMERALD   = "#3fae6e"
    RUBY      = "#d94c4c"
    SAPPHIRE  = "#3b8fd6"
    STEEL     = "#9aa3ad"


INK_COLORS = {
    "Amber":    C.AMBER,
    "Amethyst": C.AMETHYST,
    "Emerald":  C.EMERALD,
    "Ruby":     C.RUBY,
    "Sapphire": C.SAPPHIRE,
    "Steel":    C.STEEL,
}


# ---------------------------------------------------------------------------
# Fonts
# ---------------------------------------------------------------------------

class F:
    """Named fonts. Initialized in apply_theme()."""
    base: tkfont.Font          # default app font
    base_bold: tkfont.Font
    small: tkfont.Font
    small_bold: tkfont.Font
    h1: tkfont.Font            # tab pane titles
    h2: tkfont.Font            # section banners
    h3: tkfont.Font            # row titles
    badge: tkfont.Font         # large numeric badges
    caption: tkfont.Font       # tag chips, helper text


def _pick_family() -> str:
    """Pick the nicest available system UI font."""
    available = set(tkfont.families())
    for family in ("Segoe UI", "SF Pro Text", "Helvetica Neue",
                   "Inter", "Cantarell", "DejaVu Sans"):
        if family in available:
            return family
    return "TkDefaultFont"


# ---------------------------------------------------------------------------
# Theme application
# ---------------------------------------------------------------------------

def apply_theme(root: tk.Tk) -> None:
    """Apply the Lorcana Picking Tool theme to the entire app."""
    family = _pick_family()

    # Initialize the F.* fonts (must happen after a Tk root exists)
    F.base       = tkfont.Font(family=family, size=10)
    F.base_bold  = tkfont.Font(family=family, size=10, weight="bold")
    F.small      = tkfont.Font(family=family, size=9)
    F.small_bold = tkfont.Font(family=family, size=9, weight="bold")
    F.h1         = tkfont.Font(family=family, size=14, weight="bold")
    F.h2         = tkfont.Font(family=family, size=12, weight="bold")
    F.h3         = tkfont.Font(family=family, size=11, weight="bold")
    F.badge      = tkfont.Font(family=family, size=14, weight="bold")
    F.caption    = tkfont.Font(family=family, size=8)

    # Replace Tk's named "TkDefaultFont" so vanilla tk widgets pick up our font
    root.option_add("*Font", F.base)
    root.option_add("*background", C.BG_APP)

    style = ttk.Style(root)

    # 'clam' is the most flexible ttk theme on Windows for color overrides
    try:
        style.theme_use("clam")
    except tk.TclError:
        pass

    # Window background
    root.configure(background=C.BG_APP)

    # ----- Generic widgets -----
    style.configure(".",
                    background=C.BG_APP, foreground=C.TEXT_PRIMARY,
                    font=F.base, borderwidth=0)

    style.configure("TFrame", background=C.BG_APP)
    style.configure("TLabel", background=C.BG_APP, foreground=C.TEXT_PRIMARY,
                    font=F.base)
    style.configure("Muted.TLabel", foreground=C.TEXT_SECONDARY, font=F.small)
    style.configure("Caption.TLabel", foreground=C.TEXT_MUTED, font=F.caption)
    style.configure("H1.TLabel", font=F.h1, foreground=C.TEXT_PRIMARY)
    style.configure("H2.TLabel", font=F.h2, foreground=C.TEXT_PRIMARY)
    style.configure("H3.TLabel", font=F.h3, foreground=C.TEXT_PRIMARY)

    # ----- Buttons -----
    style.configure("TButton",
                    font=F.base, padding=(12, 6),
                    background=C.BG_SURFACE, foreground=C.TEXT_PRIMARY,
                    borderwidth=1, relief="flat",
                    bordercolor=C.BORDER, focusthickness=0)
    style.map("TButton",
              background=[("active", C.BG_SURFACE_2),
                          ("pressed", C.ACCENT_LIGHT),
                          ("disabled", C.BG_SURFACE)],
              bordercolor=[("active", C.ACCENT)],
              foreground=[("disabled", C.TEXT_MUTED)])

    # Primary button (CTA: "Ajouter PDF", "Enregistrer")
    style.configure("Primary.TButton",
                    font=F.base_bold, padding=(14, 7),
                    background=C.ACCENT, foreground=C.TEXT_ON_ACCENT,
                    borderwidth=0)
    style.map("Primary.TButton",
              background=[("active", C.ACCENT_HOVER),
                          ("pressed", C.ACCENT_HOVER)])

    # Danger button
    style.configure("Danger.TButton",
                    background=C.DANGER, foreground=C.TEXT_ON_ACCENT,
                    borderwidth=0, padding=(12, 6))
    style.map("Danger.TButton",
              background=[("active", "#b91c1c"), ("pressed", "#991b1b")])

    # ----- Entries / Spinboxes / Combo -----
    style.configure("TEntry",
                    fieldbackground=C.BG_SURFACE, foreground=C.TEXT_PRIMARY,
                    bordercolor=C.BORDER, lightcolor=C.BORDER,
                    darkcolor=C.BORDER, padding=4)
    style.map("TEntry",
              bordercolor=[("focus", C.ACCENT)])
    style.configure("TSpinbox",
                    fieldbackground=C.BG_SURFACE, foreground=C.TEXT_PRIMARY,
                    bordercolor=C.BORDER, padding=2, arrowsize=12)
    style.configure("TCombobox",
                    fieldbackground=C.BG_SURFACE, foreground=C.TEXT_PRIMARY,
                    bordercolor=C.BORDER, padding=2, arrowsize=12)

    # ----- Checkbutton / Radiobutton -----
    style.configure("TCheckbutton",
                    background=C.BG_APP, foreground=C.TEXT_PRIMARY,
                    indicatorcolor=C.BG_SURFACE,
                    font=F.base, padding=2)
    style.map("TCheckbutton",
              indicatorcolor=[("selected", C.ACCENT),
                              ("active", C.BG_SURFACE_2)])
    style.configure("TRadiobutton",
                    background=C.BG_APP, foreground=C.TEXT_PRIMARY,
                    font=F.base)
    style.map("TRadiobutton",
              indicatorcolor=[("selected", C.ACCENT)])

    # ----- Notebook (tabs) -----
    style.configure("TNotebook",
                    background=C.BG_APP, borderwidth=0, tabmargins=(4, 4, 4, 0))
    style.configure("TNotebook.Tab",
                    background=C.BG_SIDEBAR, foreground=C.TEXT_SECONDARY,
                    font=F.base_bold, padding=(18, 10),
                    borderwidth=0)
    style.map("TNotebook.Tab",
              background=[("selected", C.BG_SURFACE),
                          ("active", C.BG_SURFACE_2)],
              foreground=[("selected", C.ACCENT),
                          ("active", C.TEXT_PRIMARY)],
              expand=[("selected", (0, 0, 0, 1))])

    # ----- Treeview (used heavily for tables) -----
    style.configure("Treeview",
                    background=C.BG_SURFACE,
                    fieldbackground=C.BG_SURFACE,
                    foreground=C.TEXT_PRIMARY,
                    rowheight=26, borderwidth=0,
                    font=F.base)
    style.configure("Treeview.Heading",
                    background=C.BG_SIDEBAR,
                    foreground=C.TEXT_PRIMARY,
                    font=F.small_bold,
                    padding=(8, 6),
                    relief="flat", borderwidth=0)
    style.map("Treeview.Heading",
              background=[("active", C.ACCENT_LIGHT)])
    style.map("Treeview",
              background=[("selected", C.ACCENT_LIGHT)],
              foreground=[("selected", C.TEXT_PRIMARY)])

    # ----- Separator -----
    style.configure("TSeparator", background=C.BORDER)

    # ----- Scrollbar -----
    style.configure("Vertical.TScrollbar",
                    background=C.BG_SIDEBAR, troughcolor=C.BG_APP,
                    bordercolor=C.BG_APP, arrowcolor=C.TEXT_SECONDARY,
                    relief="flat")
    style.configure("Horizontal.TScrollbar",
                    background=C.BG_SIDEBAR, troughcolor=C.BG_APP,
                    bordercolor=C.BG_APP, arrowcolor=C.TEXT_SECONDARY,
                    relief="flat")

    # ----- Progressbar -----
    style.configure("TProgressbar",
                    background=C.ACCENT, troughcolor=C.BG_SIDEBAR,
                    bordercolor=C.BG_SIDEBAR, lightcolor=C.ACCENT,
                    darkcolor=C.ACCENT, thickness=10)
    # Variant: green when complete
    style.configure("Done.Horizontal.TProgressbar",
                    background=C.OK, troughcolor=C.BG_SIDEBAR,
                    bordercolor=C.BG_SIDEBAR, lightcolor=C.OK,
                    darkcolor=C.OK, thickness=10)

    # ----- Panedwindow sash -----
    style.configure("TPanedwindow", background=C.BG_APP)
    style.configure("Sash", sashthickness=6, gripcount=0,
                    background=C.BG_SIDEBAR)


# ---------------------------------------------------------------------------
# Helper widgets used throughout the app
# ---------------------------------------------------------------------------

def make_card(parent, *, padding: int = 10, **kwargs) -> tk.Frame:
    """A subtle elevated 'card' container — used everywhere as a panel."""
    f = tk.Frame(parent, background=C.BG_SURFACE,
                  highlightbackground=C.BORDER, highlightthickness=1, **kwargs)
    inner = tk.Frame(f, background=C.BG_SURFACE, padx=padding, pady=padding)
    inner.pack(fill=tk.BOTH, expand=True)
    f.inner = inner    # type: ignore[attr-defined]
    return f


def make_badge(parent, text: str, *, bg: str = C.ACCENT,
               fg: str = C.TEXT_ON_ACCENT, font=None) -> tk.Label:
    """A small colored badge label, e.g. for quantities and tags."""
    return tk.Label(parent, text=text, background=bg, foreground=fg,
                    font=font or F.small_bold, padx=8, pady=2)


def make_chip(parent, text: str) -> tk.Label:
    """A pill-shaped neutral chip, used for tags."""
    return tk.Label(parent, text=f" {text} ", background=C.ACCENT_LIGHT,
                    foreground="#7c5d12", font=F.caption, padx=4, pady=1)
