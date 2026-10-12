import { Component, type ReactNode } from 'react';

/** Keeps one broken area (e.g. the 3D view) from blanking the whole app. The design is autosaved, so nothing is lost. */
export class ErrorBoundary extends Component<{ area: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.area}]`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <b>The {this.props.area} hit a problem.</b>
        <p>Your design is saved. Undo the last change, or try again.</p>
        <code>{this.state.error.message}</code>
        <div className="buttons">
          <button onClick={() => this.setState({ error: null })}>Try again</button>
          <button onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
