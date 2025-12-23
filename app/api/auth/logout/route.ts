import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
    (await cookies()).delete("__session");
    (await cookies()).delete("role");
    return NextResponse.json({ status: "success" });
}
