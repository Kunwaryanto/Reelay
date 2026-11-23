// "Made for your phone": the one page any computer gets, whatever the address. The QR code opens Reelay on a phone.
import qrcode from 'qrcode-generator'
import { useMemo, useState } from 'react'
import { FRESH, useQuery } from '../lib/query'
import { supabase } from '../lib/supabase'
import { PosterWall, Wordmark } from '../ui'

async function loadWall(): Promise<string[]> {
  const { data, error } = await supabase.rpc('start_wall')
  if (error) throw new Error(error.message)
  return (data ?? []) as string[]
}

/** The code as one SVG path, a module per unit. */
function qrPath(text: string): { d: string; size: number } {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  let d = ''
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`
  return { d, size: n }
}

export default function Desktop() {
  const wall = useQuery<string[]>('wall', loadWall, FRESH.catalogue)
  const [ready, setReady] = useState(false)
  // from an invite link, the code carries the invite itself; always this site's own address
  const invited = /^\/i\/[A-Za-z0-9_-]+$/.test(location.pathname)
  const url = location.origin + (invited ? location.pathname : '/')
  const code = useMemo(() => qrPath(url), [url])
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  return (
    <div className="desk">
      <div className="desk-wall" data-ready={ready} aria-hidden="true"><PosterWall posters={wall.data ?? []} dim={0.62} still={still} onReady={() => setReady(true)} /></div>
      <div className="desk-shade" aria-hidden="true" />
      <div className="desk-mark"><Wordmark height={20} /></div>
      <main className="desk-body" data-ready={ready || wall.error}>
        <h1>{invited ? 'You’re invited' : 'Made for your phone'}</h1>
        <p>{invited ? 'Scan to join on your phone.' : 'Invite only. Scan to open Reelay on your phone.'}</p>
        <div className="desk-code" role="img" aria-label={`QR code that opens ${url.replace(/^https?:\/\//, '')}`}>
          <svg viewBox={`0 0 ${code.size} ${code.size}`} shapeRendering="crispEdges"><path d={code.d} fill="#000" /></svg>
        </div>
      </main>
    </div>
  )
}
