import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-4 text-center my-auto w-full select-none rounded-2xl bg-zinc-950/90 border border-red-500/30 shadow-xl">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 mb-2">
            <AlertCircle className="w-5 h-5" />
          </div>
          <h4 className="text-xs font-semibold text-white">
            {this.props.fallbackTitle || 'Terjadi Masalah pada Komponen'}
          </h4>
          <p className="text-[10px] text-zinc-400 max-w-[280px] mt-1 mb-3 line-clamp-2">
            {this.state.error?.message || 'Komponen mengalami kendala tak terduga.'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700/80 transition-all cursor-pointer active:scale-95"
          >
            <RefreshCw className="w-3 h-3 text-cyan-400" />
            <span>Muat Ulang Komponen</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
