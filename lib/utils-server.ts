import "server-only";
import { randomBytes } from "crypto";

/**
 * FIX 36: Cryptographically-strong studentCode generator for server-side use.
 *
 * Uses crypto.randomBytes instead of Math.random so an attacker cannot predict
 * the sequence of generated codes by observing a few examples. Use this in API
 * routes that mint new student accounts (e.g. parent-created children).
 *
 * Note: existing 6-character legacy codes still work — lookups by code don't
 * rely on a fixed length.
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
