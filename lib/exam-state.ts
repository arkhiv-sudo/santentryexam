/**
 * Шалгалтын төлөв — ОГНОО БИШ, ТӨЛӨВӨӨР удирдана.
 *
 * Шалгалт зөвхөн админ «Бүгдэд эхлүүлэх» дарснаар эхэлдэг болсон тул
 * товлосон огноо/цаг хэрэггүй болсон. Бүх хуудас энэ дундын логикийг ашиглана.
 */

export type ExamState = "draft" | "open" | "running" | "finished" | "archived";

export interface ExamStateInput {
    status?: string;
    duration?: number;
    startedAt?: unknown;
}

/** Firestore Timestamp | Date | ISO | millis → millis */
export function toMillis(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const v = value as { toMillis?: () => number; seconds?: number };
    if (typeof v.toMillis === "function") return v.toMillis();
    if (typeof v.seconds === "number") return v.seconds * 1000;
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number") return value;
    const d = new Date(value as string);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
}

export function getExamState(exam: ExamStateInput, now: number = Date.now()): ExamState {
    if (exam.status === "archived") return "archived";
    if (exam.status !== "published") return "draft";
    const started = toMillis(exam.startedAt);
    if (!started) return "open";
    const end = started + (exam.duration || 60) * 60 * 1000;
    return now < end ? "running" : "finished";
}

/** Сурагч энэ шалгалт руу орох боломжтой юу (хүлээх танхим эсвэл явц). */
export function isExamJoinable(exam: ExamStateInput, now: number = Date.now()): boolean {
    const s = getExamState(exam, now);
    return s === "open" || s === "running";
}

export const EXAM_STATE_LABEL: Record<ExamState, string> = {
    draft: "Ноорог",
    open: "Нээлттэй",
    running: "Явагдаж байна",
    finished: "Дууссан",
    archived: "Архивласан",
};

/** Tailwind классууд — бүдэг саарал биш, тод ялгаатай өнгө. */
export const EXAM_STATE_CLASS: Record<ExamState, string> = {
    draft: "bg-slate-100 text-slate-700 border border-slate-200",
    open: "bg-emerald-100 text-emerald-800 border border-emerald-300",
    running: "bg-blue-100 text-blue-800 border border-blue-300",
    finished: "bg-purple-100 text-purple-800 border border-purple-300",
    archived: "bg-amber-100 text-amber-800 border border-amber-300",
};

/** Шалгалтын дуусах мөч (эхэлсэн бол). */
export function examEndsAt(exam: ExamStateInput): number | null {
    const started = toMillis(exam.startedAt);
    return started ? started + (exam.duration || 60) * 60 * 1000 : null;
}
