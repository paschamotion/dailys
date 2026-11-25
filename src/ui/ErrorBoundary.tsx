import { Component, type ReactNode } from 'react';

/** Zeigt statt einer leeren Seite eine verständliche Meldung, falls die Oberfläche abstürzt. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 40px)' }}>
        <div className="banner error" role="alert">
          <div>
            <strong>Da ist etwas schiefgelaufen</strong>
            Deine Daten sind sicher gespeichert. Lade die App neu.
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8, wordBreak: 'break-word' }}>{this.state.error.message}</div>
          </div>
        </div>
        <button className="btn block" style={{ marginTop: 12 }} onClick={() => location.reload()}>Neu laden</button>
      </div>
    );
  }
}
