"""
app.py — Lorcana Picking Tool — Tkinter desktop UI.

Run:
    python app.py

Tabs
----
1. Picking       — drop your PDFs, see the optimized picking list grouped
                   by physical location (in your custom order).
2. Emplacements  — define your physical storage rules (which cards go where).
3. Tags          — manage per-card tags (e.g. "collec perso", "à vendre vite").
4. Options       — display & behavior settings.

All data persists between launches in:
    config.json        — display & behavior options
    locations.json     — your locations & rules
    tags.json          — per-card tags
    cache/             — Lorcast API responses + downloaded card images
"""

from __future__ import annotations

import csv
import io
import json
import threading
import tkinter as tk
import traceback
from pathlib import Path
from tkinter import colorchooser, filedialog, messagebox, simpledialog, ttk

from parser import Order, parse_pdf
from lorcast import LorcastClient
from picking import (
    DEFAULT_COLOR_ORDER,
    PickingEntry,
    PickingSection,
    build_picking,
    build_picking_from_records,
)
from locations import (
    LocationStore,
    Location,
    Rule,
    RARITIES,
    parse_chapters_input,
    _compact_int_ranges,
)
from tags import TagStore
from history import (
    HistoryStore, OrderRecord,
    STATUS_TO_PICK, STATUS_IN_PROGRESS, STATUS_SENT,
)
from theme import (
    apply_theme, C, F, INK_COLORS, make_card, make_badge, make_chip,
)
import backup
import updater


import sys
from datetime import datetime

# Where to store user data (config, locations, tags, cache).
# - Normal Python run: next to this script.
# - PyInstaller-bundled .exe: next to the .exe (NOT the temp _MEI dir,
#   which gets wiped between launches and would lose all user data).
if getattr(sys, "frozen", False):
    HERE = Path(sys.executable).parent
else:
    HERE = Path(__file__).parent

CONFIG_PATH = HERE / "config.json"
LOCATIONS_PATH = HERE / "locations.json"
TAGS_PATH = HERE / "tags.json"
HISTORY_PATH = HERE / "history.json"


# ---- optional Pillow / AVIF support for displaying card images --------------
try:
    from PIL import Image, ImageTk  # type: ignore
    try:
        import pillow_avif  # noqa: F401
        AVIF_OK = True
    except ImportError:
        AVIF_OK = False
    PIL_OK = True
except ImportError:
    PIL_OK = False
    AVIF_OK = False


def load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text("utf-8"))
        except json.JSONDecodeError:
            pass
    return {}


def save_config(cfg: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), "utf-8")


# ============================================================================
# Main app
# ============================================================================

class PickingApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Lorcana Picking Tool")
        self.geometry("1280x820")
        self.minsize(1000, 640)

        # Apply the visual theme BEFORE creating any widget so they pick it up
        apply_theme(self)

        self.cfg = {**self._defaults(), **load_config()}
        self.sections: list[PickingSection] = []

        self.client = LorcastClient(HERE / self.cfg["cache_dir"])
        self.location_store = LocationStore(LOCATIONS_PATH)
        self.tag_store = TagStore(TAGS_PATH)
        self.history = HistoryStore(HISTORY_PATH)

        # Auto-backup once per day. Silent on success; if disk is read-only,
        # it just no-ops.
        try:
            backup.auto_backup_today(HERE, keep_last=30)
        except Exception:
            pass

        self._build_ui()

    @staticmethod
    def _defaults() -> dict:
        return {
            "color_order": list(DEFAULT_COLOR_ORDER),
            "group_identical_cards": True,
            "show_card_image": True,
            "image_size_px": 90,
            "show_buyer_username": True,
            "show_buyer_real_name": False,
            "show_sale_id": True,
            "show_price": False,
            "show_rarity": True,
            "show_language": True,
            "show_condition": True,
            "fetch_card_data_from_api": True,
            "cache_dir": "cache",
            "export_format": "csv",
        }

    # ------------------------------------------------------------------ UI tree
    def _build_ui(self) -> None:
        # Container for the update banner (shown at top when an update exists).
        # Empty by default; populated by `show_update_banner()`.
        self.banner_container = tk.Frame(self, background=C.BG_APP)
        self.banner_container.pack(side=tk.TOP, fill=tk.X)

        self.notebook = ttk.Notebook(self)
        self.notebook.pack(fill=tk.BOTH, expand=True, padx=8, pady=8)

        self.tab_picking = PickingTab(self.notebook, self)
        self.tab_locations = LocationsTab(self.notebook, self)
        self.tab_tags = TagsTab(self.notebook, self)
        self.tab_history = HistoryTab(self.notebook, self)
        self.tab_options = OptionsTab(self.notebook, self)

        self.notebook.add(self.tab_picking, text=" 🎯  Picking ")
        self.notebook.add(self.tab_locations, text=" 📦  Emplacements ")
        self.notebook.add(self.tab_tags, text=" 🏷  Tags ")
        self.notebook.add(self.tab_history, text=" 📚  Historique ")
        self.notebook.add(self.tab_options, text=" ⚙  Options ")

        # Schedule an update check after the UI is shown (non-blocking)
        upd_cfg = updater.read_update_config(HERE)
        if upd_cfg.get("check_on_startup", True):
            self.after(2000, self._check_for_updates_async)

    # ------------------------------------------------------ Update system

    def _check_for_updates_async(self, on_done=None) -> None:
        """Run the update check in a thread so we don't freeze the UI."""
        def worker():
            info = updater.check_for_update(HERE)
            self.after(0, lambda: self._on_update_check_done(info, on_done))
        threading.Thread(target=worker, daemon=True).start()

    def _on_update_check_done(self, info: updater.UpdateInfo, on_done=None) -> None:
        if info.available:
            self.show_update_banner(info)
        if on_done:
            on_done(info)

    def show_update_banner(self, info: updater.UpdateInfo) -> None:
        """Show a yellow banner at the top with update info & action button."""
        # Clear any existing banner
        for w in self.banner_container.winfo_children():
            w.destroy()

        banner = tk.Frame(self.banner_container, background=C.WARN_LIGHT)
        banner.pack(fill=tk.X)
        # Left strip
        tk.Frame(banner, background=C.WARN, width=4).pack(side=tk.LEFT, fill=tk.Y)

        inner = tk.Frame(banner, background=C.WARN_LIGHT, padx=14, pady=10)
        inner.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        tk.Label(inner,
                 text=f"🔔  Mise à jour disponible : v{info.latest_version}",
                 background=C.WARN_LIGHT, foreground="#7c2d12",
                 font=F.base_bold).pack(side=tk.LEFT)
        tk.Label(inner,
                 text=f"  (tu utilises v{info.current_version})",
                 background=C.WARN_LIGHT, foreground="#7c2d12",
                 font=F.small).pack(side=tk.LEFT, padx=(2, 14))

        actions = tk.Frame(banner, background=C.WARN_LIGHT)
        actions.pack(side=tk.RIGHT, padx=14, pady=8)
        ttk.Button(actions, text="✕ Plus tard",
                   command=self._dismiss_banner).pack(side=tk.RIGHT, padx=(6, 0))
        ttk.Button(actions, text="📦 Installer",
                   command=lambda: self._start_update(info),
                   style="Primary.TButton").pack(side=tk.RIGHT)
        ttk.Button(actions, text="📋 Voir les détails",
                   command=lambda: self._show_update_details(info)).pack(side=tk.RIGHT, padx=(0, 6))

    def _dismiss_banner(self) -> None:
        for w in self.banner_container.winfo_children():
            w.destroy()

    def _show_update_details(self, info: updater.UpdateInfo) -> None:
        details = (f"Version actuelle : v{info.current_version}\n"
                   f"Nouvelle version : v{info.latest_version}\n\n")
        if info.release_notes:
            details += f"Notes de version :\n\n{info.release_notes}"
        else:
            details += "(Aucune note de version fournie.)"
        if info.release_url:
            details += f"\n\n{info.release_url}"
        messagebox.showinfo(f"Mise à jour v{info.latest_version}", details)

    def _start_update(self, info: updater.UpdateInfo) -> None:
        if not messagebox.askyesno("Confirmer la mise à jour",
                f"Installer la mise à jour vers v{info.latest_version} ?\n\n"
                "Une sauvegarde de la version actuelle sera créée.\n"
                "Tu devras redémarrer l'application après l'installation."):
            return

        # Build a small modal progress dialog
        dlg = tk.Toplevel(self)
        dlg.title("Mise à jour en cours")
        dlg.geometry("420x140")
        dlg.transient(self)
        dlg.grab_set()
        dlg.configure(background=C.BG_APP)

        wrap = tk.Frame(dlg, background=C.BG_APP, padx=16, pady=16)
        wrap.pack(fill=tk.BOTH, expand=True)
        step_label = tk.Label(wrap, text="Préparation…", background=C.BG_APP,
                              foreground=C.TEXT_PRIMARY, font=F.base_bold)
        step_label.pack(anchor="w")
        pb = ttk.Progressbar(wrap, length=380, mode="determinate", maximum=100)
        pb.pack(pady=8, fill=tk.X)

        def progress_cb(step: str, pct: int):
            self.after(0, lambda: (step_label.configure(text=step),
                                    pb.configure(value=pct)))

        def worker():
            ok, msg = updater.apply_update(info, HERE, progress_cb=progress_cb)
            self.after(0, lambda: self._after_update(dlg, ok, msg))

        threading.Thread(target=worker, daemon=True).start()

    def _after_update(self, dlg, ok: bool, msg: str) -> None:
        try:
            dlg.destroy()
        except tk.TclError:
            pass
        if ok:
            messagebox.showinfo("Mise à jour réussie ✅", msg)
            self._dismiss_banner()
        else:
            messagebox.showerror("Échec de la mise à jour", msg)

    # ---------------------------------------------- triggered by other tabs
    def on_locations_changed(self) -> None:
        self.location_store.save()
        self.tab_picking.refresh()

    def on_tags_changed(self) -> None:
        self.tag_store.save()
        self.tab_picking.refresh()

    def on_history_changed(self) -> None:
        """Called when an order's pick state or status changes."""
        self.history.save()
        self.tab_picking.refresh()
        self.tab_history.refresh()

    def on_options_changed(self, new_cfg: dict) -> None:
        self.cfg.update(new_cfg)
        save_config(self.cfg)
        self.tab_picking.refresh()


# ============================================================================
# TAB 1 — Picking
# ============================================================================

# ============================================================================
# TAB 1 — Picking
# ============================================================================

class PickingTab(ttk.Frame):
    """
    Active picking view, backed by HistoryStore.active().

    For each card line the picker can increment a counter (0 → quantity)
    showing how many copies have actually been retrieved. State is persisted
    immediately so closing the app does not lose progress.

    A bottom panel shows the progress of every active order; when an order
    hits 100 %, it is auto-archived into the history.
    """
    def __init__(self, parent, app: "PickingApp"):
        super().__init__(parent)
        self.app = app
        # Tk PhotoImage refs (Tk only keeps weak refs to images)
        self.image_refs: list = []
        # spinbox vars per (order_uid, card_index) so we can read them back
        self._spinbox_vars: dict[tuple[str, int], tk.IntVar] = {}

        # ---- toolbar ---------------------------------------------------
        bar = ttk.Frame(self, padding=(4, 6))
        bar.pack(side=tk.TOP, fill=tk.X)
        ttk.Button(bar, text="📂 Ajouter PDF(s)…", command=self.on_add_pdfs,
                   style="Primary.TButton").pack(side=tk.LEFT)
        ttk.Button(bar, text="↺ Tout cocher", command=lambda: self.on_check_all(True)).pack(side=tk.LEFT, padx=(6, 0))
        ttk.Button(bar, text="◯ Tout décocher", command=lambda: self.on_check_all(False)).pack(side=tk.LEFT, padx=(4, 0))
        ttk.Separator(bar, orient="vertical").pack(side=tk.LEFT, fill=tk.Y, padx=10)
        ttk.Button(bar, text="💾 Exporter…", command=self.on_export).pack(side=tk.LEFT)
        self.status_var = tk.StringVar(
            value="Aucune commande active. Clique « Ajouter PDF(s) » ou rouvre une commande "
                  "depuis l'onglet « 📚 Historique ».")
        ttk.Label(bar, textvariable=self.status_var, foreground=C.TEXT_SECONDARY).pack(side=tk.RIGHT)

        # ---- main split: orders left, picking center, summary right ----
        main = ttk.Panedwindow(self, orient=tk.HORIZONTAL)
        main.pack(fill=tk.BOTH, expand=True, padx=4, pady=(0, 4))

        # ---- LEFT: active orders list ----------------------------------
        left = ttk.Frame(main)
        ttk.Label(left, text="Commandes actives", font=("", 10, "bold")).pack(anchor="w", padx=4, pady=(4, 2))
        self.orders_tree = ttk.Treeview(left, columns=("buyer", "progress", "total"),
                                        show="headings", height=8)
        self.orders_tree.heading("buyer", text="Acheteur")
        self.orders_tree.heading("progress", text="Avancement")
        self.orders_tree.heading("total", text="€")
        self.orders_tree.column("buyer", width=160)
        self.orders_tree.column("progress", width=100, anchor="center")
        self.orders_tree.column("total", width=70, anchor="e")
        self.orders_tree.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)
        main.add(left, weight=1)

        # ---- CENTER: picking list (scrollable) -------------------------
        center = ttk.Frame(main)
        ttk.Label(center, text="Liste de picking", font=("", 10, "bold")).pack(anchor="w", padx=4, pady=(4, 2))
        wrap = ttk.Frame(center)
        wrap.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)
        self.canvas = tk.Canvas(wrap, highlightthickness=0, background=C.BG_APP)
        vsb = ttk.Scrollbar(wrap, orient="vertical", command=self.canvas.yview)
        self.canvas.configure(yscrollcommand=vsb.set)
        self.canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        vsb.pack(side=tk.RIGHT, fill=tk.Y)
        self.picking_frame = ttk.Frame(self.canvas)
        self.canvas_window = self.canvas.create_window((0, 0), window=self.picking_frame, anchor="nw")
        self.picking_frame.bind("<Configure>",
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.canvas.bind("<Configure>",
            lambda e: self.canvas.itemconfig(self.canvas_window, width=e.width))
        self.canvas.bind_all("<MouseWheel>",
            lambda e: self._scroll_if_active(e, -int(e.delta / 120)))
        self.canvas.bind_all("<Button-4>", lambda e: self._scroll_if_active(e, -1))
        self.canvas.bind_all("<Button-5>", lambda e: self._scroll_if_active(e, 1))
        main.add(center, weight=4)

        # ---- RIGHT: per-buyer summary ----------------------------------
        right = ttk.Frame(main)
        ttk.Label(right, text="Résumé par client", font=("", 10, "bold")).pack(anchor="w", padx=4, pady=(4, 2))
        self.summary_frame = ttk.Frame(right)
        self.summary_frame.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)
        main.add(right, weight=2)

        self._show_empty_state()
        # Render whatever is already in the history (across launches)
        self.refresh()

    def _scroll_if_active(self, _e, units: int) -> None:
        try:
            if self.app.notebook.index(self.app.notebook.select()) == 0:
                self.canvas.yview_scroll(units, "units")
        except tk.TclError:
            pass

    # --- empty state ---------------------------------------------------------
    def _show_empty_state(self) -> None:
        self._clear_picking_frame()
        ttk.Label(
            self.picking_frame,
            text="\n\nAucune commande active.\n\n"
                 "Ajoute un PDF Cardmarket ci-dessus, ou rouvre une commande\n"
                 "depuis l'onglet « 📚 Historique ».\n",
            foreground=C.TEXT_MUTED, justify="center", font=F.base).pack(pady=40)

    def _clear_picking_frame(self) -> None:
        for w in self.picking_frame.winfo_children():
            w.destroy()
        self.image_refs.clear()
        self._spinbox_vars.clear()

    def _clear_summary(self) -> None:
        for w in self.summary_frame.winfo_children():
            w.destroy()

    # --- toolbar actions ----------------------------------------------------
    def on_add_pdfs(self) -> None:
        paths = filedialog.askopenfilenames(
            title="Sélectionne tes PDFs de commande Cardmarket",
            filetypes=[("PDF", "*.pdf"), ("Tous fichiers", "*.*")],
        )
        if not paths:
            return
        added = 0
        skipped = 0
        for p in paths:
            try:
                order = parse_pdf(p)
                if not order.cards:
                    messagebox.showwarning("PDF vide",
                        f"Aucune carte détectée dans :\n{Path(p).name}")
                    continue
                # If sale_id already known, add_or_get returns the existing record
                # (preserves pick state). Otherwise creates a new one.
                before = len(self.app.history.orders)
                rec = self.app.history.add_or_get(order)
                if len(self.app.history.orders) == before:
                    skipped += 1
                else:
                    added += 1
            except Exception as e:
                messagebox.showerror("Erreur de lecture",
                    f"Impossible de lire :\n{Path(p).name}\n\n{e}")
        if added or skipped:
            self.app.history.save()
            self.refresh()
            self.app.tab_history.refresh()
            if skipped:
                self.status_var.set(
                    f"{added} commande(s) ajoutée(s), {skipped} déjà dans l'historique.")

    def on_check_all(self, check: bool) -> None:
        """Quick way to mark every active card as fully picked / not picked."""
        if not self.app.history.active():
            return
        if not messagebox.askyesno("Confirmer",
                "Tout cocher" if check else "Tout décocher" + " pour TOUTES les commandes actives ?"):
            return
        for rec in self.app.history.active():
            for c in rec.cards:
                c.picked = c.quantity if check else 0
            rec.recompute_status()
        self.app.on_history_changed()

    def on_export(self) -> None:
        if not self.app.sections:
            messagebox.showinfo("Rien à exporter", "Aucune commande active.")
            return
        fmt = self.app.cfg.get("export_format", "csv")
        ext = {"csv": ".csv", "txt": ".txt", "html": ".html"}.get(fmt, ".csv")
        path = filedialog.asksaveasfilename(
            title="Exporter la liste de picking",
            defaultextension=ext,
            filetypes=[("CSV", "*.csv"), ("Texte", "*.txt"), ("HTML", "*.html")],
        )
        if not path:
            return
        try:
            ext = Path(path).suffix.lower()
            if ext == ".csv":
                self._export_csv(path)
            elif ext == ".html":
                self._export_html(path)
            else:
                self._export_txt(path)
            messagebox.showinfo("Exporté", f"Liste enregistrée :\n{path}")
        except Exception as e:
            messagebox.showerror("Erreur d'export", str(e))

    # --- core: rebuild + render --------------------------------------------
    def refresh(self) -> None:
        active = self.app.history.active()
        if not active:
            self.app.sections = []
            self._refresh_orders_tree()
            self._show_empty_state()
            self._clear_summary()
            self.status_var.set("Aucune commande active.")
            return
        self.app.sections = build_picking_from_records(
            active,
            store=self.app.location_store,
            tag_store=self.app.tag_store,
            color_order=self.app.cfg["color_order"],
            group_orders=self.app.cfg["group_identical_cards"],
        )
        self._refresh_orders_tree()
        self._render_sections()
        self._render_summary()
        if self.app.cfg["fetch_card_data_from_api"]:
            threading.Thread(target=self._enrich_in_background, daemon=True).start()
        else:
            self.status_var.set(self._summary_text())

    def _refresh_orders_tree(self) -> None:
        for iid in self.orders_tree.get_children():
            self.orders_tree.delete(iid)
        for rec in self.app.history.active():
            pct = int(rec.progress_ratio * 100)
            self.orders_tree.insert(
                "", "end", iid=rec.uid,
                values=(f"{rec.buyer or '?'} ({rec.buyer_name or '—'})",
                        f"{rec.picked_qty}/{rec.total_qty} ({pct}%)",
                        rec.total or "—"))

    def _summary_text(self) -> str:
        total = sum(s.total_cards for s in self.app.sections)
        picked = sum(e.total_picked for s in self.app.sections for e in s.entries)
        n_orders = len(self.app.history.active())
        return f"{n_orders} commande(s) · {picked}/{total} cartes pickées."

    def _render_sections(self) -> None:
        self._clear_picking_frame()
        if not self.app.sections:
            self._show_empty_state()
            return
        for section in self.app.sections:
            self._render_section(section)

    def _render_section(self, section) -> None:
        # Outer wrapper adds breathing room
        wrap = tk.Frame(self.picking_frame, background=C.BG_APP)
        wrap.pack(fill=tk.X, pady=(14, 0))

        # Banner: solid color strip, larger title
        banner = tk.Frame(wrap, background=section.color_hex, height=42)
        banner.pack(fill=tk.X)
        banner.pack_propagate(False)
        tk.Label(banner, text=f"   📦   {section.title}",
                 background=section.color_hex, foreground=C.TEXT_ON_ACCENT,
                 font=F.h2, anchor="w").pack(side=tk.LEFT, fill=tk.X, expand=True)
        tk.Label(banner, text=f"{section.total_cards} cartes   ",
                 background=section.color_hex, foreground=C.TEXT_ON_ACCENT,
                 font=F.base).pack(side=tk.RIGHT)
        if section.location and section.location.rules:
            descs = " · ".join(r.describe() for r in section.location.rules)
            tk.Label(self.picking_frame, text="  " + descs,
                      background=C.BG_APP,
                      foreground=C.TEXT_SECONDARY, padx=10, pady=4,
                      font=F.caption, anchor="w").pack(anchor="w", fill=tk.X)
        for entry in section.entries:
            self._render_entry_row(entry)

    def _render_entry_row(self, entry: PickingEntry) -> None:
        is_done = entry.fully_picked
        # Background: white card by default, soft green when complete
        row_bg = C.OK_LIGHT if is_done else C.BG_SURFACE
        accent_bar = INK_COLORS.get(entry.display_color, C.BORDER)

        # Outer card with thin colored left bar (color of the ink)
        outer = tk.Frame(self.picking_frame, background=row_bg)
        outer.pack(fill=tk.X, padx=8, pady=3)

        # Left vertical accent strip (5px wide)
        tk.Frame(outer, background=accent_bar, width=5).pack(side=tk.LEFT, fill=tk.Y)

        row = tk.Frame(outer, background=row_bg, padx=10, pady=8)
        row.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        # image (left)
        if self.app.cfg["show_card_image"] and entry.api_image and PIL_OK:
            try:
                img = Image.open(entry.api_image)
                target_h = int(self.app.cfg["image_size_px"])
                ratio = target_h / img.height
                img = img.resize((int(img.width * ratio), target_h), Image.LANCZOS)
                photo = ImageTk.PhotoImage(img)
                self.image_refs.append(photo)
                tk.Label(row, image=photo, background=row_bg).pack(side=tk.LEFT, padx=(0, 12))
            except Exception:
                self._render_image_placeholder(row, bg=row_bg)
        elif self.app.cfg["show_card_image"]:
            self._render_image_placeholder(row, bg=row_bg)

        # qty badge (left): "X / Y" with color coding
        if is_done:
            qty_color = C.OK
        elif entry.total_picked > 0:
            qty_color = C.WARN
        else:
            qty_color = C.TEXT_PRIMARY
        tk.Label(row, text=f"{entry.total_picked}/{entry.total_qty}",
                 font=F.badge,
                 foreground=C.TEXT_ON_ACCENT, background=qty_color,
                 padx=12, pady=6, width=6).pack(side=tk.LEFT, padx=(0, 12))

        # info block (center)
        info = tk.Frame(row, background=row_bg)
        info.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        # Title row: number badge + name + foil/rarity
        title_row = tk.Frame(info, background=row_bg)
        title_row.pack(anchor="w", fill=tk.X)
        # Card number as a subtle pill
        tk.Label(title_row, text=f"#{entry.number}",
                 background=C.BG_SIDEBAR, foreground=C.TEXT_SECONDARY,
                 font=F.small_bold, padx=6, pady=1).pack(side=tk.LEFT, padx=(0, 8))
        # Title
        title_font = (F.h3.cget("family"), 11, "bold overstrike" if is_done else "bold")
        tk.Label(title_row, text=entry.name,
                 background=row_bg, foreground=C.TEXT_PRIMARY,
                 font=title_font).pack(side=tk.LEFT)
        # Foil sparkle
        if entry.is_foil:
            tk.Label(title_row, text="✨ FOIL",
                     background=C.ACCENT_LIGHT, foreground="#7c5d12",
                     font=F.small_bold, padx=4).pack(side=tk.LEFT, padx=(8, 0))
        # Rarity chip
        if self.app.cfg["show_rarity"]:
            tk.Label(title_row, text=entry.display_rarity,
                     background=C.BG_SIDEBAR, foreground=C.TEXT_SECONDARY,
                     font=F.caption, padx=4).pack(side=tk.LEFT, padx=(8, 0))

        # Meta row
        meta_bits = [entry.display_color, f"ch.{entry.set_code}"]
        if self.app.cfg["show_language"]:
            meta_bits.append(entry.language)
        if self.app.cfg["show_condition"]:
            meta_bits.append(entry.condition)
        if entry.api_set_name:
            meta_bits.append(entry.api_set_name)
        tk.Label(info, text=" · ".join(meta_bits),
                 background=row_bg,
                 foreground=C.TEXT_SECONDARY, font=F.small).pack(anchor="w", pady=(2, 0))

        if entry.tags:
            tag_frame = tk.Frame(info, background=row_bg)
            tag_frame.pack(anchor="w", pady=(4, 0))
            for t in entry.tags:
                tk.Label(tag_frame, text=f" 🏷 {t} ",
                         background=C.ACCENT_LIGHT, foreground="#7c5d12",
                         font=F.caption, padx=4).pack(side=tk.LEFT, padx=(0, 4))

        # buyers + checkboxes (right)
        buyer_box = tk.Frame(row, background=row_bg)
        buyer_box.pack(side=tk.RIGHT)
        for share in entry.shares:
            self._render_share_with_checkbox(buyer_box, share, bg=row_bg)

    def _render_share_with_checkbox(self, parent, share, *, bg: str = C.BG_SURFACE) -> None:
        share_row = tk.Frame(parent, background=bg)
        share_row.pack(anchor="e", pady=1)

        # Buyer label
        bits = []
        if self.app.cfg["show_buyer_username"]:
            bits.append(share.buyer or "?")
        if self.app.cfg["show_buyer_real_name"] and share.buyer_name:
            bits.append(f"({share.buyer_name})")
        if self.app.cfg["show_sale_id"] and share.sale_id:
            bits.append(f"#{share.sale_id}")
        tk.Label(share_row, text="  ".join(bits), background=bg,
                  foreground=C.TEXT_PRIMARY, font=F.small).pack(side=tk.LEFT, padx=(0, 6))

        # Spinbox 0..quantity (or simple checkbox if quantity == 1)
        if share.quantity == 1:
            var = tk.BooleanVar(value=share.picked >= 1)
            self._spinbox_vars[(share.order_uid, share.card_index)] = var  # type: ignore
            cb = ttk.Checkbutton(
                share_row, variable=var,
                command=lambda v=var, s=share: self._on_check_changed(s, 1 if v.get() else 0),
            )
            cb.pack(side=tk.LEFT)
            tk.Label(share_row, text=f"/{share.quantity}", background=bg,
                      foreground=C.TEXT_MUTED, font=F.small).pack(side=tk.LEFT)
        else:
            var = tk.IntVar(value=share.picked)
            self._spinbox_vars[(share.order_uid, share.card_index)] = var
            sp = ttk.Spinbox(share_row, from_=0, to=share.quantity, width=3,
                             textvariable=var,
                             command=lambda s=share, v=var: self._on_check_changed(s, v.get()))
            sp.pack(side=tk.LEFT)
            tk.Label(share_row, text=f"/{share.quantity}", background=bg,
                      foreground=C.TEXT_MUTED, font=F.small).pack(side=tk.LEFT)

    def _on_check_changed(self, share, new_picked: int) -> None:
        """Callback when user changes a spinbox / checkbox value."""
        try:
            new_picked = int(new_picked)
        except (ValueError, TypeError):
            return
        # update history
        self.app.history.set_picked(share.order_uid, share.card_index, new_picked)
        # also update in-memory share so summary reflects immediately
        share.picked = max(0, min(new_picked, share.quantity))
        # persist + redraw
        self.app.on_history_changed()

    def _render_image_placeholder(self, parent, *, bg: str = C.BG_SURFACE) -> None:
        h = int(self.app.cfg["image_size_px"])
        ph = tk.Frame(parent, width=int(h * 0.72), height=h,
                      background=C.BG_SIDEBAR, highlightthickness=1,
                      highlightbackground=C.BORDER)
        ph.pack_propagate(False)
        ph.pack(side=tk.LEFT, padx=(0, 10))
        tk.Label(ph, text="?", background=C.BG_SIDEBAR,
                 foreground=C.TEXT_MUTED, font=F.h2).pack(expand=True)

    # --- per-buyer summary (right panel) -----------------------------------
    def _render_summary(self) -> None:
        self._clear_summary()
        active = self.app.history.active()
        if not active:
            ttk.Label(self.summary_frame,
                      text="Charge des commandes\npour voir le résumé.",
                      foreground=C.TEXT_MUTED, justify="center").pack(pady=20)
            return

        for rec in active:
            self._render_summary_card(rec)

    def _render_summary_card(self, rec) -> None:
        card = tk.Frame(self.summary_frame, background=C.BG_SURFACE,
                        highlightthickness=1, highlightbackground=C.BORDER)
        card.pack(fill=tk.X, pady=4, padx=2)

        # Header
        header = ttk.Frame(card, padding=(8, 6, 8, 4))
        header.pack(fill=tk.X)
        tk.Label(header, text=rec.buyer or "?", background=C.BG_SURFACE,
                 font=("", 10, "bold")).pack(anchor="w")
        tk.Label(header,
                 text=f"#{rec.sale_id} · {rec.total or '—'}",
                 background=C.BG_SURFACE, foreground=C.TEXT_SECONDARY,
                 font=("", 8)).pack(anchor="w")

        # Progress bar
        pb_frame = ttk.Frame(card, padding=(8, 0, 8, 4))
        pb_frame.pack(fill=tk.X)
        pb = ttk.Progressbar(pb_frame, maximum=rec.total_qty, value=rec.picked_qty)
        pb.pack(fill=tk.X)
        tk.Label(card, text=f"{rec.picked_qty}/{rec.total_qty} cartes",
                 background=C.BG_SURFACE, foreground=C.TEXT_PRIMARY,
                 font=("", 9)).pack(anchor="w", padx=8)

        # Action button (mark as sent shortcut)
        btn_row = ttk.Frame(card, padding=(8, 4, 8, 8))
        btn_row.pack(fill=tk.X)
        if rec.is_complete:
            tk.Label(btn_row, text="✓ COMPLÈTE",
                     background=C.OK, foreground=C.TEXT_ON_ACCENT,
                     padx=8, pady=2, font=("", 9, "bold")).pack(side=tk.LEFT)
        else:
            ttk.Button(btn_row, text="Tout cocher",
                       command=lambda r=rec: self._complete_order(r)).pack(side=tk.LEFT)

    def _complete_order(self, rec) -> None:
        if not messagebox.askyesno("Confirmer",
                f"Marquer toute la commande de {rec.buyer} comme pickée et envoyée ?"):
            return
        for c in rec.cards:
            c.picked = c.quantity
        rec.recompute_status()
        self.app.on_history_changed()

    # --- background API enrichment ----------------------------------------
    def _enrich_in_background(self) -> None:
        all_entries = [e for s in self.app.sections for e in s.entries]
        total = len(all_entries)
        for i, entry in enumerate(all_entries, 1):
            try:
                card = self.app.client.get_card(entry.set_code, entry.number)
                if card:
                    entry.api_ink = card.ink or entry.color_label
                    entry.api_rarity = card.rarity
                    entry.api_set_name = card.set_name
                    if self.app.cfg["show_card_image"] and PIL_OK and AVIF_OK:
                        path = self.app.client.get_image_path(card, "small")
                        if path:
                            entry.api_image = str(path)
                self.after(0, lambda i=i, total=total:
                           self.status_var.set(f"Chargement des données API… {i}/{total}"))
            except Exception:
                traceback.print_exc()
        self.after(0, self._rebuild_after_enrichment)

    def _rebuild_after_enrichment(self) -> None:
        from picking import assign_to_sections
        all_entries = [e for s in self.app.sections for e in s.entries]
        self.app.sections = assign_to_sections(
            all_entries, self.app.location_store,
            color_order=self.app.cfg["color_order"])
        self._render_sections()
        self.status_var.set(self._summary_text())

    # --- exports -----------------------------------------------------------
    def _export_csv(self, path: str) -> None:
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f, delimiter=";")
            w.writerow(["Emplacement", "Couleur", "Chapitre", "N°", "Nom", "Foil",
                        "Qté totale", "Qté pickée", "Langue", "Condition", "Rareté",
                        "Tags", "Détail acheteurs"])
            for s in self.app.sections:
                for e in s.entries:
                    shares = " | ".join(
                        f"{sh.picked}/{sh.quantity} {sh.buyer or '?'}"
                        + (f" (#{sh.sale_id})" if sh.sale_id else "")
                        for sh in e.shares)
                    w.writerow([s.title, e.display_color, e.set_code, e.number,
                                e.name, "FOIL" if e.is_foil else "",
                                e.total_qty, e.total_picked,
                                e.language, e.condition,
                                e.display_rarity, ", ".join(e.tags), shares])

    def _export_txt(self, path: str) -> None:
        buf = io.StringIO()
        for s in self.app.sections:
            buf.write(f"\n=== {s.title.upper()}  ({s.total_cards} cartes) ===\n")
            for e in s.entries:
                foil = "  ✨FOIL" if e.is_foil else ""
                shares = ", ".join(f"{sh.picked}/{sh.quantity} {sh.buyer or '?'}"
                                   for sh in e.shares)
                tags = f"  [{', '.join(e.tags)}]" if e.tags else ""
                check = "[X]" if e.fully_picked else "[ ]"
                buf.write(f"  {check} {e.total_picked}/{e.total_qty}  "
                          f"{e.display_color:<8} ch.{e.set_code:<3} "
                          f"#{e.number:<4} {e.name}{foil}{tags}  ({shares})\n")
        Path(path).write_text(buf.getvalue(), "utf-8")

    def _export_html(self, path: str) -> None:
        rows = []
        for s in self.app.sections:
            rows.append(f'<h2 style="background:{s.color_hex};color:#fff;padding:8px 12px">'
                        f'📦 {s.title} <small>({s.total_cards} cartes)</small></h2>')
            rows.append("<table border=1 cellspacing=0 cellpadding=4>")
            rows.append("<tr><th>✓</th><th>Pické</th><th>Couleur</th><th>Ch.</th><th>N°</th>"
                        "<th>Nom</th><th>Foil</th><th>Acheteurs</th></tr>")
            for e in s.entries:
                shares = "<br>".join(
                    f"{sh.picked}/{sh.quantity} {sh.buyer or '?'}"
                    + (f" <small>#{sh.sale_id}</small>" if sh.sale_id else "")
                    for sh in e.shares)
                foil = "✨" if e.is_foil else ""
                check = "☑" if e.fully_picked else "☐"
                rows.append(f"<tr><td style='font-size:18px'>{check}</td>"
                            f"<td><b>{e.total_picked}/{e.total_qty}</b></td>"
                            f"<td>{e.display_color}</td><td>{e.set_code}</td>"
                            f"<td>{e.number}</td><td>{e.name}</td>"
                            f"<td>{foil}</td><td>{shares}</td></tr>")
            rows.append("</table>")
        html = ("<!doctype html><meta charset=utf-8>"
                "<title>Liste de picking Lorcana</title>"
                "<style>body{font-family:sans-serif;padding:20px}"
                "table{border-collapse:collapse;margin-bottom:20px;width:100%}"
                "th{background:#eee}td{vertical-align:top}</style>" + "".join(rows))
        Path(path).write_text(html, "utf-8")


# ============================================================================
# TAB 2 — Emplacements (Locations)
# ============================================================================

class LocationsTab(ttk.Frame):
    def __init__(self, parent, app: PickingApp):
        super().__init__(parent)
        self.app = app

        ttk.Label(self, text="Définis tes emplacements physiques. "
                              "L'ordre compte : la 1ʳᵉ règle qui matche gagne.",
                  foreground=C.TEXT_SECONDARY, padding=(10, 8, 0, 4)).pack(anchor="w")

        bar = ttk.Frame(self, padding=(8, 4))
        bar.pack(fill=tk.X)
        ttk.Button(bar, text="➕ Nouvel emplacement", command=self.on_add).pack(side=tk.LEFT)
        ttk.Button(bar, text="✏ Modifier", command=self.on_edit).pack(side=tk.LEFT, padx=4)
        ttk.Button(bar, text="📋 Dupliquer", command=self.on_duplicate).pack(side=tk.LEFT, padx=4)
        ttk.Button(bar, text="🗑 Supprimer", command=self.on_remove).pack(side=tk.LEFT, padx=4)
        ttk.Separator(bar, orient="vertical").pack(side=tk.LEFT, fill=tk.Y, padx=8)
        ttk.Button(bar, text="⬆ Monter", command=self.on_move_up).pack(side=tk.LEFT)
        ttk.Button(bar, text="⬇ Descendre", command=self.on_move_down).pack(side=tk.LEFT, padx=4)

        body = ttk.Frame(self, padding=(8, 4, 8, 8))
        body.pack(fill=tk.BOTH, expand=True)

        self.tree = ttk.Treeview(body,
                                 columns=("priority", "name", "rules"),
                                 show="headings", height=20)
        self.tree.heading("priority", text="#")
        self.tree.heading("name", text="Emplacement")
        self.tree.heading("rules", text="Règle")
        self.tree.column("priority", width=40, anchor="center")
        self.tree.column("name", width=320)
        self.tree.column("rules", width=600)
        vsb = ttk.Scrollbar(body, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=vsb.set)
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        vsb.pack(side=tk.RIGHT, fill=tk.Y)
        self.tree.bind("<Double-1>", lambda _e: self.on_edit())

        self._refresh_tree()

    def _refresh_tree(self) -> None:
        for iid in self.tree.get_children():
            self.tree.delete(iid)
        for i, loc in enumerate(self.app.location_store.locations):
            rule_desc = " | ".join(r.describe() for r in loc.rules) if loc.rules \
                        else "(aucune règle — ne matchera rien)"
            self.tree.insert("", "end", iid=str(i),
                             values=(i + 1, f"● {loc.name}", rule_desc),
                             tags=(loc.color_hex,))
            self.tree.tag_configure(loc.color_hex, foreground=loc.color_hex)

    def _selected_idx(self) -> int | None:
        sel = self.tree.selection()
        if not sel:
            return None
        try:
            return int(sel[0])
        except ValueError:
            return None

    # actions ----------------------------------------------------------------
    def on_add(self) -> None:
        loc = Location(name="Nouvel emplacement", color_hex="#888888",
                       rules=[Rule()])
        dlg = LocationDialog(self, loc, on_save=lambda l: self._add_location(l))
        self.wait_window(dlg)

    def _add_location(self, loc: Location) -> None:
        self.app.location_store.locations.append(loc)
        self.app.on_locations_changed()
        self._refresh_tree()

    def on_edit(self) -> None:
        idx = self._selected_idx()
        if idx is None:
            messagebox.showinfo("Sélection", "Sélectionne d'abord un emplacement.")
            return
        loc = self.app.location_store.locations[idx]
        LocationDialog(self, loc, on_save=lambda l: self._after_edit(idx, l))

    def _after_edit(self, idx: int, loc: Location) -> None:
        self.app.location_store.locations[idx] = loc
        self.app.on_locations_changed()
        self._refresh_tree()
        self.tree.selection_set(str(idx))

    def on_remove(self) -> None:
        idx = self._selected_idx()
        if idx is None:
            return
        name = self.app.location_store.locations[idx].name
        if not messagebox.askyesno("Confirmer", f"Supprimer l'emplacement « {name} » ?"):
            return
        self.app.location_store.remove(idx)
        self.app.on_locations_changed()
        self._refresh_tree()

    def on_duplicate(self) -> None:
        """Clone the selected location with a new id and " (copie)" suffix.
        The copy is inserted right after the original; user can then edit it."""
        import uuid
        idx = self._selected_idx()
        if idx is None:
            messagebox.showinfo("Sélection", "Sélectionne d'abord un emplacement à dupliquer.")
            return
        src = self.app.location_store.locations[idx]
        copy = Location(
            name=f"{src.name} (copie)",
            color_hex=src.color_hex,
            rules=[Rule(**{k: list(getattr(r, k)) if isinstance(getattr(r, k), list)
                            else getattr(r, k)
                          for k in Rule.__annotations__})
                   for r in src.rules],
            id=uuid.uuid4().hex[:8],
        )
        # insert just after the original
        self.app.location_store.locations.insert(idx + 1, copy)
        self.app.on_locations_changed()
        self._refresh_tree()
        self.tree.selection_set(str(idx + 1))

    def on_move_up(self) -> None:
        idx = self._selected_idx()
        if idx is None or idx == 0:
            return
        self.app.location_store.move_up(idx)
        self.app.on_locations_changed()
        self._refresh_tree()
        self.tree.selection_set(str(idx - 1))

    def on_move_down(self) -> None:
        idx = self._selected_idx()
        if idx is None or idx >= len(self.app.location_store.locations) - 1:
            return
        self.app.location_store.move_down(idx)
        self.app.on_locations_changed()
        self._refresh_tree()
        self.tree.selection_set(str(idx + 1))


# ============================================================================
# Location editor dialog
# ============================================================================

class LocationDialog(tk.Toplevel):
    def __init__(self, master, loc: Location, on_save):
        super().__init__(master)
        self.title("Emplacement")
        self.geometry("640x600")
        self.transient(master)
        self.grab_set()
        self.loc = Location(name=loc.name, color_hex=loc.color_hex,
                            rules=[Rule(**{k: getattr(r, k) for k in Rule.__annotations__})
                                   for r in loc.rules],
                            id=loc.id)
        self.on_save = on_save

        wrap = ttk.Frame(self, padding=12)
        wrap.pack(fill=tk.BOTH, expand=True)

        # name + color
        top = ttk.Frame(wrap)
        top.pack(fill=tk.X)
        ttk.Label(top, text="Nom de l'emplacement").grid(row=0, column=0, sticky="w")
        self.name_var = tk.StringVar(value=self.loc.name)
        ttk.Entry(top, textvariable=self.name_var, width=44).grid(row=1, column=0, sticky="we", padx=(0, 8))
        ttk.Label(top, text="Couleur").grid(row=0, column=1, sticky="w")
        self.color_btn = tk.Button(top, text="     ", background=self.loc.color_hex,
                                   command=self._pick_color, width=8)
        self.color_btn.grid(row=1, column=1, sticky="we")
        top.columnconfigure(0, weight=1)

        ttk.Separator(wrap).pack(fill=tk.X, pady=10)

        # rules section: we show ONE rule editor; multiple rules per location
        # would be a power-user feature we can add later.
        ttk.Label(wrap, text="Règle d'affectation",
                  font=("", 10, "bold")).pack(anchor="w")
        ttk.Label(wrap, text="Une carte est affectée à cet emplacement si elle remplit "
                              "TOUS les critères ci-dessous (les critères vides = « peu importe »).",
                  foreground=C.TEXT_SECONDARY, font=F.small).pack(anchor="w", pady=(0, 6))

        if not self.loc.rules:
            self.loc.rules = [Rule()]
        rule = self.loc.rules[0]

        # Colors (multi-select)
        self._colors_vars = self._build_multiselect(
            wrap, "Couleurs (vide = toutes)",
            DEFAULT_COLOR_ORDER, rule.colors)

        # Rarities
        self._rarities_vars = self._build_multiselect(
            wrap, "Raretés (vide = toutes)",
            RARITIES, rule.rarities)

        # Chapters (text)
        ch_frame = ttk.Frame(wrap)
        ch_frame.pack(fill=tk.X, pady=(8, 0))
        ttk.Label(ch_frame, text="Chapitres (vide = tous, ex: « 1-5, 8, 10 »)").pack(anchor="w")
        self.chapters_var = tk.StringVar(
            value=_compact_int_ranges(rule.chapters) if rule.chapters else "")
        ttk.Entry(ch_frame, textvariable=self.chapters_var, width=40).pack(anchor="w")

        # Foil
        foil_frame = ttk.Frame(wrap)
        foil_frame.pack(fill=tk.X, pady=(8, 0))
        ttk.Label(foil_frame, text="Foil").pack(side=tk.LEFT, padx=(0, 8))
        self.foil_var = tk.StringVar(value={None: "any", True: "foil", False: "nonfoil"}[rule.foil])
        for label, val in [("Peu importe", "any"), ("Foil uniquement", "foil"),
                           ("Non-foil uniquement", "nonfoil")]:
            ttk.Radiobutton(foil_frame, text=label, variable=self.foil_var,
                            value=val).pack(side=tk.LEFT, padx=(0, 8))

        # Languages
        lang_frame = ttk.Frame(wrap)
        lang_frame.pack(fill=tk.X, pady=(8, 0))
        ttk.Label(lang_frame, text="Langues (vide = toutes, ex: « FR, EN »)").pack(anchor="w")
        self.langs_var = tk.StringVar(value=", ".join(rule.languages))
        ttk.Entry(lang_frame, textvariable=self.langs_var, width=40).pack(anchor="w")

        # Tags
        tag_frame = ttk.Frame(wrap)
        tag_frame.pack(fill=tk.X, pady=(8, 0))
        ttk.Label(tag_frame, text="Tags requis (vide = aucune contrainte, séparés par virgule)").pack(anchor="w")
        self.tags_var = tk.StringVar(value=", ".join(rule.tags))
        ttk.Entry(tag_frame, textvariable=self.tags_var, width=40).pack(anchor="w")

        # buttons
        btn = ttk.Frame(wrap)
        btn.pack(fill=tk.X, pady=(16, 0), side=tk.BOTTOM)
        ttk.Button(btn, text="Annuler", command=self.destroy).pack(side=tk.RIGHT, padx=(6, 0))
        ttk.Button(btn, text="Enregistrer", command=self._save).pack(side=tk.RIGHT)

    def _build_multiselect(self, parent, label: str, options: list[str],
                           preselected: list[str]) -> dict[str, tk.BooleanVar]:
        f = ttk.Frame(parent)
        f.pack(fill=tk.X, pady=(8, 0))
        ttk.Label(f, text=label).pack(anchor="w")
        cb_row = ttk.Frame(f)
        cb_row.pack(anchor="w")
        vars_: dict[str, tk.BooleanVar] = {}
        for opt in options:
            v = tk.BooleanVar(value=opt in preselected)
            ttk.Checkbutton(cb_row, text=opt, variable=v).pack(side=tk.LEFT, padx=(0, 8))
            vars_[opt] = v
        return vars_

    def _pick_color(self) -> None:
        c = colorchooser.askcolor(initialcolor=self.loc.color_hex, parent=self)
        if c and c[1]:
            self.loc.color_hex = c[1]
            self.color_btn.configure(background=c[1])

    def _save(self) -> None:
        name = self.name_var.get().strip() or "Sans nom"
        chapters = parse_chapters_input(self.chapters_var.get())
        langs = [s.strip().upper() for s in self.langs_var.get().split(",") if s.strip()]
        tags = [s.strip() for s in self.tags_var.get().split(",") if s.strip()]
        foil_map = {"any": None, "foil": True, "nonfoil": False}
        rule = Rule(
            colors=[c for c, v in self._colors_vars.items() if v.get()],
            rarities=[r for r, v in self._rarities_vars.items() if v.get()],
            chapters=chapters,
            foil=foil_map[self.foil_var.get()],
            languages=langs,
            tags=tags,
        )
        self.loc.name = name
        self.loc.rules = [rule]
        self.on_save(self.loc)
        self.destroy()


# ============================================================================
# TAB 3 — Tags
# ============================================================================

class TagsTab(ttk.Frame):
    def __init__(self, parent, app: PickingApp):
        super().__init__(parent)
        self.app = app

        ttk.Label(self, text="Tags par carte. Identifie une carte par son chapitre + numéro.",
                  foreground=C.TEXT_SECONDARY, padding=(10, 8, 0, 4)).pack(anchor="w")

        bar = ttk.Frame(self, padding=(8, 4))
        bar.pack(fill=tk.X)
        ttk.Label(bar, text="Chapitre").pack(side=tk.LEFT)
        self.chap_var = tk.StringVar()
        ttk.Entry(bar, textvariable=self.chap_var, width=6).pack(side=tk.LEFT, padx=(2, 8))
        ttk.Label(bar, text="N° carte").pack(side=tk.LEFT)
        self.num_var = tk.StringVar()
        ttk.Entry(bar, textvariable=self.num_var, width=8).pack(side=tk.LEFT, padx=(2, 8))
        ttk.Label(bar, text="Tag").pack(side=tk.LEFT)
        self.tag_var = tk.StringVar()
        ttk.Entry(bar, textvariable=self.tag_var, width=24).pack(side=tk.LEFT, padx=(2, 8))
        ttk.Button(bar, text="➕ Ajouter", command=self.on_add).pack(side=tk.LEFT)

        body = ttk.Frame(self, padding=(8, 4, 8, 8))
        body.pack(fill=tk.BOTH, expand=True)
        self.tree = ttk.Treeview(body, columns=("card", "tags"), show="headings")
        self.tree.heading("card", text="Carte (ch./n°)")
        self.tree.heading("tags", text="Tags")
        self.tree.column("card", width=140)
        self.tree.column("tags", width=600)
        vsb = ttk.Scrollbar(body, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=vsb.set)
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        vsb.pack(side=tk.RIGHT, fill=tk.Y)

        del_bar = ttk.Frame(self, padding=(8, 0, 8, 8))
        del_bar.pack(fill=tk.X)
        ttk.Button(del_bar, text="🗑 Supprimer le tag sélectionné",
                   command=self.on_remove).pack(side=tk.LEFT)

        self._refresh_tree()

    def _refresh_tree(self) -> None:
        for iid in self.tree.get_children():
            self.tree.delete(iid)
        for key, tags in self.app.tag_store.all_tagged_cards():
            self.tree.insert("", "end", iid=key, values=(key, ", ".join(tags)))

    def on_add(self) -> None:
        ch = self.chap_var.get().strip()
        num = self.num_var.get().strip()
        tag = self.tag_var.get().strip()
        if not ch or not num or not tag:
            messagebox.showinfo("Champs requis", "Remplis chapitre, numéro et tag.")
            return
        self.app.tag_store.add(ch, num, tag)
        self.app.on_tags_changed()
        self.tag_var.set("")
        self._refresh_tree()

    def on_remove(self) -> None:
        sel = self.tree.selection()
        if not sel:
            return
        key = sel[0]
        ch, num = key.split("/", 1)
        # ask which tag to remove
        tags = self.app.tag_store.get(ch, num)
        if not tags:
            return
        tag = simpledialog.askstring("Supprimer un tag",
                                      f"Quel tag retirer de {key} ?\n"
                                      f"Tags actuels : {', '.join(tags)}",
                                      parent=self)
        if tag and tag in tags:
            self.app.tag_store.remove(ch, num, tag)
            self.app.on_tags_changed()
            self._refresh_tree()


# ============================================================================
# TAB 4 — Historique
# ============================================================================

class HistoryTab(ttk.Frame):
    """
    Browse all orders ever loaded (active or sent), with filters and stats.

    Two sub-tabs:
      • Commandes — list view, with reopen / delete / view detail actions
      • Statistiques — top cards sold, revenue per month, etc.
    """
    def __init__(self, parent, app: "PickingApp"):
        super().__init__(parent)
        self.app = app

        self.sub = ttk.Notebook(self)
        self.sub.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)

        self.orders_pane = ttk.Frame(self.sub)
        self.stats_pane = ttk.Frame(self.sub)
        self.sub.add(self.orders_pane, text=" Commandes ")
        self.sub.add(self.stats_pane, text=" Statistiques ")

        self._build_orders_pane()
        self._build_stats_pane()
        self.refresh()

    # ---- Orders pane ------------------------------------------------------

    def _build_orders_pane(self) -> None:
        # filter bar
        bar = ttk.Frame(self.orders_pane, padding=(8, 6))
        bar.pack(fill=tk.X)
        ttk.Label(bar, text="Filtre :").pack(side=tk.LEFT, padx=(0, 6))
        self.filter_var = tk.StringVar(value="all")
        for label, val in [("Tout", "all"), ("Actives", "active"), ("Envoyées", "sent")]:
            ttk.Radiobutton(bar, text=label, variable=self.filter_var, value=val,
                            command=self._refresh_orders).pack(side=tk.LEFT)
        ttk.Separator(bar, orient="vertical").pack(side=tk.LEFT, fill=tk.Y, padx=10)
        ttk.Label(bar, text="Recherche :").pack(side=tk.LEFT, padx=(0, 4))
        self.search_var = tk.StringVar()
        self.search_var.trace_add("write", lambda *_: self._refresh_orders())
        ttk.Entry(bar, textvariable=self.search_var, width=24).pack(side=tk.LEFT)

        ttk.Separator(bar, orient="vertical").pack(side=tk.LEFT, fill=tk.Y, padx=10)
        ttk.Button(bar, text="🔄 Rouvrir (re-picker)", command=self.on_reopen).pack(side=tk.LEFT)
        ttk.Button(bar, text="👁 Détail", command=self.on_view_detail).pack(side=tk.LEFT, padx=4)
        ttk.Button(bar, text="🗑 Supprimer", command=self.on_remove).pack(side=tk.LEFT, padx=4)

        body = ttk.Frame(self.orders_pane, padding=(8, 4, 8, 8))
        body.pack(fill=tk.BOTH, expand=True)
        self.tree = ttk.Treeview(body,
                                 columns=("status","loaded","sent","buyer","sale","cards","total"),
                                 show="headings", height=20)
        for col, lbl, w, anc in [
            ("status", "Statut", 90, "center"),
            ("loaded", "Chargée le", 130, "w"),
            ("sent", "Envoyée le", 130, "w"),
            ("buyer", "Acheteur", 200, "w"),
            ("sale", "N° vente", 110, "w"),
            ("cards", "Cartes", 80, "center"),
            ("total", "Total", 80, "e"),
        ]:
            self.tree.heading(col, text=lbl)
            self.tree.column(col, width=w, anchor=anc)
        vsb = ttk.Scrollbar(body, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=vsb.set)
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        vsb.pack(side=tk.RIGHT, fill=tk.Y)
        self.tree.tag_configure("sent", foreground=C.OK)
        self.tree.tag_configure("in_progress", foreground=C.WARN)
        self.tree.tag_configure("to_pick", foreground=C.TEXT_PRIMARY)
        self.tree.bind("<Double-1>", lambda _e: self.on_view_detail())

    def _refresh_orders(self) -> None:
        for iid in self.tree.get_children():
            self.tree.delete(iid)
        f = self.filter_var.get()
        q = self.search_var.get().strip().lower()
        for rec in sorted(self.app.history.orders,
                          key=lambda r: r.loaded_date or "", reverse=True):
            if f == "active" and rec.status == STATUS_SENT:
                continue
            if f == "sent" and rec.status != STATUS_SENT:
                continue
            if q and not (q in (rec.buyer or "").lower()
                          or q in (rec.buyer_name or "").lower()
                          or q in rec.sale_id.lower()):
                continue
            status_label = {
                STATUS_TO_PICK: "À picker",
                STATUS_IN_PROGRESS: "En cours",
                STATUS_SENT: "✓ Envoyée",
            }.get(rec.status, rec.status)
            self.tree.insert(
                "", "end", iid=rec.uid,
                values=(status_label,
                        _fmt_dt(rec.loaded_date),
                        _fmt_dt(rec.sent_date) if rec.sent_date else "—",
                        f"{rec.buyer or '?'} ({rec.buyer_name or '—'})",
                        rec.sale_id or "—",
                        f"{rec.picked_qty}/{rec.total_qty}",
                        rec.total or "—"),
                tags=(rec.status,))

    def _selected_uid(self) -> str | None:
        sel = self.tree.selection()
        return sel[0] if sel else None

    def on_reopen(self) -> None:
        uid = self._selected_uid()
        if not uid:
            messagebox.showinfo("Sélection", "Sélectionne une commande.")
            return
        rec = self.app.history.by_uid(uid)
        if not rec:
            return
        if rec.status == STATUS_SENT:
            if not messagebox.askyesno("Rouvrir",
                    f"Rouvrir la commande de {rec.buyer} (#{rec.sale_id}) ?\n\n"
                    "Les cases seront décochées et la commande redeviendra active."):
                return
            self.app.history.reopen(uid)
        else:
            messagebox.showinfo("Déjà active", "Cette commande est déjà active.")
            return
        self.app.on_history_changed()

    def on_view_detail(self) -> None:
        uid = self._selected_uid()
        if not uid:
            return
        rec = self.app.history.by_uid(uid)
        if not rec:
            return
        OrderDetailDialog(self, rec)

    def on_remove(self) -> None:
        uid = self._selected_uid()
        if not uid:
            return
        rec = self.app.history.by_uid(uid)
        if not rec:
            return
        if not messagebox.askyesno("Confirmer",
                f"Supprimer DÉFINITIVEMENT la commande de {rec.buyer} "
                f"(#{rec.sale_id}) de l'historique ?\n\n"
                "Cette action est irréversible."):
            return
        self.app.history.remove(uid)
        self.app.on_history_changed()

    # ---- Stats pane -------------------------------------------------------

    def _build_stats_pane(self) -> None:
        wrap = ttk.Frame(self.stats_pane, padding=12)
        wrap.pack(fill=tk.BOTH, expand=True)

        ttk.Label(wrap, text="Statistiques globales (commandes envoyées)",
                  font=("", 11, "bold")).pack(anchor="w")
        self.stats_summary = ttk.Label(wrap, text="", foreground=C.TEXT_PRIMARY,
                                       font=("", 10), padding=(0, 4, 0, 12))
        self.stats_summary.pack(anchor="w")

        # Top cards
        ttk.Label(wrap, text="Top 20 cartes les plus vendues",
                  font=("", 10, "bold")).pack(anchor="w", pady=(8, 4))
        body1 = ttk.Frame(wrap)
        body1.pack(fill=tk.BOTH, expand=True)
        self.top_tree = ttk.Treeview(body1,
                                      columns=("qty","name","number","color"),
                                      show="headings", height=10)
        for c, l, w in [("qty","Vendues",80), ("name","Carte",260),
                        ("number","Ch./N°",80), ("color","Couleur",100)]:
            self.top_tree.heading(c, text=l)
            self.top_tree.column(c, width=w,
                                  anchor="center" if c in ("qty","number") else "w")
        vsb1 = ttk.Scrollbar(body1, orient="vertical", command=self.top_tree.yview)
        self.top_tree.configure(yscrollcommand=vsb1.set)
        self.top_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        vsb1.pack(side=tk.RIGHT, fill=tk.Y)

        # Per-month revenue
        ttk.Label(wrap, text="Chiffre d'affaires par mois (commandes envoyées)",
                  font=("", 10, "bold")).pack(anchor="w", pady=(16, 4))
        body2 = ttk.Frame(wrap)
        body2.pack(fill=tk.BOTH, expand=True)
        self.month_tree = ttk.Treeview(body2,
                                        columns=("month","orders","cards","total"),
                                        show="headings", height=8)
        for c, l, w in [("month","Mois",100), ("orders","Commandes",80),
                        ("cards","Cartes",80), ("total","Total €",100)]:
            self.month_tree.heading(c, text=l)
            self.month_tree.column(c, width=w,
                                    anchor="center" if c != "total" else "e")
        vsb2 = ttk.Scrollbar(body2, orient="vertical", command=self.month_tree.yview)
        self.month_tree.configure(yscrollcommand=vsb2.set)
        self.month_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        vsb2.pack(side=tk.RIGHT, fill=tk.Y)

    def _refresh_stats(self) -> None:
        sent = self.app.history.sent()
        if not sent:
            self.stats_summary.configure(
                text="Aucune commande envoyée pour le moment.")
            for t in (self.top_tree, self.month_tree):
                for iid in t.get_children():
                    t.delete(iid)
            return

        total_orders = len(sent)
        total_cards = sum(r.total_qty for r in sent)
        total_revenue = sum(_parse_eur(r.total) for r in sent)
        self.stats_summary.configure(
            text=f"{total_orders} commandes envoyées · "
                 f"{total_cards} cartes · "
                 f"{total_revenue:.2f} € de chiffre d'affaires.")

        # Top cards
        from collections import Counter
        counter: Counter = Counter()
        names: dict[tuple, tuple] = {}
        for r in sent:
            for c in r.cards:
                key = (c.set_code, c.number, c.is_foil)
                counter[key] += c.quantity
                names[key] = (c.name, c.color_label, "✨" if c.is_foil else "")
        for iid in self.top_tree.get_children():
            self.top_tree.delete(iid)
        for (set_code, num, foil), qty in counter.most_common(20):
            name, color, foil_marker = names[(set_code, num, foil)]
            self.top_tree.insert("", "end",
                                  values=(qty, f"{name} {foil_marker}".strip(),
                                          f"{set_code}/{num}", color))

        # Per-month
        per_month: dict[str, dict] = {}
        for r in sent:
            month = (r.sent_date or r.loaded_date or "")[:7]  # "YYYY-MM"
            if not month:
                continue
            d = per_month.setdefault(month, {"orders": 0, "cards": 0, "total": 0.0})
            d["orders"] += 1
            d["cards"] += r.total_qty
            d["total"] += _parse_eur(r.total)
        for iid in self.month_tree.get_children():
            self.month_tree.delete(iid)
        for month in sorted(per_month.keys(), reverse=True):
            d = per_month[month]
            self.month_tree.insert("", "end",
                                    values=(month, d["orders"], d["cards"],
                                            f"{d['total']:.2f}"))

    def refresh(self) -> None:
        self._refresh_orders()
        self._refresh_stats()


class OrderDetailDialog(tk.Toplevel):
    """Read-only popup showing all cards of one order."""
    def __init__(self, master, rec: OrderRecord):
        super().__init__(master)
        self.title(f"Commande #{rec.sale_id} — {rec.buyer}")
        self.geometry("780x500")
        self.transient(master)

        head = ttk.Frame(self, padding=10)
        head.pack(fill=tk.X)
        ttk.Label(head, text=f"Acheteur : {rec.buyer} ({rec.buyer_name})",
                  font=("", 10, "bold")).pack(anchor="w")
        ttk.Label(head, text=f"Vendeur : {rec.seller}").pack(anchor="w")
        ttk.Label(head, text=f"Chargée : {_fmt_dt(rec.loaded_date)}"
                              + (f" · Envoyée : {_fmt_dt(rec.sent_date)}"
                                 if rec.sent_date else "")).pack(anchor="w")
        ttk.Label(head, text=f"Total : {rec.total} · {rec.total_qty} cartes "
                              f"· {rec.picked_qty} pickées").pack(anchor="w")

        body = ttk.Frame(self, padding=(10, 0, 10, 10))
        body.pack(fill=tk.BOTH, expand=True)
        tree = ttk.Treeview(body,
                             columns=("qty","picked","ch","num","name","color","foil","price"),
                             show="headings")
        for c, l, w, a in [
            ("qty","Qté",50,"center"), ("picked","Pickées",60,"center"),
            ("ch","Ch.",40,"center"), ("num","N°",50,"center"),
            ("name","Nom",260,"w"), ("color","Couleur",80,"w"),
            ("foil","Foil",50,"center"), ("price","Prix",70,"e"),
        ]:
            tree.heading(c, text=l)
            tree.column(c, width=w, anchor=a)
        vsb = ttk.Scrollbar(body, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=vsb.set)
        tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        vsb.pack(side=tk.RIGHT, fill=tk.Y)
        for c in rec.cards:
            tree.insert("", "end",
                         values=(c.quantity, c.picked, c.set_code, c.number,
                                 c.name, c.color_label,
                                 "✨" if c.is_foil else "", c.price))

        ttk.Button(self, text="Fermer", command=self.destroy).pack(pady=(0, 10))


# ---- helpers used by HistoryTab --------------------------------------------

def _fmt_dt(iso: str | None) -> str:
    """Format an ISO datetime as a friendly string."""
    if not iso:
        return ""
    try:
        return datetime.fromisoformat(iso).strftime("%d/%m/%Y %H:%M")
    except (ValueError, TypeError):
        return iso


def _parse_eur(text: str) -> float:
    """'5,42 EUR' -> 5.42; safe fallback to 0.0."""
    if not text:
        return 0.0
    cleaned = text.replace("EUR", "").replace("€", "").replace(",", ".").strip()
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


# ============================================================================
# TAB 5 — Options
# ============================================================================

class OptionsTab(ttk.Frame):
    def __init__(self, parent, app: PickingApp):
        super().__init__(parent)
        self.app = app

        # Use a scrollable canvas so the page works at any window size
        outer = ttk.Frame(self, padding=12)
        outer.pack(fill=tk.BOTH, expand=True)

        wrap = ttk.Frame(outer)
        wrap.pack(fill=tk.BOTH, expand=True)

        self._vars: dict[str, tk.Variable] = {}

        # ======== Section 1: Affichage =====================================
        ttk.Label(wrap, text="Affichage", style="H2.TLabel").pack(anchor="w")
        section1 = make_card(wrap, padding=12)
        section1.pack(fill=tk.X, pady=(6, 16))
        s1 = section1.inner  # type: ignore[attr-defined]

        for key, label in [
            ("group_identical_cards", "Regrouper les cartes identiques entre commandes"),
            ("show_card_image", "Afficher le visuel de la carte (API Lorcast)"),
            ("show_buyer_username", "Afficher le pseudo de l'acheteur"),
            ("show_buyer_real_name", "Afficher le nom réel de l'acheteur"),
            ("show_sale_id", "Afficher le n° de vente"),
            ("show_rarity", "Afficher la rareté"),
            ("show_language", "Afficher la langue"),
            ("show_condition", "Afficher la condition (NM/EX/…)"),
            ("show_price", "Afficher le prix"),
            ("fetch_card_data_from_api", "Interroger l'API Lorcast (sinon hors ligne)"),
        ]:
            v = tk.BooleanVar(value=bool(self.app.cfg.get(key, False)))
            self._vars[key] = v
            cb = tk.Checkbutton(s1, text=label, variable=v,
                                background=C.BG_SURFACE, foreground=C.TEXT_PRIMARY,
                                activebackground=C.BG_SURFACE, selectcolor=C.ACCENT_LIGHT,
                                font=F.base, anchor="w",
                                command=self._auto_save)
            cb.pack(anchor="w", fill=tk.X, pady=1)

        ttk.Separator(s1).pack(fill=tk.X, pady=8)

        row = tk.Frame(s1, background=C.BG_SURFACE)
        row.pack(fill=tk.X, pady=2)
        tk.Label(row, text="Taille du visuel (pixels) :",
                 background=C.BG_SURFACE).pack(side=tk.LEFT)
        sv = tk.IntVar(value=int(self.app.cfg.get("image_size_px", 90)))
        self._vars["image_size_px"] = sv
        ttk.Spinbox(row, from_=40, to=240, increment=10, textvariable=sv,
                    width=8, command=self._auto_save).pack(side=tk.LEFT, padx=8)

        row2 = tk.Frame(s1, background=C.BG_SURFACE)
        row2.pack(fill=tk.X, pady=(8, 2))
        tk.Label(row2, text="Format d'export par défaut :",
                 background=C.BG_SURFACE).pack(side=tk.LEFT)
        fmt = tk.StringVar(value=self.app.cfg.get("export_format", "csv"))
        self._vars["export_format"] = fmt
        ttk.Combobox(row2, textvariable=fmt, values=["csv", "txt", "html"],
                     state="readonly", width=10).pack(side=tk.LEFT, padx=8)

        tk.Label(s1, text="Ordre des couleurs (un par ligne) :",
                 background=C.BG_SURFACE).pack(anchor="w", pady=(8, 2))
        self.color_text = tk.Text(s1, height=7, width=30,
                                   background=C.BG_APP, foreground=C.TEXT_PRIMARY,
                                   highlightthickness=1, highlightbackground=C.BORDER,
                                   relief="flat", font=F.base)
        self.color_text.insert("1.0", "\n".join(
            self.app.cfg.get("color_order", DEFAULT_COLOR_ORDER)))
        self.color_text.pack(anchor="w", pady=(0, 8))

        ttk.Button(s1, text="💾 Enregistrer & appliquer",
                   command=self._save, style="Primary.TButton").pack(anchor="w")

        # ======== Section 2: Sauvegarde ====================================
        ttk.Label(wrap, text="Sauvegarde & restauration",
                  style="H2.TLabel").pack(anchor="w")
        section2 = make_card(wrap, padding=12)
        section2.pack(fill=tk.X, pady=(6, 16))
        s2 = section2.inner  # type: ignore[attr-defined]

        tk.Label(s2,
                 text="Une sauvegarde automatique est créée chaque jour dans le dossier "
                      "« backups\\ » à côté de l'application (30 dernières conservées). "
                      "Tu peux aussi exporter manuellement vers un fichier unique pour "
                      "transférer ta config sur un autre PC.",
                 background=C.BG_SURFACE, foreground=C.TEXT_SECONDARY,
                 font=F.small, justify="left", wraplength=600).pack(anchor="w", pady=(0, 8))

        # Status of last auto-backup
        self.backup_status = tk.Label(s2, background=C.BG_SURFACE,
                                       foreground=C.TEXT_SECONDARY, font=F.small)
        self.backup_status.pack(anchor="w", pady=(0, 8))
        self._refresh_backup_status()

        btn_row = tk.Frame(s2, background=C.BG_SURFACE)
        btn_row.pack(fill=tk.X)
        ttk.Button(btn_row, text="📤 Exporter…",
                   command=self.on_export, style="Primary.TButton").pack(side=tk.LEFT)
        ttk.Button(btn_row, text="📥 Importer…",
                   command=self.on_import).pack(side=tk.LEFT, padx=8)
        ttk.Button(btn_row, text="📁 Ouvrir le dossier backups",
                   command=self.on_open_backups).pack(side=tk.LEFT)

        # ======== Section 3: Mises à jour ==================================
        ttk.Label(wrap, text="Mises à jour", style="H2.TLabel").pack(anchor="w")
        section3 = make_card(wrap, padding=12)
        section3.pack(fill=tk.X, pady=(6, 16))
        s3 = section3.inner  # type: ignore[attr-defined]

        current_version = updater.read_local_version(HERE)
        upd_cfg = updater.read_update_config(HERE)
        repo_str = (f"{upd_cfg.get('github_owner', '?')}/"
                    f"{upd_cfg.get('github_repo', '?')}")

        tk.Label(s3, text=f"Version actuelle : v{current_version}",
                 background=C.BG_SURFACE, foreground=C.TEXT_PRIMARY,
                 font=F.base_bold).pack(anchor="w")
        tk.Label(s3, text=f"Source : github.com/{repo_str}",
                 background=C.BG_SURFACE, foreground=C.TEXT_SECONDARY,
                 font=F.small).pack(anchor="w", pady=(0, 6))

        self.update_status = tk.Label(s3, background=C.BG_SURFACE,
                                       foreground=C.TEXT_SECONDARY, font=F.small,
                                       wraplength=600, justify="left")
        self.update_status.pack(anchor="w", pady=(0, 8))

        # Auto-check at startup checkbox
        self.auto_check_var = tk.BooleanVar(
            value=bool(upd_cfg.get("check_on_startup", True)))
        cb = tk.Checkbutton(s3,
            text="Vérifier automatiquement au démarrage",
            variable=self.auto_check_var,
            background=C.BG_SURFACE, foreground=C.TEXT_PRIMARY,
            activebackground=C.BG_SURFACE, selectcolor=C.ACCENT_LIGHT,
            font=F.base, command=self._save_update_cfg)
        cb.pack(anchor="w", pady=(0, 8))

        upd_row = tk.Frame(s3, background=C.BG_SURFACE)
        upd_row.pack(fill=tk.X)
        self.check_btn = ttk.Button(upd_row, text="🔄 Vérifier les mises à jour",
                                     command=self.on_check_updates,
                                     style="Primary.TButton")
        self.check_btn.pack(side=tk.LEFT)
        ttk.Button(upd_row, text="📁 Ouvrir le dossier des sauvegardes de versions",
                   command=self.on_open_versions_backup).pack(side=tk.LEFT, padx=8)

    # ---- auto-save handlers --------------------------------------------------
    def _auto_save(self) -> None:
        self._save()

    def _save(self) -> None:
        out: dict = {}
        for key, var in self._vars.items():
            out[key] = var.get()
        out["color_order"] = [
            line.strip()
            for line in self.color_text.get("1.0", "end").splitlines()
            if line.strip()
        ]
        self.app.on_options_changed(out)

    # ---- backup status --------------------------------------------------------
    def _refresh_backup_status(self) -> None:
        backups = backup.list_backups(HERE)
        if backups:
            most_recent_date, _ = backups[0]
            self.backup_status.configure(
                text=f"📅 Dernière sauvegarde automatique : {most_recent_date}  "
                     f"·  {len(backups)} sauvegarde(s) au total")
        else:
            self.backup_status.configure(
                text="📅 Aucune sauvegarde pour le moment.")

    # ---- export ---------------------------------------------------------------
    def on_export(self) -> None:
        ExportDialog(self, self.app, on_done=self._refresh_backup_status)

    def on_import(self) -> None:
        ImportDialog(self, self.app, on_done=self._after_import)

    def _after_import(self) -> None:
        self._refresh_backup_status()
        # full app refresh: rebuild stores from disk
        self.app.location_store.load()
        self.app.tag_store.load()
        self.app.history.load()
        self.app.cfg = {**self.app._defaults(), **load_config()}
        self.app.tab_picking.refresh()
        self.app.tab_locations._refresh_tree()
        self.app.tab_tags._refresh_tree()
        self.app.tab_history.refresh()

    def on_open_backups(self) -> None:
        backups_dir = HERE / "backups"
        backups_dir.mkdir(exist_ok=True)
        self._open_folder(backups_dir)

    def on_open_versions_backup(self) -> None:
        d = HERE / "versions_backup"
        d.mkdir(exist_ok=True)
        self._open_folder(d)

    def _open_folder(self, folder: Path) -> None:
        try:
            import os, sys, subprocess
            if sys.platform.startswith("win"):
                os.startfile(str(folder))  # type: ignore[attr-defined]
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(folder)])
            else:
                subprocess.Popen(["xdg-open", str(folder)])
        except Exception as e:
            messagebox.showerror("Impossible d'ouvrir",
                f"Le dossier est ici :\n{folder}\n\n{e}")

    # ---- update system handlers ---------------------------------------------

    def _save_update_cfg(self) -> None:
        """Persist the 'check on startup' toggle to update_config.json."""
        cfg_path = HERE / "update_config.json"
        cfg = updater.read_update_config(HERE)
        cfg["check_on_startup"] = bool(self.auto_check_var.get())
        try:
            cfg_path.write_text(
                json.dumps(cfg, indent=2, ensure_ascii=False), "utf-8")
        except OSError as e:
            messagebox.showerror("Erreur",
                f"Impossible d'enregistrer la préférence :\n{e}")

    def on_check_updates(self) -> None:
        """User clicked the 'Check for updates' button."""
        self.check_btn.configure(state="disabled", text="🔄 Vérification…")
        self.update_status.configure(text="Interrogation de GitHub…")

        def on_done(info: updater.UpdateInfo) -> None:
            self.check_btn.configure(state="normal",
                                      text="🔄 Vérifier les mises à jour")
            if info.is_error:
                self.update_status.configure(
                    text=f"⚠️  {info.error}",
                    foreground=C.WARN)
            elif info.available:
                self.update_status.configure(
                    text=f"✨  Une nouvelle version est disponible : v{info.latest_version} "
                         f"(tu utilises v{info.current_version})",
                    foreground=C.OK)
                # Show the banner in case it was dismissed
                self.app.show_update_banner(info)
            else:
                self.update_status.configure(
                    text=f"✅  Tu utilises la dernière version (v{info.current_version}).",
                    foreground=C.OK)

        self.app._check_for_updates_async(on_done=on_done)


# ============================================================================
# Export / Import dialogs
# ============================================================================

class ExportDialog(tk.Toplevel):
    """Pick what to include, then save the bundle to a JSON file."""
    def __init__(self, master, app: PickingApp, on_done):
        super().__init__(master)
        self.title("Exporter mes données")
        self.geometry("500x420")
        self.transient(master)
        self.grab_set()
        self.app = app
        self.on_done = on_done
        self.configure(background=C.BG_APP)

        wrap = ttk.Frame(self, padding=14)
        wrap.pack(fill=tk.BOTH, expand=True)

        ttk.Label(wrap, text="Exporter mes données",
                  style="H2.TLabel").pack(anchor="w")
        tk.Label(wrap, text="Coche ce que tu veux inclure dans la sauvegarde.",
                 background=C.BG_APP, foreground=C.TEXT_SECONDARY,
                 font=F.small).pack(anchor="w", pady=(0, 12))

        self._vars: dict[str, tk.BooleanVar] = {}
        for section in backup.ALL_SECTIONS:
            v = tk.BooleanVar(value=True)
            self._vars[section] = v
            tk.Checkbutton(wrap, text=backup.SECTION_LABELS[section],
                           variable=v, background=C.BG_APP, foreground=C.TEXT_PRIMARY,
                           activebackground=C.BG_APP, selectcolor=C.ACCENT_LIGHT,
                           font=F.base).pack(anchor="w", pady=2)

        ttk.Separator(wrap).pack(fill=tk.X, pady=14)

        btn_row = ttk.Frame(wrap)
        btn_row.pack(fill=tk.X)
        ttk.Button(btn_row, text="Annuler",
                   command=self.destroy).pack(side=tk.RIGHT, padx=(8, 0))
        ttk.Button(btn_row, text="📤 Exporter",
                   command=self._do_export, style="Primary.TButton").pack(side=tk.RIGHT)

    def _do_export(self) -> None:
        if not any(v.get() for v in self._vars.values()):
            messagebox.showwarning("Sélection", "Coche au moins une section.",
                                    parent=self)
            return
        default_name = f"lorcana_backup_{datetime.now().strftime('%Y-%m-%d')}.json"
        path = filedialog.asksaveasfilename(
            parent=self,
            title="Enregistrer la sauvegarde sous…",
            defaultextension=".json",
            initialfile=default_name,
            filetypes=[("Sauvegarde JSON", "*.json")],
        )
        if not path:
            return
        try:
            bundle = backup.build_bundle(
                here=HERE,
                include_config=self._vars[backup.SECTION_CONFIG].get(),
                include_locations=self._vars[backup.SECTION_LOCATIONS].get(),
                include_tags=self._vars[backup.SECTION_TAGS].get(),
                include_history=self._vars[backup.SECTION_HISTORY].get(),
            )
            backup.export_to_file(bundle, path)
            messagebox.showinfo("Export réussi",
                f"Sauvegarde enregistrée :\n{path}",
                parent=self)
            self.on_done()
            self.destroy()
        except Exception as e:
            messagebox.showerror("Erreur d'export", str(e), parent=self)


class ImportDialog(tk.Toplevel):
    """Pick a bundle file, choose strategies per section, then apply."""
    def __init__(self, master, app: PickingApp, on_done):
        super().__init__(master)
        self.title("Importer une sauvegarde")
        self.geometry("640x520")
        self.transient(master)
        self.grab_set()
        self.app = app
        self.on_done = on_done
        self.bundle: dict | None = None
        self.configure(background=C.BG_APP)

        wrap = ttk.Frame(self, padding=14)
        wrap.pack(fill=tk.BOTH, expand=True)

        ttk.Label(wrap, text="Importer une sauvegarde",
                  style="H2.TLabel").pack(anchor="w")
        tk.Label(wrap,
                 text="Choisis un fichier .json, puis pour chaque section décide "
                      "quoi faire avec les données existantes.",
                 background=C.BG_APP, foreground=C.TEXT_SECONDARY,
                 font=F.small, wraplength=600).pack(anchor="w", pady=(0, 8))

        ttk.Button(wrap, text="📂 Choisir un fichier de sauvegarde…",
                   command=self._pick_file,
                   style="Primary.TButton").pack(anchor="w", pady=(4, 12))

        # Container that gets populated once a file is loaded
        self.body = ttk.Frame(wrap)
        self.body.pack(fill=tk.BOTH, expand=True)

        self.btn_row = ttk.Frame(wrap)
        self.btn_row.pack(fill=tk.X, pady=(10, 0))
        ttk.Button(self.btn_row, text="Annuler",
                   command=self.destroy).pack(side=tk.RIGHT, padx=(8, 0))
        self.apply_btn = ttk.Button(self.btn_row, text="📥 Appliquer",
                                     command=self._do_apply,
                                     style="Primary.TButton",
                                     state="disabled")
        self.apply_btn.pack(side=tk.RIGHT)

        self._strategy_vars: dict[str, tk.StringVar] = {}

    def _pick_file(self) -> None:
        path = filedialog.askopenfilename(
            parent=self,
            title="Choisir une sauvegarde",
            filetypes=[("Sauvegarde JSON", "*.json"), ("Tous fichiers", "*.*")],
        )
        if not path:
            return
        try:
            self.bundle = backup.load_bundle(path)
        except Exception as e:
            messagebox.showerror("Fichier invalide", str(e), parent=self)
            return
        self._render_choices()

    def _render_choices(self) -> None:
        for w in self.body.winfo_children():
            w.destroy()
        if not self.bundle:
            return

        meta = (f"Créée le {self.bundle.get('created_at', '?')}  ·  "
                f"version {self.bundle.get('app_version', '?')}")
        tk.Label(self.body, text=meta, background=C.BG_APP,
                 foreground=C.TEXT_SECONDARY, font=F.small).pack(anchor="w", pady=(4, 8))

        descs = backup.describe_bundle(self.bundle)
        self._strategy_vars.clear()

        for section in backup.ALL_SECTIONS:
            if self.bundle["contents"].get(section) is None:
                continue   # not in the bundle, skip

            block = make_card(self.body, padding=10)
            block.pack(fill=tk.X, pady=4)
            inner = block.inner  # type: ignore[attr-defined]

            tk.Label(inner, text=backup.SECTION_LABELS[section],
                     background=C.BG_SURFACE, foreground=C.TEXT_PRIMARY,
                     font=F.base_bold).pack(anchor="w")
            tk.Label(inner, text=descs[section],
                     background=C.BG_SURFACE, foreground=C.TEXT_SECONDARY,
                     font=F.small).pack(anchor="w", pady=(0, 6))

            var = tk.StringVar(value=backup.STRATEGY_IGNORE)
            self._strategy_vars[section] = var
            opt_row = tk.Frame(inner, background=C.BG_SURFACE)
            opt_row.pack(anchor="w")
            for strat in [backup.STRATEGY_IGNORE,
                          backup.STRATEGY_MERGE,
                          backup.STRATEGY_REPLACE]:
                tk.Radiobutton(opt_row, text=backup.STRATEGY_LABELS[strat],
                               variable=var, value=strat,
                               background=C.BG_SURFACE, foreground=C.TEXT_PRIMARY,
                               activebackground=C.BG_SURFACE,
                               selectcolor=C.ACCENT_LIGHT,
                               font=F.small).pack(side=tk.LEFT, padx=(0, 12))

        self.apply_btn.configure(state="normal")

    def _do_apply(self) -> None:
        if not self.bundle:
            return
        # Confirm if any section will replace
        replaces = [s for s, v in self._strategy_vars.items()
                    if v.get() == backup.STRATEGY_REPLACE]
        if replaces:
            labels = ", ".join(backup.SECTION_LABELS[s] for s in replaces)
            if not messagebox.askyesno("Confirmer le remplacement",
                f"Tu vas REMPLACER (effacer l'existant) pour :\n\n• {labels}\n\n"
                "Cette action est irréversible.\nContinuer ?",
                parent=self):
                return
        try:
            summary = backup.apply_bundle(
                self.bundle, HERE,
                strategy_config=self._strategy_vars.get(
                    backup.SECTION_CONFIG, tk.StringVar(value=backup.STRATEGY_IGNORE)).get(),
                strategy_locations=self._strategy_vars.get(
                    backup.SECTION_LOCATIONS, tk.StringVar(value=backup.STRATEGY_IGNORE)).get(),
                strategy_tags=self._strategy_vars.get(
                    backup.SECTION_TAGS, tk.StringVar(value=backup.STRATEGY_IGNORE)).get(),
                strategy_history=self._strategy_vars.get(
                    backup.SECTION_HISTORY, tk.StringVar(value=backup.STRATEGY_IGNORE)).get(),
            )
            if summary:
                msg = "Import terminé :\n\n" + "\n".join(
                    f"• {backup.SECTION_LABELS[s]} → {m}"
                    for s, m in summary.items())
            else:
                msg = "Aucune section sélectionnée — rien n'a été modifié."
            messagebox.showinfo("Import réussi", msg, parent=self)
            self.on_done()
            self.destroy()
        except Exception as e:
            messagebox.showerror("Erreur d'import", str(e), parent=self)


def main() -> None:
    """
    Launch the app inside a safety net.

    If anything fails during startup (or unhandled in the Tk main loop),
    we show a readable error dialog AND write a `crash.log` next to the
    .exe / script — much friendlier than the cryptic Windows
    "Unhandled exception in script" popup.
    """
    import sys, traceback
    try:
        app = PickingApp()
    except Exception as e:
        _show_crash("Erreur au démarrage", e)
        return

    # Catch unhandled exceptions inside Tk callbacks too
    def _tk_excepthook(exc_type, exc_value, exc_tb):
        traceback.print_exception(exc_type, exc_value, exc_tb)
        _show_crash("Erreur en cours d'exécution",
                    exc_value, "".join(traceback.format_exception(exc_type, exc_value, exc_tb)))

    # Tk has its own callback for exceptions inside event handlers
    def _tk_report_callback_exception(self, exc, val, tb):
        _tk_excepthook(exc, val, tb)
    tk.Tk.report_callback_exception = _tk_report_callback_exception

    try:
        app.mainloop()
    except Exception as e:
        _show_crash("Erreur fatale", e)


def _show_crash(title: str, err: Exception, full_trace: str | None = None) -> None:
    """Display a friendly error dialog and dump details to crash.log."""
    import traceback, sys, tkinter as tk
    from tkinter import messagebox

    if full_trace is None:
        full_trace = traceback.format_exc()

    # write crash.log next to the exe (or script)
    try:
        crash_log = HERE / "crash.log"
        crash_log.write_text(
            f"=== Lorcana Picking Tool — crash ===\n"
            f"{title}\n\n{full_trace}\n", "utf-8")
    except Exception:
        pass

    # try to show a Tk dialog; fall back to console if Tk itself is broken
    try:
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror(
            title,
            f"{err}\n\nDétails enregistrés dans crash.log à côté du logiciel.\n\n"
            f"Si tu m'envoies ce fichier, je peux corriger le souci.")
        root.destroy()
    except Exception:
        print(f"[CRASH] {title}: {err}\n{full_trace}", file=sys.stderr)


if __name__ == "__main__":
    main()
