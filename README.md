# Lorcana Picking Tool

Assistant complet de **vendeur Cardmarket** pour cartes **Disney Lorcana** :
préparation de commandes, picking par emplacement physique, gestion de stock,
statistiques de ventes, et synchronisation comptable facultative vers Odoo.

Application Windows installable, **données 100 % locales** (rien ne part dans
un cloud), mise à jour automatique.

> Licence : [PolyForm Noncommercial 1.0.0](LICENSE) — l'application est
> **gratuite pour tout usage non commercial du code**. Tu peux l'utiliser pour
> gérer ta boutique ; tu ne peux pas revendre le logiciel ni en faire un
> produit commercial.

---

## Installation

1. Télécharge le dernier `Lorcana-Picking-Tool-Setup-x.y.z.exe` dans
   [**Releases**](https://github.com/Titem78/lorcana-picking-tool/releases).
2. Lance l'installateur. **Windows SmartScreen affichera « Éditeur inconnu »**
   (l'installateur n'est pas signé numériquement — c'est cosmétique) : clique
   « Informations complémentaires » puis « Exécuter quand même ».
3. C'est tout : l'application se met ensuite à jour **toute seule** à chaque
   nouvelle version (un bandeau « Redémarrer maintenant » apparaît quand une
   mise à jour est prête).

## Guide de démarrage

### 1. Créer son compte préparateur
Au premier lancement, crée un utilisateur (nom + code PIN). Le premier compte
créé est administrateur. Chaque préparateur a son compte : toutes les actions
(picking, expéditions) sont tracées **qui / quand**.

### 2. Se connecter à Cardmarket
Ouvre l'onglet **🌐 Cardmarket** et connecte-toi à ton compte vendeur.

> ⚠ **Important : le compte Cardmarket doit être réglé en FRANÇAIS** (le site,
> pas les cartes). Toute la lecture des pages est calibrée sur l'interface
> française. Les cartes vendues peuvent être en n'importe quelle langue.

La bulle à côté du titre « Lorcana Picking » indique l'état de connexion
(🟢 connecté / 🔴 déconnecté). Tes identifiants peuvent être enregistrés dans
Réglages pour remplir le formulaire de connexion en un clic — ils restent
**sur ton PC uniquement**.

### 3. Décrire tes emplacements physiques
Onglet **Emplacements** : décris où vivent tes cartes (boîtes de couleur,
boîtes numérotées, classeurs…) avec des règles libres — par chapitre, encre,
rareté, foil, langue. Un générateur crée une série de boîtes d'un coup
(ex. une boîte par couleur pour les chapitres 1-13 + une boîte Promo).
L'ordre de la liste est la priorité : une carte va dans le **premier**
emplacement dont une règle correspond.

### 4. Importer les commandes
Trois façons :
- ouvrir une vente dans l'onglet 🌐 Cardmarket → **⬇ Importer cette commande** ;
- glisser-déposer les **PDF de vente** Cardmarket dans l'onglet Commandes ;
- dossier surveillé (Réglages) : tout PDF déposé est importé automatiquement.

L'app extrait tout (client, adresse, totaux, mode d'envoi, cartes) et va
chercher en arrière-plan les visuels **français officiels**, l'encre et la
rareté de chaque carte. Un contrôle vérifie que le nombre d'articles importés
correspond à celui annoncé par Cardmarket.

### 5. Picker, préparer, expédier
- **Picking** : liste globale groupée par emplacement (« dans la boîte Rubis,
  sortir ces cartes ») — une carte demandée par plusieurs clients apparaît une
  fois, avec la répartition.
- **Préparation** : fiche de contrôle carte par carte (ordre du PDF ou ordre
  du picking, au choix dans Réglages), grammage estimé **et recommandation
  d'affranchissement Cardmarket** (méthode, avec/sans suivi, poids max),
  bouton 📋 pour copier l'adresse.
- **Expédition** : saisie du numéro de suivi ; en option (Réglages), l'app
  **dépose le numéro de suivi et confirme l'envoi sur Cardmarket** en un clic,
  avec vérification de la prise en compte.

### 6. Stock, ventes, réassort (facultatif mais puissant)
Onglet **📦 Stock** : lance un **Inventaire général** (balayage complet de ton
stock Cardmarket, en lecture seule) — ensuite chaque vente importée décrémente
le miroir local. Tu disposes alors de : filtres par rareté/encre/chapitre,
top des ventes par période, stock dormant (valeur immobilisée), liste d'achat
« À racheter », seuils de stock minimum par rareté, et instantanés datés
comparables (inventaires avant/après).

### 7. Odoo et comptabilité (facultatif)
Pour les boutiques sous **Odoo** : envoi des commandes en factures clients
(avec détection des acheteurs professionnels), rapprochement de factures
existantes, et import mensuel du **relevé Cardmarket** en relevé bancaire
(onglet « Sync gestion co. »), avec triple protection anti-doublon.

### Signaler un problème
Réglages → Général → **🐛 Signaler un problème** : décris le souci, un e-mail
pré-rempli s'ouvre (version, journal des dernières actions) vers l'adresse de
support configurée.

---

## Questions fréquentes

**La bulle est rouge alors que je suis connecté ?** Mets l'application à jour
(≥ 2.43.9) : Cardmarket a durci sa protection anti-robots fin septembre 2026,
l'app passe désormais par un vrai canal navigateur.

**Les cartes en anglais sont-elles gérées ?** Oui, partout (badges, stock,
picking). Seule l'**interface** du site Cardmarket doit être en français.

**Où sont mes données ?** Dans `%APPDATA%/lorcana-picking-tool/` :
`lorcana-picking.db` (base SQLite) et `cache/` (visuels). Rien ne quitte ton
PC, hors les échanges directs avec Cardmarket/Odoo que tu déclenches.

**Mac/Linux ?** Non — Windows uniquement pour l'instant.

---

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

### Publier une mise à jour

```bash
npm version patch        # ou minor / major — met à jour package.json + tag git
git push origin main --follow-tags
```

Le workflow GitHub Actions construit l'installateur Windows et le publie en
Release ; toutes les installations se mettent à jour automatiquement.

### Architecture

```
src/
  main/       processus principal Electron (Node)
    db.ts            SQLite + migrations versionnées
    users.ts         comptes préparateurs (PIN hashé scrypt)
    locations.ts     emplacements + moteur de règles (1re règle gagnante)
    pdf-parser.ts    analyse des PDF de vente Cardmarket
    lorcast.ts       API Lorcast (cache JSON + images)
    lorcanajson.ts   données & visuels officiels FR (raretés, encres, promos)
    lorcards.ts      scans FR LorCards (repli)
    orders.ts        import, statuts, suivi, enrichissements, stats
    picking.ts       liste de picking groupée par emplacement
    stock.ts         miroir de stock, instantanés, ventes, réassort, seuils
    cmshipping.ts    lecture page de vente, canal Cardmarket, validation d'envoi
    cmdashboard.ts   tableau de bord Cardmarket
    cmtransactions.ts relevés Cardmarket → Odoo (compta)
    odoo.ts          JSON-RPC Odoo (factures, relevés, partenaires)
    updater.ts       mise à jour auto via GitHub Releases
  preload/    pont IPC sécurisé (window.api)
  renderer/   interface React
  shared/     types et référentiels communs
test/         tests vitest (98 tests : parseurs calibrés sur données réelles,
              intégration import→picking, stock, compta)
```
