import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Catches render errors (and failed lazy chunk loads) below it so the rest of the app stays usable
 * instead of going blank. `fallback` replaces the default "Something went wrong" panel.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ui] render failed:", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      this.props.fallback ?? (
        <div role="alert" className="space-y-3 py-12 text-center">
          <p className="text-destructive">Something went wrong.</p>
          <Button variant="outline" className="h-11" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      )
    );
  }
}
