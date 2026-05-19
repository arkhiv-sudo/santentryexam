import "server-only";
import { adminDb } from "./firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * FIX 32: Admin audit log helper.
 *
 * Records privileged admin actions to an append-only Firestore collection
 * (`admin_audit`) so admins can later trace who did what, when, and from where.
 *
 * Firestore rules block all client writes to this collection — entries are
 * only ever written via the Admin SDK from this module.
 */

export type AuditAction =
    | 'set_role'
    | 'disable_user'
    | 'force_submit'
    | 'exam_delete'
    | 'exam_archive'
    | 'retake_approve'
    | 'retake_reject'
    | 'question_correction_approve'
    | 'question_correction_reject'
    | 'bulk_action';

export interface AuditEntry {
    action: AuditAction;
    actorUid: string;
    actorRole?: string;
    targetUid?: string;
    targetResource?: string; // e.g. "exams/abc123"
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
}

export async function logAdmin(entry: AuditEntry): Promise<void> {
    try {
        await adminDb.collection('admin_audit').add({
            ...entry,
            createdAt: FieldValue.serverTimestamp(),
        });
    } catch (err) {
        // Audit logging must never break the action — only log to console
        console.error('[audit] Failed to log:', err);
    }
}

// Helper to extract IP / UA from a NextRequest-like object.
// FIX 33: Capture caller IP + User-Agent so audit entries include network provenance.
export function getRequestMeta(request: { headers: { get: (k: string) => string | null } }): { ipAddress: string; userAgent: string } {
    return {
        ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
    };
}
