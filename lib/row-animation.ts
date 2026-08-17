"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
    if (typeof window === "undefined" || !window.matchMedia) return () => { };
    const mq = window.matchMedia(REDUCED_MOTION_QUERY);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
}

function getReducedMotion() {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * `prefers-reduced-motion: reduce` тохиргоог сонсдог hook.
 * SSR дээр `false` (hydration зөрөхгүй), клиент дээр бодит утгаа авна.
 */
export function usePrefersReducedMotion(): boolean {
    return useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
}

interface FlipOptions {
    /** Анимацийн үргэлжлэх хугацаа (мс). */
    duration?: number;
    /** `true` үед анимаци огт хийхгүй (reduced-motion). */
    disabled?: boolean;
}

/**
 * FLIP (First-Last-Invert-Play) техникээр жагсаалтын мөрүүдийг байрлал солиход
 * зөөлөн гулсуулах hook.
 *
 * - `keys` — одоогийн эрэмбээр байгаа мөрүүдийн түлхүүрийн жагсаалт.
 * - `registerRow(key)` — тухайн мөрийн `ref` callback.
 *
 * Зөвхөн байрлалаа сольсон мөрүүдэд л transform тавьдаг тул 100 мөр дээр ч
 * нэг удаагийн layout уншилтаас илүү зардал гаргахгүй.
 */
export function useFlipRows<T extends HTMLElement = HTMLElement>(
    keys: string[],
    { duration = 320, disabled = false }: FlipOptions = {},
) {
    const nodes = useRef(new Map<string, T>());
    const refCache = useRef(new Map<string, (el: T | null) => void>());
    const prevTops = useRef(new Map<string, number>());
    const orderKey = keys.join("|");

    const registerRow = useCallback((key: string) => {
        const cached = refCache.current.get(key);
        if (cached) return cached;
        const fn = (el: T | null) => {
            if (el) nodes.current.set(key, el);
            else {
                nodes.current.delete(key);
                prevTops.current.delete(key);
                refCache.current.delete(key);
            }
        };
        refCache.current.set(key, fn);
        return fn;
    }, []);

    useLayoutEffect(() => {
        const prev = prevTops.current;
        const next = new Map<string, number>();
        const moved: { el: T; dy: number }[] = [];

        // Байрлалыг эцэг элементэд харьцангуйгаар хэмжинэ — ингэснээр хуудас
        // дээрх бусад блок (жишээ нь хүсэлтийн самбар) хүснэгтийг доош
        // түлхэхэд хуурамч анимаци гарахгүй.
        const anchor = Array.from(nodes.current.values())[0]?.parentElement ?? null;
        const baseTop = anchor ? anchor.getBoundingClientRect().top : 0;

        nodes.current.forEach((el, key) => {
            const top = el.getBoundingClientRect().top - baseTop;
            next.set(key, top);
            if (disabled) return;
            const before = prev.get(key);
            if (before === undefined) return;
            const dy = before - top;
            if (Math.abs(dy) < 1) return;
            moved.push({ el, dy });
        });

        prevTops.current = next;
        if (disabled || moved.length === 0) return;

        // Invert — өмнөх байрлалд нь transform-оор буцаана.
        moved.forEach(({ el, dy }) => {
            el.style.transition = "none";
            el.style.transform = `translateY(${dy}px)`;
        });

        // Play — дараагийн frame дээр transform-ыг тэглэж гулсуулна.
        const raf = requestAnimationFrame(() => {
            moved.forEach(({ el }) => {
                el.style.transition = `transform ${duration}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
                el.style.transform = "";
            });
        });

        return () => cancelAnimationFrame(raf);
    }, [orderKey, duration, disabled]);

    return useMemo(() => ({ registerRow }), [registerRow]);
}

interface FlashOptions {
    /** Анивчих хугацаа (мс). */
    duration?: number;
    /** `true` үед анивчихгүй. */
    disabled?: boolean;
}

/**
 * Утга нь өөрчлөгдсөн (эсвэл шинээр нэмэгдсэн) түлхүүрүүдийг түр хугацаанд
 * "анивчих" жагсаалтад оруулна. Эхний snapshot дээр юу ч анивчихгүй.
 */
export function useChangeFlash(
    values: Record<string, number | string>,
    { duration = 1500, disabled = false }: FlashOptions = {},
): Set<string> {
    const [flashing, setFlashing] = useState<Set<string>>(() => new Set());
    const prevValues = useRef<Record<string, number | string> | null>(null);
    const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

    useEffect(() => {
        const timerMap = timers.current;
        return () => {
            timerMap.forEach(t => clearTimeout(t));
            timerMap.clear();
        };
    }, []);

    useEffect(() => {
        const prev = prevValues.current;
        prevValues.current = values;
        if (prev === null) return; // Анхны ачаалалт — анивчихгүй
        if (disabled) return;

        const changed = Object.keys(values).filter(k => prev[k] !== values[k]);
        if (changed.length === 0) return;

        setFlashing(curr => {
            const next = new Set(curr);
            changed.forEach(k => next.add(k));
            return next;
        });

        changed.forEach(k => {
            const running = timers.current.get(k);
            if (running) clearTimeout(running);
            timers.current.set(k, setTimeout(() => {
                timers.current.delete(k);
                setFlashing(curr => {
                    if (!curr.has(k)) return curr;
                    const next = new Set(curr);
                    next.delete(k);
                    return next;
                });
            }, duration));
        });
    }, [values, duration, disabled]);

    return flashing;
}
