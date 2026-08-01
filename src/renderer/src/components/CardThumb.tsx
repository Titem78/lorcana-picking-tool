import { useState } from 'react'
import { INK_HEX } from '@shared/constants'

interface ThumbLine {
  image_file: string | null
  image_large_file?: string | null
  ink?: string | null
  color_label?: string | null
  name: string
}

/**
 * Vignette de carte : visuel Lorcast en cache si disponible, sinon un
 * placeholder à la couleur de l'encre. Clic → zoom plein écran en haute
 * définition (image_large_file, avec repli sur la vignette).
 */
export default function CardThumb({
  line,
  size = 52,
  onMissingClick
}: {
  line: ThumbLine
  size?: number
  /** clic sur le placeholder quand il n'y a pas de visuel (ex. accessoires : associer une image) */
  onMissingClick?: () => void
}): React.JSX.Element {
  const [zoom, setZoom] = useState(false)
  const ink = line.ink ?? line.color_label ?? ''
  const hex = INK_HEX[ink] ?? '#555'

  if (!line.image_file) {
    return (
      <div
        title={onMissingClick ? `${line.name} — clique pour ajouter un visuel` : line.name}
        onClick={onMissingClick}
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

  return (
    <>
      <img
        src={`appcache://images/${line.image_file}`}
        alt={line.name}
        onClick={() => setZoom(true)}
        style={{
          width: size,
          borderRadius: 4,
          cursor: 'zoom-in',
          flexShrink: 0
        }}
      />
      {zoom && (
        <div
          onClick={() => setZoom(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            cursor: 'zoom-out'
          }}
        >
          <img
            src={`appcache://images/${zoomFile}`}
            alt={line.name}
            style={{
              maxHeight: '92vh',
              maxWidth: '92vw',
              minHeight: '75vh',
              objectFit: 'contain',
              borderRadius: 16,
              boxShadow: '0 8px 60px rgba(0,0,0,0.8)'
            }}
          />
        </div>
      )}
    </>
  )
}
