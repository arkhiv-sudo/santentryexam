"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { parseStudentSheet, ParsedRow } from "@/lib/students-import";
import { downloadCsv } from "@/lib/download";
import {
    Download,
    Upload,
    Loader2,
    AlertCircle,
    CheckCircle2,
    Copy,
    X,
    FileSpreadsheet,
} from "lucide-react";

interface RowResult {
    rowNumber: number;
    lastName: string;
    firstName: string;
    grade: string;
    phone: string;
    status: 'created' | 'updated' | 'error';
    examCode?: string;
    error?: string;
}

interface ImportSummary {
    created: number;
    updated: number;
    failed: number;
}

/**
 * Файлын текстийг зөв кодчлолоор унших.
 * Excel-ээс "CSV" болгож хадгалахад Windows дээр ихэвчлэн windows-1251 болдог тул
 * UTF-8-аар уншаад эвдэрсэн тэмдэгт (U+FFFD) илэрвэл 1251-ээр дахин оролдоно.
 */
async function readTextSmart(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const utf8 = new TextDecoder("utf-8").decode(buffer);
    if (!utf8.includes("�")) return utf8.replace(/^﻿/, "");
    try {
        const cp1251 = new TextDecoder("windows-1251").decode(buffer);
        return cp1251.replace(/^﻿/, "");
    } catch {
        return utf8.replace(/^﻿/, "");
    }
}

export default function StudentExcelImport({ onImported }: { onImported?: () => void }) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = useState("");
    const [rows, setRows] = useState<ParsedRow[]>([]);
    const [parsing, setParsing] = useState(false);
    const [importing, setImporting] = useState(false);
    const [results, setResults] = useState<RowResult[] | null>(null);
    const [summary, setSummary] = useState<ImportSummary | null>(null);
    const [errorText, setErrorText] = useState("");

    const validRows = rows.filter(r => !r.error);
    const invalidRows = rows.filter(r => r.error);

    const reset = () => {
        setRows([]);
        setResults(null);
        setSummary(null);
        setFileName("");
        setErrorText("");
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    /** Загвар: толгой мөр + жишээ мөр. Жишээний утас санаатайгаар хүчингүй
     *  (0-оор эхэлсэн) тул андуурч импортлогдох аргагүй. */
    const downloadTemplate = () => {
        downloadCsv(
            ["Овог", "Нэр", "Анги", "Утас"],
            [["ЖИШЭЭ-Овог", "ЖИШЭЭ-Нэр", "7", "00000000"]],
            "surgach_zagvar.csv",
        );
        toast.success("Загвар татагдлаа. Жишээ мөрийг устгаад өөрийн датаг бичнэ үү.");
    };

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setParsing(true);
        setResults(null);
        setSummary(null);
        setErrorText("");

        try {
            const name = file.name.toLowerCase();
            let matrix: unknown[][] = [];

            if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
                // Excel-ийн хоёртын формат — номын санг зөвхөн хэрэгтэй үед ачаална,
                // ингэснээр номын сан унасан ч хуудас бүхэлдээ эвдрэхгүй.
                try {
                    const XLSX = await import("xlsx");
                    const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
                    const sheet = book.Sheets[book.SheetNames[0]];
                    if (!sheet) throw new Error("Файл дотор хуудас олдсонгүй");
                    matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, raw: false });
                } catch (xlsxErr) {
                    console.error("[StudentExcelImport] xlsx уншиж чадсангүй", xlsxErr);
                    setErrorText(
                        "Excel (.xlsx) файлыг уншиж чадсангүй. Excel дээрээ «Файл → Хадгалах → CSV UTF-8» " +
                        "гэж хадгалаад дахин оруулна уу (загвар татах товч CSV өгдөг)."
                    );
                    return;
                }
            } else {
                // CSV / TSV — таслал, цэг таслал, tab-ыг автоматаар таньдаг
                const text = await readTextSmart(file);
                const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: "greedy" });
                if (parsed.errors.length > 0) {
                    console.warn("[StudentExcelImport] CSV сануулга:", parsed.errors.slice(0, 3));
                }
                matrix = parsed.data as unknown[][];
            }

            const { rows: parsedRows } = parseStudentSheet(matrix);
            if (parsedRows.length === 0) {
                setErrorText("Файлаас сурагчийн мөр олдсонгүй. Багана нь Овог | Нэр | Анги | Утас байх ёстой.");
                return;
            }

            setRows(parsedRows);
            setFileName(file.name);
            toast.success(`${parsedRows.length} мөр уншлаа`);
        } catch (err) {
            console.error("[StudentExcelImport] parse failed", err);
            setErrorText(err instanceof Error ? err.message : "Файлыг уншихад алдаа гарлаа");
        } finally {
            setParsing(false);
        }
    };

    const handleImport = async () => {
        if (validRows.length === 0) return;
        setImporting(true);
        setErrorText("");
        try {
            const res = await fetch("/api/admin/students/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    students: validRows.map(r => ({
                        rowNumber: r.rowNumber,
                        lastName: r.lastName,
                        firstName: r.firstName,
                        grade: r.grade,
                        phone: r.phone,
                    })),
                }),
            });

            const text = await res.text();
            let data: { error?: string; results?: RowResult[]; summary?: ImportSummary };
            try {
                data = JSON.parse(text);
            } catch {
                throw new Error(`Сервер буруу хариу буцаалаа (${res.status}): ${text.slice(0, 200)}`);
            }
            if (!res.ok) throw new Error(data.error || `Импорт амжилтгүй (${res.status})`);

            setResults(data.results || []);
            setSummary(data.summary || { created: 0, updated: 0, failed: 0 });
            setRows([]);
            toast.success(`${data.summary?.created ?? 0} шинэ, ${data.summary?.updated ?? 0} шинэчлэгдсэн`);
            onImported?.();
        } catch (err) {
            console.error("[StudentExcelImport] import failed", err);
            setErrorText(err instanceof Error ? err.message : "Импорт амжилтгүй боллоо");
            toast.error("Импорт амжилтгүй — дэлгэрэнгүйг доор харна уу");
        } finally {
            setImporting(false);
        }
    };

    const successRows = (results || []).filter(r => r.status !== 'error');

    const copyCodes = async () => {
        const text = successRows
            .map(r => `${r.lastName} ${r.firstName}\t${r.grade}\t${r.phone}\t${r.examCode}`)
            .join("\n");
        try {
            await navigator.clipboard.writeText(text);
            toast.success("Хуулагдлаа");
        } catch {
            toast.error("Хуулж чадсангүй");
        }
    };

    const downloadCodes = () => {
        downloadCsv(
            ["Овог", "Нэр", "Анги", "Утас", "Нэвтрэх код"],
            successRows.map(r => [r.lastName, r.firstName, r.grade, r.phone, r.examCode || ""]),
            "surgach_nevtreh_kod.csv",
        );
    };

    return (
        <Card className="border-0 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                    Сурагч импортлох
                </CardTitle>
                <Button variant="outline" onClick={downloadTemplate} className="gap-2">
                    <Download className="w-4 h-4" /> Загвар татах
                </Button>
            </CardHeader>

            <CardContent className="space-y-6">
                <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 text-sm text-blue-900 space-y-1">
                    <p>
                        Баганы дараалал: <strong>Овог | Нэр | Анги | Утас</strong>. Толгой мөртэй ба
                        толгойгүй хоёуланг уншина. Анги 1–12, утас 8 оронтой.
                    </p>
                    <p>
                        <strong>CSV</strong> (загвар татах товчоор авсан) хамгийн найдвартай. Excel-ийн
                        .xlsx файл ч ажиллана.
                    </p>
                    <p>
                        Импорт хийхэд сурагч бүрт <strong>3 тэмдэгт нэвтрэх код</strong> үүсэж, тэр кодоороо
                        утасны дугаартайгаа хамт шалгалт руу шууд нэвтэрнэ.
                    </p>
                </div>

                {errorText && (
                    <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-800 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span className="whitespace-pre-wrap">{errorText}</span>
                    </div>
                )}

                {/* ── File picker ─────────────────────────────────────────── */}
                {!results && (
                    <div className="flex flex-wrap items-center gap-3">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,.tsv,.txt,.xlsx,.xls"
                            onChange={handleFile}
                            className="hidden"
                        />
                        <Button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={parsing || importing}
                            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            Файл сонгох (CSV / Excel)
                        </Button>
                        {fileName && (
                            <span className="text-sm text-slate-500 font-medium flex items-center gap-2">
                                {fileName}
                                <button onClick={reset} className="text-slate-400 hover:text-red-500" title="Цуцлах">
                                    <X className="w-4 h-4" />
                                </button>
                            </span>
                        )}
                    </div>
                )}

                {/* ── Preview ─────────────────────────────────────────────── */}
                {rows.length > 0 && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3 text-sm font-bold">
                            <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700">
                                Бэлэн: {validRows.length}
                            </span>
                            {invalidRows.length > 0 && (
                                <span className="px-3 py-1 rounded-full bg-red-100 text-red-700">
                                    Алдаатай: {invalidRows.length}
                                </span>
                            )}
                        </div>

                        <div className="max-h-96 overflow-auto rounded-xl border border-slate-200">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs uppercase bg-slate-50 text-slate-600 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2">#</th>
                                        <th className="px-4 py-2">Овог</th>
                                        <th className="px-4 py-2">Нэр</th>
                                        <th className="px-4 py-2">Анги</th>
                                        <th className="px-4 py-2">Утас</th>
                                        <th className="px-4 py-2">Төлөв</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(row => (
                                        <tr
                                            key={row.rowNumber}
                                            className={`border-b border-slate-100 ${row.error ? "bg-red-50" : "bg-white"}`}
                                        >
                                            <td className="px-4 py-2 text-slate-400">{row.rowNumber}</td>
                                            <td className="px-4 py-2 font-medium text-slate-800">{row.lastName}</td>
                                            <td className="px-4 py-2 font-medium text-slate-800">{row.firstName}</td>
                                            <td className="px-4 py-2">{row.grade || "—"}</td>
                                            <td className="px-4 py-2 font-mono">{row.phone || row.rawPhone || "—"}</td>
                                            <td className="px-4 py-2">
                                                {row.error ? (
                                                    <span className="text-red-600 font-medium flex items-center gap-1">
                                                        <AlertCircle className="w-3.5 h-3.5" /> {row.error}
                                                    </span>
                                                ) : (
                                                    <span className="text-emerald-600 font-medium flex items-center gap-1">
                                                        <CheckCircle2 className="w-3.5 h-3.5" /> Бэлэн
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex items-center gap-3">
                            <Button
                                onClick={handleImport}
                                disabled={importing || validRows.length === 0}
                                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                {validRows.length} сурагч үүсгэх
                            </Button>
                            <Button variant="outline" onClick={reset} disabled={importing}>
                                Цуцлах
                            </Button>
                        </div>
                        <p className="text-xs text-slate-500">
                            Өмнө нь бүртгэгдсэн утасны дугаар таарвал тухайн сурагчийн мэдээлэл шинэчлэгдэж,
                            <strong> шинэ код</strong> үүснэ (хуучин код ажиллахаа болино).
                        </p>
                    </div>
                )}

                {/* ── Results ─────────────────────────────────────────────── */}
                {results && summary && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3 text-sm font-bold">
                            <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700">
                                Шинээр үүссэн: {summary.created}
                            </span>
                            <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700">
                                Шинэчлэгдсэн: {summary.updated}
                            </span>
                            {summary.failed > 0 && (
                                <span className="px-3 py-1 rounded-full bg-red-100 text-red-700">
                                    Амжилтгүй: {summary.failed}
                                </span>
                            )}
                        </div>

                        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
                            Доорх кодуудыг сурагчдад тараана уу. Хожим <strong>Сурагчид</strong> хүснэгтээс
                            мөн харах боломжтой.
                        </div>

                        <div className="max-h-96 overflow-auto rounded-xl border border-slate-200">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs uppercase bg-slate-50 text-slate-600 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2">Овог</th>
                                        <th className="px-4 py-2">Нэр</th>
                                        <th className="px-4 py-2">Анги</th>
                                        <th className="px-4 py-2">Утас</th>
                                        <th className="px-4 py-2">Код</th>
                                        <th className="px-4 py-2">Төлөв</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map(r => (
                                        <tr key={`${r.rowNumber}-${r.phone}`} className={`border-b border-slate-100 ${r.status === 'error' ? "bg-red-50" : "bg-white"}`}>
                                            <td className="px-4 py-2 font-medium text-slate-800">{r.lastName}</td>
                                            <td className="px-4 py-2 font-medium text-slate-800">{r.firstName}</td>
                                            <td className="px-4 py-2">{r.grade}</td>
                                            <td className="px-4 py-2 font-mono">{r.phone}</td>
                                            <td className="px-4 py-2">
                                                {r.examCode ? (
                                                    <span className="font-mono font-black text-lg tracking-widest text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                                        {r.examCode}
                                                    </span>
                                                ) : "—"}
                                            </td>
                                            <td className="px-4 py-2">
                                                {r.status === 'created' && <span className="text-emerald-600 font-medium">Шинэ</span>}
                                                {r.status === 'updated' && <span className="text-blue-600 font-medium">Шинэчлэгдсэн</span>}
                                                {r.status === 'error' && <span className="text-red-600 font-medium">{r.error}</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <Button onClick={downloadCodes} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                                <Download className="w-4 h-4" /> Кодуудыг татах (CSV)
                            </Button>
                            <Button variant="outline" onClick={copyCodes} className="gap-2">
                                <Copy className="w-4 h-4" /> Хуулах
                            </Button>
                            <Button variant="outline" onClick={reset}>
                                Дахин импортлох
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
