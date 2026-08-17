import Papa from "papaparse";

/**
 * Браузерт файл татах дундын туслахууд.
 *
 * Blob + `<a download>` хослол нь энэ төсөлд аль хэдийн батлагдсан арга
 * (BulkQuestionUpload мөн ингэж ажилладаг). Excel-ийн `writeFile` шиг
 * гуравдагч номын сангаас хамаардаггүй тул хаана ч унахгүй.
 */

/** UTF-8 BOM — үүнгүйгээр Excel Кирилл үсгийг гажуудуулж нээдэг. */
const BOM = "﻿";

export function downloadBlob(content: BlobPart, filename: string, mime: string) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type CsvCell = string | number | boolean | null | undefined;

/** Толгойтой CSV үүсгэж (BOM-той, Excel зөв нээнэ) татаж авна. */
export function downloadCsv(fields: string[], rows: CsvCell[][], filename: string) {
    const csv = BOM + Papa.unparse({
        fields,
        data: rows.map(r => r.map(cell => (cell === null || cell === undefined ? "" : cell))),
    });
    downloadFilename(csv, filename);
}

function downloadFilename(csv: string, filename: string) {
    downloadBlob(csv, filename.endsWith(".csv") ? filename : `${filename}.csv`, "text/csv;charset=utf-8;");
}

/** "2026-08-17" хэлбэрийн огноо — файлын нэрэнд хэрэглэнэ. */
export function todayStamp(): string {
    return new Date().toISOString().slice(0, 10);
}

/** Секундыг "12м 30с" болгоно. */
export function formatDuration(seconds?: number): string {
    if (!seconds || seconds <= 0) return "—";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}м ${s}с` : `${s}с`;
}

/** Файлын нэрэнд аюулгүй болгож цэвэрлэнэ. */
export function safeFileName(name: string): string {
    return name.replace(/[^\p{L}\p{N}\-_ ]/gu, "").replace(/\s+/g, "_").slice(0, 60) || "file";
}
