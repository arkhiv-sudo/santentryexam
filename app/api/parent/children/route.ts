import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const idToken = authHeader.split("Bearer ")[1];
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        const parentId = decodedToken.uid;

        const body = await req.json();
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
        const randomNum = Math.floor(100000 + Math.random() * 900000); // 6 digits
        const studentCode = `ST${randomNum}`;
        const tempPassword = Math.random().toString(36).slice(-8); // 8 char random password
        const email = `${studentCode.toLowerCase()}@student.internal`;

        // 3. Create Auth User
        const userRecord = await adminAuth.createUser({
            email,
            password: tempPassword,
            displayName: `${lastName} ${firstName}`,
        });

        const childUid = userRecord.uid;

        // 4. Save to Firestore `users` collection
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
            tempPassword, // Save plainly so parent can view it
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

        return NextResponse.json({ success: true, childData });
    } catch (error: any) {
        console.error("Error creating child:", error);
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}
