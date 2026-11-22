// Reading a Letterboxd export on the phone: the ZIP (or the CSV files from it) is opened here and only the
// film rows are sent on. diary.csv has every logged watch; watched.csv adds films marked as seen without a
// log; ratings.csv gives those their rating.
import { supabase } from './supabase'

export type ImportRow = { n: string; y: number | null; d: string | null; r: number | null; w: boolean }
const WANTED = ['diary.csv', 'watched.csv', 'ratings.csv']

/** The wanted files of a ZIP, as text. Reads the ZIP's own index, so nothing else is unpacked. */
async function unzip(file: File): Promise<Record<string, string>> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const v = new DataView(bytes.buffer)
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66_000); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break }
  if (end < 0) throw new Error('not a zip')
  const count = v.getUint16(end + 10, true)
  let at = v.getUint32(end + 16, true)
  const out: Record<string, string> = {}
  const text = new TextDecoder()
  for (let k = 0; k < count && at + 46 <= bytes.length; k++) {
    if (v.getUint32(at, true) !== 0x02014b50) break
    const method = v.getUint16(at + 10, true), size = v.getUint32(at + 20, true)
    const nameLen = v.getUint16(at + 28, true), extraLen = v.getUint16(at + 30, true), commentLen = v.getUint16(at + 32, true)
    const local = v.getUint32(at + 42, true)
    const path = text.decode(bytes.subarray(at + 46, at + 46 + nameLen))
    at += 46 + nameLen + extraLen + commentLen
    // the export's own files, at its top (also when it was zipped inside a folder); not the copies under deleted/ or orphaned/
    const name = path.split('/').pop() ?? ''
    if (!WANTED.includes(name) || /(^|\/)(deleted|orphaned|likes|lists)\//.test(path) || name in out) continue
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const data = bytes.subarray(start, start + size)
    if (method === 0) out[name] = text.decode(data)
    else if (method === 8) out[name] = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text()
  }
  return out
}

/** CSV with quoted fields, as rows keyed by the header. */
function parseCsv(csv: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  const s = csv.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++ } else quoted = false }
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  const head = rows.shift() ?? []
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])))
}

const num = (s: string) => { const n = Number(s); return s && Number.isFinite(n) ? n : null }
const day = (s: string) => (/^\d{4}-\d\d-\d\d$/.test(s) ? s : null)
const key = (name: string, year: number | null) => `${name.toLowerCase()}|${year ?? ''}`

/** The rows of an export: the picked ZIP, or the CSV files from one that iOS already unpacked. */
export async function readExport(files: File[]): Promise<ImportRow[]> {
  let found: Record<string, string> = {}
  for (const f of files) {
    const name = f.name.toLowerCase()
    if (name.endsWith('.zip')) found = { ...found, ...await unzip(f) }
    // "diary.csv", or "diary 2.csv" as Files names a second download
    else { const which = WANTED.find((w) => name.startsWith(w.replace('.csv', '')) && name.endsWith('.csv')); if (which) found[which] = await f.text() }
  }
  const rows: ImportRow[] = []
  const logged = new Set<string>()
  for (const r of parseCsv(found['diary.csv'] ?? '')) {
    const n = r['Name']?.trim(), y = num(r['Year'])
    if (!n) continue
    logged.add(key(n, y))
    rows.push({ n, y, d: day(r['Watched Date']) ?? day(r['Date']), r: num(r['Rating']), w: r['Rewatch'] === 'Yes' })
  }
  const rated = new Map(parseCsv(found['ratings.csv'] ?? '').map((r) => [key(r['Name']?.trim() ?? '', num(r['Year'])), num(r['Rating'])]))
  // marked as seen but never logged: no date, and the rating if it has one
  for (const r of parseCsv(found['watched.csv'] ?? '')) {
    const n = r['Name']?.trim(), y = num(r['Year'])
    if (!n || logged.has(key(n, y))) continue
    logged.add(key(n, y))
    rows.push({ n, y, d: null, r: rated.get(key(n, y)) ?? null, w: false })
  }
  return rows
}

export type Imported = { status: 'imported'; films: number; matched: number } | { error: 'not_connected' | 'empty' | 'too_many' | 'failed' }
export async function sendImport(rows: ImportRow[]): Promise<Imported> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('signed out')
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/letterboxd-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ rows }),
  })
  const body = await res.json().catch(() => ({})) as { status?: string; films?: number; matched?: number; error?: string }
  if (body.status === 'imported') return { status: 'imported', films: body.films ?? 0, matched: body.matched ?? 0 }
  return { error: body.error === 'not_connected' || body.error === 'empty' || body.error === 'too_many' ? body.error : 'failed' }
}
