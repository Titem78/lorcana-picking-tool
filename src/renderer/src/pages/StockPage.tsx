import { useEffect, useState } from 'react'
import type { User } from '@shared/types'
import { confirmDialog } from '@/lib/dialogs'
import { INK_HEX, INK_LABELS_FR, RARITY_LABELS_FR } from '@shared/constants'

/** Multi-sélection à puces : clic = coche/décoche, rien coché = tout. */
function Chips({
  options,
  selected,
  onChange,
  labels
}: {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  labels?: Record<string, string>
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <button
          key={o}
          className={selected.includes(o) ? 'primary' : ''}
          style={{ padding: '2px 9px', fontSize: '0.8rem' }}
          onClick={() =>
            onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o])
          }
        >
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  )
}

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
  rarity: string | null
  ink: string | null
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
  prev_sold: number
  orders: number
  revenue_cents: number
  last_price: string | null
  in_stock: number
  statut?: 'rupture' | 'faible'
}

interface DormantRow {
  name: string
  set_code: string | null
  color_code: string | null
  language: string | null
  is_foil: number
  condition: string | null
  price: string | null
  quantity: number
  value_cents: number
  updated_at: string
}

const cleVente = (r: { name: string; language: string | null; is_foil: number }): string =>
  `${r.name}|${r.language ?? ''}|${r.is_foil}`


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
  const [section, setSection] = useState<
    'stock' | 'ventes' | 'inventaires' | 'reassort' | 'dormant' | 'seuils'
  >('stock')

  // --- Section Stock -----------------------------------------------------------
  const [items, setItems] = useState<StockItem[]>([])
  const [totals, setTotals] = useState<StockTotals>({ items: 0, copies: 0, value_cents: 0 })
  const [sets, setSets] = useState<string[]>([])
  const [languages, setLanguages] = useState<string[]>([])
  const [rarities, setRarities] = useState<string[]>([])
  const [conditions, setConditions] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [fSets, setFSets] = useState<string[]>([])
  const [fLangs, setFLangs] = useState<string[]>([])
  const [fRars, setFRars] = useState<string[]>([])
  const [fConds, setFConds] = useState<string[]>([])
  const [fFoil, setFFoil] = useState<'' | '1' | '0'>('')
  const [sort, setSort] = useState<'recent' | 'name' | 'qty' | 'price'>('recent')
  const [exportMsg, setExportMsg] = useState('')

  const refresh = (): void => {
    window.api.stock
      .list({ q, sets: fSets, languages: fLangs, rarities: fRars, conditions: fConds, foil: fFoil, sort })
      .then(
        (r: {
          items: StockItem[]
          totals: StockTotals
          sets: string[]
          languages: string[]
          rarities: string[]
          conditions: string[]
        }) => {
          setItems(r.items)
          setTotals(r.totals)
          setSets(r.sets)
          setLanguages(r.languages)
          setRarities(r.rarities)
          setConditions(r.conditions)
        }
      )
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [q, fSets, fLangs, fRars, fConds, fFoil, sort])

  // --- Section Ventes / Réassort -------------------------------------------------
  const [days, setDays] = useState(30)
  const [sales, setSales] = useState<SalesRow[]>([])
  const [restock, setRestock] = useState<SalesRow[]>([])
  const [minSold, setMinSold] = useState(2)
  const [dormant, setDormant] = useState<{ rows: DormantRow[]; total_cents: number } | null>(null)
  const [dormantDays, setDormantDays] = useState(90)
  // Liste d'achat : sélection dans « À racheter »
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [buyMsg, setBuyMsg] = useState('')
  useEffect(() => {
    if (section === 'ventes') window.api.stock.sales(days).then(setSales)
    if (section === 'reassort')
      window.api.stock.restock(days, minSold).then((r: SalesRow[]) => {
        setRestock(r)
        setChecked(new Set())
      })
    if (section === 'dormant') window.api.stock.dormant(dormantDays).then(setDormant)
    if (section === 'seuils') chargerSeuils()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, days, minSold, dormantDays])

  // --- Section Seuils par rareté --------------------------------------------------
  const [seuils, setSeuils] = useState<Record<string, number>>({})
  const [manquants, setManquants] = useState<
    {
      name: string
      set_code: string | null
      color_code: string | null
      language: string | null
      is_foil: number
      rarity: string
      price: string | null
      quantity: number
      seuil: number
      manque: number
    }[]
  >([])
  const chargerSeuils = (): void => {
    window.api.stock.lowStock().then((r: { rows: typeof manquants; seuils: Record<string, number> }) => {
      setManquants(r.rows)
      setSeuils(r.seuils)
    })
  }
  const sauverSeuil = (rarity: string, value: number): void => {
    const next = { ...seuils }
    if (value > 0) next[rarity] = value
    else delete next[rarity]
    setSeuils(next)
    window.api.settings.set(user.id, 'stock_min_rarities', JSON.stringify(next)).then(chargerSeuils)
  }

  const exporterListe = (): void => {
    const rows = restock
      .filter((r) => checked.has(cleVente(r)))
      .map((r) => ({
        name: r.name,
        chapitre: chapitre(r),
        rarity: RARITY_LABELS_FR[r.rarity] ?? r.rarity,
        language: r.language,
        is_foil: r.is_foil,
        sold: r.sold,
        in_stock: r.in_stock,
        qty: Math.max(1, r.sold - r.in_stock),
        last_price: r.last_price
      }))
    window.api.stock.buyListCsv(rows).then((p: string) => {
      if (p) setBuyMsg(`✅ Liste d'achat enregistrée : ${p}`)
    })
  }

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
    // Drapeau (si l'onglet Cardmarket n'a jamais été ouvert : lu à son
    // montage) + événement (s'il est déjà vivant en arrière-plan)
    sessionStorage.setItem('startInventory', '1')
    window.dispatchEvent(new CustomEvent('goto-tab', { detail: 'cardmarket' }))
    window.dispatchEvent(new CustomEvent('start-inventory'))
  }

  // Balayage silencieux : l'onglet Cardmarket (vivant en arrière-plan) diffuse
  // sa progression — on l'affiche ici avec le bouton Stop, et on rafraîchit à
  // la fin. On peut donc lancer l'inventaire puis travailler ailleurs.
  const [invProgress, setInvProgress] = useState<{
    label: string
    page: number
    den: number | null
    items: number
  } | null>(null)
  const [invMsg, setInvMsg] = useState('')
  useEffect(() => {
    const onProgress = (e: Event): void =>
      setInvProgress((e as CustomEvent).detail as typeof invProgress)
    const onDone = (e: Event): void => {
      setInvMsg(String((e as CustomEvent).detail ?? ''))
      // Rareté + encre des nouveaux articles (données officielles, hors CM)
      window.api.stock.enrichMeta().then(() => refresh())
      refresh()
    }
    window.addEventListener('inventory-progress', onProgress)
    window.addEventListener('inventory-done', onDone)
    return () => {
      window.removeEventListener('inventory-progress', onProgress)
      window.removeEventListener('inventory-done', onDone)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const vide =
    totals.items === 0 &&
    !q &&
    !fFoil &&
    fSets.length === 0 &&
    fLangs.length === 0 &&
    fRars.length === 0 &&
    fConds.length === 0

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
          title="Prend une PHOTO datée du stock tel qu'il est maintenant, sans rien lire sur Cardmarket (0 requête) — un point de repère pour comparer ensuite. L'Inventaire général, lui, RECOMPTE le vrai stock sur Cardmarket puis prend sa photo tout seul."
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
            ['reassort', '💡 À racheter'],
            ['dormant', '😴 Dormant'],
            ['seuils', '🎯 Seuils']
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

      {invProgress && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            marginBottom: 12,
            fontSize: '0.88rem'
          }}
        >
          <div style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                borderRadius: 4,
                background: 'var(--accent, #3b82f6)',
                transition: 'width .4s',
                width: `${invProgress.den ? Math.min(100, Math.round((invProgress.page / invProgress.den) * 100)) : 100}%`
              }}
            />
          </div>
          <span style={{ whiteSpace: 'nowrap' }}>📥 {invProgress.label}</span>
          <button onClick={() => window.dispatchEvent(new CustomEvent('inventory-stop'))}>✋ Stop</button>
        </div>
      )}
      {invMsg && !invProgress && (
        <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginBottom: 10 }}>{invMsg}</p>
      )}
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
          <div style={{ display: 'flex', gap: 10, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              placeholder="Rechercher une carte, un commentaire…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: 260 }}
            />
            <select value={fFoil} onChange={(e) => setFFoil(e.target.value as '' | '1' | '0')}>
              <option value="">Foil ou non</option>
              <option value="1">✨ Foil</option>
              <option value="0">Non foil</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="recent">Tri : plus récents</option>
              <option value="name">Tri : nom</option>
              <option value="qty">Tri : quantité</option>
              <option value="price">Tri : prix</option>
            </select>
          </div>
          {/* Multifiltres : combine librement raretés + langues + états + chapitres */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {(fSets.length > 0 || fLangs.length > 0 || fRars.length > 0 || fConds.length > 0 || fFoil || q) && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className="badge" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                  {items.length}
                  {items.length === 500 ? '+' : ''} résultat(s)
                </span>
                <button
                  style={{ padding: '2px 10px', fontSize: '0.8rem' }}
                  onClick={() => {
                    setQ('')
                    setFSets([])
                    setFLangs([])
                    setFRars([])
                    setFConds([])
                    setFFoil('')
                  }}
                >
                  ✕ Réinitialiser les filtres
                </button>
              </div>
            )}
            {rarities.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem', width: 70 }}>Raretés</span>
                <Chips options={rarities} selected={fRars} onChange={setFRars} labels={RARITY_LABELS_FR} />
              </div>
            )}
            {languages.length > 1 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem', width: 70 }}>Langues</span>
                <Chips options={languages} selected={fLangs} onChange={setFLangs} />
              </div>
            )}
            {conditions.length > 1 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem', width: 70 }}>États</span>
                <Chips options={conditions} selected={fConds} onChange={setFConds} />
              </div>
            )}
            {sets.length > 1 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem', width: 70 }}>Chapitres</span>
                <Chips options={sets} selected={fSets} onChange={setFSets} />
              </div>
            )}
          </div>

          <table className="data">
            <thead>
              <tr>
                <th>Carte / article</th>
                <th>Chapitre</th>
                <th>Rareté</th>
                <th>Encre</th>
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
                  <td>{it.rarity ? (RARITY_LABELS_FR[it.rarity] ?? it.rarity) : ''}</td>
                  <td>
                    {it.ink && (
                      <span style={{ color: INK_HEX[it.ink] ?? 'var(--text-dim)' }}>
                        ⬤ {INK_LABELS_FR[it.ink] ?? it.ink}
                      </span>
                    )}
                  </td>
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
            <>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginBottom: 10 }}>
                Cartes vendues sur la période dont le stock actuel est épuisé (🔴 rupture) ou
                inférieur aux ventes de la période (🟠 faible). Coche celles à racheter puis
                exporte la liste d&apos;achat.
              </p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() =>
                    setChecked(
                      checked.size === restock.length
                        ? new Set()
                        : new Set(restock.map(cleVente))
                    )
                  }
                >
                  {checked.size === restock.length && restock.length > 0 ? '☐ Tout décocher' : '☑ Tout cocher'}
                </button>
                <button className="primary" disabled={checked.size === 0} onClick={exporterListe}>
                  🛒 Exporter la liste d&apos;achat ({checked.size})
                </button>
                {buyMsg && <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>{buyMsg}</span>}
              </div>
            </>
          )}
          <table className="data">
            <thead>
              <tr>
                {section === 'reassort' && <th></th>}
                <th>Carte</th>
                <th>Chapitre</th>
                <th>Rareté</th>
                <th style={{ textAlign: 'right' }}>Vendues</th>
                <th style={{ textAlign: 'right' }} title="NOS ventes par semaine sur la période">/sem</th>
                <th style={{ textAlign: 'right' }}>CA</th>
                <th style={{ textAlign: 'right' }}>Dernier prix</th>
                <th style={{ textAlign: 'right' }}>En stock</th>
                {section === 'ventes' && (
                  <th style={{ textAlign: 'right' }} title="Stock ÷ rythme de vente">Couverture</th>
                )}
                {section === 'reassort' && <th style={{ textAlign: 'right' }}>À racheter</th>}
                {section === 'reassort' && <th>Statut</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(section === 'ventes' ? sales : restock).map((r, i) => {
                const parSemaine = (r.sold / days) * 7
                const couverture = r.sold > 0 ? Math.round(r.in_stock / (r.sold / days)) : null
                const k = cleVente(r)
                return (
                  <tr key={`${k}|${i}`}>
                    {section === 'reassort' && (
                      <td>
                        <input
                          type="checkbox"
                          checked={checked.has(k)}
                          onChange={(e) => {
                            const next = new Set(checked)
                            if (e.target.checked) next.add(k)
                            else next.delete(k)
                            setChecked(next)
                          }}
                        />
                      </td>
                    )}
                    <CarteCell r={r} />
                    <td>{chapitre(r)}</td>
                    <td>{RARITY_LABELS_FR[r.rarity] ?? r.rarity}</td>
                    <td style={{ textAlign: 'right' }}>
                      <b>{r.sold}</b>
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-dim)' }}>
                      {parSemaine >= 10 ? Math.round(parSemaine) : parSemaine.toFixed(1)}
                    </td>
                    <td style={{ textAlign: 'right' }}>{euros(r.revenue_cents)}</td>
                    <td style={{ textAlign: 'right' }}>{r.last_price}</td>
                    <td style={{ textAlign: 'right', color: r.in_stock === 0 ? 'var(--danger, #e5534b)' : undefined }}>
                      <b>{r.in_stock}</b>
                    </td>
                    {section === 'ventes' && (
                      <td style={{ textAlign: 'right', color: 'var(--text-dim)' }}>
                        {couverture == null ? '' : couverture === 0 ? '🔴 0 j' : `~${couverture} j`}
                      </td>
                    )}
                    {section === 'reassort' && (
                      <td style={{ textAlign: 'right' }}>
                        <b>{Math.max(1, r.sold - r.in_stock)}</b>
                      </td>
                    )}
                    {section === 'reassort' && (
                      <td>{r.statut === 'rupture' ? '🔴 rupture' : '🟠 faible'}</td>
                    )}
                    <td>
                      <button
                        title="Ouvrir la recherche de cette carte sur Cardmarket (2e fenêtre, session connectée)"
                        onClick={() =>
                          window.api.cm.openWindow(
                            `https://www.cardmarket.com/fr/Lorcana/Products/Search?searchString=${encodeURIComponent(r.name)}`
                          )
                        }
                      >
                        🛒
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {(section === 'ventes' ? sales : restock).length === 0 && (
            <p style={{ color: 'var(--text-dim)' }}>
              Rien sur cette période{section === 'reassort' ? ' avec ces critères' : ''}.
            </p>
          )}
        </>
      )}

      {section === 'dormant' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-dim)' }}>Aucune vente depuis :</span>
            {[30, 90, 180, 365].map((d) => (
              <button key={d} className={dormantDays === d ? 'primary' : ''} onClick={() => setDormantDays(d)}>
                {d} j
              </button>
            ))}
            {dormant && (
              <span className="badge" style={{ borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 700 }}>
                valeur immobilisée : {euros(dormant.total_cents)}
              </span>
            )}
          </div>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginBottom: 10 }}>
            Les articles en stock dont AUCUN exemplaire ne s&apos;est vendu sur la période —
            candidats à une baisse de prix ou au déstockage, triés par valeur immobilisée.
          </p>
          <table className="data">
            <thead>
              <tr>
                <th>Carte / article</th>
                <th>Chapitre</th>
                <th>État</th>
                <th style={{ textAlign: 'right' }}>Prix</th>
                <th style={{ textAlign: 'right' }}>Qté</th>
                <th style={{ textAlign: 'right' }}>Valeur</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(dormant?.rows ?? []).map((r, i) => (
                <tr key={i}>
                  <CarteCell r={r} />
                  <td>{chapitre(r)}</td>
                  <td>{r.condition}</td>
                  <td style={{ textAlign: 'right' }}>{r.price}</td>
                  <td style={{ textAlign: 'right' }}>{r.quantity}</td>
                  <td style={{ textAlign: 'right' }}>
                    <b>{euros(r.value_cents)}</b>
                  </td>
                  <td>
                    <button
                      title="Ouvrir la recherche de cette carte sur Cardmarket (2e fenêtre) pour ajuster le prix"
                      onClick={() =>
                        window.api.cm.openWindow(
                          `https://www.cardmarket.com/fr/Lorcana/Products/Search?searchString=${encodeURIComponent(r.name)}`
                        )
                      }
                    >
                      🛒
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {dormant && dormant.rows.length === 0 && (
            <p style={{ color: 'var(--text-dim)' }}>
              Rien ne dort : tout le stock a vendu au moins un exemplaire sur la période 🎉
            </p>
          )}
        </>
      )}

      {section === 'seuils' && (
        <>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginBottom: 10 }}>
            Fixe un stock MINIMUM par rareté (ex. 30 pour Commune et Inhabituelle si tu vises 30
            exemplaires en vente par carte) : la liste montre toutes les cartes SOUS leur seuil,
            avec combien il en manque — à recompléter depuis les boîtes. Vide = pas de seuil.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
            {['Common', 'Uncommon', 'Rare', 'Super_rare', 'Epic', 'Legendary', 'Enchanted', 'Promo', 'Iconic'].map(
              (r) => (
                <label key={r} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.88rem' }}>
                  {RARITY_LABELS_FR[r] ?? r}
                  <input
                    type="number"
                    min={0}
                    value={seuils[r] ?? ''}
                    placeholder="—"
                    onChange={(e) => sauverSeuil(r, parseInt(e.target.value, 10) || 0)}
                    style={{ width: 64 }}
                  />
                </label>
              )
            )}
          </div>
          {Object.keys(seuils).length === 0 ? (
            <p style={{ color: 'var(--text-dim)' }}>Renseigne au moins un seuil pour voir les manquants.</p>
          ) : (
            <>
              <p style={{ marginBottom: 8 }}>
                <b>{manquants.length}</b> carte(s) sous leur seuil —{' '}
                <b>{manquants.reduce((s, m) => s + m.manque, 0)}</b> exemplaire(s) à recompléter.
              </p>
              <table className="data">
                <thead>
                  <tr>
                    <th>Carte</th>
                    <th>Chapitre</th>
                    <th>Rareté</th>
                    <th style={{ textAlign: 'right' }}>En stock</th>
                    <th style={{ textAlign: 'right' }}>Seuil</th>
                    <th style={{ textAlign: 'right' }}>Manque</th>
                    <th style={{ textAlign: 'right' }}>Prix</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {manquants.map((m, i) => (
                    <tr key={i}>
                      <CarteCell r={m} />
                      <td>{chapitre(m)}</td>
                      <td>{RARITY_LABELS_FR[m.rarity] ?? m.rarity}</td>
                      <td style={{ textAlign: 'right' }}>{m.quantity}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-dim)' }}>{m.seuil}</td>
                      <td style={{ textAlign: 'right', color: 'var(--danger, #e5534b)' }}>
                        <b>+{m.manque}</b>
                      </td>
                      <td style={{ textAlign: 'right' }}>{m.price}</td>
                      <td>
                        <button
                          title="Ouvrir la recherche de cette carte sur Cardmarket (2e fenêtre)"
                          onClick={() =>
                            window.api.cm.openWindow(
                              `https://www.cardmarket.com/fr/Lorcana/Products/Search?searchString=${encodeURIComponent(m.name)}`
                            )
                          }
                        >
                          🛒
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {manquants.length === 0 && (
                <p style={{ color: 'var(--text-dim)' }}>Tout le stock est au-dessus des seuils 🎉</p>
              )}
            </>
          )}
        </>
      )}

      {section === 'inventaires' && (
        <>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginBottom: 10 }}>
            <b>📥 Inventaire général</b> = recompter le vrai stock sur Cardmarket (balayage, puis
            photo automatique). <b>📸 Instantané</b> = photo du stock tel que l&apos;app le
            connaît, sans toucher Cardmarket — un point de repère (avant un salon, un gros
            achat…). Compare ensuite deux dates, ou une date avec le stock actuel, pour voir ce
            qui est sorti et entré.
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
