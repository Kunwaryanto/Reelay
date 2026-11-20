// Notifications on this device: whether they're allowed, and asking for it.
// On iPhone they only exist in the Home Screen app, so Safari reports 'unsupported'.
export type Permission = 'unsupported' | 'default' | 'granted' | 'denied'

export const permission = (): Permission => ('Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
  ? Notification.permission : 'unsupported')

/** Shows the system's "Would Like to Send You Notifications" question. Call it from a tap. */
export async function askPermission(): Promise<Permission> {
  if (permission() === 'unsupported') return 'unsupported'
  try { return await Notification.requestPermission() } catch { return permission() }
}
