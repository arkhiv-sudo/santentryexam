import "server-only";
import { randomBytes } from "crypto";

/**
 * FIX 36: Cryptographically-strong studentCode generator for server-side use.
 *
 * Uses crypto.randomBytes instead of Math.random so an attacker cannot predict
 * the sequence of generated codes by observing a few examples.
 *
 * Note: existing 6-character legacy codes still work — lookups by code don't
 * rely on a fixed length. Kept for legacy student accounts; new students are
 * created through the admin Excel import (phone + examCode).
 */
const STUDENT_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0, O, 1, I

export function generateStudentCodeSecure(): string {
    const bytes = randomBytes(8);
    let code = 'ST';
    for (let i = 0; i < 8; i++) {
        code += STUDENT_CODE_CHARS[bytes[i] % STUDENT_CODE_CHARS.length];
    }
    return code;
}

/**
 * Short login code used by the phone+code exam entry flow (/s).
 *
 * Uppercase letters + digits, ambiguous characters (0/O, 1/I) excluded so the
 * code can be read aloud or copied off a printed list without mistakes.
 * Brute force is contained by the per-phone attempt limiter in
 * /api/auth/exam-login, NOT by the code length.
 */
export const EXAM_CODE_LENGTH = 3;

export function generateExamCode(): string {
    const bytes = randomBytes(EXAM_CODE_LENGTH);
    let code = '';
    for (let i = 0; i < EXAM_CODE_LENGTH; i++) {
        code += STUDENT_CODE_CHARS[bytes[i] % STUDENT_CODE_CHARS.length];
    }
    return code;
}

/** Strong random password for imported accounts. Never shown to anyone — these
 *  students sign in with phone+examCode, which mints a custom token instead. */
export function generateInternalPassword(): string {
    return randomBytes(24).toString('base64url');
}
