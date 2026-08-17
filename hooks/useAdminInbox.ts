"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Админы «ирсэн хүсэлт» хайрцаг — БҮХ шалгалтаас нэг дор.
 *
 * Өмнө нь дахин өгөх хүсэлт зөвхөн тухайн шалгалтын явцын хуудсан дээр
 * харагддаг байсан тул админ тэр хуудсыг нээгээгүй бол хүсэлт ирснийг
 * огт мэдэхгүй байв. Энэ hook нь Header болон хянах самбарт хамт
 * ашиглагдана (Firestore SDK ижил query-г дотооддоо хуваалцдаг).
 */

export interface PendingRetake {
    id: string;
    studentId: string;
    studentName: string;
    examId: string;
    examTitle: string;
    reason?: string;
    createdAt?: { seconds: number } | null;
}

export interface OpenTicket {
    id: string;
    examId: string;
    studentId: string;
    studentName: string;
    messageCount: number;
    updatedAt?: { seconds: number } | null;
}

/** Богино "динь" дуу — файл татахгүйгээр WebAudio-оор үүсгэнэ. */
export function playChime() {
    try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1245, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
        osc.onended = () => ctx.close().catch(() => {});
    } catch {
        /* дуу гаргаж чадсангүй — чимээгүй алгасна */
    }
}

const MUTE_KEY = "admin_inbox_muted";
const MUTE_EVENT = "admin-inbox-mute-changed";

function subscribeMute(onChange: () => void) {
    window.addEventListener(MUTE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
        window.removeEventListener(MUTE_EVENT, onChange);
        window.removeEventListener("storage", onChange);
    };
}

/**
 * Дуут дохионы тохиргоо (localStorage). `useSyncExternalStore` ашигласан нь
 * SSR-д аюулгүй бөгөөд effect дотроос setState дуудахаас зайлсхийнэ.
 */
export function useInboxSound() {
    const muted = useSyncExternalStore(
        subscribeMute,
        () => localStorage.getItem(MUTE_KEY) === "1",
        () => false, // сервер талд дуугүй гэж үзнэ
    );

    const toggleMuted = useCallback(() => {
        const next = localStorage.getItem(MUTE_KEY) === "1" ? "0" : "1";
        localStorage.setItem(MUTE_KEY, next);
        window.dispatchEvent(new Event(MUTE_EVENT));
    }, []);

    return { muted, toggleMuted };
}

/**
 * Хүлээгдэж буй дахин өгөх хүсэлт + нээлттэй тусламжийн чатыг сонсоно.
 * `enabled=false` үед (админ биш) ямар ч сонсогч үүсгэхгүй.
 */
export function useAdminInbox(enabled: boolean) {
    const [retakes, setRetakes] = useState<PendingRetake[]>([]);
    const [tickets, setTickets] = useState<OpenTicket[]>([]);
    const [loading, setLoading] = useState(true);
    /** Шинээр ирсэн зүйлийг мэдэхийн тулд өмнөх ID-нуудыг хадгална. */
    const seenRetakes = useRef<Set<string> | null>(null);
    const seenTickets = useRef<Set<string> | null>(null);
    const [newArrival, setNewArrival] = useState<{ kind: "retake" | "ticket"; name: string } | null>(null);

    useEffect(() => {
        if (!enabled) return;

        const unsubRetake = onSnapshot(
            query(collection(db, "retake_requests"), where("status", "==", "pending")),
            snap => {
                const rows: PendingRetake[] = snap.docs.map(d => ({ id: d.id, ...d.data() }) as PendingRetake);
                rows.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));

                const prev = seenRetakes.current;
                if (prev) {
                    const fresh = rows.find(r => !prev.has(r.id));
                    if (fresh) setNewArrival({ kind: "retake", name: fresh.studentName || "Сурагч" });
                }
                seenRetakes.current = new Set(rows.map(r => r.id));
                setRetakes(rows);
                setLoading(false);
            },
            err => { console.error("[useAdminInbox] retake listener", err); setLoading(false); },
        );

        const unsubTicket = onSnapshot(
            query(collection(db, "exam_tickets"), where("status", "==", "open")),
            snap => {
                const rows: OpenTicket[] = snap.docs.map(d => {
                    const data = d.data();
                    return {
                        id: d.id,
                        examId: data.examId,
                        studentId: data.studentId,
                        studentName: data.studentName,
                        messageCount: Array.isArray(data.messages) ? data.messages.length : 0,
                        updatedAt: data.updatedAt ?? null,
                    };
                });
                rows.sort((a, b) => (b.updatedAt?.seconds ?? 0) - (a.updatedAt?.seconds ?? 0));

                const prev = seenTickets.current;
                if (prev) {
                    const fresh = rows.find(t => !prev.has(t.id));
                    if (fresh) setNewArrival({ kind: "ticket", name: fresh.studentName || "Сурагч" });
                }
                seenTickets.current = new Set(rows.map(t => t.id));
                setTickets(rows);
            },
            err => console.error("[useAdminInbox] ticket listener", err),
        );

        return () => { unsubRetake(); unsubTicket(); };
    }, [enabled]);

    // enabled=false үед сонсогч огт үүсдэггүй тул хоосон утга буцаана
    // (effect дотор setState дуудахгүйн тулд төлөвийг нь цэвэрлэхгүй).
    if (!enabled) {
        return { retakes: [], tickets: [], loading: false, total: 0, newArrival: null, clearArrival: () => {} };
    }

    return {
        retakes,
        tickets,
        loading,
        total: retakes.length + tickets.length,
        /** Шинэ зүйл ирсэн дохио — уншсаны дараа `clearArrival()` дуудна. */
        newArrival,
        clearArrival: () => setNewArrival(null),
    };
}
