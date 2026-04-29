# Lorcana Picking Tool

Outil desktop (PC Windows / Mac / Linux) pour préparer tes commandes
**Cardmarket Lorcana** sans courir partout dans tes classeurs.

Tu lui donnes un ou plusieurs **PDFs de vente Cardmarket**, tu lui as expliqué
**où sont rangées physiquement** tes cartes (par exemple : « Légendaires →
deck box dorée », « Foils → classeur 2 », « Ruby commune ch.1-5 → bac 7 »…),
et il te sort une **liste de picking optimisée** : section par section, par
emplacement physique, dans **l'ordre que tu choisis**.

Si plusieurs clients veulent la même carte, tu la vois **une seule fois**
avec la répartition à côté. Au fur et à mesure que tu sors les cartes, tu
**coches** dans l'app — quand tout est coché pour une commande, elle est
**archivée automatiquement** dans l'historique avec date d'envoi.

---

## Les 5 onglets

| Onglet | Rôle |
|---|---|
| 🎯 **Picking** | Liste de picking active, avec cases à cocher et résumé par client |
| 📦 **Emplacements** | Définis où sont rangées tes cartes (règles + ordre + duplication) |
| 🏷 **Tags** | Étiquettes libres sur des cartes individuelles |
| 📚 **Historique** | Toutes tes commandes passées + statistiques (top cartes, CA mensuel) |
| ⚙ **Options** | Affichage, sauvegarde, **export/import**, ouverture du dossier backups |

## Sauvegarde

- **Sauvegarde automatique quotidienne** dans `backups/<date>/` à côté de l'app — les 30 dernières sont conservées, les plus anciennes sont purgées automatiquement
- **Export manuel** vers un fichier `.json` unique : tu choisis ce que tu inclus (config, emplacements, tags, historique). Idéal pour transférer sur un autre PC ou faire un backup externe
- **Import** : tu choisis pour chaque section ce que tu fais (Ignorer / Fusionner / Remplacer)

---

## Installation (à faire une seule fois)

### 1. Installer Python 3.10 ou plus

- Windows : <https://www.python.org/downloads/windows/> (coche bien
  *« Add Python to PATH »* à l'installation)
- macOS : `brew install python` ou via le site officiel
- Linux : déjà installé sur la plupart des distros

### 2. Installer les dépendances

Ouvre un terminal **dans le dossier du projet** puis lance :

```bash
pip install -r requirements.txt
```

> Sous Linux, si l'interface ne se lance pas, installe Tk :
> `sudo apt install python3-tk`

### 3. Lancer le logiciel

```bash
python app.py
```

Une fenêtre s'ouvre avec **4 onglets** : Picking, Emplacements, Tags, Options.

---

## 🪟 Version Windows autonome (.exe)

Tu veux un **vrai logiciel Windows** à double-cliquer, sans installer Python ?
Voir **[`BUILD_WINDOWS.md`](BUILD_WINDOWS.md)** : tu installes Python une fois,
double-cliques sur `build_exe.bat`, et le `.exe` est généré en 2-3 minutes
dans `dist\LorcanaPicking\`. Tu peux ensuite copier ce dossier sur n'importe
quel PC Windows.

---

## Démarrage rapide en 3 étapes

### 1️⃣ Définis tes emplacements (onglet « 📦 Emplacements »)

Clique « ➕ Nouvel emplacement » et règle :
- un **nom** (« Bac 7 — Ruby commune ch.1-5 »)
- une **couleur** d'accent (pour repérer visuellement)
- une **règle** combinant des critères :
  - **Couleurs** (Amber, Amethyst, Emerald, Ruby, Sapphire, Steel)
  - **Raretés** (Common, Uncommon, Rare, Super_rare, Legendary, Enchanted, Promo)
  - **Chapitres** (texte libre : `1-5, 8, 10`)
  - **Foil** (Foil uniquement / Non-foil uniquement / Peu importe)
  - **Langues** (`FR`, `EN`, …)
  - **Tags requis** (la carte doit porter tous ces tags)

> 📌 Les critères vides = « peu importe ». Tous les critères cochés sont
> combinés en **ET** logique.

**L'ordre compte !** Une carte va dans le 1er emplacement dont une règle
matche. Donc si tu mets « Légendaires » en haut et « Bac AMBER ch.10 » en
bas, une Légendaire Amber ch.10 ira dans « Légendaires », pas dans le bac.

Utilise les boutons **⬆ Monter / ⬇ Descendre** pour réordonner.

### 2️⃣ (Optionnel) Tague des cartes individuelles (onglet « 🏷 Tags »)

Pour des étiquettes fines genre *« collec perso »*, *« promo conv 2024 »*,
*« à vendre vite »* qu'une règle peut ensuite cibler.

### 3️⃣ Lance le picking (onglet « 🎯 Picking »)

Clique « 📂 Ajouter PDF(s) » et sélectionne tes PDFs Cardmarket. La liste
s'affiche, regroupée par emplacement, avec :
- le **visuel** de chaque carte (récupéré via API Lorcast, mis en cache)
- la **quantité totale** à sortir (gros badge)
- nom · couleur · chapitre · rareté · langue · condition · ✨ FOIL si applicable
- la **répartition par client** : qui veut combien

Clique « 💾 Exporter » pour sauvegarder en CSV / TXT / HTML.

---

## Exemple de configuration concret

Voici un set d'emplacements typique pour un boutiquier :

| Ordre | Emplacement | Règle |
|---|---|---|
| 1 | Deck box LÉGENDAIRES | Raretés = Legendary, Enchanted |
| 2 | Classeur Promos | Raretés = Promo |
| 3 | Classeur FOILS | Foil = oui |
| 4 | Bac 7 (Ruby C/U/R 1-5) | Couleurs = Ruby, Raretés = C/U/R, Ch. = 1-5 |
| 5 | Bac AMBER 8-10 | Couleurs = Amber, Ch. = 8-10 |

Avec ce setup, une **Foil Légendaire Amber ch.10** finit dans
*Deck box LÉGENDAIRES* (ordre 1 gagne), une **Foil non-légendaire Ruby ch.3**
finit dans *Classeur FOILS* (ordre 3 gagne, parce que l'ordre 1 et 2 ne
matchent pas), et une **Common Ruby ch.3** finit dans *Bac 7*.

---

## Détection foil

Le caractère foil est détecté automatiquement à partir de la colonne
**commentaire** du PDF (le texte qui dit « booster to sleeve » d'habitude).
Les mots-clés reconnus : **FOIL**, **Foil**, **Holo**, **Cold Foil** —
peu importe la casse.

---

## Cache & données persistantes

Tout est stocké à côté de l'application :

| Fichier | Contenu |
|---|---|
| `config.json`     | tes options d'affichage |
| `locations.json`  | tes emplacements et règles |
| `tags.json`       | tes tags par carte |
| `cache/cards.json`| réponses API Lorcast (1 fois par carte) |
| `cache/images/`   | visuels AVIF téléchargés |

Tu peux supprimer le `cache/` sans souci, il sera reconstruit à la demande.
Les autres fichiers contiennent ta config personnelle, ne les supprime que
si tu veux repartir de zéro.

---

## Architecture

```
lorcana_picking/
├── app.py            ← interface Tkinter (4 onglets)
├── parser.py         ← lecture PDFs Cardmarket (avec détection foil)
├── lorcast.py        ← client API Lorcast + cache disque
├── locations.py      ← modèle Emplacement/Règle + moteur d'affectation
├── tags.py           ← gestion des tags par carte
├── picking.py        ← moteur de regroupement par emplacement
├── config.json       ← réglages utilisateur
├── locations.json    ← (généré) tes emplacements
├── tags.json         ← (généré) tes tags
├── requirements.txt
└── cache/            ← (généré) données API + images
```

Chaque module est testable seul :

```bash
python parser.py /chemin/vers/Vente_XXXX.pdf
```

---

## Limitations connues

- Le parser est calibré sur les PDFs Cardmarket actuels (mise en page
  standard à 9 colonnes). Si Cardmarket change le format, ajuste `parser.py`.
- Le format AVIF requiert `pillow-avif-plugin` (dans `requirements.txt`).
  Sans lui, le reste fonctionne mais sans images.
- Une seule règle par emplacement dans l'éditeur visuel. Si tu veux un
  emplacement avec PLUSIEURS règles alternatives (OU logique), édite
  `locations.json` à la main — le moteur supporte déjà `rules: [r1, r2, …]`.
