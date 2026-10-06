import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-950/60 border border-red-700/60 rounded-xl p-5 my-4 text-slate-200 space-y-3">
          <div className="flex items-center gap-2.5 text-red-400 font-semibold text-sm">
            <AlertCircle size={18} />
            <span>{this.props.fallbackTitle || 'Something went wrong rendering this section'}</span>
          </div>
          {this.state.error?.message && (
            <p className="text-xs text-red-300/80 font-mono bg-red-950/80 p-2.5 rounded border border-red-900/60">
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={this.handleRetry}
            className="px-3 py-1.5 bg-red-800/80 hover:bg-red-700 text-white rounded text-xs font-medium transition-colors flex items-center gap-1.5 w-fit"
          >
            <RefreshCw size={13} />
            Retry
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
