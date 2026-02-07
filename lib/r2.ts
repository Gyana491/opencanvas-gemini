import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const r2Config = {
    accountId: process.env.R2_ACCOUNT_ID!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    bucketName: process.env.R2_BUCKET_NAME!,
    publicUrl: process.env.R2_PUBLIC_URL!,
};

// Initialize S3 Client for Cloudflare R2
export const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
    },
});

/**
 * Upload a file to R2
 * @param buffer - File content as Buffer
 * @param key - Unique file path/key (e.g., "workflows/123/image.png")
 * @param contentType - MIME type of the file
 * @returns The public URL of the uploaded file
 */
export async function uploadFile(buffer: Buffer, key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
        Bucket: r2Config.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        // ACL: "public-read", // R2 buckets are private by default, but we use Public Access or Custom Domain
    });

    try {
        await r2.send(command);
        // Return the public URL
        // If publicUtils ends with /, remove it
        const baseUrl = r2Config.publicUrl.endsWith('/') ? r2Config.publicUrl.slice(0, -1) : r2Config.publicUrl;
        // Ensure key doesn't start with /
        const cleanKey = key.startsWith('/') ? key.slice(1) : key;

        return `${baseUrl}/${cleanKey}`;
    } catch (error) {
        console.error("R2 Upload Error:", error);
        throw new Error("Failed to upload file to R2");
    }
}

/**
 * Delete a file from R2
 * @param key - The file path/key to delete
 */
export async function deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
        Bucket: r2Config.bucketName,
        Key: key,
    });

    try {
        await r2.send(command);
    } catch (error) {
        console.error("R2 Delete Error:", error);
        throw new Error("Failed to delete file from R2");
    }
}
