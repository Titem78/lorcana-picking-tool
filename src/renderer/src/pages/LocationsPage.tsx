import type { User } from '@shared/types'

export default function LocationsPage({ user: _user }: { user: User }): React.JSX.Element {
  return (
    <div>
      <h1>🗄️ Emplacements</h1>
      <div className="placeholder">
        Bientôt : définis ici où sont rangées tes cartes (boîtes, classeurs, deck boxes...).
      </div>
    </div>
  )
}
