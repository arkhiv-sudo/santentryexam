import { NextResponse } from "next/server";

/**
 * DISABLED — the anonymous ("зочин") exam entry flow was replaced by the
 * phone + code sign-in at /s (see /api/auth/exam-login).
 *
 * This endpoint used to mint a student-role custom token for anyone who asked,
 * which let unauthenticated callers register for exams and read exam questions.
 * It is kept as a 410 stub rather than deleted so the removal is easy to revert;
 * delete the file once you're happy with the new flow.
 */
export async function POST() {
    return NextResponse.json(
        { error: "Зочин горим хаагдсан. Утасны дугаар болон кодоороо нэвтэрнэ үү." },
        { status: 410 }
    );
}
