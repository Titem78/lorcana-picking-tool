import { useEffect, useState } from 'react'
import type { User } from '@shared/types'
import { confirmDialog } from '@/lib/dialogs'
import { RARITY_LABELS_FR } from '@shared/constants'

interface StockItem {
  cm_article_id: string
  name: string
  number: string | null
  set_code: string | null
  color_code: string | null
  language: string | null
  condition: string | null
  is_foil: number
  comment: string | null
  price: string | null
  quantity: number
  updated_at: string
}

interface StockTotals {
  items: number
  copies: number
  value_cents: number
}

interface Snapshot {
  id: number
  taken_at: string
  label: string | null
  kind: string
  items: number
  copies: number
  value_cents: number
}

interface DiffRow {
  name: string
  number: string | null
  set_code: string | null
  color_code: string | null
  language: string | null
  is_foil: number
  price: string | null
  qty_before: number
  qty_after: number
  delta: number
}

interface SalesRow {
  name: string
  number: string | null
  set_code: string | null
  color_code: string | null
  language: string | null
  is_foil: number
  rarity: string
  sold: number
  orders: number
  revenue_cents: number
  last_price: string | null
  in_stock: number
  statut?: 'rupture' | 'faible'
}

const euros = (cents: number): string =>
  (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })

const chapitre = (r: { set_code: string | null; color_code: string | null }): string =>
  r.set_code ? `${r.set_code}${r.color_code ?? ''}` : (r.color_code ?? '')

function CarteCell({ r }: { r: { name: string; number?: string | null; is_foil: number; language: string | null } }): React.JSX.Element {
  return (
    <td>
      {r.name}
      {r.number ? <span style={{ color: 'var(--text-dim)' }}> · n° {r.number}</span> : null}{' '}
      {r.is_foil === 1 && <span style={{ color: 'var(--accent)' }}>✨</span>}{' '}
      {r.language && r.language !== 'FR' && (
        <span className="badge" style={{ borderColor: '#58a6d3', color: '#58a6d3' }}>
          {r.language}
        </span>
      )}
    </td>
  )
}

/**
 * Module de gestion du stock : miroir local (alimenté par l'inventaire général
 * et décrémenté par chaque vente importée), instantanés datés + comparatifs,
 * top des ventes par période, et recommandations de réassort.
 */
export default function StockPage({ user }: { user: User }): React.JSX.Element {
  const [section, setSection] = useState<'stock' | 'ventes' | 'inventaires' | 'reassort'>('stock')

  // --- Section Stock -----------------------------------------------------------
  const [items, setItems] = useState<StockItem[]>([])
  const [totals, setTotals] = useState<StockTotals>({ items: 0, copies: 0, value_cents: 0 })
  const [sets, setSets] = useState<string[]>([])
  const [languages, setLanguages] = useState<string[]>([])
  const [conditions, setConditions] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [fSet, setFSet] = useState('')
  const [fLang, setFLang] = useState('')
  const [fFoil, setFFoil] = useState<'' | '1' | '0'>('')
  const [fCond, setFCond] = useState('')
  const [sort, setSort] = useState<'recent' | 'name' | 'qty' | 'price'>('recent')
  const [exportMsg, setExportMsg] = useState('')

  const refresh = (): void => {
    window.api.stock
      .list({ q, set_code: fSet, language: fLang, foil: fFoil, condition: fCond, sort })
      .then(
        (r: {
          items: StockItem[]
          totals: StockTotals
          sets: string[]
          languages: string[]
          conditions: string[]
        }) => {
          setItems(r.items)
          setTotals(r.totals)
          setSets(r.sets)
          setLanguages(r.languages)
          setConditions(r.conditions)
        }
      )
  }
  useEffect(refresh, [q, fSet, fLang, fFoil, fCond, sort])

  // --- Section Ventes / Réassort -------------------------------------------------
  const [days, setDays] = useState(30)
  const [sales, setSales] = useState<SalesRow[]>([])
  const [restock, setRestock] = useState<SalesRow[]>([])
  const [minSold, setMinSold] = useState(2)
  useEffect(() => {
    if (section === 'ventes') window.api.stock.sales(days).then(setSales)
    if (section === 'reassort') window.api.stock.restock(days, minSold).then(setRestock)
  }, [section, days, minSold])

  // --- Section Inventaires -------------------------------------------------------
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [fromId, setFromId] = useState<number | ''>('')
  const [toId, setToId] = useState<number | 'current' | ''>('current')
  const [diff, setDiff] = useState<{ rows: DiffRow[]; totals: { sortis: number; entres: number } } | null>(null)
  const loadSnapshots = (): void => {
    window.api.stock.snapshots().then((s: Snapshot[]) => {
      setSnapshots(s)
      if (s.length && fromId === '') setFromId(s[0].id)
    })
  }
  useEffect(() => {
    if (section === 'inventaires') loadSnapshots()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section])
  useEffect(() => {
    if (section !== 'inventaires' || fromId === '' || toId === '') {
      setDiff(null)
      return
    }
    window.api.stock
      .compare(fromId as number, toId === 'current' ? null : (toId as number))
      .then(setDiff)
  }, [section, fromId, toId])

  const lancerInventaire = (): void => {
    sessionStorage.setItem('startInventory', '1')
    window.dispatchEvent(new CustomEvent('goto-tab', { detail: 'cardmarket' }))
  }

  const vide = totals.items === 0 && !q && !fSet && !fLang && !fFoil && !fCond

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
        <h1 style={{ marginBottom: 0 }}>📦 Stock</h1>
        <span className="badge">{totals.items} article(s)</span>
        <span className="badge">{totals.copies} exemplaire(s)</span>
        <span className="badge" style={{ borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 700 }}>
          valeur : {euros(totals.value_cents)}
        </span>
        <span style={{ flex: 1 }} />
        <button
          className="primary"
          title="Balaye TOUT ton stock Cardmarket (lecture seule, extension par extension, ~2 requêtes/s, Stop à tout moment) puis fige un instantané daté. Ouvre l'onglet 🌐 Cardmarket — il faut y être connecté."
          onClick={lancerInventaire}
        >
          📥 Inventaire général
        </button>
        <button
          title="Fige l'état actuel du miroir en instantané daté (comparable ensuite)"
          onClick={() => {
            window.api.stock
              .snapshotTake(user.id, 'Instantané manuel', 'manual')
              .then(() => {
                setExportMsg('📸 Instantané enregistré (section Inventaires)')
                if (section === 'inventaires') loadSnapshots()
              })
          }}
        >
          📸 Instantané
        </button>
        <button
          title="Exporte tout le miroir local en CSV (Excel)"
          onClick={() => {
            window.api.stock.exportCsv().then((p: string) => {
              if (p) setExportMsg(`✅ Export enregistré : ${p}`)
            })
          }}
        >
          ⬇ CSV
        </button>
        {user.is_admin === 1 && (
          <button
            onClick={() => {
              if (confirmDialog('Vider complètement le miroir de stock local ? (Aucun effet sur Cardmarket ; les instantanés datés sont conservés.)'))
                window.api.stock.clear(user.id).then(refresh)
            }}
          >
            🗑
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {(
          [
            ['stock', '📋 Stock'],
            ['ventes', '🏆 Ventes'],
            ['inventaires', '📸 Inventaires'],
            ['reassort', '💡 À racheter']
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={section === id ? 'primary' : ''}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {exportMsg && (
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 10 }}>{exportMsg}</p>
      )}

      {section === 'stock' && vide && (
        <div className="placeholder">
          Ton miroir de stock est vide. Clique « 📥 Inventaire général » (il faut être connecté à
          Cardmarket dans l&apos;onglet 🌐) : tout ton stock sera balayé automatiquement, puis chaque
          commande importée le décrémentera.
        </div>
      )}

      {section === 'stock' && !vide && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              placeholder="Rechercher une carte, un commentaire…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: 260 }}
            />
            <select value={fSet} onChange={(e) => setFSet(e.target.value)} title="Chapitre / set promo">
              <option value="">Tous chapitres</option>
              {sets.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select value={fLang} onChange={(e) => setFLang(e.target.value)}>
              <option value="">Toutes langues</option>
              {languages.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <select value={fFoil} onChange={(e) => setFFoil(e.target.value as '' | '1' | '0')}>
              <option value="">Foil ou non</option>
              <option value="1">✨ Foil</option>
              <option value="0">Non foil</option>
            </select>
            <select value={fCond} onChange={(e) => setFCond(e.target.value)}>
              <option value="">Tous états</option>
              {conditions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="recent">Tri : plus récents</option>
              <option value="name">Tri : nom</option>
              <option value="qty">Tri : quantité</option>
              <option value="price">Tri : prix</option>
            </select>
          </div>

          <table className="data">
            <thead>
              <tr>
                <th>Carte / article</th>
                <th>Chapitre</th>
                <th>État</th>
                <th>Commentaire</th>
                <th style={{ textAlign: 'right' }}>Prix</th>
                <th style={{ textAlign: 'right' }}>Qté</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.cm_article_id}>
                  <CarteCell r={it} />
                  <td>{chapitre(it)}</td>
                  <td>{it.condition}</td>
                  <td style={{ color: 'var(--text-dim)' }}>{it.comment}</td>
                  <td style={{ textAlign: 'right' }}>{it.price}</td>
                  <td style={{ textAlign: 'right' }}>
                    <b>{it.quantity}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 500 && (
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: 8 }}>
              500 premiers résultats affichés — affine la recherche ou les filtres.
            </p>
          )}
        </>
      )}

      {(section === 'ventes' || section === 'reassort') && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-dim)' }}>Période :</span>
            {[7, 30, 90, 365].map((d) => (
              <button key={d} className={days === d ? 'primary' : ''} onClick={() => setDays(d)}>
                {d} j
              </button>
            ))}
            {section === 'reassort' && (
              <>
                <span style={{ color: 'var(--text-dim)', marginLeft: 12 }}>Vendues au moins</span>
                <input
                  type="number"
                  min={1}
                  value={minSold}
                  onChange={(e) => setMinSold(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  style={{ width: 60 }}
                />
                <span style={{ color: 'var(--text-dim)' }}>fois</span>
              </>
            )}
          </div>
          {section === 'reassort' && (
            <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginBottom: 10 }}>
              Cartes vendues sur la période dont le stock actuel est épuisé (🔴 rupture) ou inférieur
              aux ventes de la période (🟠 faible) — les meilleures candidates au rachat.
            </p>
          )}
          <table className="data">
            <thead>
              <tr>
                <th>Carte</th>
                <th>Chapitre</th>
                <th>Rareté</th>
                <th style={{ textAlign: 'right' }}>Vendues</th>
                <th style={{ textAlign: 'right' }}>Cmd</th>
                <th style={{ textAlign: 'right' }}>CA</th>
                <th style={{ textAlign: 'right' }}>Dernier prix</th>
                <th style={{ textAlign: 'right' }}>En stock</th>
                {section === 'reassort' && <th>Statut</th>}
              </tr>
            </thead>
            <tbody>
              {(section === 'ventes' ? sales : restock).map((r, i) => (
                <tr key={`${r.name}|${r.number}|${r.language}|${r.is_foil}|${i}`}>
                  <CarteCell r={r} />
                  <td>{chapitre(r)}</td>
                  <td>{RARITY_LABELS_FR[r.rarity] ?? r.rarity}</td>
                  <td style={{ textAlign: 'right' }}>
                    <b>{r.sold}</b>
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text-dim)' }}>{r.orders}</td>
                  <td style={{ textAlign: 'right' }}>{euros(r.revenue_cents)}</td>
                  <td style={{ textAlign: 'right' }}>{r.last_price}</td>
                  <td style={{ textAlign: 'right', color: r.in_stock === 0 ? 'var(--danger, #e5534b)' : undefined }}>
                    <b>{r.in_stock}</b>
                  </td>
                  {section === 'reassort' && (
                    <td>{r.statut === 'rupture' ? '🔴 rupture' : '🟠 faible'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {(section === 'ventes' ? sales : restock).length === 0 && (
            <p style={{ color: 'var(--text-dim)' }}>
              Rien sur cette période{section === 'reassort' ? ' avec ces critères' : ''}.
            </p>
          )}
        </>
      )}

      {section === 'inventaires' && (
        <>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginBottom: 10 }}>
            Chaque inventaire général fige un instantané daté ; le bouton 📸 en fige un à tout
            moment. Compare deux dates (ou une date avec le stock actuel) pour voir ce qui est
            sorti et entré.
          </p>
          <table className="data" style={{ marginBottom: 18 }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th style={{ textAlign: 'right' }}>Articles</th>
                <th style={{ textAlign: 'right' }}>Exemplaires</th>
                <th style={{ textAlign: 'right' }}>Valeur</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id}>
                  <td>{s.taken_at.slice(0, 16)}</td>
                  <td>{s.kind === 'sweep' ? '📥 Inventaire général' : `📸 ${s.label ?? 'Manuel'}`}</td>
                  <td style={{ textAlign: 'right' }}>{s.items}</td>
                  <td style={{ textAlign: 'right' }}>{s.copies}</td>
                  <td style={{ textAlign: 'right' }}>{euros(s.value_cents)}</td>
                  <td>
                    {user.is_admin === 1 && (
                      <button
                        onClick={() => {
                          if (confirmDialog(`Supprimer l'instantané du ${s.taken_at.slice(0, 16)} ?`))
                            window.api.stock.snapshotDelete(user.id, s.id).then(loadSnapshots)
                        }}
                      >
                        🗑
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {snapshots.length === 0 && (
            <p style={{ color: 'var(--text-dim)' }}>
              Aucun instantané pour l&apos;instant — lance un 📥 Inventaire général ou clique 📸.
            </p>
          )}

          {snapshots.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-dim)' }}>Comparer</span>
                <select value={fromId} onChange={(e) => setFromId(parseInt(e.target.value, 10))}>
                  {snapshots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.taken_at.slice(0, 16)}
                    </option>
                  ))}
                </select>
                <span style={{ color: 'var(--text-dim)' }}>→</span>
                <select
                  value={toId}
                  onChange={(e) =>
                    setToId(e.target.value === 'current' ? 'current' : parseInt(e.target.value, 10))
                  }
                >
                  <option value="current">Stock actuel</option>
                  {snapshots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.taken_at.slice(0, 16)}
                    </option>
                  ))}
                </select>
                {diff && (
                  <>
                    <span className="badge" style={{ borderColor: 'var(--danger, #e5534b)', color: 'var(--danger, #e5534b)' }}>
                      −{diff.totals.sortis} sortis
                    </span>
                    <span className="badge" style={{ borderColor: 'var(--ok)', color: 'var(--ok)' }}>
                      +{diff.totals.entres} entrés
                    </span>
                  </>
                )}
              </div>
              {diff && (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Carte</th>
                      <th>Chapitre</th>
                      <th style={{ textAlign: 'right' }}>Avant</th>
                      <th style={{ textAlign: 'right' }}>Après</th>
                      <th style={{ textAlign: 'right' }}>Δ</th>
                      <th style={{ textAlign: 'right' }}>Prix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.rows.slice(0, 500).map((r, i) => (
                      <tr key={i}>
                        <CarteCell r={r} />
                        <td>{chapitre(r)}</td>
                        <td style={{ textAlign: 'right' }}>{r.qty_before}</td>
                        <td style={{ textAlign: 'right' }}>{r.qty_after}</td>
                        <td
                          style={{
                            textAlign: 'right',
                            fontWeight: 700,
                            color: r.delta < 0 ? 'var(--danger, #e5534b)' : 'var(--ok)'
                          }}
                        >
                          {r.delta > 0 ? `+${r.delta}` : r.delta}
                        </td>
                        <td style={{ textAlign: 'right' }}>{r.price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {diff && diff.rows.length === 0 && (
                <p style={{ color: 'var(--text-dim)' }}>Aucune différence entre les deux états.</p>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
