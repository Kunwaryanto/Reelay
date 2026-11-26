import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/auth-js'
import { forgetDevice } from './push'
import { supabase } from './supabase'
import { loadProfile, profileKey } from './profile'
import { FRESH, fetchShared } from './query'
import { launchUser } from './me'

type Auth = {
  /** undefined while the saved session is being read */
  session: Session | null | undefined
  email: string | null
  isAdmin: boolean
  signOut: () => Promise<void>
}

const Ctx = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    setIsAdmin(false)
    launchUser(userId ?? null)
    if (!userId) return
    let live = true
    // the same load (and saved answer) as useProfile's: one request for both (no profile yet: it makes one)
    fetchShared(profileKey(userId), () => loadProfile(userId), FRESH.mine())
      .then((p) => { if (live) setIsAdmin(!!p?.is_admin) }, () => {})
    return () => { live = false }
  }, [userId])

  const value = useMemo<Auth>(() => ({
    session,
    email: session?.user.email ?? null,
    isAdmin,
    signOut: async () => {
      await forgetDevice() // this phone stops getting the account's notifications
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    },
  }), [session, isAdmin])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): Auth {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
