// The watchlist, shared by every screen: bookmark buttons, the long-press menu and Notify me.
import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react'
import { useAuth } from './auth'
import { loadWatchlist, loadWatchlistTitles, saveTitle, unsaveTitle, type Card, type Saved, type SavedTitle } from './catalogue'
import { askPermission, permission } from './push'
import { setQueryData, updateQueryData, useQuery } from './query'
import { useToast } from '../ui'
import { useState } from 'react'

type Ctx = {
  isSaved: (id: number) => boolean
  isNotifying: (id: number) => boolean
  /** `card`: what the screen knows about the title, so the Watchlist has its row at once */
  toggleSaved: (id: number, title: string, card?: Shown) => void
  toggleNotify: (id: number) => void
  /** the saved list has arrived (from the phone or the server) */
  loaded: boolean
  /** every saved title id, local changes included */
  ids: number[]
  /** save several at once, without a toast each (the empty Watchlist's Add) */
  addMany: (ids: number[]) => Promise<void>
}
/** What a screen saving a title already shows of it: enough for its Watchlist row. */
export type Shown = Pick<Card, 'id' | 'kind' | 'title' | 'year' | 'poster_path' | 'availability'>
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
  const refreshing = useRef<ReturnType<typeof setTimeout>>(undefined)

  const get = useCallback((id: number): Saved | null => {
    if (id in local) return local[id]
    return q.data?.find((s) => s.title_id === id) ?? null
  }, [local, q.data])

  // The Watchlist's own list (titles with poster, year and services) is kept in step here, so opening the
  // Watchlist after saving shows the row already in place instead of fetching and popping it in.
  const refresh = useCallback(() => {
    if (!userId) return
    clearTimeout(refreshing.current)
    // a moment later, once for a burst of saves: fills in what the row didn't know (genres, rating, length)
    refreshing.current = setTimeout(() => { loadWatchlistTitles().then((rows) => setQueryData(`watchlist-titles:${userId}`, rows), () => {}) }, 600)
  }, [userId])

  const write = useCallback((id: number, next: Saved | null, prev: Saved | null, card?: Shown) => {
    if (!userId) return Promise.resolve()
    setLocal((l) => ({ ...l, [id]: next }))
    if (next && card) {
      updateQueryData<SavedTitle[]>(`watchlist-titles:${userId}`, (rows) => rows.some((r) => r.id === id) ? rows
        : [{ id, kind: card.kind, title: card.title, year: card.year, poster_path: card.poster_path, availability: card.availability ?? [], rating: null, notify: next.notify, added_at: new Date().toISOString() }, ...rows])
    }
    const job = next ? saveTitle(userId, id, next.notify) : unsaveTitle(userId, id)
    return job.then(() => { if (next && !prev) refresh() }, () => {
      setLocal((l) => ({ ...l, [id]: prev }))
      toast({ text: navigator.onLine ? 'Couldn’t save that. Try again.' : 'You’re offline. Connect to save.' })
    })
  }, [userId, toast, refresh])

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
    toggleSaved: (id, title, card) => {
      const prev = get(id)
      if (prev) {
        write(id, null, prev)
        toast({ text: `Removed ${title}`, action: 'Undo', run: () => write(id, prev, null, card) })
      } else {
        write(id, { title_id: id, notify: false }, null, card)
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
