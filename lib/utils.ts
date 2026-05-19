// FIX 36: Lengthen and de-confuse studentCode so codes are harder to enumerate
// or mis-read. Existing 6-character legacy codes still work — lookups by code
// don't rely on a fixed length.
const STUDENT_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0, O, 1, I to avoid ambiguity

export function generateStudentCode(): string {
    let code = 'ST';
    for (let i = 0; i < 8; i++) {
        code += STUDENT_CODE_CHARS[Math.floor(Math.random() * STUDENT_CODE_CHARS.length)];
    }
    return code;
}

export function toDate(value: unknown): Date {
    if (!value) return new Date(0);
    if (value instanceof Date) return value;
    if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as any).toDate === 'function') {
        return (value as any).toDate();
    }
    if (typeof value === 'string' || typeof value === 'number') return new Date(value);
    return new Date(0);
}

export function safeApiError(error: unknown, fallback = 'Серверийн алдаа гарлаа'): string {
    if (error instanceof Error) {
        const message = error.message;
        if (message.includes('Firebase') || message.includes('firestore') || message.includes('INTERNAL')) {
            return fallback;
        }
        return message.slice(0, 150);
    }
    return fallback;
}
