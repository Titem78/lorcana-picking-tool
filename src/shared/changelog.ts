// Historique des versions, affiché dans Réglages → Nouveautés et dans le
// récapitulatif « Quoi de neuf » après chaque mise à jour.

export interface ChangelogEntry {
  version: string
  title: string
  items: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.42.2',
    title: 'Progression visible partout, navigation, mise à jour discrète',
    items: [
      'Inventaire silencieux : une mini-barre de progression s’affiche dans la BARRE LATÉRALE (visible depuis n’importe quel onglet, % + articles) — clique dessus pour ouvrir le détail dans Stock',
      '2e fenêtre Cardmarket : barre de navigation ← → ⟳ (plus Alt+←/→ et les boutons latéraux de la souris)',
      '« Redémarrer maintenant » installe la mise à jour EN SILENCE puis relance l’app — plus de fenêtre d’installateur Windows au redémarrage',
      'Réglages de vocabulaire : la différence 📥 Inventaire général (recompte le vrai stock Cardmarket) / 📸 Instantané (photo locale sans requête) est expliquée dans la section Inventaires'
    ]
  },
  {
    version: '2.42.1',
    title: 'Promo et version classique ne se mélangent plus dans le Stock',
    items: [
      'Bug signalé (Maléfique) : 4 promos DIS à 24 € fusionnées avec 31 classiques → « 35 exemplaires à 24 € = 840 € ». Le regroupement tient maintenant compte de la VERSION (chapitre ou set promo) : deux lignes distinctes, chacune avec sa vraie valeur',
      'La valeur est calculée annonce par annonce (prix de chaque annonce × sa quantité), plus jamais « prix le plus haut × total »',
      'L’inventaire général reconnaît désormais les sets promo tout en lettres (DIS, D23…) — relance un inventaire pour que les promos déjà balayées récupèrent leur set',
      'Le rapprochement ventes ↔ stock (colonnes « En stock », À racheter) distingue aussi les versions'
    ]
  },
  {
    version: '2.42.0',
    title: 'Liste d’achat, tendances, stock dormant, mise à jour en un clic',
    items: [
      '💡 À racheter : coche les cartes → liste d’achat CSV avec la QUANTITÉ CONSEILLÉE (ventes − stock), et bouton 🛒 qui ouvre la carte sur Cardmarket (session connectée) pour racheter en 2 clics',
      '🏆 Ventes : rythme (ventes/semaine), tendance ↗/↘ vs la période précédente, et couverture (« ~N jours de stock restants »)',
      '😴 Nouveau : Stock dormant — les articles jamais vendus sur la période, triés par valeur immobilisée : les candidats à baisser de prix ou déstocker',
      '🔄 Mise à jour en un clic : quand une mise à jour est téléchargée, un bandeau « Redémarrer maintenant » l’installe immédiatement — fini le double redémarrage mystère ; la version (et la pastille orange si une mise à jour attend) s’affiche en bas de la barre latérale',
      'Correction : « En stock » dans Ventes/À racheter affichait 0 à tort pour les articles balayés (l’inventaire ne fournit pas le numéro de carte) — rapprochement par nom + langue + foil'
    ]
  },
  {
    version: '2.41.2',
    title: 'Inventaire silencieux + démarrage plus fluide',
    items: [
      'L’inventaire général tourne maintenant EN SILENCE : une fois lancé, on peut travailler dans n’importe quel onglet — la progression et le bouton Stop s’affichent dans 📦 Stock (avant, quitter l’onglet Cardmarket arrêtait le balayage)',
      'L’onglet 🌐 Cardmarket reste vivant en arrière-plan après sa première ouverture : plus de rechargement de la page à chaque retour dessus',
      'Démarrage plus fluide : la bascule des visuels vers les images officielles se fait désormais en douceur (pauses entre chaque téléchargement) — c’est elle qui ralentissait le chargement de la page Cardmarket après la mise à jour'
    ]
  },
  {
    version: '2.41.0',
    title: 'Le Stock devient un vrai module de gestion',
    items: [
      'L’onglet 📦 Stock est réorganisé en 4 sections : 📋 Stock (filtres chapitre/langue/foil/état + tri), 🏆 Ventes, 📸 Inventaires, 💡 À racheter',
      '📥 Inventaire général : le bouton quitte la barre Cardmarket (interface allégée) et se lance depuis le Stock — chaque balayage complet fige automatiquement un INSTANTANÉ daté',
      '📸 Inventaires : fige un instantané à tout moment et compare deux dates (ou une date avec le stock actuel) — ce qui est sorti, entré, et en quelle quantité',
      '🏆 Ventes : top des cartes vendues sur 7/30/90/365 jours, avec rareté, nombre de commandes, chiffre d’affaires et stock restant',
      '💡 À racheter : les cartes vendues dont le stock est épuisé (🔴 rupture) ou insuffisant (🟠 faible) — les meilleures candidates au réassort',
      'Rien ne change au reste : les ventes importées continuent de décrémenter le miroir automatiquement'
    ]
  },
  {
    version: '2.40.1',
    title: 'Grand audit des visuels : zéro ambiguïté tolérée',
    items: [
      'Le bandeau sur les photos d’annonce dit désormais « FR indispo » (au lieu de « EN » qui pouvait faire douter de la langue de la carte) — la carte vendue est bien FR, seul le visuel français manque',
      'Photo d’annonce : appariement par NOM + numéro de la carte, plus jamais par position — un ordre de page différent du PDF ne peut plus poser une image sur la mauvaise ligne',
      'Scans LorCards : deux variantes (V.1/V.2) d’un même set partagent le même nom d’URL — le numéro exact est maintenant exigé, sinon aucun visuel',
      'Règle générale confirmée partout : au moindre doute, AUCUN visuel plutôt qu’un visuel possiblement faux'
    ]
  },
  {
    version: '2.40.0',
    title: 'Visuels officiels Ravensburger en français',
    items: [
      'Nouvelle source n°1 des visuels : les images OFFICIELLES de l’app Disney Lorcana (via LorcanaJSON) — haute qualité, en français, tous les chapitres ET les promos avec leur set exact (P1 à P4, PD1…)',
      'Les promos PR2/PR3 affichent donc maintenant leur vrai visuel français officiel ; Dreamborn et LorCards restent en repli, et la photo d’annonce Cardmarket (pastille EN) en dernier recours',
      'Les visuels de moindre qualité déjà en place sont remplacés automatiquement au fil des rattrapages'
    ]
  },
  {
    version: '2.39.6',
    title: 'Visuel d’annonce : pastille EN pour éviter tout doute',
    items: [
      'Le visuel repris d’une annonce Cardmarket est la photo produit, TOUJOURS en anglais et en petite résolution — même quand la carte vendue est française : une pastille EN sur la vignette et une note dans le zoom le signalent clairement, la langue vendue reste celle du badge FR',
      'Ces visuels d’annonce sont remplacés automatiquement par le scan français dès sa publication (vérification au démarrage et toutes les heures)',
      'Rappel : après une mise à jour, les nouveautés s’activent au redémarrage SUIVANT (l’app télécharge la mise à jour pendant qu’elle tourne et l’installe à la fermeture) — pas besoin de supprimer/réimporter une commande'
    ]
  },
  {
    version: '2.39.5',
    title: 'Les promos récupèrent le visuel exact de l’annonce',
    items: [
      'Les lignes sans visuel (promos DIS non scannées ailleurs) récupèrent maintenant l’image EXACTE de l’annonce depuis la page de la vente Cardmarket — la même que celle vue par l’acheteur, donc toujours la bonne version',
      'Aucune requête supplémentaire : l’app profite de la lecture déjà faite pour le grammage, et le rattrapage au démarrage reprend les commandes existantes (dont celles importées par PDF)',
      'C’est pourquoi un import via l’onglet Cardmarket avait déjà les visuels et un import PDF non : les deux chemins sont maintenant équivalents'
    ]
  },
  {
    version: '2.39.4',
    title: 'Visuels promo manquants : surveillance automatique',
    items: [
      'Un visuel promo sans emplacement de scan (version trop récente, ex. les promos DIS) n’est pas un bug : l’app préfère AUCUN visuel à celui d’une autre version — et surveille désormais LorCards toute seule (au plus 1×/heure) pour poser le bon visuel dès sa publication',
      'En attendant, la version se lit sur le badge ★ PROMO · DIS et un visuel peut être associé à la main (clic 📷)'
    ]
  },
  {
    version: '2.39.3',
    title: 'Sécurité : plus jamais le visuel d’une autre version promo',
    items: [
      'Une même carte peut exister en PLUSIEURS versions promo (ex. Elsa « Le cinquième esprit » en P3 n°6 ET en DIS n°7) : le visuel affiché est maintenant garanti être celui du BON set promo — sinon aucun visuel, jamais un visuel trompeur qui ferait picker la mauvaise carte',
      'Badge ★ PROMO (avec le code du set : DIS, PR3…) à côté du badge FOIL, dans le picking et la fiche de vente — la version se voit d’un coup d’œil',
      'Les visuels promo déjà enregistrés sont re-vérifiés une fois automatiquement au démarrage',
      'Les noms avec apostrophe (Buzz l’Éclair…) retrouvent enfin leur scan français'
    ]
  },
  {
    version: '2.39.2',
    title: 'Promos DIS : encre retrouvée par le nom',
    items: [
      'Les promos DIS (et D23…) ont une numérotation Cardmarket qui ne correspond à aucune base officielle : leur encre est maintenant retrouvée par le NOM de la carte (une réimpression promo garde l’encre de la carte d’origine)',
      'Sécurité : plus aucun risque d’associer les infos d’une mauvaise carte à une promo — le lookup direct est réservé aux codes PR2/PR3 dont la numérotation est vérifiée',
      'La rareté de ces promos reste « Promo » : la boîte à règle « Rareté = Promo » continue de toutes les accueillir'
    ]
  },
  {
    version: '2.39.1',
    title: 'Les promos trouvent enfin leur boîte',
    items: [
      'Une règle avec TOUTES les couleurs cochées (ou toutes les raretés) vaut « peu importe » : la boîte Promo accueille maintenant les promos même sans encre connue — plus de « Sans emplacement » injustifié',
      'Les cartes promo récupèrent désormais leur encre, leur rareté et leur visuel officiel via Lorcana (PR2, PR3, DIS, D23…)',
      'Carte restée sans encre alors que la base Lorcana la connaît (données incomplètes à la sortie d’un chapitre) : l’app re-vérifie et se corrige toute seule — le cas Meilin Lee chapitre 13',
      'L’import PDF accepte aussi les codes promo type D23 ou C2'
    ]
  },
  {
    version: '2.39.0',
    title: 'Signaler un problème en un clic',
    items: [
      'Réglages → Général → 🐛 Signaler un problème : décris le souci, clique, et un e-mail pré-rempli s’ouvre (version, utilisateur, dernières actions du journal) vers l’adresse de support — reste à cliquer Envoyer',
      'Bouton « 📁 Ouvrir le dossier des journaux » pour joindre les fichiers de diagnostic si besoin',
      'L’adresse de support se renseigne une seule fois dans le même écran'
    ]
  },
  {
    version: '2.38.3',
    title: 'Promos DIS aussi + rappel emplacement',
    items: [
      'Les codes promo tout en lettres (« DIS » = Discover Promo…) sont maintenant acceptés à l’import PDF, comme PR2/PR3',
      'Rappel : pour ranger toutes les promos, crée un emplacement avec une règle « Rareté = Promo » (Emplacements → Règles) — elles y iront quel que soit leur chapitre ou leur encre'
    ]
  },
  {
    version: '2.38.2',
    title: 'Les promos ne sont plus perdues à l’import',
    items: [
      'Cause du « 108 annoncés / 105 importés » de Laure : les cartes PROMO (codes PR2, PR3…) étaient silencieusement abandonnées par le lecteur de PDF — corrigé, vérifié sur le PDF réel : 108/108',
      'Les promos s’importent sans chapitre (comme les autres promos), avec visuel retrouvé par leur nom'
    ]
  },
  {
    version: '2.38.1',
    title: 'Les cartes bi-encre enfin rangées',
    items: [
      'Cause trouvée : les cartes BI-ENCRE (chapitres récents) n’avaient jamais d’encre dans l’app — elles restaient « Sans emplacement » pour toujours. Elles portent maintenant leur première encre (ex. Ambre pour une Ambre/Saphir) et se rangent normalement',
      '« 🔄 Compléter les infos » rattrape aussi les cartes qui avaient déjà leur rareté mais pas leur encre (le cas des vieilles commandes)'
    ]
  },
  {
    version: '2.38.0',
    title: 'Trois retours du terrain',
    items: [
      'Picking : quand une carte est « Sans emplacement » parce que son encre n’a pas encore été récupérée, l’app l’explique et propose « 🔄 Compléter les infos » pour la ranger aussitôt',
      'Odoo : bouton « 🚫 Ne pas facturer » dans la fiche (commande annulée…) — l’erreur de sync disparaît, la commande sort du décompte et de l’envoi en lot des manquantes (réversible avec ↩ Refacturer)',
      'Cardmarket : le bouton 🔑 Connexion remplit les identifiants ET clique le bouton de connexion — plus rien à faire'
    ]
  },
  {
    version: '2.37.1',
    title: 'Fraîcheur des exports garantie',
    items: [
      'Un export généré AVANT la fin du mois demandé n’est jamais réutilisé (garde-fou) — Cardmarket tronque de toute façon la borne au jour même et nomme le fichier avec la plage réelle, donc un fichier partiel ne peut pas se faire passer pour le mois complet',
      'Demander un mois en cours reste possible pour vérifier, avec l’avertissement « mois en cours » dans l’aperçu — l’import compta se fait mois terminé'
    ]
  },
  {
    version: '2.37.0',
    title: 'Clients professionnels',
    items: [
      'Les acheteurs badgés « Professionnel » sur Cardmarket sont détectés (badge 🏢 PRO sur la fiche de commande) — à l’import web ou via la lecture de la page de vente pour les imports PDF',
      'Nouvelle option (Réglages → Odoo, désactivée par défaut) : facturer les PRO sur leur propre fiche client Odoo, créée automatiquement avec nom, adresse et référence CM:pseudo',
      'Décochée : tout passe par le client Cardmarket habituel, comme avant'
    ]
  },
  {
    version: '2.36.0',
    title: 'Le test montre ce qu’il lit',
    items: [
      'Le test de génération affiche maintenant le contenu du fichier lu (date, type, contrepartie, montant) — plus besoin de le croire sur parole',
      'La progression des tests reste dans le panneau de test, la barre du haut ne garde plus de message périmé',
      'Nouveau garde-fou : importer un mois pas encore terminé affiche un avertissement (la ligne de frais serait partielle) — la compta s’importe mois clos'
    ]
  },
  {
    version: '2.35.2',
    title: 'Pastille fiable + test lisible',
    items: [
      'La pastille de connexion ne repasse plus au rouge à tort (anti-cache sur la vérification) et devient verte toute seule dès que tu te connectes dans l’onglet Cardmarket',
      'La progression du test de génération s’affiche dans le panneau de test'
    ]
  },
  {
    version: '2.35.1',
    title: 'La navigation manquante',
    items: [
      'Correction du « formulaire d’export introuvable » : depuis la v2.34.1, l’app cherchait le formulaire sur la page Téléchargements au lieu de naviguer d’abord vers la page Transactions — la navigation a été rétablie',
      'La génération d’un export inédit devrait maintenant fonctionner de bout en bout'
    ]
  },
  {
    version: '2.35.0',
    title: 'Test de génération à plage libre',
    items: [
      'Sync gestion co. : bouton « 🧪 Tester la génération » — choisis une plage de dates jamais demandée (ex. un demi-mois) pour valider la chaîne complète génération → téléchargement → lecture, sans rien envoyer vers Odoo',
      'Nécessaire car Cardmarket ne régénère jamais un export identique : les mois déjà générés ne peuvent plus servir à tester la génération'
    ]
  },
  {
    version: '2.34.3',
    title: 'Téléchargement = un vrai clic',
    items: [
      'Le fichier est maintenant récupéré en soumettant réellement le formulaire de la ligne (comme ton clic sur le nom bleu) et en interceptant le téléchargement du navigateur — fini les erreurs de redirection et de CORS',
      'Si le formulaire d’export est introuvable, l’app réessaie après 2 s puis enregistre la page qu’elle a vue dans cm-export-debug.html'
    ]
  },
  {
    version: '2.34.2',
    title: 'Dernier maillon : le téléchargement',
    items: [
      'Le téléchargement du fichier échouait (« Failed to fetch ») : la redirection vers le stockage Amazon est interdite à un fetch de page (CORS) — il passe maintenant par le canal principal de l’app qui la suit sans restriction',
      'La chaîne complète est : page réelle pour générer et guetter, canal principal pour rapatrier le fichier'
    ]
  },
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
