// The watchlist, shared by every screen: bookmark buttons, the long-press menu and Notify me.
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useAuth } from './auth'
import { loadWatchlist, saveTitle, unsaveTitle, type Saved } from './catalogue'
import { useQuery } from './query'
import { useToast } from '../ui'
import { useState } from 'react'

type Ctx = {
  isSaved: (id: number) => boolean
  isNotifying: (id: number) => boolean
  toggleSaved: (id: number, title: string) => void
  toggleNotify: (id: number) => void
}
const C = createContext<Ctx | null>(null)
export const useSaved = () => useContext(C)!

export function SavedProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id
  const toast = useToast()
  const q = useQuery<Saved[]>(userId ? `watchlist:${userId}` : null, loadWatchlist)
  // local changes win until the server copy catches up
  const [local, setLocal] = useState<Record<number, Saved | null>>({})

  const get = useCallback((id: number): Saved | null => {
    if (id in local) return local[id]
    return q.data?.find((s) => s.title_id === id) ?? null
  }, [local, q.data])

  const write = useCallback((id: number, next: Saved | null, prev: Saved | null) => {
    if (!userId) return
    setLocal((l) => ({ ...l, [id]: next }))
    const job = next ? saveTitle(userId, id, next.notify) : unsaveTitle(userId, id)
    job.catch(() => {
      setLocal((l) => ({ ...l, [id]: prev }))
      toast({ text: navigator.onLine ? 'Couldn’t save that. Try again.' : 'You’re offline. Connect to save.' })
    })
  }, [userId, toast])

  const value = useMemo<Ctx>(() => ({
    isSaved: (id) => !!get(id),
    isNotifying: (id) => !!get(id)?.notify,
    toggleSaved: (id, title) => {
      const prev = get(id)
      if (prev) {
        write(id, null, prev)
        toast({ text: `Removed ${title}`, action: 'Undo', run: () => write(id, prev, null) })
      } else {
        write(id, { title_id: id, notify: false }, null)
        toast({ text: 'Added to Watchlist' })
      }
    },
    toggleNotify: (id) => {
      const prev = get(id)
      if (prev?.notify) { write(id, { ...prev, notify: false }, prev); return }
      // Notify me always saves the title
      write(id, { title_id: id, notify: true }, prev)
      toast({ text: 'We’ll let you know when it’s on.', action: 'Undo', run: () => write(id, prev, { title_id: id, notify: true }) })
    },
  }), [get, write, toast])

  return <C.Provider value={value}>{children}</C.Provider>
}
