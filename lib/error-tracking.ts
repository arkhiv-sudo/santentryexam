// Centralized error tracking
// In production, integrate with Sentry / Crashlytics here.
// For now, logs to console + an in-app system_logs collection.

import { db } from "./firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export function trackError(error: unknown, context?: { component?: string; action?: string; userId?: string }) {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('[trackError]', context?.component || '?', message, stack);
    // Best-effort write to Firestore — don't await, don't throw
    void addDoc(collection(db, 'system_logs'), {
      level: 'error',
      message: message.slice(0, 1000),
      stack: stack?.slice(0, 2000) || null,
      component: context?.component || null,
      action: context?.action || null,
      userId: context?.userId || null,
      url: typeof window !== 'undefined' ? window.location.pathname : null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      createdAt: serverTimestamp(),
    }).catch(() => {});
  } catch {
    // Silent — error tracking must never throw
  }
}
