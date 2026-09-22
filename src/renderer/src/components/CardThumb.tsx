import { useRef, useState } from 'react'
import { INK_HEX } from '@shared/constants'

interface ThumbLine {
  image_file: string | null
  image_large_file?: string | null
  ink?: string | null
  color_label?: string | null
  name: string
  lorcast_name?: string | null
  language?: string | null
  is_foil?: number | boolean
}

const isAltVersion = (name: string): boolean => /\(V\.[2-9]\d*\)/i.test(name)

/**
 * Vignette de carte. SURVOL → zoom plein écran avec bandeau d'identification
 * (nom, langue, FOIL, alerte version alternative) : le visuel Lorcast est
 * celui de la version de base — pour les V.2/promos, vérifier ou remplacer.
 * CLIC DROIT → remplacer le visuel (image exacte depuis Cardmarket).
 */
export default function CardThumb({
  line,
  size = 52,
  onMissingClick,
  onCustomize
}: {
  line: ThumbLine
  size?: number
  /** clic sur le placeholder quand il n'y a pas de visuel */
  onMissingClick?: () => void
  /** clic droit : associer/remplacer le visuel */
  onCustomize?: () => void
}): React.JSX.Element {
  const [zoom, setZoom] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ink = line.ink ?? line.color_label ?? ''
  const hex = INK_HEX[ink] ?? '#555'
  const foil = line.is_foil === 1 || line.is_foil === true
  const alt = isAltVersion(line.name)

  const enter = (): void => {
    hoverTimer.current = setTimeout(() => setZoom(true), 180)
  }
  const leave = (): void => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setZoom(false)
  }
  const context = (e: React.MouseEvent): void => {
    if (onCustomize) {
      e.preventDefault()
      leave()
      onCustomize()
    }
  }

  if (!line.image_file) {
    return (
      <div
        title={onMissingClick ? `${line.name} — clique pour ajouter un visuel` : line.name}
        onClick={onMissingClick}
        onContextMenu={context}
        style={{
          width: size,
          height: Math.round(size * 1.4),
          borderRadius: 4,
          background: `linear-gradient(160deg, ${hex}66, ${hex}22)`,
          border: `1px solid ${hex}`,
          flexShrink: 0,
          cursor: onMissingClick ? 'pointer' : 'default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.round(size / 3)
        }}
      >
        {onMissingClick ? '📷' : ''}
      </div>
    )
  }

  const zoomFile = line.image_large_file ?? line.image_file
  // Visuel repris de l'ANNONCE Cardmarket (photo produit, toujours en
  // anglais) alors que la carte vendue est FR : on le signale pour que le
  // scan anglais ne fasse pas douter de la langue — remplacé automatiquement
  // par le scan français dès sa publication.
  const annonceEn =
    line.image_file.startsWith('cm_') && (line.language ?? '').toUpperCase().startsWith('FR')

  return (
    <>
      <span style={{ position: 'relative', flexShrink: 0, display: 'inline-flex' }}>
        <img
          src={`appcache://images/${line.image_file}`}
          alt={line.name}
          onMouseEnter={enter}
          onMouseLeave={leave}
          onContextMenu={context}
          title={
            annonceEn
              ? `${line.name} — visuel FR indisponible : photo de l'annonce Cardmarket (anglaise), la carte vendue est bien FR`
              : line.name
          }
          style={{
            width: size,
            borderRadius: 4
          }}
        />
        {annonceEn && (
          <span
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'rgba(20,20,20,0.82)',
              color: '#ffce55',
              fontWeight: 700,
              fontSize: Math.max(8, Math.round(size / 8)),
              lineHeight: 1.5,
              textAlign: 'center',
              borderRadius: '0 0 4px 4px',
              pointerEvents: 'none',
              whiteSpace: 'nowrap'
            }}
          >
            FR indispo
          </span>
        )}
      </span>
      {zoom && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.82)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            zIndex: 60,
            pointerEvents: 'none'
          }}
        >
          <img
            src={`appcache://images/${zoomFile}`}
            alt={line.name}
            style={{
              maxHeight: '78vh',
              maxWidth: '90vw',
              minHeight: '65vh',
              objectFit: 'contain',
              borderRadius: 16,
              boxShadow: '0 8px 60px rgba(0,0,0,0.8)'
            }}
          />
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '8px 16px',
              maxWidth: '90vw',
              flexWrap: 'wrap',
              justifyContent: 'center'
            }}
          >
            <b>{line.name}</b>
            {line.lorcast_name && line.lorcast_name !== line.name && (
              <span style={{ color: 'var(--text-dim)' }}>({line.lorcast_name})</span>
            )}
            {line.language && (
              <span
                className="badge"
                style={
                  line.language !== 'FR'
                    ? { borderColor: '#58a6d3', color: '#58a6d3', fontWeight: 700, fontSize: '1rem' }
                    : { fontSize: '1rem' }
                }
              >
                {line.language}
              </span>
            )}
            {foil && (
              <span
                className="badge"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 700, fontSize: '1rem' }}
              >
                ✨ FOIL
              </span>
            )}
            {annonceEn && (
              <span style={{ color: 'var(--text-dim)' }}>
                ⚠ visuel FR indisponible — photo de l’annonce Cardmarket (anglaise). La
                carte vendue est bien FR ; le scan français la remplacera dès sa
                publication
              </span>
            )}
          </div>
        </div>
      )}
    </>
  )
}
