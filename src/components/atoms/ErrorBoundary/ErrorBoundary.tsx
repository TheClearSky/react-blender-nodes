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
          className='rbn:flex rbn:flex-col rbn:items-center rbn:justify-center rbn:gap-3 rbn:rounded-md rbn:border rbn:border-red-500/50 rbn:bg-zinc-900 rbn:p-6 rbn:text-zinc-300'
        >
          <AlertTriangle className='rbn:h-8 rbn:w-8 rbn:text-red-400' />
          <div className='rbn:text-center'>
            <p className='rbn:text-sm rbn:font-medium rbn:text-red-400'>
              Something went wrong
            </p>
            <p className='rbn:mt-1 rbn:max-w-md rbn:text-xs rbn:text-zinc-500'>
              {error.message}
            </p>
          </div>
          <button
            type='button'
            onClick={this.reset}
            className='rbn:mt-2 rbn:inline-flex rbn:items-center rbn:gap-1.5 rbn:rounded-md rbn:border rbn:border-zinc-700 rbn:bg-zinc-800 rbn:px-3 rbn:py-1.5 rbn:text-xs rbn:text-zinc-300 rbn:transition-colors rbn:hover:bg-zinc-700'
          >
            <RotateCcw className='rbn:h-3 rbn:w-3' />
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
