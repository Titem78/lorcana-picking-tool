/**
 * Guide de démarrage intégré : le parcours conseillé pour un nouvel
 * utilisateur, et les réponses aux questions fréquentes. Contenu statique —
 * la référence complète est le README du dépôt GitHub.
 */

function Etape({
  n,
  titre,
  children
}: {
  n: number
  titre: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 14, marginBottom: 18, maxWidth: 760 }}>
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: 'var(--accent, #3b82f6)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          flexShrink: 0
        }}
      >
        {n}
      </div>
      <div>
        <b>{titre}</b>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginTop: 4 }}>{children}</p>
      </div>
    </div>
  )
}

function Faq({ q, children }: { q: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ marginBottom: 12, maxWidth: 760 }}>
      <b style={{ fontSize: '0.92rem' }}>{q}</b>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginTop: 2 }}>{children}</p>
    </div>
  )
}

export default function AidePage(): React.JSX.Element {
  return (
    <div>
      <h1>❓ Premiers pas</h1>
      <p style={{ color: 'var(--text-dim)', marginBottom: 20, maxWidth: 760 }}>
        Le parcours conseillé pour démarrer. Guide complet et nouveautés :{' '}
        <a
          href="https://github.com/Titem78/lorcana-picking-tool#readme"
          target="_blank"
          rel="noreferrer"
        >
          page du projet
        </a>{' '}
        — et les nouveautés de chaque version sont dans Réglages.
      </p>

      <Etape n={1} titre="Connecte-toi à Cardmarket (onglet 🌐)">
        ⚠ Le site Cardmarket doit être réglé <b>en français</b> (les cartes vendues, elles,
        peuvent être en n&apos;importe quelle langue). La bulle à côté du titre de l&apos;app
        indique l&apos;état : 🟢 connecté, 🔴 déconnecté. Tes identifiants peuvent être
        enregistrés dans Réglages — ils restent sur ce PC.
      </Etape>
      <Etape n={2} titre="Décris tes emplacements physiques (onglet Emplacements)">
        Boîtes de couleur, boîtes numérotées, classeurs… avec des règles par chapitre, encre,
        rareté, foil, langue. Le générateur crée une série de boîtes d&apos;un coup. L&apos;ordre
        de la liste est la priorité : une carte va dans le premier emplacement qui correspond.
        Pense à une boîte « Rareté = Promo » pour les cartes promotionnelles.
      </Etape>
      <Etape n={3} titre="Importe tes commandes">
        Depuis l&apos;onglet 🌐 (ouvrir une vente → « ⬇ Importer cette commande »), en
        glissant-déposant les PDF de vente dans Commandes, ou via le dossier surveillé
        (Réglages). L&apos;app récupère ensuite toute seule visuels français, encres et raretés,
        et vérifie que le compte d&apos;articles correspond à l&apos;annonce.
      </Etape>
      <Etape n={4} titre="Picke, prépare, expédie">
        Picking = liste groupée par emplacement, chaque coche est tracée. La fiche de commande
        donne le grammage estimé et la <b>recommandation d&apos;affranchissement Cardmarket</b>,
        un bouton 📋 copie l&apos;adresse. Au « Marquer expédiée », l&apos;app peut déposer le
        numéro de suivi et confirmer l&apos;envoi sur Cardmarket (option dans Réglages), avec
        vérification.
      </Etape>
      <Etape n={5} titre="(Facultatif) Inventaire et gestion de stock">
        Onglet 📦 Stock → « 📥 Inventaire général » : balayage complet de ton stock Cardmarket
        en lecture seule. Ensuite chaque vente décrémente le miroir : top des ventes, stock
        dormant, liste d&apos;achat, seuils par rareté, inventaires datés comparables.
      </Etape>
      <Etape n={6} titre="(Facultatif) Odoo et comptabilité">
        Pour les boutiques sous Odoo : factures clients (avec détection des pros),
        rapprochement de factures existantes, et import mensuel du relevé Cardmarket en relevé
        bancaire (« Sync gestion co. »), protégé contre les doublons.
      </Etape>

      <h2 style={{ fontSize: '1.05rem', margin: '26px 0 12px' }}>Questions fréquentes</h2>
      <Faq q="La bulle est rouge alors que la page Cardmarket est connectée ?">
        Mets l&apos;app à jour : Cardmarket a durci sa protection anti-robots (sept. 2026) ;
        depuis la 2.43.9 l&apos;app passe par un canal navigateur accepté.
      </Faq>
      <Faq q="Windows affiche « Éditeur inconnu » à l'installation ?">
        Normal (installateur non signé) : « Informations complémentaires » → « Exécuter quand
        même ». Les mises à jour suivantes sont automatiques et silencieuses.
      </Faq>
      <Faq q="Des cartes sans rareté dans le Stock ?">
        Les produits scellés/accessoires n&apos;en ont pas, et quelques versions alternatives
        ambiguës restent volontairement vides plutôt que fausses.
      </Faq>
      <Faq q="Où sont mes données ?">
        Sur ce PC uniquement (%APPDATA%/lorcana-picking-tool). Rien ne part dans un cloud ;
        l&apos;app ne parle qu&apos;à Cardmarket et, si configuré, à ton Odoo.
      </Faq>
      <Faq q="Un bug, une idée ?">
        Réglages → Général → 🐛 Signaler un problème : un e-mail pré-rempli (version + journal)
        s&apos;ouvre vers l&apos;adresse de support configurée.
      </Faq>
    </div>
  )
}
