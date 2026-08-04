import { useEffect, useState } from 'react'
import type { User } from '@shared/types'
import { confirmDialog } from '@/lib/dialogs'

interface StockItem {
  cm_article_id: string
  name: string
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

/**
 * Miroir local du stock Cardmarket, alimenté page par page depuis l'onglet
 * 🌐 Cardmarket (bouton « 📥 Stock (page) »), et décrémenté automatiquement à
 * chaque commande importée. Recherche + valeur totale de l'inventaire.
 */
export default function StockPage({ user }: { user: User }): React.JSX.Element {
  const [items, setItems] = useState<StockItem[]>([])
  const [totals, setTotals] = useState<StockTotals>({ items: 0, copies: 0, value_cents: 0 })
  const [search, setSearch] = useState('')

  const refresh = (q: string): void => {
    window.api.stock.list(q).then((r: { items: StockItem[]; totals: StockTotals }) => {
      setItems(r.items)
      setTotals(r.totals)
    })
  }
  useEffect(() => refresh(search), [search])

  const euros = (cents: number): string =>
    (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })

  if (totals.items === 0 && !search) {
    return (
      <div>
        <h1>📦 Stock</h1>
        <div className="placeholder">
          Ton miroir de stock est vide. Va dans l&apos;onglet 🌐 Cardmarket → Stock → Mes offres,
          puis clique « 📥 Stock (page) » sur chaque page de ta liste d&apos;articles. Ensuite,
          chaque commande importée décrémentera automatiquement ce miroir.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
        <h1 style={{ marginBottom: 0 }}>📦 Stock</h1>
        <span className="badge">{totals.items} article(s)</span>
        <span className="badge">{totals.copies} exemplaire(s)</span>
        <span className="badge" style={{ borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 700 }}>
          valeur : {euros(totals.value_cents)}
        </span>
        <span style={{ flex: 1 }} />
        {user.is_admin === 1 && (
          <button
            onClick={() => {
              if (confirmDialog('Vider complètement le miroir de stock local ? (Aucun effet sur Cardmarket.)'))
                window.api.stock.clear(user.id).then(() => refresh(search))
            }}
          >
            🗑 Vider le miroir
          </button>
        )}
      </div>

      <input
        placeholder="Rechercher une carte, un commentaire, un chapitre…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: 360, marginBottom: 14 }}
      />

      <table className="data">
        <thead>
          <tr>
            <th>Carte / article</th>
            <th>Chapitre</th>
            <th>Langue</th>
            <th>État</th>
            <th>Foil</th>
            <th>Commentaire</th>
            <th style={{ textAlign: 'right' }}>Prix</th>
            <th style={{ textAlign: 'right' }}>Qté</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.cm_article_id}>
              <td>{it.name}</td>
              <td>
                {it.set_code}
                {it.color_code ?? ''}
              </td>
              <td>
                {it.language && (
                  <span
                    className="badge"
                    style={it.language !== 'FR' ? { borderColor: '#58a6d3', color: '#58a6d3' } : {}}
                  >
                    {it.language}
                  </span>
                )}
              </td>
              <td>{it.condition}</td>
              <td>{it.is_foil === 1 ? '✨' : ''}</td>
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
          500 premiers résultats affichés — affine la recherche.
        </p>
      )}
    </div>
  )
}
