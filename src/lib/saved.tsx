// The watchlist, shared by every screen: bookmark buttons, the long-press menu and Notify me.
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useAuth } from './auth'
import { loadWatchlist, saveTitle, unsaveTitle, type Saved } from './catalogue'
import { askPermission, permission } from './push'
import { useQuery } from './query'
import { useToast } from '../ui'
import { useState } from 'react'

type Ctx = {
  isSaved: (id: number) => boolean
  isNotifying: (id: number) => boolean
  toggleSaved: (id: number, title: string) => void
  toggleNotify: (id: number) => void
  /** the saved list has arrived (from the phone or the server) */
  loaded: boolean
  /** every saved title id, local changes included */
  ids: number[]
  /** save several at once, without a toast each (the empty Watchlist's Add) */
  addMany: (ids: number[]) => Promise<void>
}
const C = createContext<Ctx | null>(null)
export const useSaved = () => useContext(C)!

export function SavedProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id
  const toast = useToast()
  const q = useQuery<Saved[]>(userId ? `watchlist:${userId}` : null, loadWatchlist)
  const loaded = q.data !== undefined
  // local changes win until the server copy catches up
  const [local, setLocal] = useState<Record<number, Saved | null>>({})

  const get = useCallback((id: number): Saved | null => {
    if (id in local) return local[id]
    return q.data?.find((s) => s.title_id === id) ?? null
  }, [local, q.data])

  const write = useCallback((id: number, next: Saved | null, prev: Saved | null) => {
    if (!userId) return Promise.resolve()
    setLocal((l) => ({ ...l, [id]: next }))
    const job = next ? saveTitle(userId, id, next.notify) : unsaveTitle(userId, id)
    return job.then(() => {}, () => {
      setLocal((l) => ({ ...l, [id]: prev }))
      toast({ text: navigator.onLine ? 'Couldn’t save that. Try again.' : 'You’re offline. Connect to save.' })
    })
  }, [userId, toast])

  const ids = useMemo(() => {
    const set = new Set((q.data ?? []).map((s) => s.title_id))
    for (const [id, v] of Object.entries(local)) { if (v) set.add(Number(id)); else set.delete(Number(id)) }
    return [...set]
  }, [q.data, local])

  const value = useMemo<Ctx>(() => ({
    ids,
    loaded,
    addMany: (list) => Promise.all(list.filter((id) => !get(id)).map((id) => write(id, { title_id: id, notify: false }, null))).then(() => {}),
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
      const perm = permission()
      if (perm === 'denied') { toast({ text: 'Notifications are off for Reelay. Turn them on in iOS Settings.' }); return }
      // Notify me always saves the title
      const on = () => {
        write(id, { title_id: id, notify: true }, prev)
        toast({
          text: perm === 'unsupported' ? 'Saved. Notifications need the Home Screen app.' : 'We’ll let you know when it’s on.',
          action: 'Undo', run: () => write(id, prev, { title_id: id, notify: true }),
        })
      }
      // the first Notify me asks iOS (this runs inside the tap, which iOS requires)
      if (perm === 'default') askPermission().then((answer) => { if (answer === 'denied') toast({ text: 'Notifications are off for Reelay.' }); else on() })
      else on()
    },
  }), [get, write, toast, ids, loaded])

  return <C.Provider value={value}>{children}</C.Provider>
}
