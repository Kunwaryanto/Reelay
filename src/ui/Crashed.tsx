// When a screen can't draw (a bug), the app shows this instead of a black screen, and reports what happened.
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { isStaleBuild, reloadForNewVersion, reportError } from '../lib/errors'
import { SmallButton } from './index'

export class Crashed extends Component<{ children: ReactNode }, { failed: boolean; reloading: boolean }> {
  state = { failed: false, reloading: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // a screen of an older version that no longer exists: reload into the new one instead of showing an error
    if (isStaleBuild(error) && reloadForNewVersion()) { this.setState({ reloading: true }); return }
    void reportError('render', error, `${error.stack ?? ''}\n--- in\n${info.componentStack ?? ''}`)
  }
  render() {
    if (!this.state.failed) return this.props.children
    if (this.state.reloading) return null
    return (
      <main className="page crashed">
        <div className="page-center">
          <div className="load-failed">
            <p>Something went wrong.</p>
            <SmallButton onClick={() => location.reload()}>Reload</SmallButton>
          </div>
        </div>
      </main>
    )
  }
}
