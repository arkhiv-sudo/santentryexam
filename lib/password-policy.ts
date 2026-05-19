/**
 * FIX 34: Centralised password complexity validation.
 *
 * Applied wherever users (or generated credentials) set a new password:
 *  - parent signup
 *  - change-password page
 *  - parent-created child accounts (sanity-check on generated temp password)
 */

export interface PasswordCheckResult {
    ok: boolean;
    errors: string[];
}

export function checkPasswordStrength(password: string): PasswordCheckResult {
    const errors: string[] = [];
    if (!password || password.length < 8) errors.push("Хамгийн багадаа 8 тэмдэгт");
    if (!/[A-Za-zА-Яа-яӨөҮү]/.test(password)) errors.push("Хамгийн багадаа 1 үсэг");
    if (!/[0-9]/.test(password)) errors.push("Хамгийн багадаа 1 тоо");
    // Common weak passwords (subset of well-known list)
    const weak = ['password', '12345678', 'qwerty', 'abc12345', 'password1', '11111111', 'admin123'];
    if (weak.includes(password.toLowerCase())) errors.push("Хэт хялбар нууц үг");
    return { ok: errors.length === 0, errors };
}
