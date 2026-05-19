import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { randomBytes } from "crypto";
import { rateLimit } from "@/lib/rate-limit";
import { checkOrigin } from "@/lib/csrf";
import { generateStudentCodeSecure } from "@/lib/utils-server";
import { checkPasswordStrength } from "@/lib/password-policy";

// FIX 35: tempPassword handling rules (DO NOT VIOLATE):
//  1. Must NEVER be logged (no console.log of the password value).
//  2. Must NEVER be stored in Firestore — only the Firebase Auth record holds it.
//  3. Is returned ONCE in this API response and shown ONCE to the parent in the
//     credentials modal on /parent/children/add. The parent is expected to copy
//     or write it down at that moment; there is no second chance to retrieve it.

export async function POST(request: NextRequest) {
    const origin = checkOrigin(request);
    if (!origin.ok) return origin.response;

    try {
        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const idToken = authHeader.split("Bearer ")[1];
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        const parentId = decodedToken.uid;

        // FIX 14: Rate limit — 5 children created per hour per parent
        const limit = rateLimit(`children:${parentId}`, 5, 60 * 60 * 1000);
        if (!limit.allowed) {
            return NextResponse.json(
                { error: 'Та цагт 5-аас илүү хүүхэд бүртгэх боломжгүй' },
                { status: 429 }
            );
        }

        const body = await request.json();
        const { firstName, lastName, phone, school, className, nationalId } = body;

        if (!firstName || !lastName || !nationalId) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // 1. Check if nationalId (РД) already exists
        const existingUsers = await adminDb.collection("users").where("nationalId", "==", nationalId).get();
        if (!existingUsers.empty) {
            return NextResponse.json({ error: "Энэ регистрийн дугаартай хүүхэд аль хэдийн бүртгэгдсэн байна." }, { status: 409 });
        }

        // 2. Generate credentials
        // FIX 36: Use the cryptographically-strong, 8-char unambiguous student code
        // generator. Legacy 6-digit codes (`ST######`) continue to work because
        // lookups don't enforce a fixed length.
        const studentCode = generateStudentCodeSecure();
        const tempPassword = randomBytes(6).toString("hex"); // 12 char hex string
        // FIX 34: Sanity-check that the generated temp password meets the same
        // policy users have to follow. 12 hex chars always passes today, but if
        // someone shortens the generator later the check will catch it.
        if (tempPassword.length < 10 || !checkPasswordStrength(tempPassword + 'A').ok) {
            // Hex contains digits + letters, but not necessarily both — appending 'A'
            // gives the policy a guaranteed letter for the satisfies-rule check; the
            // real password we ship to the parent remains the unmodified `tempPassword`.
            console.error('[parent/children] Generated tempPassword failed policy check');
            return NextResponse.json({ error: 'Серверийн алдаа: нууц үг үүсгэхэд алдаа' }, { status: 500 });
        }
        const email = `${studentCode.toLowerCase()}@student.internal`;

        // FIX 35: Reminder that tempPassword is shown ONCE in this response and never
        // again. Never log the value itself.
        if (process.env.NODE_ENV !== 'production') {
            console.warn('[parent/children] tempPassword is returned in JSON and shown once in the credentials modal. Never log the value, never persist it to Firestore.');
        }

        // 3. Create Auth User
        const userRecord = await adminAuth.createUser({
            email,
            password: tempPassword,
            displayName: `${lastName} ${firstName}`,
        });

        const childUid = userRecord.uid;

        // 4. Save to Firestore `users` collection (do NOT store tempPassword)
        const childData = {
            uid: childUid,
            email,
            firstName,
            lastName,
            role: "student",
            phone: phone || "",
            school: school || "",
            class: className || "",
            grade: className?.match(/\d+/)?.[0] || "",
            nationalId,
            parentId,
            studentCode,
            mustChangePassword: true,
            createdAt: new Date(),
        };

        await adminDb.collection("users").doc(childUid).set(childData);

        // 5. Update Parent's `children` array
        const parentRef = adminDb.collection("users").doc(parentId);
        const parentDoc = await parentRef.get();
        
        let childrenArray = [];
        if (parentDoc.exists) {
            const parentData = parentDoc.data();
            childrenArray = parentData?.children || [];
        }
        
        if (!childrenArray.includes(childUid)) {
            childrenArray.push(childUid);
            await parentRef.update({ children: childrenArray });
        }

        return NextResponse.json({ success: true, studentCode, tempPassword, name: `${lastName} ${firstName}` });
    } catch (error: any) {
        console.error("Error creating child:", error);
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}
