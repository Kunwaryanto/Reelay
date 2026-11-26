// The few facts the long-press menu shows under a title's name: length or seasons, genres, who made it and the
// three scores. Fetched light and early, so the menu opens complete:
//  - for every poster or row as it comes near the screen, in batches (one request for a whole row of titles);
//  - for the one under a finger the moment it lands, if it isn't there yet.
// A title page already loaded has them too and is used as is.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { readQueryData } from './query'
import type { TitleDetail } from './catalogue'

export type Facts = {
  runtime_min: number | null; seasons: number | null; end_year: number | null; genres: string[]
  imdb: number | null; rt: number | null; lb: number | null
  /** directors (films) or creators (series), in credit order */
  by: string[]
}

const got = new Map<number, Facts>()
const asked = new Set<number>()
const waiting = new Set<number>()
const listeners = new Map<number, Set<() => void>>()
let timer: ReturnType<typeof setTimeout> | undefined

type Row = {
  id: number; kind: 'film' | 'series'; runtime_min: number | null; seasons: number | null; end_year: number | null; genres: string[] | null
  scores: Sc | Sc[] | null; credits: { role: string; sort_order: number; person: { name: string } | null }[] | null
}
type Sc = { imdb_rating: number | null; rt_critics: number | null; letterboxd: number | null }

function keep(id: number, f: Facts) {
  got.set(id, f)
  listeners.get(id)?.forEach((fn) => fn())
}

async function fetchNow(ids: number[]) {
  if (!ids.length) return
  const res = await supabase.from('titles')
    .select('id,kind,runtime_min,seasons,end_year,genres,scores(imdb_rating,rt_critics,letterboxd),credits(role,sort_order,person:people(name))')
    .in('id', ids).in('credits.role', ['director', 'creator'])
  if (res.error) { ids.forEach((id) => asked.delete(id)); return } // asked again next time
  for (const r of (res.data ?? []) as unknown as Row[]) {
    const sc = Array.isArray(r.scores) ? r.scores[0] : r.scores
    const role = r.kind === 'film' ? 'director' : 'creator'
    keep(r.id, {
      runtime_min: r.runtime_min, seasons: r.seasons, end_year: r.end_year, genres: r.genres ?? [],
      imdb: sc?.imdb_rating ?? null, rt: sc?.rt_critics ?? null, lb: sc?.letterboxd ?? null,
      by: (r.credits ?? []).filter((c) => c.role === role).sort((a, b) => a.sort_order - b.sort_order).map((c) => c.person?.name).filter((n): n is string => !!n),
    })
  }
}

function fromPage(id: number): Facts | undefined {
  const t = readQueryData<TitleDetail | null>(`title:${id}`)
  if (!t) return undefined
  const role = t.kind === 'film' ? 'director' : 'creator'
  return {
    runtime_min: t.runtime_min ?? null, seasons: t.seasons ?? null, end_year: t.end_year ?? null, genres: t.genres,
    imdb: t.scores?.imdb_rating ?? null, rt: t.scores?.rt_critics ?? null, lb: t.scores?.letterboxd ?? null,
    by: t.credits.filter((c) => c.role === role).map((c) => c.person.name),
  }
}

/** Cards that came with their facts (Home's, from home_card: end year, scores, who made it): known at once, so
 *  their posters ask for nothing. Takes any data and finds the cards in it. */
type Carded = { id: number; kind: string; runtime_min?: number | null; seasons?: number | null; end_year?: number | null; genres?: string[] | null
  imdb_rating?: number | string | null; rating?: number | string | null; rt?: number | null; lb?: number | string | null; by_names?: string[] }
export function seedFacts(data: unknown) {
  const seen = new Set<unknown>()
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== 'object' || depth > 5 || seen.has(v)) return
    seen.add(v)
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return }
    const c = v as Carded
    if (typeof c.id === 'number' && Array.isArray(c.by_names) && 'rt' in c && !got.has(c.id)) {
      keep(c.id, {
        runtime_min: c.runtime_min ?? null, seasons: c.seasons ?? null, end_year: c.end_year ?? null, genres: c.genres ?? [],
        imdb: (c.imdb_rating ?? c.rating) == null ? null : Number(c.imdb_rating ?? c.rating), rt: c.rt ?? null, lb: c.lb == null ? null : Number(c.lb), by: c.by_names,
      })
      waiting.delete(c.id)
      return
    }
    for (const x of Object.values(v)) walk(x, depth + 1)
  }
  walk(data, 0)
}

/** Ask for these titles' facts soon, together with others asked for in the same moment. `now`: don't wait. */
export function warmFacts(ids: number[], now = false) {
  for (const id of ids) {
    if (got.has(id) || asked.has(id)) continue
    const page = fromPage(id)
    if (page) { keep(id, page); continue }
    asked.add(id); waiting.add(id)
  }
  if (!waiting.size) return
  clearTimeout(timer)
  const send = () => { const batch = [...waiting].slice(0, 80); batch.forEach((id) => waiting.delete(id)); void fetchNow(batch); if (waiting.size) timer = setTimeout(send, 0) }
  if (now) send(); else timer = setTimeout(send, 250)
}

/** A title's facts, once known. */
export function useFacts(id: number): Facts | undefined {
  const [, bump] = useState(0)
  useEffect(() => {
    let set = listeners.get(id)
    if (!set) listeners.set(id, set = new Set())
    const fn = () => bump((n) => n + 1)
    set.add(fn)
    warmFacts([id], true)
    return () => { set.delete(fn) }
  }, [id])
  return got.get(id) ?? fromPage(id)
}
