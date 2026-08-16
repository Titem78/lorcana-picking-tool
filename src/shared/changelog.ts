// Historique des versions, affiché dans Réglages → Nouveautés et dans le
// récapitulatif « Quoi de neuf » après chaque mise à jour.

export interface ChangelogEntry {
  version: string
  title: string
  items: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.34.1',
    title: 'Le mystère résolu : Cardmarket ne régénère pas',
    items: [
      'Trouvé grâce au diagnostic : quand un export identique existe déjà (même mois, même format), Cardmarket ne crée PAS de nouvelle ligne — l’app attendait donc pour rien',
      'Maintenant : si l’export du mois existe déjà, il est téléchargé directement (instantané) ; sinon génération puis détection par nouveauté OU par le nom du mois',
      'Bonus : retenter un mois déjà récupéré est désormais immédiat'
    ]
  },
  {
    version: '2.34.0',
    title: 'Récupération pilotée comme un vrai navigateur',
    items: [
      'La récupération Cardmarket est réécrite : une fenêtre invisible (ta session) charge réellement les pages et soumet les formulaires — exactement tes clics, plus aucune requête « à part » qui voyait une liste figée',
      'La demande part depuis la vraie page Transactions, l’attente recharge la vraie page Téléchargements, le téléchargement clique le vrai formulaire de la ligne',
      'En cas d’échec, cm-export-debug.html contient désormais la liste telle que l’app la voit — diagnostic direct'
    ]
  },
  {
    version: '2.33.1',
    title: 'Patience sur la file de génération',
    items: [
      'La demande d’export est bien acceptée par Cardmarket ; la ligne peut simplement tarder à apparaître dans la liste — l’app attend maintenant 60 s avant de conclure au refus (attente totale 3 min inchangée)',
      'Formulation neutre « l’utilisateur » dans l’alerte des autres journaux'
    ]
  },
  {
    version: '2.33.0',
    title: 'Récupération Cardmarket enfin complète',
    items: [
      'Cause du blocage trouvée : la liste des Téléchargements était relue depuis le cache — le fichier fraîchement généré n’y apparaissait jamais. Anti-cache ajouté, la chaîne complète fonctionne',
      '« 📖 Voir le mois dans Odoo » se recharge tout seul quand tu changes de mois',
      'Si le journal choisi est vide mais que la période contient des lignes dans d’AUTRES journaux, l’app te les montre (utile pour retrouver où Laure saisit)'
    ]
  },
  {
    version: '2.32.2',
    title: 'Téléchargement réparé + bulle autonome',
    items: [
      'Récupération Cardmarket : le téléchargement du fichier généré passe maintenant la redirection Amazon (net::ERR_FAILED corrigé) — la chaîne complète génération → aperçu → import est fonctionnelle',
      'La bulle de connexion se met à jour toute seule : toutes les 5 min, au retour sur la fenêtre, et en quittant l’onglet Cardmarket après une connexion'
    ]
  },
  {
    version: '2.32.1',
    title: 'Récupération Cardmarket : correctifs ciblés',
    items: [
      'La demande d’export envoie maintenant la bonne page d’origine (Referer) — cause probable des demandes parties dans le vide',
      'La lecture de la liste des téléchargements tolère les variations de structure de la page',
      'En cas d’échec, la réponse de Cardmarket est enregistrée dans cm-export-debug.html pour diagnostic immédiat'
    ]
  },
  {
    version: '2.32.0',
    title: 'Bulle de connexion + regard sur Odoo',
    items: [
      'Bulle verte/rouge à côté de « Lorcana Picking » : connecté ou non à Cardmarket (clic pour re-vérifier)',
      'Sync gestion co. : bouton « 📖 Voir le mois dans Odoo » — liste ce que le journal contient déjà sur la période, en distinguant lignes de l’outil et saisies manuelles',
      'Récupération Cardmarket : si la demande d’export n’est pas acceptée, l’app le dit en ~15 s au lieu d’attendre 3 minutes'
    ]
  },
  {
    version: '2.31.0',
    title: 'Sync gestion co. fiabilisée + rangement',
    items: [
      'Récupération Cardmarket réparée : Cardmarket renomme les dates des fichiers générés (mai « 01→31 » devient « …05-30 ») — l’attente ne se fie plus au nom, elle repère le fichier apparu après notre demande. Fini le « toujours en cours » sans fin',
      'Compte à rebours pendant l’attente, et message clair si Cardmarket ne génère rien (période trop ancienne ou vide)',
      'L’onglet s’appelle maintenant « 🔄 Sync gestion co. »',
      'Réglages rangés : « 📮 Envois & timbres » regroupe le grammage, la validation des envois Cardmarket et les timbres'
    ]
  },
  {
    version: '2.30.1',
    title: 'Garde-fou : mois déjà saisi à la main',
    items: [
      'Import Odoo : si le journal contient déjà des lignes saisies à la main sur la période (par exemple par Laure), l’aperçu l’annonce en rouge — importer par-dessus créerait des doublons que l’anti-doublon ne peut pas voir',
      'Règle simple : un mois = une seule méthode (manuel OU outil)'
    ]
  },
  {
    version: '2.30.0',
    title: 'Import compta Cardmarket → Odoo',
    items: [
      'Nouvel onglet 💶 Import Odoo (admins) : le relevé mensuel des transactions Cardmarket part dans le journal 517 en quelques clics',
      '« ⚡ Récupérer depuis Cardmarket » : l’app demande, attend et télécharge le Transaction Summary toute seule (via ta session, sans rien installer) — ou choisis le fichier .csv à la main',
      'Règles compta appliquées : une ligne par vente/achat/remboursement/retrait, frais et commissions fondus dans « Frais Cardmarket MM/AAAA » datée de fin de mois',
      'Sécurités : chaîne des soldes vérifiée, type inconnu = arrêt, alerte de période mal choisie, aperçu obligatoire, triple anti-doublon (réimporter ne crée jamais deux fois la même ligne)'
    ]
  },
  {
    version: '2.29.0',
    title: 'Import instantané + rapprochement Odoo',
    items: [
      'L’import d’une commande est maintenant immédiat : les visuels/encres arrivent en arrière-plan quelques secondes après (fini les 45 s sans savoir si ça a planté)',
      'Odoo : bouton « 🔗 Rapprocher d’une facture existante » dans la fiche — pour les brouillons supprimés puis recréés à la main, ou les factures déjà comptabilisées : associe la bonne facture et l’erreur disparaît',
      'La recherche propose d’office le n° de vente ; tu peux aussi chercher par n° FACT/… ou nom du client'
    ]
  },
  {
    version: '2.28.0',
    title: 'Tableau de bord',
    items: [
      'Nouvel onglet 📊 : ventes payées à traiter sur Cardmarket (avec celles pas encore importées), messages non lus, solde vendeur — et l’état local (picking / à préparer / à expédier)',
      'Lecture à la demande uniquement (bouton Actualiser, 2 requêtes) — jamais de rafraîchissement en boucle',
      'Clique une tuile pour ouvrir la page Cardmarket correspondante ou l’onglet de l’app'
    ]
  },
  {
    version: '2.27.0',
    title: 'Contrôle Cardmarket à la demande',
    items: [
      'Fiche de commande (préparée, expédiée ou archivée) : bouton « 🔍 Vérifier le statut » — l’app te dit si la vente est réellement marquée envoyée sur Cardmarket',
      'Si elle ne l’est pas : bouton « 📮 Envoyer suivi + valider l’expédition » pour le faire en un clic, même si l’option automatique n’était pas cochée'
    ]
  },
  {
    version: '2.26.1',
    title: 'Garde-fous sur les requêtes Cardmarket',
    items: [
      'Le rattrapage du démarrage est plafonné à 15 commandes, ignore les commandes de plus de 30 jours, abandonne définitivement après 3 échecs par commande, et s’arrête net si la session semble déconnectée',
      'Les commandes expédiées/archivées ne sont jamais re-consultées : app à jour = zéro requête, même avec des années d’historique'
    ]
  },
  {
    version: '2.26.0',
    title: 'Validation des envois sur Cardmarket',
    items: [
      'Nouvelle option (Réglages → Import & Cardmarket, désactivée par défaut) : quand tu cliques « Marquer expédiée », l’app dépose le n° de suivi sur la vente Cardmarket et confirme l’envoi',
      'Sans n° de suivi (envoi non suivi), l’envoi est confirmé directement — plus besoin de retrouver la vente sur Cardmarket',
      'Le résultat est vérifié sur la page après coup et affiché ; chaque validation est tracée dans le journal'
    ]
  },
  {
    version: '2.25.2',
    title: 'Réparation à l’ouverture de la fiche',
    items: [
      'Les commandes polluées par le bug de la v2.25.0 (dont les préparées) se réparent maintenant aussi dès l’ouverture de leur fiche — plus besoin d’attendre le rattrapage du démarrage'
    ]
  },
  {
    version: '2.25.1',
    title: 'Correctif important : suivi et dénomination',
    items: [
      '🚨 Correction du bug qui affichait « AVEC suivi » sur des envois NON suivis (la dénomination était polluée par un libellé de la page) — désolé pour les envois sur-affranchis',
      'Le suivi est maintenant lu explicitement sur la page de la vente (« Envoi non suivi » / « Suivi | Trustee Service ») et affiché AVEC / SANS / à confirmer',
      'Les commandes déjà polluées sont réparées automatiquement au démarrage'
    ]
  },
  {
    version: '2.25.0',
    title: 'Recommandation Cardmarket complète',
    items: [
      'Fiche de commande : « Recommandation Cardmarket : Lettre Verte Suivi (max. 100g) » — dénomination exacte, badge AVEC/sans suivi, grammage demandé',
      'Le grammage n’est pas dans le PDF de vente : l’app va le lire automatiquement sur la page de la vente (session connectée, lecture seule) — à l’import, au démarrage pour les commandes en cours, et à l’ouverture d’une fiche',
      'L’alerte rouge compare l’estimation au grammage demandé par Cardmarket'
    ]
  },
  {
    version: '2.24.0',
    title: 'Le grammage des envois',
    items: [
      'Fiche de commande : la recommandation Cardmarket est mise en avant (le « max. 100g » de la méthode d’envoi)',
      'Poids estimé calculé pour chaque commande (cartes × poids/carte + enveloppe) avec la tranche d’affranchissement 20/100/250/500 g',
      'Alerte rouge si l’estimation dépasse le max. de la méthode choisie par le client',
      'Réglages → Général → ⚖ Grammage : calibre le poids de l’enveloppe et des cartes avec ta balance'
    ]
  },
  {
    version: '2.23.0',
    title: 'Générateur enrichi + numéro réparé',
    items: [
      'Générer en série : critères raretés et langues, et nouveau mode « une box par rareté »',
      'Correction : certaines cartes arrivaient avec le numéro collé au nom (ex. « … élevé 185 ») et sans numéro — corrigé à l’import, et les commandes déjà importées sont réparées automatiquement au démarrage (numéro, encre, rareté, visuel)'
    ]
  },
  {
    version: '2.22.1',
    title: 'Écrire au client',
    items: [
      'Fiche de commande : bouton « 💬 Écrire au client » — ouvre son profil Cardmarket dans une fenêtre connectée, le bouton ✉ Message est juste là'
    ]
  },
  {
    version: '2.22.0',
    title: 'Les retours de Laure',
    items: [
      'Picking : un bandeau annonce clairement quand une commande est entièrement pickée (au lieu de disparaître sans prévenir)',
      'Picking : option (Réglages → Général) pour GARDER les commandes terminées affichées ✅ jusqu’à leur préparation',
      'Picking : case « Masquer les cartes déjà sorties » pour ne voir que le restant',
      'Emplacements : bouton « ⚡ Générer en série » — une box par encre pour une tranche de chapitres, avec les règles créées automatiquement',
      'Remboursement et n° de suivi : confirmation visuelle ✅ à l’enregistrement',
      'Préparation : le mode d’envoi choisi par le client est mis en évidence, même quand les timbres sont désactivés',
      'Cardmarket : bouton « ⧉ 2e fenêtre » (même session) — garde la messagerie ouverte en naviguant, et les liens qui s’ouvrent en popup fonctionnent'
    ]
  },
  {
    version: '2.21.0',
    title: 'Inventaire général',
    items: [
      'Un seul bouton « 📦 Inventaire général » balaye TOUT ton stock Cardmarket (même au-delà de la limite des 300 résultats, en passant extension par extension)',
      'Rapide et discret : lecture en arrière-plan dans ta session (~2 pages/s), sans tourner les pages à l’écran — toujours en lecture seule',
      'À la fin d’un balayage complet, les articles vendus/retirés disparaissent du miroir',
      'Onglet 📦 Stock : bouton « ⬇ Export CSV » (fichier Excel de tout l’inventaire)'
    ]
  },
  {
    version: '2.20.0',
    title: 'Import du stock en un clic',
    items: [
      'Nouveau bouton « 📥 Stock (tout) » : importe toutes les pages de Stock → Mes offres automatiquement (pause entre chaque page)',
      'Barre de progression avec compteur d’articles et bouton ✋ Stop pour interrompre à tout moment',
      'Toujours en lecture seule : l’app ne modifie jamais rien sur Cardmarket'
    ]
  },
  {
    version: '2.19.1',
    title: 'Import du stock réparé',
    items: [
      'L’import « 📥 Stock (page) » lit maintenant la vraie structure de la page Stock → Mes offres (elle diffère des pages de commande)',
      'Nom, extension, état, langue, foil, commentaire, prix et quantité sont extraits de chaque ligne affichée'
    ]
  },
  {
    version: '2.19.0',
    title: 'Inventaire de vente',
    items: [
      'Nouvel onglet 📦 Stock : miroir local de tes articles en vente Cardmarket',
      'Alimenté page par page depuis l’onglet Cardmarket (bouton « 📥 Stock (page) » sur Stock → Mes offres)',
      'Recherche, valeur totale de l’inventaire, et décrément automatique à chaque commande importée'
    ]
  },
  {
    version: '2.18.0',
    title: 'Timbres en option',
    items: [
      'La gestion des timbres devient une option (Réglages → Timbres) : désactivée, tout ce qui concerne les timbres est masqué',
      'Le numéro de suivi et son lien de vérification restent bien sûr toujours disponibles'
    ]
  },
  {
    version: '2.17.3',
    title: 'Promos en français aussi',
    items: [
      'Les cartes PROMO (sans chapitre standard) trouvent leur scan français par leur nom',
      'Un index interrompu par le réseau reprend automatiquement jusqu’à être complet'
    ]
  },
  {
    version: '2.17.2',
    title: 'Import réparé (plus jamais bloquant)',
    items: [
      'L’import n’attend plus l’indexation des cartes françaises : il aboutit immédiatement',
      'L’index se construit en arrière-plan, puis les visuels FRANÇAIS se mettent à jour automatiquement sur toutes les commandes (même déjà importées)'
    ]
  },
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
