// Tabs that aren't built yet show their name, so the shell and tab switching can be reviewed.
export default function Soon({ name }: { name: string }) {
  return (
    <main className="page page-plain">
      <h1 className="page-title page-title-tab">{name}</h1>
      <p className="empty">Coming in a later sprint.</p>
    </main>
  )
}
