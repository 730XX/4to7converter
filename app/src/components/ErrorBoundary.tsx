import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Frontera de errores global: captura cualquier excepción de renderizado para
 * que la aplicación nunca quede en una pantalla en blanco. Muestra el mensaje
 * del error y permite reiniciar el árbol.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Error de renderizado capturado:", error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error === null) {
      return this.props.children;
    }

    return (
      <main className="app-shell">
        <section className="error-card">
          <h1 className="error-card-title">Algo salió mal</h1>
          <p className="error-card-message mono">{this.state.error.message}</p>
          <button type="button" className="ghost-button" onClick={this.handleReset}>
            Reiniciar la aplicación
          </button>
        </section>
      </main>
    );
  }
}
