import type { OrderStatus } from '@shared/types'

export const STATUS_LABELS: Record<OrderStatus, string> = {
  imported: 'À picker',
  picking: 'Picking en cours',
  picked: 'Pické — à préparer',
  prepared: 'Préparée',
  shipped: 'Expédiée',
  archived: 'Archivée'
}

export function statusColor(status: OrderStatus): string {
  switch (status) {
    case 'imported':
      return 'var(--text-dim)'
    case 'picking':
      return 'var(--accent)'
    case 'picked':
      return '#58a6d3'
    case 'prepared':
      return 'var(--ok)'
    case 'shipped':
      return 'var(--ok)'
    default:
      return 'var(--border)'
  }
}
