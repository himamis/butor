import { Component, type ReactNode } from 'react';

interface Props {
  area: string;
  children: ReactNode;
}

/** Keeps a failure in one area from blanking the whole app (docs/v2/02-architecture.md#error-containment). */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error(`[${this.props.area}]`, error);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash" role="alert" data-testid="crash">
        <strong>The {this.props.area} hit a problem.</strong>
        <p>Your design is saved. Undo the last change, or try again.</p>
        <code>{this.state.error.message}</code>
        <div>
          <button type="button" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}
