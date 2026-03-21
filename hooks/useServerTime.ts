"use client";

import { useState, useEffect } from "react";

// Cache offset globally so we only fetch it once per session
let globalTimeOffset: number | null = null;

export function getServerTimeValue(): number {
    return Date.now() + (globalTimeOffset || 0);
}

export function useServerTime() {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        let mounted = true;

        const syncTime = async () => {
            if (globalTimeOffset === null) {
                try {
                    const start = Date.now();
                    const res = await fetch("/api/time", { cache: "no-store", next: { revalidate: 0 } });
                    if (res.ok) {
                        const data = await res.json();
                        const end = Date.now();
                        const latency = (end - start) / 2;
                        const estimatedServerTime = data.serverTime + latency;
                        globalTimeOffset = estimatedServerTime - end;
                    } else {
                        globalTimeOffset = 0;
                    }
                } catch {
                    globalTimeOffset = 0; // Fallback to local time
                }
            }

            if (mounted) {
                setNow(new Date(Date.now() + globalTimeOffset));
            }
        };

        syncTime();

        // Update the local time every second using the offset
        const interval = setInterval(() => {
            setNow(new Date(Date.now() + (globalTimeOffset || 0)));
        }, 1000);

        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, []);

    return now;
}

export function formatTimeLeft(targetDate: Date, now: Date) {
    const diff = targetDate.getTime() - now.getTime();
    if (diff <= 0) return null;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / 1000 / 60) % 60);
    const secs = Math.floor((diff / 1000) % 60);

    const parts = [];
    if (days > 0) parts.push(`${days} өдөр`);
    if (hours > 0 || days > 0) parts.push(`${hours} цаг`);
    parts.push(`${mins} мин`);
    
    // Make seconds visible when it gets close, e.g., < 1 hour left
    if (days === 0 && hours === 0) {
        parts.push(`${secs} сек`);
    }

    return parts.join(' ');
}
