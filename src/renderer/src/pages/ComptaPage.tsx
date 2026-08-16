import { useEffect, useRef, useState } from 'react'
import type { User } from '@shared/types'
import { confirmDialog } from '@/lib/dialogs'

interface LigneOdoo {
  cle: string
  date: string
  libelle: string
  ref: string
  montant: number
  type: string
  detail?: Record<string, number>
}

interface Analyse {
  periode: string
  fichier: { nom: string; empreinte: string }
  soldes: { debut: number; fin: number }
  repartition: Record<string, number>
  aCreer: LigneOdoo[]
  dejaPresentes: number
  avertissements: string[]
}

/**
 * 🧪 Test de la chaîne de génération avec une plage libre : les mois à données
 * étant déjà générés (jamais recréés par Cardmarket), seule une plage inédite
 * déclenche une vraie génération. Rien ne part vers Odoo.
 */
function TestGeneration({
  busy,
  setBusy,
  runningRef,
  clearMainMsg
}: {
  busy: boolean
  setBusy: (b: boolean) => void
  runningRef: React.MutableRefObject<boolean>
  clearMainMsg: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [debut, setDebut] = useState('')
  const [fin, setFin] = useState('')
  const [result, setResult] = useState('')
  const [lignes, setLignes] = useState<
    { date: string; type: string; tiers: string; ref: string; montant: number }[]
  >([])

  // Pendant le test, la progression s'affiche ICI (le haut est réservé aux
  // vrais imports — voir le filtre runningRef dans ComptaPage)
  useEffect(() => {
    window.api.cmtx.onProgress((m: string) => {
      if (runningRef.current) setResult(m)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = (): void => {
    if (!debut || !fin) return
    setBusy(true)
    runningRef.current = true
    setResult('Test en cours…')
    setLignes([])
    window.api.cmtx
      .testGeneration(debut, fin)
      .then(
        (r: {
          nom: string
          mouvements: number
          repartition: Record<string, number>
          lignes: { date: string; type: string; tiers: string; ref: string; montant: number }[]
        }) => {
          setResult(
            `✅ Chaîne complète OK : « ${r.nom} » généré et téléchargé — ${r.mouvements} mouvement(s) lu(s)` +
              (Object.keys(r.repartition).length
                ? ` (${Object.entries(r.repartition)
                    .map(([p, n]) => `${p} : ${n}`)
                    .join(', ')})`
                : '')
          )
          setLignes(r.lignes)
        }
      )
      .catch((err: Error) => setResult(`❌ ${err.message.replace(/^.*Error: /, '')}`))
      .finally(() => {
        setBusy(false)
        runningRef.current = false
        clearMainMsg()
      })
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <button onClick={() => setOpen(!open)} style={{ fontSize: '0.85rem' }}>
        {open ? 'Masquer le test' : '🧪 Tester la génération (plage libre, sans import)'}
      </button>
      {open && (
        <div
          style={{
            border: '1px dashed var(--border)',
            borderRadius: 'var(--radius)',
            padding: 12,
            marginTop: 8,
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
            fontSize: '0.9rem'
          }}
        >
          <span style={{ color: 'var(--text-dim)' }}>
            Choisis une plage <b>jamais demandée</b> (ex. un demi-mois) pour forcer une vraie
            génération. Rien ne part vers Odoo.
          </span>
          <label style={{ color: 'var(--text-dim)' }}>
            De <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} />
          </label>
          <label style={{ color: 'var(--text-dim)' }}>
            À <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
          </label>
          <button className="primary" disabled={busy || !debut || !fin} onClick={run}>
            Lancer le test
          </button>
          {result && (
            <span style={{ width: '100%', color: result.startsWith('✅') ? 'var(--ok)' : 'var(--text-dim)' }}>
              {result}
            </span>
          )}
          {lignes.length > 0 && (
            <div style={{ width: '100%', maxHeight: 240, overflow: 'auto' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Contrepartie</th>
                    <th>Référence</th>
                    <th style={{ textAlign: 'right' }}>Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l, i) => (
                    <tr key={i}>
                      <td>{l.date.split('-').reverse().join('/')}</td>
                      <td>{l.type}</td>
                      <td>{l.tiers || '—'}</td>
                      <td>{l.ref}</td>
                      <td style={{ textAlign: 'right', color: l.montant < 0 ? 'var(--danger)' : 'var(--ok)' }}>
                        {l.montant.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** 18 derniers mois, du plus récent au plus ancien (défaut : mois précédent). */
function moisRecents(n = 18): string[] {
  const out: string[] = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }
  return out
}

/**
 * Import mensuel des transactions Cardmarket dans Odoo (compte 517) — portage
 * de la spec compta livrée par l'utilisateur : aperçu obligatoire, chaîne des
 * soldes vérifiée, frais agrégés en une ligne, triple anti-doublon.
 */
export default function ComptaPage({ user }: { user: User }): React.JSX.Element {
  const [periode, setPeriode] = useState(moisRecents()[1])
  const [journalId, setJournalId] = useState<number | null>(null)
  const [journalName, setJournalName] = useState('')
  const [journalQuery, setJournalQuery] = useState('')
  const [journalHits, setJournalHits] = useState<{ id: number; name: string; code: string }[]>([])
  const [analyse, setAnalyse] = useState<Analyse | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [odooOpen, setOdooOpen] = useState(false)
  const [odooData, setOdooData] = useState<{
    lines: { date: string; payment_ref: string; amount: number; from_tool: boolean }[]
    elsewhere: { journal: string; count: number }[]
  } | null>(null)

  // Le panneau « Voir le mois dans Odoo » suit le mois choisi : changer la
  // période pendant qu'il est ouvert recharge automatiquement.
  useEffect(() => {
    if (!odooOpen || !journalId) return
    setOdooData(null)
    const [an, mois] = [periode.slice(0, 4), periode.slice(5, 7)]
    const dernierJour = new Date(parseInt(an, 10), parseInt(mois, 10), 0).getDate()
    window.api.odoo
      .listStatementLines(`${periode}-01`, `${periode}-${String(dernierJour).padStart(2, '0')}`)
      .then((d: typeof odooData) => setOdooData(d))
      .catch((err: Error) => {
        setOdooOpen(false)
        setMsg(`❌ ${err.message.replace(/^.*Error: /, '')}`)
      })
  }, [odooOpen, periode, journalId])

  const testRunningRef = useRef(false)

  useEffect(() => {
    window.api.settings.get('cmtx_journal_id').then((v: string | null) => {
      if (v) setJournalId(parseInt(v, 10))
    })
    window.api.settings.get('cmtx_journal_name').then((v: string | null) => setJournalName(v ?? ''))
    // La progression des TESTS s'affiche dans le panneau de test, pas ici
    window.api.cmtx.onProgress((m: string) => {
      if (!testRunningRef.current) setMsg(m)
    })
  }, [])

  if (user.is_admin !== 1) {
    return (
      <div>
        <h1>🔄 Sync gestion commerciale</h1>
        <div className="placeholder">
          L&apos;import comptable des transactions Cardmarket est réservé aux administrateurs.
        </div>
      </div>
    )
  }

  const chooseJournal = (j: { id: number; name: string; code: string }): void => {
    setJournalId(j.id)
    setJournalName(`${j.name} (${j.code})`)
    setJournalHits([])
    window.api.settings.set(user.id, 'cmtx_journal_id', String(j.id))
    window.api.settings.set(user.id, 'cmtx_journal_name', `${j.name} (${j.code})`)
  }

  const analyzeContent = (content: string, name: string, per: string): void => {
    setBusy(true)
    setMsg('Analyse du fichier…')
    setAnalyse(null)
    window.api.cmtx
      .analyze(content, name, per)
      .then((a: Analyse) => {
        setAnalyse(a)
        setMsg('')
      })
      .catch((err: Error) => setMsg(`❌ ${err.message.replace(/^.*Error: /, '')}`))
      .finally(() => setBusy(false))
  }

  const pickFile = (): void => {
    window.api.cmtx.pickFile().then(
      (r: { name: string; content: string; periodeGuess: string | null } | null) => {
        if (!r) return
        const per = r.periodeGuess ?? periode
        if (r.periodeGuess) setPeriode(r.periodeGuess)
        analyzeContent(r.content, r.name, per)
      }
    )
  }

  const autoDownload = (): void => {
    if (!confirmDialog(`Demander à Cardmarket le fichier des transactions de ${periode} ?\n\n(génération ~30 s côté Cardmarket)`)) return
    setBusy(true)
    setAnalyse(null)
    setMsg('Connexion à Cardmarket…')
    window.api.cmtx
      .download(periode)
      .then((r: { nom: string; contenu: string }) => analyzeContent(r.contenu, r.nom, periode))
      .catch((err: Error) => {
        setMsg(`❌ ${err.message.replace(/^.*Error: /, '')}`)
        setBusy(false)
      })
  }

  const doImport = (): void => {
    if (!analyse) return
    if (
      !confirmDialog(
        `Importer ${analyse.aCreer.length} ligne(s) dans le journal ${journalName || journalId} ?\n\nTotal : ${total.toFixed(2)} EUR — période ${analyse.periode}`
      )
    )
      return
    setBusy(true)
    setMsg('Écriture dans Odoo…')
    window.api.cmtx
      .import(user.id, analyse)
      .then((r: { created: number }) => {
        setMsg(`✅ ${r.created} ligne(s) créée(s) dans Odoo pour ${analyse.periode}`)
        setAnalyse(null)
      })
      .catch((err: Error) => setMsg(`❌ ${err.message.replace(/^.*Error: /, '')}`))
      .finally(() => setBusy(false))
  }

  const total = analyse ? analyse.aCreer.reduce((s, l) => s + l.montant, 0) : 0
  const detail = analyse?.aCreer.find((l) => l.detail)?.detail

  return (
    <div>
      <h1>🔄 Sync gestion commerciale — transactions Cardmarket → Odoo</h1>
      <p style={{ color: 'var(--text-dim)', maxWidth: 720, marginBottom: 16 }}>
        Une fois par mois : récupère le relevé Cardmarket (Transaction Summary), vérifie
        l&apos;aperçu, puis importe dans le journal 517. Ventes, achats, remboursements et
        retraits font une ligne chacun ; commissions et frais Trustee sont fondus dans une
        ligne « Frais Cardmarket » datée de fin de mois. Triple anti-doublon : réimporter ne
        crée jamais deux fois la même ligne.
      </p>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ color: 'var(--text-dim)' }}>
          Période{' '}
          <select value={periode} onChange={(e) => setPeriode(e.target.value)} disabled={busy}>
            {moisRecents().map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <span style={{ color: 'var(--text-dim)' }}>
          Journal :{' '}
          {journalId ? (
            <b style={{ color: 'var(--text)' }}>{journalName || `#${journalId}`}</b>
          ) : (
            <b style={{ color: 'var(--danger)' }}>à choisir ↓</b>
          )}
        </span>
        <button disabled={busy || !journalId} onClick={autoDownload} className="primary">
          ⚡ Récupérer depuis Cardmarket
        </button>
        <button disabled={busy || !journalId} onClick={pickFile}>
          📄 Choisir le fichier export…
        </button>
        <button disabled={busy || !journalId} onClick={() => setOdooOpen(!odooOpen)}>
          {odooOpen ? 'Masquer Odoo' : '📖 Voir le mois dans Odoo'}
        </button>
      </div>

      {odooOpen && (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 14,
            marginBottom: 16
          }}
        >
          {!odooData ? (
            <p style={{ color: 'var(--text-dim)' }}>Lecture du journal Odoo sur {periode}…</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', marginBottom: 8 }}>
                <h2 style={{ fontSize: '1rem', margin: 0 }}>
                  Déjà dans Odoo — {periode} ({odooData.lines.length} ligne(s))
                </h2>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>
                  total {odooData.lines.reduce((s, l) => s + l.amount, 0).toFixed(2)} EUR ·{' '}
                  {odooData.lines.filter((l) => l.from_tool).length} via l&apos;outil ·{' '}
                  {odooData.lines.filter((l) => !l.from_tool).length} manuelle(s)
                </span>
              </div>
              {odooData.lines.length === 0 && odooData.elsewhere.length > 0 && (
                <div
                  style={{
                    border: '1px solid var(--accent)',
                    borderRadius: 'var(--radius)',
                    padding: '8px 12px',
                    marginBottom: 8,
                    fontSize: '0.9rem'
                  }}
                >
                  ⚠ Rien dans <b>ce</b> journal, mais la période contient des lignes ailleurs :{' '}
                  {odooData.elsewhere.map((e) => `${e.journal} (${e.count})`).join(' · ')} —
                  l&apos;utilisateur a peut-être saisi dans un autre journal. Change le journal
                  ci-dessous pour comparer, et n&apos;importe pas ce mois dans un journal différent
                  sans vérifier (doublon comptable).
                </div>
              )}
              {odooData.lines.length === 0 && odooData.elsewhere.length === 0 ? (
                <p style={{ color: 'var(--ok)' }}>Rien sur cette période — le mois est vierge, tu peux importer.</p>
              ) : odooData.lines.length > 0 ? (
                <div style={{ maxHeight: 260, overflow: 'auto' }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Libellé</th>
                        <th style={{ textAlign: 'right' }}>Montant</th>
                        <th>Origine</th>
                      </tr>
                    </thead>
                    <tbody>
                      {odooData.lines.map((l, i) => (
                        <tr key={i}>
                          <td>{l.date.split('-').reverse().join('/')}</td>
                          <td>{l.payment_ref}</td>
                          <td style={{ textAlign: 'right', color: l.amount < 0 ? 'var(--danger)' : 'var(--ok)' }}>
                            {l.amount.toFixed(2)}
                          </td>
                          <td>
                            <span
                              className="badge"
                              style={l.from_tool ? { borderColor: 'var(--ok)', color: 'var(--ok)' } : {}}
                            >
                              {l.from_tool ? 'outil' : '✍ manuelle'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          placeholder="Chercher le journal banque Cardmarket (ex. 517, Cardmarket)…"
          value={journalQuery}
          style={{ width: 320 }}
          onChange={(e) => setJournalQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter')
              window.api.odoo
                .searchJournals(journalQuery)
                .then(setJournalHits)
                .catch((err: Error) => setMsg(`❌ ${err.message.replace(/^.*Error: /, '')}`))
          }}
        />
        <button
          onClick={() =>
            window.api.odoo
              .searchJournals(journalQuery)
              .then(setJournalHits)
              .catch((err: Error) => setMsg(`❌ ${err.message.replace(/^.*Error: /, '')}`))
          }
        >
          Chercher
        </button>
        {journalHits.map((j) => (
          <button key={j.id} onClick={() => chooseJournal(j)}>
            {j.name} ({j.code})
          </button>
        ))}
      </div>

      {msg && (
        <div
          style={{
            padding: '8px 14px',
            border: `1px solid ${msg.startsWith('❌') ? 'var(--danger)' : 'var(--border)'}`,
            borderRadius: 'var(--radius)',
            marginBottom: 14,
            whiteSpace: 'pre-wrap',
            color: msg.startsWith('❌') ? 'var(--danger)' : msg.startsWith('✅') ? 'var(--ok)' : 'var(--text-dim)'
          }}
        >
          {msg}
        </div>
      )}

      <TestGeneration
        busy={busy}
        setBusy={setBusy}
        runningRef={testRunningRef}
        clearMainMsg={() => setMsg('')}
      />

      {analyse && (
        <div style={{ border: '1px solid var(--accent)', borderRadius: 'var(--radius)', padding: 16 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 8 }}>
            <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Aperçu — {analyse.periode}</h2>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>
              {analyse.fichier.nom} · solde Cardmarket {analyse.soldes.debut.toFixed(2)} →{' '}
              {analyse.soldes.fin.toFixed(2)} EUR
            </span>
            {analyse.dejaPresentes > 0 && (
              <span className="badge">{analyse.dejaPresentes} déjà dans Odoo, écartée(s)</span>
            )}
          </div>

          {analyse.avertissements.map((w, i) => (
            <div
              key={i}
              style={{
                border: '1px solid var(--danger)',
                borderRadius: 'var(--radius)',
                padding: '8px 12px',
                marginBottom: 8,
                color: 'var(--danger)',
                fontSize: '0.9rem',
                whiteSpace: 'pre-wrap'
              }}
            >
              ⚠ {w}
            </div>
          ))}

          <div style={{ maxHeight: 320, overflow: 'auto', marginBottom: 10 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Libellé</th>
                  <th style={{ textAlign: 'right' }}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {analyse.aCreer.map((l) => (
                  <tr key={l.cle}>
                    <td>{l.date.split('-').reverse().join('/')}</td>
                    <td>{l.libelle}</td>
                    <td style={{ textAlign: 'right', color: l.montant < 0 ? 'var(--danger)' : 'var(--ok)' }}>
                      {l.montant.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detail && (
            <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginBottom: 10 }}>
              Détail de la ligne de frais :{' '}
              {Object.entries(detail)
                .map(([t, v]) => `${t} ${v.toFixed(2)}`)
                .join(' · ')}
            </p>
          )}

          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <b>
              {analyse.aCreer.length} ligne(s) — total {total.toFixed(2)} EUR
            </b>
            <span style={{ flex: 1 }} />
            <button
              className="primary"
              disabled={busy || analyse.aCreer.length === 0}
              onClick={doImport}
            >
              ✅ Importer dans Odoo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
