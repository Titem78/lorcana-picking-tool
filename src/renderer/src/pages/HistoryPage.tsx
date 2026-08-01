import type { User } from '@shared/types'

export default function HistoryPage({ user: _user }: { user: User }): React.JSX.Element {
  return (
    <div>
      <h1>📚 Historique</h1>
      <div className="placeholder">Bientôt : l&apos;historique des commandes expédiées.</div>
    </div>
  )
}
