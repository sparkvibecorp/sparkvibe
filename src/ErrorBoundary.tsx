// ErrorBoundary.tsx
import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  // React lifecycle: update state when error is caught
  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  // Catch errors and log them
  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);

    // Example: Hook into an external logging/monitoring service
    // Sentry.captureException(error, { extra: errorInfo });
  }

  // Reset without reloading the full page
  private resetError = () => {
    this.setState({ hasError: false });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
          <div className="text-white text-center max-w-md">
            <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>

            {process.env.NODE_ENV === "development" && (
              <p className="text-sm text-gray-300 mb-4">
                Check the console for more details.
              </p>
            )}

            <div className="flex justify-center gap-4">
              <button
                onClick={this.resetError}
                className="bg-purple-500 hover:bg-purple-600 transition px-6 py-3 rounded-xl"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="bg-slate-700 hover:bg-slate-800 transition px-6 py-3 rounded-xl"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
