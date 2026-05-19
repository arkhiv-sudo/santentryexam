"use client";

import { Component, ReactNode, ErrorInfo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { trackError } from "@/lib/error-tracking";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  label?: string; // Optional label shown above the error message
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", this.props.label || "", error, info);
    if (this.props.onError) {
      try { this.props.onError(error, info); } catch {}
    }
    // FIX 50: Centralized error tracking — fire-and-forget, never throws.
    try { trackError(error, { component: this.props.label || 'ErrorBoundary' }); } catch {}
    // Log to Firestore error service for tracking (optional, non-blocking)
    try {
      const winAny = typeof window !== 'undefined' ? (window as unknown as { __logError?: (e: unknown) => void }) : undefined;
      if (winAny?.__logError) winAny.__logError(error);
    } catch {}
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 my-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-red-900 text-sm mb-1">
                {this.props.label || "Энэ хэсэг ажиллахад алдаа гарлаа"}
              </h3>
              <p className="text-xs text-red-700 mb-3 break-words">
                {this.state.error?.message?.slice(0, 200) || "Тодорхойгүй алдаа"}
              </p>
              <button
                onClick={this.reset}
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white border border-red-300 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-100"
              >
                <RefreshCw className="w-3 h-3" /> Дахин оролдох
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
