import { useEffect, useState } from 'react'
import type { RuleCriteria, StorageLocation, User } from '@shared/types'
import {
  INK_COLORS,
  INK_HEX,
  INK_LABELS_FR,
  LANGUAGES,
  LOCATION_KINDS,
  RARITIES,
  RARITY_LABELS_FR
} from '@shared/constants'
import { compactIntRanges, describeCriteria, parseChaptersInput } from '@shared/rules'

interface LocationDraft {
  name: string
  kind: StorageLocation['kind']
  color: string | null
  label: string | null
  notes: string | null
}

const EMPTY_DRAFT: LocationDraft = {
  name: '',
  kind: 'box_color',
  color: '#d4a437',
  label: null,
  notes: null
}

/**
 * Page Emplacements : où sont physiquement rangées les cartes.
 * L'ordre de la liste EST la priorité du moteur de rangement :
 * pour chaque carte, le premier emplacement dont une règle matche gagne.
 */
export default function LocationsPage({ user }: { user: User }): React.JSX.Element {
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [editing, setEditing] = useState<{ id: number | null; draft: LocationDraft } | null>(null)
  const [rulesFor, setRulesFor] = useState<StorageLocation | null>(null)

  const refresh = (): void => {
    window.api.locations.list().then(setLocations)
  }
  useEffect(refresh, [])

  const move = (index: number, dir: -1 | 1): void => {
    const target = index + dir
    if (target < 0 || target >= locations.length) return
    const ids = locations.map((l) => l.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    window.api.locations.reorder(user.id, ids).then(refresh)
  }

  const remove = (loc: StorageLocation): void => {
    if (!window.confirm(`Supprimer « ${loc.name} » ? Les commandes passées le garderont en mémoire.`))
      return
    window.api.locations.remove(user.id, loc.id).then(refresh)
  }

  const saveDraft = (): void => {
    if (!editing) return
    const { id, draft } = editing
    const action =
      id === null
        ? window.api.locations.create(user.id, draft)
        : window.api.locations.update(user.id, id, draft)
    action.then(() => {
      setEditing(null)
      refresh()
    })
  }

  return (
    <div>
      <h1>🗄️ Emplacements</h1>
      <p style={{ color: 'var(--text-dim)', marginBottom: 18, maxWidth: 700 }}>
        Décris ici où sont rangées tes cartes. L&apos;ordre de la liste compte : une carte va dans
        le <b>premier</b> emplacement dont une règle correspond. Utilise ▲▼ pour prioriser.
      </p>

      <button className="primary" onClick={() => setEditing({ id: null, draft: { ...EMPTY_DRAFT } })}>
        + Nouvel emplacement
      </button>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {locations.length === 0 && (
          <div className="placeholder">
            Aucun emplacement pour l&apos;instant. Exemple : « Deck box dorée » pour les
            légendaires, « Bac 7 » pour les communes Rubis des chapitres 1 à 5...
          </div>
        )}
        {locations.map((loc, i) => (
          <div
            key={loc.id}
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderLeft: `5px solid ${loc.color ?? 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              padding: '12px 16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <strong style={{ fontSize: '1.02rem' }}>{loc.name}</strong>
              {loc.label && <span className="badge">n° {loc.label}</span>}
              <span className="badge">
                {LOCATION_KINDS.find((k) => k.id === loc.kind)?.label ?? loc.kind}
              </span>
              <span style={{ flex: 1 }} />
              <button title="Monter" onClick={() => move(i, -1)} disabled={i === 0}>
                ▲
              </button>
              <button title="Descendre" onClick={() => move(i, 1)} disabled={i === locations.length - 1}>
                ▼
              </button>
              <button onClick={() => setRulesFor(loc)}>Règles ({loc.rules.length})</button>
              <button
                onClick={() =>
                  setEditing({
                    id: loc.id,
                    draft: {
                      name: loc.name,
                      kind: loc.kind,
                      color: loc.color,
                      label: loc.label,
                      notes: loc.notes
                    }
                  })
                }
              >
                Modifier
              </button>
              <button onClick={() => remove(loc)}>✕</button>
            </div>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginTop: 6 }}>
              {loc.rules.length === 0
                ? '⚠ Aucune règle : rien ne sera rangé ici.'
                : loc.rules.map((r) => describeCriteria(r.criteria)).join('   |   ')}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <h2 style={{ marginBottom: 14 }}>
            {editing.id === null ? 'Nouvel emplacement' : 'Modifier l’emplacement'}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 380 }}>
            <input
              placeholder="Nom (ex. Deck box dorée, Bac 7...)"
              value={editing.draft.name}
              autoFocus
              onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, name: e.target.value } })}
            />
            <select
              value={editing.draft.kind}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  draft: { ...editing.draft, kind: e.target.value as StorageLocation['kind'] }
                })
              }
            >
              {LOCATION_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-dim)' }}>
              Couleur visuelle
              <input
                type="color"
                value={editing.draft.color ?? '#888888'}
                style={{ width: 60, height: 34, padding: 2 }}
                onChange={(e) =>
                  setEditing({ ...editing, draft: { ...editing.draft, color: e.target.value } })
                }
              />
            </label>
            <input
              placeholder="Numéro / repère (optionnel, ex. 7)"
              value={editing.draft.label ?? ''}
              onChange={(e) =>
                setEditing({ ...editing, draft: { ...editing.draft, label: e.target.value || null } })
              }
            />
            <textarea
              placeholder="Notes (optionnel)"
              rows={2}
              value={editing.draft.notes ?? ''}
              onChange={(e) =>
                setEditing({ ...editing, draft: { ...editing.draft, notes: e.target.value || null } })
              }
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditing(null)}>Annuler</button>
              <button className="primary" disabled={!editing.draft.name.trim()} onClick={saveDraft}>
                Enregistrer
              </button>
            </div>
          </div>
        </Modal>
      )}

      {rulesFor && (
        <RulesEditor
          location={rulesFor}
          onClose={() => setRulesFor(null)}
          onSave={(rules) => {
            window.api.locations.setRules(user.id, rulesFor.id, rules).then(() => {
              setRulesFor(null)
              refresh()
            })
          }}
        />
      )}
    </div>
  )
}

// --- Éditeur de règles ---------------------------------------------------------

function RulesEditor({
  location,
  onClose,
  onSave
}: {
  location: StorageLocation
  onClose: () => void
  onSave: (rules: RuleCriteria[]) => void
}): React.JSX.Element {
  const [rules, setRules] = useState<RuleCriteria[]>(
    location.rules.length ? location.rules.map((r) => r.criteria) : [{}]
  )

  const update = (i: number, patch: Partial<RuleCriteria>): void => {
    setRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  return (
    <Modal onClose={onClose}>
      <h2 style={{ marginBottom: 4 }}>Règles — {location.name}</h2>
      <p style={{ color: 'var(--text-dim)', marginBottom: 14, maxWidth: 560 }}>
        Une carte est rangée ici si elle correspond à <b>au moins une</b> règle. Dans une règle,
        tous les critères cochés doivent être vrais. Critère vide = « peu importe ».
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '55vh', overflow: 'auto' }}>
        {rules.map((rule, i) => (
          <div
            key={i}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <strong>Règle {i + 1}</strong>
              <span style={{ flex: 1, color: 'var(--text-dim)', marginLeft: 12, fontSize: '0.85rem' }}>
                {describeCriteria(rule)}
              </span>
              <button onClick={() => setRules(rules.filter((_, j) => j !== i))}>✕</button>
            </div>

            <ChipRow
              label="Encres"
              options={INK_COLORS.map((c) => ({ id: c, label: INK_LABELS_FR[c], hex: INK_HEX[c] }))}
              selected={rule.colors ?? []}
              onChange={(colors) => update(i, { colors })}
            />
            <ChipRow
              label="Raretés"
              options={RARITIES.map((r) => ({ id: r, label: RARITY_LABELS_FR[r] }))}
              selected={rule.rarities ?? []}
              onChange={(rarities) => update(i, { rarities })}
            />
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                Chapitres{' '}
                <input
                  placeholder="ex. 1-5, 8"
                  defaultValue={compactIntRanges(rule.chapters ?? [])}
                  style={{ width: 130 }}
                  onBlur={(e) =>
                    update(i, {
                      chapters: e.target.value.trim() ? parseChaptersInput(e.target.value) : []
                    })
                  }
                />
              </label>
              <label style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                Foil{' '}
                <select
                  value={rule.foil === true ? 'foil' : rule.foil === false ? 'nonfoil' : 'any'}
                  onChange={(e) =>
                    update(i, {
                      foil: e.target.value === 'foil' ? true : e.target.value === 'nonfoil' ? false : null
                    })
                  }
                >
                  <option value="any">Peu importe</option>
                  <option value="foil">Foil uniquement</option>
                  <option value="nonfoil">Non-foil uniquement</option>
                </select>
              </label>
            </div>
            <ChipRow
              label="Langues"
              options={LANGUAGES.map((l) => ({ id: l, label: l }))}
              selected={rule.languages ?? []}
              onChange={(languages) => update(i, { languages })}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button onClick={() => setRules([...rules, {}])}>+ Ajouter une règle</button>
        <span style={{ flex: 1 }} />
        <button onClick={onClose}>Annuler</button>
        <button className="primary" onClick={() => onSave(rules)}>
          Enregistrer les règles
        </button>
      </div>
    </Modal>
  )
}

function ChipRow({
  label,
  options,
  selected,
  onChange
}: {
  label: string
  options: { id: string; label: string; hex?: string }[]
  selected: string[]
  onChange: (values: string[]) => void
}): React.JSX.Element {
  const toggle = (id: string): void => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem', width: 70 }}>{label}</span>
      {options.map((o) => {
        const on = selected.includes(o.id)
        return (
          <button
            key={o.id}
            onClick={() => toggle(o.id)}
            style={{
              padding: '3px 11px',
              borderRadius: 20,
              fontSize: '0.85rem',
              borderColor: on ? (o.hex ?? 'var(--accent)') : 'var(--border)',
              background: on ? (o.hex ? `${o.hex}33` : 'var(--accent-soft)') : 'var(--bg-raised)',
              color: on ? 'var(--text)' : 'var(--text-dim)'
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// --- Modal générique -----------------------------------------------------------

function Modal({
  children,
  onClose
}: {
  children: React.ReactNode
  onClose: () => void
}): React.JSX.Element {
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 40
      }}
    >
      <div
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 22,
          maxWidth: '90vw',
          maxHeight: '85vh',
          overflow: 'auto'
        }}
      >
        {children}
      </div>
    </div>
  )
}
