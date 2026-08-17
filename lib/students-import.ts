/**
 * Shared (client + server) helpers for the admin Excel student import.
 *
 * The same normalisation runs in the browser preview table and again in
 * /api/admin/students/import — the client copy is only there so the admin can
 * see problems before anything is written. The server never trusts it.
 */

export interface StudentImportRow {
    lastName: string;
    firstName: string;
    grade: string;   // '1' – '12'
    phone: string;   // normalised: exactly 8 digits
}

export interface ParsedRow extends StudentImportRow {
    rowNumber: number;   // 1-based row number in the sheet (for error messages)
    rawPhone: string;
    error?: string;
}

/** Column header aliases — matched case-insensitively after trimming. */
const HEADER_ALIASES: Record<keyof StudentImportRow, string[]> = {
    lastName: ['овог', 'ovog', 'lastname', 'last name', 'surname'],
    firstName: ['нэр', 'ner', 'firstname', 'first name', 'name'],
    grade: ['анги', 'angi', 'grade', 'class'],
    phone: ['утас', 'утасны дугаар', 'utas', 'phone', 'phone number', 'дугаар'],
};

/**
 * Normalise a Mongolian mobile number to bare 8 digits.
 * Accepts "9911-2233", "+976 99112233", "97699112233".
 * Returns null when the value cannot be a valid 8-digit number.
 */
export function normalizePhone(raw: unknown): string | null {
    if (raw == null) return null;
    let digits = String(raw).replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('976')) digits = digits.slice(3);
    if (digits.length === 9 && digits.startsWith('0')) digits = digits.slice(1);
    if (digits.length !== 8) return null;
    // Mongolian mobile/landline numbers never start with 0 or 1
    if (/^[01]/.test(digits)) return null;
    return digits;
}

/** Extract a grade number 1–12 from "7", "7а", "7-р анги", 7 (number). */
export function normalizeGrade(raw: unknown): string | null {
    if (raw == null) return null;
    const match = String(raw).match(/\d{1,2}/);
    if (!match) return null;
    const n = parseInt(match[0], 10);
    if (Number.isNaN(n) || n < 1 || n > 12) return null;
    return String(n);
}

export function cleanName(raw: unknown): string {
    if (raw == null) return '';
    return String(raw)
        .replace(/[\x00-\x1f\x7f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60);
}

function matchHeader(cell: unknown): keyof StudentImportRow | null {
    const value = String(cell ?? '').trim().toLowerCase();
    if (!value) return null;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof StudentImportRow, string[]][]) {
        if (aliases.some(a => value === a || value.startsWith(a))) return field;
    }
    return null;
}

/**
 * Turn a raw sheet (array of arrays, as produced by
 * XLSX.utils.sheet_to_json(sheet, { header: 1 })) into validated rows.
 *
 * Works with or without a header row: if the first row looks like headers the
 * columns are mapped by name, otherwise the fixed order
 * Овог | Нэр | Анги | Утас is assumed.
 */
export function parseStudentSheet(rows: unknown[][]): { rows: ParsedRow[]; usedHeader: boolean } {
    const nonEmpty = rows.filter(r => Array.isArray(r) && r.some(c => String(c ?? '').trim() !== ''));
    if (nonEmpty.length === 0) return { rows: [], usedHeader: false };

    const firstRow = nonEmpty[0];
    const headerMap: Partial<Record<keyof StudentImportRow, number>> = {};
    firstRow.forEach((cell, idx) => {
        const field = matchHeader(cell);
        if (field && headerMap[field] === undefined) headerMap[field] = idx;
    });
    // A header row must identify at least the name + phone columns
    const usedHeader = headerMap.phone !== undefined && (headerMap.firstName !== undefined || headerMap.lastName !== undefined);

    const columns = usedHeader
        ? {
            lastName: headerMap.lastName ?? 0,
            firstName: headerMap.firstName ?? 1,
            grade: headerMap.grade ?? 2,
            phone: headerMap.phone ?? 3,
        }
        : { lastName: 0, firstName: 1, grade: 2, phone: 3 };

    const dataRows = usedHeader ? nonEmpty.slice(1) : nonEmpty;
    const seenPhones = new Set<string>();

    const parsed = dataRows.map((row, i): ParsedRow => {
        const rowNumber = i + 1 + (usedHeader ? 1 : 0);
        const lastName = cleanName(row[columns.lastName]);
        const firstName = cleanName(row[columns.firstName]);
        const rawPhone = String(row[columns.phone] ?? '').trim();
        const phone = normalizePhone(row[columns.phone]);
        const grade = normalizeGrade(row[columns.grade]);

        let error: string | undefined;
        if (!lastName && !firstName) error = 'Овог/нэр хоосон';
        else if (!firstName) error = 'Нэр хоосон';
        else if (!grade) error = 'Анги буруу (1–12 байх ёстой)';
        else if (!phone) error = 'Утасны дугаар буруу (8 орон)';
        else if (seenPhones.has(phone)) error = 'Файл дотор давхардсан утас';

        if (phone && !error) seenPhones.add(phone);

        return {
            rowNumber,
            lastName,
            firstName,
            grade: grade ?? '',
            phone: phone ?? '',
            rawPhone,
            error,
        };
    });

    return { rows: parsed, usedHeader };
}
