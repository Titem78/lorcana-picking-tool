// Historique des versions, affiché dans Réglages → Nouveautés et dans le
// récapitulatif « Quoi de neuf » après chaque mise à jour.

export interface ChangelogEntry {
  version: string
  title: string
  items: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.17.0',
    title: 'Visuels FRANÇAIS pour tous les chapitres',
    items: [
      'Nouvelle source LorCards.fr : scans français y compris pour les chapitres les plus récents (set 13, Enchanted/Epic compris)',
      'Ordre des visuels : scan FRANÇAIS → scan exact de l’annonce Cardmarket → anglais en dernier recours',
      'Premier import après la mise à jour : l’app construit son index des cartes françaises (environ une minute, une seule fois)'
    ]
  },
  {
    version: '2.16.2',
    title: 'Visuels exacts réparés',
    items: [
      'Le scan exact de chaque annonce est maintenant réellement téléchargé (le serveur d’images Cardmarket exigeait un en-tête particulier)',
      'Correction du faux « Ch. 16 » sur certaines cartes (segment technique de l’URL pris pour un chapitre)',
      'Coller une adresse d’image Cardmarket (clic droit sur un visuel) fonctionne aussi désormais'
    ]
  },
  {
    version: '2.16.1',
    title: 'Import Cardmarket calibré sur la vraie page',
    items: [
      'Import d’une vente : le PDF officiel est récupéré via « Imprimer la commande » (parseur PDF infaillible : chapitre, langue, foil, tout)',
      'Repli robuste : lecture des données exactes fournies par Cardmarket dans le tableau (nom, numéro, langue, état, prix)',
      'Visuel EXACT de chaque ligne (scan de l’annonce) téléchargé et appliqué automatiquement'
    ]
  },
  {
    version: '2.16.0',
    title: 'Visuels en FRANÇAIS',
    items: [
      'Cartes FR → visuel FRANÇAIS automatique (CDN Dreamborn) quand disponible, sinon repli sur l’anglais',
      'Bouton 🐞 dans l’onglet Cardmarket : enregistre la structure de la page pour corriger rapidement les imports incomplets (chapitre manquant, image absente)'
    ]
  },
  {
    version: '2.15.0',
    title: 'Réglages organisés & connexion Cardmarket',
    items: [
      'Réglages réorganisés par catégories (Général, Import, Timbres, Odoo, Équipe, Sauvegardes…)',
      'Identifiants Cardmarket mémorisés (chiffrés par Windows) : bouton 🔑 qui remplit la connexion en un clic',
      'Import via l’onglet Cardmarket : le visuel EXACT de la version vendue est récupéré automatiquement depuis la page',
      'Retrait du badge « V. alternative » : chaque version a son propre numéro, le visuel est le bon'
    ]
  },
  {
    version: '2.14.0',
    title: 'Visuels fiabilisés & nouveautés',
    items: [
      'Zoom des cartes au SURVOL de la souris (plus besoin de cliquer)',
      'Bandeau d’identification sur le zoom : nom, langue, ✨ FOIL',
      'Alerte « ⚠ V. alternative » sur les versions V.2 / promos (visuel à vérifier)',
      'Clic droit sur un visuel pour le remplacer (image Cardmarket exacte)',
      'Cette page « Nouveautés » et récap automatique après chaque mise à jour'
    ]
  },
  {
    version: '2.13.x',
    title: 'Remboursements & import sans PDF',
    items: [
      'Onglet Cardmarket : « Importer cette commande » lit directement la page de la vente',
      'Remboursements (ex. port rendu en main propre) : saisie sur la fiche + ligne négative dans la facture Odoo',
      'Correction du bug d’interface figée après les boîtes de dialogue'
    ]
  },
  {
    version: '2.12.0',
    title: 'Import automatique',
    items: [
      'Dossier surveillé : tout Vente_#xxxx.pdf téléchargé est importé tout seul',
      'Navigateur Cardmarket intégré avec session mémorisée'
    ]
  },
  {
    version: '2.11.0',
    title: 'Contrôles renforcés',
    items: [
      'Vérification « X articles annoncés = X importés » à chaque import',
      'Badges ✨ FOIL et langue (EN en bleu) au picking',
      'Visuel d’accessoire en collant l’adresse de l’image (page produit Cardmarket)',
      'Correction des encres fantaisistes sur les dés (WHI n’est pas « Ambre »)'
    ]
  },
  {
    version: '2.9–2.10',
    title: 'Timbres La Poste',
    items: [
      'Import des planches PDF « Mon Timbre en Ligne » : chaque timbre suivi par son numéro unique',
      'Affectation du prochain timbre libre selon le poids réel — jamais réutilisé',
      'Le numéro du timbre sert de n° de suivi (traçable sur laposte.fr)',
      'Impression groupée : 8 étiquettes timbre + adresse par feuille A4',
      'Sauvegarde complète (base + visuels + planches) et restauration pour changer de PC',
      'Suppression de commandes (admin, confirmation par numéro de vente)'
    ]
  },
  {
    version: '2.5–2.8',
    title: 'Facturation Odoo complète',
    items: [
      'Facture brouillon automatique à l’expédition : client unique existant, une ligne par carte',
      'Prix convertis TTC → HT avec TVA 20 % sur chaque ligne',
      'Articles Odoo associés par type + par produit exact (stock des troves/displays/dés)',
      'Pilotage dans l’Historique : validées (n° comptable) / brouillons / manquantes, envoi en lot, sync auto',
      'Bouton « Ouvrir dans Odoo » sur chaque fiche facturée'
    ]
  },
  {
    version: '2.2–2.4',
    title: 'Flux de travail complet',
    items: [
      'Onglets numérotés ① Commandes → ② Picking → ③ Préparation → ④ Historique',
      'Dés et produits scellés importés (plus seulement les cartes)',
      'Compteurs − n/N + pour sortir les exemplaires un par un',
      'Contrôle carte par carte en préparation, bypass « Valider la commande complète »',
      'Rareté Epic dans les règles d’emplacement'
    ]
  },
  {
    version: '2.0–2.1',
    title: 'Fondations',
    items: [
      'Import des PDF de vente Cardmarket avec visuels Lorcana en cache',
      'Picking global multi-commandes groupé par emplacement (règles de rangement libres)',
      'Comptes préparateurs (PIN) et traçabilité complète',
      'Expédition avec suivi transporteur, historique, stats, exports',
      'Mises à jour automatiques via GitHub'
    ]
  }
]
