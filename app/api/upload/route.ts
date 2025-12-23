import { NextResponse } from "next/server";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET_NAME } from "@/lib/r2";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: Request) {
    try {
        const { filename, contentType } = await request.json();

        const uniqueFilename = `${uuidv4()}-${filename}`;

        const command = new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: uniqueFilename,
            ContentType: contentType,
        });

        const signedUrl = await getSignedUrl(r2, command, { expiresIn: 3600 });

        return NextResponse.json({
            uploadUrl: signedUrl,
            publicUrl: `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${uniqueFilename}`
        });
    } catch (error) {
        console.error("Error generating signed URL:", error);
        return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 });
    }
}
