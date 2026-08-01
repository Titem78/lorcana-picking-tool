import { useEffect, useState } from 'react'
import type { ActivityEntry, AppInfo, User } from '@shared/types'

function UpdateChecker(): React.JSX.Element {
  const [state, setState] = useState<string>('')
  const [busy, setBusy] = useState(false)

  const check = (): void => {
    setBusy(true)
    setState('Vérification…')
    window.api
      .checkUpdates()
      .then((r: { status: string; current: string; latest?: string; message?: string }) => {
        setBusy(false)
        switch (r.status) {
          case 'dev':
            setState('Mode développement : pas de mise à jour.')
            break
          case 'uptodate':
            setState(`✅ Tu as la dernière version (${r.current}).`)
            break
          case 'available':
            setState(
              `⬇ Version ${r.latest} disponible (tu as la ${r.current}) — téléchargement en cours, elle s'installera à la fermeture de l'app.`
            )
            break
          default:
            setState(`⚠ Vérification impossible : ${r.message}`)
        }
      })
  }

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <button onClick={check} disabled={busy}>
        🔄 Vérifier les mises à jour maintenant
      </button>
      <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>{state}</span>
    </div>
  )
}

interface OdooCfg {
  url: string
  db: string
  user: string
  apiKey: string
  partnerMode: 'per_buyer' | 'single'
  singlePartner: string
  singlePartnerId: number | null
  productCardsId: number | null
  productCardsName: string
  productDiceId: number | null
  productDiceName: string
  productOtherId: number | null
  productOtherName: string
}

/**
 * Sélecteur d'un enregistrement Odoo existant (client ou article) :
 * on tape quelques lettres, on cherche dans Odoo, on clique sur le bon.
 * Aucune saisie d'ID à la main, aucun doublon possible.
 */
function OdooPicker({
  label,
  selectedId,
  selectedName,
  search,
  onSelect
}: {
  label: string
  selectedId: number | null
  selectedName: string
  search: (query: string) => Promise<{ id: number; name: string }[]>
  onSelect: (id: number | null, name: string) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: number; name: string }[] | null>(null)
  const [busy, setBusy] = useState(false)

  const doSearch = (): void => {
    if (!query.trim()) return
    setBusy(true)
    search(query.trim())
      .then(setResults)
      .catch(() => setResults([]))
      .finally(() => setBusy(false))
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem', width: 130 }}>{label}</span>
      {selectedId ? (
        <>
          <span className="badge" style={{ borderColor: 'var(--ok)', color: 'var(--text)' }}>
            {selectedName} (n°{selectedId})
          </span>
          <button onClick={() => onSelect(null, '')}>Changer</button>
        </>
      ) : (
        <>
          <input
            placeholder="Rechercher dans Odoo…"
            value={query}
            style={{ width: 190 }}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') doSearch()
            }}
          />
          <button onClick={doSearch} disabled={busy || !query.trim()}>
            🔎
          </button>
          {results !== null &&
            (results.length === 0 ? (
              <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>aucun résultat</span>
            ) : (
              results.map((r) => (
                <button
                  key={r.id}
                  style={{ fontSize: '0.85rem' }}
                  onClick={() => {
                    onSelect(r.id, r.name)
                    setResults(null)
                    setQuery('')
                  }}
                >
                  {r.name}
                </button>
              ))
            ))}
        </>
      )}
    </div>
  )
}

/**
 * Connecteur Odoo (admins) : configuration + test de connexion.
 * À l'expédition d'une commande, l'app crée dans Odoo le client
 * « Cardmarket - pseudo » et une facture brouillon (détail + port).
 */
function OdooSection({ user }: { user: User }): React.JSX.Element {
  const [cfg, setCfg] = useState<OdooCfg>({
    url: '',
    db: '',
    user: '',
    apiKey: '',
    partnerMode: 'per_buyer',
    singlePartner: 'Cardmarket',
    singlePartnerId: null,
    productCardsId: null,
    productCardsName: '',
    productDiceId: null,
    productDiceName: '',
    productOtherId: null,
    productOtherName: ''
  })
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api.odoo.getConfig().then((c: OdooCfg | null) => {
      if (c) setCfg(c)
    })
  }, [])

  const complete = cfg.url.trim() && cfg.db.trim() && cfg.user.trim() && cfg.apiKey.trim()

  const test = (): void => {
    setBusy(true)
    setStatus('Connexion à Odoo…')
    window.api.odoo
      .test(cfg)
      .then((r: { version: string; company: string }) => {
        setStatus(`✅ Connecté — Odoo ${r.version}, société « ${r.company} »`)
      })
      .catch((err: Error) => setStatus(`❌ ${err.message.replace(/^.*Error: /, '')}`))
      .finally(() => setBusy(false))
  }

  const save = (): void => {
    window.api.odoo.saveConfig(user.id, cfg).then(() => setStatus('Configuration enregistrée ✔'))
  }

  return (
    <section style={{ marginBottom: 30 }}>
      <h2 style={{ fontSize: '1.05rem', marginBottom: 6 }}>Connecteur Odoo</h2>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginBottom: 12, maxWidth: 720 }}>
        À chaque commande marquée <b>expédiée</b>, l&apos;app crée dans Odoo le client
        « Cardmarket - pseudo » et une <b>facture brouillon</b> (une ligne par carte + frais de
        port) — plus rien à ressaisir. La clé API se crée dans Odoo : avatar en haut à droite →
        Mon profil → Sécurité du compte → Clés API → Nouvelle clé.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 640 }}>
        <input
          placeholder="Adresse (ex. https://masociete.odoo.com)"
          value={cfg.url}
          onChange={(e) => setCfg({ ...cfg, url: e.target.value })}
        />
        <input
          placeholder="Base de données (souvent = masociete)"
          value={cfg.db}
          onChange={(e) => setCfg({ ...cfg, db: e.target.value })}
        />
        <input
          placeholder="Utilisateur (email de connexion Odoo)"
          value={cfg.user}
          onChange={(e) => setCfg({ ...cfg, user: e.target.value })}
        />
        <input
          placeholder="Clé API"
          type="password"
          value={cfg.apiKey}
          onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })}
        />
      </div>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-dim)' }}>
          <input
            type="radio"
            checked={cfg.partnerMode === 'per_buyer'}
            onChange={() => setCfg({ ...cfg, partnerMode: 'per_buyer' })}
          />
          Un client Odoo <b>par acheteur</b> (« Cardmarket - pseudo »)
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-dim)' }}>
          <input
            type="radio"
            checked={cfg.partnerMode === 'single'}
            onChange={() => setCfg({ ...cfg, partnerMode: 'single' })}
          />
          Un <b>client unique existant</b> pour toutes les ventes :
        </label>
        {cfg.partnerMode === 'single' && (
          <div style={{ marginLeft: 26 }}>
            <OdooPicker
              label="Client Odoo"
              selectedId={cfg.singlePartnerId}
              selectedName={cfg.singlePartner}
              search={(q) => window.api.odoo.searchPartners(cfg, q)}
              onSelect={(id, name) =>
                setCfg({ ...cfg, singlePartnerId: id, singlePartner: name || 'Cardmarket' })
              }
            />
          </div>
        )}
        <span style={{ color: 'var(--text-dim)', fontSize: '0.83rem' }}>
          Dans les deux cas, la référence de la facture est « Cardmarket #commande - pseudo ».
        </span>
      </div>

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
          <b>Articles Odoo</b> par type de produit (l&apos;app n&apos;en crée jamais — associe tes
          articles existants, ex. « Carte à l&apos;unité » ; son champ Coût dans Odoo sert de prix
          d&apos;achat pour tes marges). Sans association, la ligne reste en texte libre.
        </span>
        <OdooPicker
          label="🃏 Cartes"
          selectedId={cfg.productCardsId}
          selectedName={cfg.productCardsName}
          search={(q) => window.api.odoo.searchProducts(cfg, q)}
          onSelect={(id, name) => setCfg({ ...cfg, productCardsId: id, productCardsName: name })}
        />
        <OdooPicker
          label="🎲 Dés"
          selectedId={cfg.productDiceId}
          selectedName={cfg.productDiceName}
          search={(q) => window.api.odoo.searchProducts(cfg, q)}
          onSelect={(id, name) => setCfg({ ...cfg, productDiceId: id, productDiceName: name })}
        />
        <OdooPicker
          label="📦 Autres (scellé…)"
          selectedId={cfg.productOtherId}
          selectedName={cfg.productOtherName}
          search={(q) => window.api.odoo.searchProducts(cfg, q)}
          onSelect={(id, name) => setCfg({ ...cfg, productOtherId: id, productOtherName: name })}
        />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button disabled={!complete || busy} onClick={test}>
          🔌 Tester la connexion
        </button>
        <button className="primary" disabled={!complete} onClick={save}>
          Enregistrer
        </button>
        <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>{status}</span>
      </div>
    </section>
  )
}

/**
 * Zone dangereuse (admins) : réinitialisation TOTALE des données.
 * Garde-fou : il faut taper RESET pour déverrouiller le bouton, et le
 * processus principal revérifie (admin + confirmation) de son côté.
 */
function DangerZone({ user }: { user: User }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const armed = text.trim().toUpperCase() === 'RESET'

  const doReset = (): void => {
    window.api
      .resetData(user.id, text)
      .then(() => {
        window.alert(
          'Toutes les données ont été effacées. L’application repart de zéro : crée le premier compte préparateur.'
        )
        window.location.reload()
      })
      .catch((err: Error) => setError(err.message.replace(/^.*Error: /, '')))
  }

  return (
    <section
      style={{
        marginBottom: 30,
        border: '1px solid var(--danger)',
        borderRadius: 'var(--radius)',
        padding: 16
      }}
    >
      <h2 style={{ fontSize: '1.05rem', marginBottom: 8, color: 'var(--danger)' }}>
        ⚠ Zone dangereuse
      </h2>
      {!open ? (
        <>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: 10 }}>
            Réinitialiser efface <b>tout</b> : préparateurs, emplacements et règles, commandes en
            cours, historique, journal d&apos;activité. Irréversible. (Le cache des visuels de
            cartes est conservé.) Pense à exporter l&apos;historique et les emplacements avant.
          </p>
          <button style={{ borderColor: 'var(--danger)' }} onClick={() => setOpen(true)}>
            🗑 Réinitialiser toutes les données…
          </button>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
            Pour confirmer, tape <b style={{ color: 'var(--danger)' }}>RESET</b> :
          </span>
          <input
            value={text}
            autoFocus
            onChange={(e) => {
              setText(e.target.value)
              setError('')
            }}
            style={{ width: 120, borderColor: armed ? 'var(--danger)' : 'var(--border)' }}
          />
          <button
            disabled={!armed}
            onClick={doReset}
            style={{
              background: armed ? 'var(--danger)' : 'var(--bg-raised)',
              borderColor: 'var(--danger)',
              color: armed ? '#fff' : 'var(--text-dim)',
              fontWeight: 600
            }}
          >
            Tout effacer définitivement
          </button>
          <button
            onClick={() => {
              setOpen(false)
              setText('')
              setError('')
            }}
          >
            Annuler
          </button>
          <span style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>{error}</span>
        </div>
      )}
    </section>
  )
}

export default function SettingsPage({ user }: { user: User }): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [log, setLog] = useState<ActivityEntry[]>([])
  const [newName, setNewName] = useState('')
  const [newPin, setNewPin] = useState('')
  const [newAdmin, setNewAdmin] = useState(false)
  const [msg, setMsg] = useState('')

  const refresh = (): void => {
    window.api.appInfo().then(setInfo)
    window.api.users.list().then(setUsers)
    window.api.activity.list(100).then(setLog)
  }
  useEffect(refresh, [])

  const addUser = (e: React.FormEvent): void => {
    e.preventDefault()
    window.api.users
      .create(newName, newPin, newAdmin)
      .then(() => {
        setNewName('')
        setNewPin('')
        setNewAdmin(false)
        setMsg('Préparateur ajouté ✔')
        refresh()
      })
      .catch((err: Error) => setMsg(err.message.replace(/^.*Error: /, '')))
  }

  const toggleAdmin = (target: User): void => {
    window.api.users
      .setAdmin(user.id, target.id, target.is_admin !== 1)
      .then(refresh)
      .catch((err: Error) => setMsg(err.message.replace(/^.*Error: /, '')))
  }

  const removeUser = (target: User): void => {
    if (!window.confirm(`Désactiver le compte de ${target.name} ?`)) return
    window.api.users.deactivate(target.id, user.id).then(refresh)
  }

  return (
    <div>
      <h1>⚙️ Réglages</h1>

      <section style={{ marginBottom: 30 }}>
        <h2 style={{ fontSize: '1.05rem', marginBottom: 10 }}>Application</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: 10 }}>
          Version {info?.version ?? '…'} — les mises à jour s&apos;installent automatiquement
          depuis GitHub.
          <br />
          Base de données : {info?.dbPath ?? '…'}
        </p>
        <UpdateChecker />
      </section>

      <section style={{ marginBottom: 30 }}>
        <h2 style={{ fontSize: '1.05rem', marginBottom: 10 }}>Exports &amp; sauvegardes</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() =>
              window.api.exports.historyCsv(user.id).then((f: string | null) => {
                if (f) setMsg(`Historique exporté ✔ (${f.split(/[\\/]/).pop()})`)
              })
            }
          >
            📤 Exporter l&apos;historique (CSV)
          </button>
          <button
            onClick={() =>
              window.api.exports.locationsJson(user.id).then((f: string | null) => {
                if (f) setMsg(`Emplacements exportés ✔ (${f.split(/[\\/]/).pop()})`)
              })
            }
          >
            📤 Exporter les emplacements
          </button>
          <button
            onClick={() =>
              window.api.exports
                .importLocations(user.id)
                .then((r: { imported?: number; error?: string } | null) => {
                  if (!r) return
                  setMsg(r.error ?? `${r.imported} emplacement(s) importé(s) ✔`)
                })
            }
          >
            📥 Importer des emplacements
          </button>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>{msg}</span>
        </div>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: 8 }}>
          L&apos;export CSV s&apos;ouvre dans Excel/LibreOffice. L&apos;export des emplacements
          permet de transférer ta configuration de boîtes sur un autre PC.
        </p>
      </section>

      <section style={{ marginBottom: 30 }}>
        <h2 style={{ fontSize: '1.05rem', marginBottom: 10 }}>Préparateurs</h2>
        <table className="data" style={{ maxWidth: 560 }}>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Rôle</th>
              <th>Créé le</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.is_admin ? <span className="badge">admin</span> : ''}</td>
                <td>{u.created_at.slice(0, 10)}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  {user.is_admin === 1 && (
                    <button onClick={() => toggleAdmin(u)}>
                      {u.is_admin === 1 ? 'Retirer admin' : 'Promouvoir admin'}
                    </button>
                  )}
                  {u.id !== user.id && user.is_admin === 1 && (
                    <button onClick={() => removeUser(u)}>Désactiver</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {user.is_admin === 1 && (
          <form onSubmit={addUser} style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <input
              placeholder="Prénom / pseudo"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              placeholder="PIN (4 chiffres)"
              value={newPin}
              maxLength={4}
              style={{ width: 130 }}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
            />
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-dim)' }}
            >
              <input
                type="checkbox"
                checked={newAdmin}
                onChange={(e) => setNewAdmin(e.target.checked)}
              />
              admin
            </label>
            <button className="primary" disabled={!newName.trim() || newPin.length !== 4}>
              Ajouter
            </button>
            <span style={{ alignSelf: 'center', color: 'var(--text-dim)' }}>{msg}</span>
          </form>
        )}
      </section>

      {user.is_admin === 1 && <OdooSection user={user} />}

      {user.is_admin === 1 && <DangerZone user={user} />}

      <section>
        <h2 style={{ fontSize: '1.05rem', marginBottom: 10 }}>Journal d&apos;activité</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Quand</th>
              <th>Qui</th>
              <th>Action</th>
              <th>Détails</th>
            </tr>
          </thead>
          <tbody>
            {log.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.created_at}</td>
                <td>{entry.user_name ?? '—'}</td>
                <td>{entry.action}</td>
                <td style={{ color: 'var(--text-dim)' }}>{entry.details ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
