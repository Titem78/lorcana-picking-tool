# Lorcana Picking Tool V2

Assistant de préparation de commandes **Cardmarket** pour cartes **Lorcana**.
Application Windows installable, données 100 % locales, mise à jour automatique
via GitHub Releases.

> L'ancienne version (Python/Tkinter) est conservée dans la branche
> [`v1`](https://github.com/Titem78/lorcana-picking-tool/tree/v1).

## Ce que fait l'application

1. **Emplacements** — décris où sont physiquement rangées tes cartes (boîtes de
   couleur, boîtes numérotées, classeurs, deck boxes) avec des règles libres :
   par chapitre, par couleur d'encre, par rareté, foil ou non, par langue.
   L'ordre de la liste est la priorité : une carte va dans le **premier**
   emplacement dont une règle correspond.
2. **Commandes** — glisse-dépose tes **PDF de vente Cardmarket** : l'app en
   extrait tout (client, adresse, totaux, mode d'envoi, cartes) et télécharge
   les visuels depuis Lorcast (mis en cache local, léger et disponible
   hors-ligne ensuite).
3. **Picking** — liste globale groupée par emplacement : « dans la boîte X,
   sortir ces cartes ». Une carte demandée par plusieurs clients apparaît une
   seule fois avec la répartition. Chaque coche est tracée (**qui**, **quand**).
4. **Préparation & expédition** — fiche de commande numérique : validation de
   la préparation, saisie du numéro de suivi, lien direct vers le suivi
   transporteur (La Poste, Mondial Relay, Chronopost).
5. **Historique** — commandes expédiées, recherche, CA par mois, top cartes.
6. **Préparateurs** — comptes nom + PIN, journal d'activité complet.

## Installation

Télécharge le dernier `Lorcana-Picking-Tool-Setup-x.y.z.exe` dans
[Releases](https://github.com/Titem78/lorcana-picking-tool/releases) et
lance-le. L'application se met ensuite à jour toute seule à chaque nouvelle
release.

## Développement

```bash
npm install       # dépendances
npm run dev       # app en mode développement
npm test          # tests (vitest)
npm run typecheck # vérification TypeScript
npm run dist      # construire l'installateur en local (dossier release/)
```

Stack : Electron + Vite + React + TypeScript, SQLite (better-sqlite3),
pdfjs-dist pour l'analyse des PDF, electron-updater pour les mises à jour.

Les données vivent dans `%APPDATA%/lorcana-picking-tool/` :
`lorcana-picking.db` (base SQLite) et `cache/` (visuels de cartes).

## Publier une mise à jour

```bash
npm version patch        # ou minor / major — met à jour package.json + tag git
git push origin main --follow-tags
```

Le workflow GitHub Actions (`.github/workflows/release.yml`) construit alors
l'installateur Windows et le publie en Release. Toutes les applications
installées se mettent à jour automatiquement au prochain lancement.

## Architecture (pour les curieux)

```
src/
  main/       processus principal Electron (Node)
    db.ts           SQLite + migrations versionnées
    users.ts        comptes préparateurs (PIN hashé scrypt)
    locations.ts    emplacements + moteur de règles (1re règle gagnante)
    pdf-parser.ts   analyse des PDF de vente Cardmarket (colonnes + repli regex)
    lorcast.ts      client API Lorcast, cache JSON + images
    orders.ts       import, statuts, suivi, stats
    picking.ts      liste de picking groupée par emplacement
    updater.ts      mise à jour auto via GitHub Releases
  preload/    pont IPC sécurisé (window.api)
  renderer/   interface React
  shared/     types et référentiels communs (encres, raretés, règles, suivi)
test/         tests vitest (parseur + intégration import→picking)
```

Un connecteur **Odoo** (récupération automatique des ventes) est prévu par
l'architecture et pourra s'ajouter comme module dans `src/main/`.
