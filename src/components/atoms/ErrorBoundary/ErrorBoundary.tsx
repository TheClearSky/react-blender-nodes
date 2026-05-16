import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Props for the ErrorBoundary component.
 *
 * NOTE: React error boundaries only catch errors during rendering, in lifecycle
 * methods, and in constructors of the whole tree below them. They do NOT catch
 * errors in event handlers, async code (setTimeout, requestAnimationFrame),
 * or server-side rendering.
 */
type ErrorBoundaryProps = {
  children: ReactNode;
  /** Fallback UI to render when an error occurs. Receives error info. */
  fallback?:
    | ReactNode
    | ((props: {
        error: Error;
        errorInfo: ErrorInfo | null;
        reset: () => void;
      }) => ReactNode);
  /** Called when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Key to reset the boundary (change this to recover) */
  resetKey?: string | number;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
};

/**
 * Reusable error boundary component that catches rendering errors in its
 * subtree and displays a fallback UI instead of crashing the whole app.
 *
 * Supports:
 * - Custom fallback UI (static or render-prop)
 * - `resetKey` prop for automatic recovery when upstream data changes
 * - `onError` callback for error reporting
 * - Manual reset via the `reset` function passed to the fallback render prop
 *
 * @example
 * ```tsx
 * <ErrorBoundary
 *   fallback={({ error, reset }) => (
 *     <div>
 *       <p>Something went wrong: {error.message}</p>
 *       <button onClick={reset}>Try Again</button>
 *     </div>
 *   )}
 *   onError={(error) => console.error(error)}
 * >
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.props.resetKey !== undefined &&
      prevProps.resetKey !== this.props.resetKey &&
      this.state.hasError
    ) {
      this.reset();
    }
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      const { fallback } = this.props;
      const { error, errorInfo } = this.state;

      if (typeof fallback === 'function') {
        return fallback({ error, errorInfo, reset: this.reset });
      }

      if (fallback !== undefined) {
        return fallback;
      }

      // Default fallback UI
      return (
        <div
          data-slot='error-boundary'
          className='flex flex-col items-center justify-center gap-3 rounded-md border border-red-500/50 bg-zinc-900 p-6 text-zinc-300'
        >
          <AlertTriangle className='h-8 w-8 text-red-400' />
          <div className='text-center'>
            <p className='text-sm font-medium text-red-400'>
              Something went wrong
            </p>
            <p className='mt-1 max-w-md text-xs text-zinc-500'>
              {error.message}
            </p>
          </div>
          <button
            type='button'
            onClick={this.reset}
            className='mt-2 inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700'
          >
            <RotateCcw className='h-3 w-3' />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export { ErrorBoundary };

export type { ErrorBoundaryProps };
