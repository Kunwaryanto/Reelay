// When a screen can't draw (a bug), the app shows this instead of a black screen, and reports what happened.
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '../lib/errors'
import { SmallButton } from './index'

export class Crashed extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { void reportError('render', error, `${error.stack ?? ''}\n--- in\n${info.componentStack ?? ''}`) }
  render() {
    if (!this.state.failed) return this.props.children
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
