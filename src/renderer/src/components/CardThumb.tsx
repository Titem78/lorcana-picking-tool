import { useState } from 'react'
import { INK_HEX } from '@shared/constants'

interface ThumbLine {
  image_file: string | null
  ink?: string | null
  color_label?: string | null
  name: string
}

/**
 * Vignette de carte : visuel Lorcast en cache si disponible, sinon un
 * placeholder à la couleur de l'encre. Clic → zoom.
 */
export default function CardThumb({
  line,
  size = 52
}: {
  line: ThumbLine
  size?: number
}): React.JSX.Element {
  const [zoom, setZoom] = useState(false)
  const ink = line.ink ?? line.color_label ?? ''
  const hex = INK_HEX[ink] ?? '#555'

  if (!line.image_file) {
    return (
      <div
        title={line.name}
        style={{
          width: size,
          height: Math.round(size * 1.4),
          borderRadius: 4,
          background: `linear-gradient(160deg, ${hex}66, ${hex}22)`,
          border: `1px solid ${hex}`,
          flexShrink: 0
        }}
      />
    )
  }

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
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            cursor: 'zoom-out'
          }}
        >
          <img
            src={`appcache://images/${line.image_file}`}
            alt={line.name}
            style={{ maxHeight: '80vh', borderRadius: 12 }}
          />
        </div>
      )}
    </>
  )
}
