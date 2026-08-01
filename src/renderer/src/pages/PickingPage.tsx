import type { User } from '@shared/types'

export default function PickingPage({ user: _user }: { user: User }): React.JSX.Element {
  return (
    <div>
      <h1>🎯 Picking</h1>
      <div className="placeholder">
        Importe des PDF de commande Cardmarket dans l&apos;onglet « Commandes » pour lancer un
        picking.
      </div>
    </div>
  )
}
