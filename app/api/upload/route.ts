import { NextRequest, NextResponse } from "next/server";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET_NAME, R2_PUBLIC_URL } from "@/lib/r2";
import { v4 as uuidv4 } from "uuid";
import { getCurrentUser } from "@/lib/session";
import { checkOrigin } from "@/lib/csrf";

const ALLOWED_MIME = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg',
    'video/mp4', 'video/webm',
];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

export async function POST(request: NextRequest) {
    const origin = checkOrigin(request);
    if (!origin.ok) return origin.response;

    const user = await getCurrentUser();
    if (!user || (user.role !== "admin" && user.role !== "teacher")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { filename, contentType, fileSize } = body;
        // Backwards-compat: accept either `filename` or `fileName`
        const safeFilename = filename || body.fileName;

        if (!contentType || !ALLOWED_MIME.includes(contentType)) {
            return NextResponse.json(
                { error: `MIME төрөл зөвшөөрөгдөөгүй. Зөвхөн: ${ALLOWED_MIME.join(', ')}` },
                { status: 400 }
            );
        }

        if (typeof fileSize === 'number' && fileSize > MAX_SIZE) {
            return NextResponse.json(
                { error: `Файлын хэмжээ ${MAX_SIZE / 1024 / 1024}MB-аас хэтэрсэн` },
                { status: 400 }
            );
        }

        const uniqueFilename = `${uuidv4()}-${safeFilename}`;

        // Enforce ContentLength on the presigned URL when fileSize is provided so R2
        // rejects uploads larger than the declared size. Note: R2 follows S3 semantics
        // for ContentLength on PutObject — clients MUST send the matching Content-Length
        // header or the upload fails. If fileSize is not provided we fall back to the
        // server-side MAX_SIZE check above (client-side enforcement only).
        const commandInput: ConstructorParameters<typeof PutObjectCommand>[0] = {
            Bucket: R2_BUCKET_NAME,
            Key: uniqueFilename,
            ContentType: contentType,
        };
        if (typeof fileSize === 'number' && fileSize > 0) {
            commandInput.ContentLength = fileSize;
        }
        const command = new PutObjectCommand(commandInput);

        const signedUrl = await getSignedUrl(r2, command, { expiresIn: 3600 });

        return NextResponse.json({
            uploadUrl: signedUrl,
            publicUrl: `${R2_PUBLIC_URL}/${uniqueFilename}`
        });
    } catch (error) {
        console.error("Error generating signed URL:", error);
        return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 });
    }
}
