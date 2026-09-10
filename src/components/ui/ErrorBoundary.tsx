import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from './Button';

/**
 * One broken view instead of a blank application.
 *
 * A render error anywhere under React unmounts the whole tree by default, so a
 * single unexpected record took down the header, the navigation and every other
 * view with it — leaving a white page and no way back.
 *
 * This is deliberately not a substitute for fixing the cause. It is what stands
 * between a person and a white screen while the cause is being found, and it
 * keeps the rest of the application usable so they can go somewhere else.
 */
interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; label?: string },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // The detail goes to the console for whoever is looking; the person sees a
    // sentence they can act on.
    console.error('view crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="grid place-items-center px-4 py-16" role="alert">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-late-soft text-late">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="text-base font-semibold text-ink">
            {this.props.label ?? 'התצוגה הזאת לא נטענה'}
          </p>
          <p className="text-base text-ink-secondary">
            שאר המערכת עובדת. אפשר לנסות שוב, או לעבור לתצוגה אחרת.
          </p>
          <Button variant="secondary" onClick={() => this.setState({ error: null })}>
            <RotateCcw className="h-4.5 w-4.5" />
            נסה שוב
          </Button>
        </div>
      </div>
    );
  }
}
