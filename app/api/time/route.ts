import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// FIX 30: Monotonic counter so clients can detect cached/stale responses.
// Combined with no-store headers, this prevents intermediaries from caching
// /api/time and serving the same timestamp to multiple clients.
let _counter = 0;

export async function GET() {
    const now = Date.now();
    _counter++;
    return NextResponse.json(
        {
            serverTime: now,
            nonce: _counter,
        },
        {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate",
                Pragma: "no-cache",
            },
        }
    );
}
