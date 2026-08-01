import type { User } from '@shared/types'

export default function OrdersPage({ user: _user }: { user: User }): React.JSX.Element {
  return (
    <div>
      <h1>📦 Commandes</h1>
      <div className="placeholder">
        Bientôt : glisser-déposer des PDF de vente Cardmarket pour les importer.
      </div>
    </div>
  )
}
