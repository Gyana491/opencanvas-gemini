import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { deleteFile, uploadFile } from "@/lib/r2";

function extractStorageKeyFromUrl(url: string): string | null {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.pathname.replace(/^\/+/, "") || null;
    } catch {
        return null;
    }
}

export async function POST(
    req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    console.log("[Thumbnail API] Request received", { workflowId: params.id });

    const session = await auth.api.getSession({
        headers: req.headers,
    });

    if (!session) {
        console.warn("[Thumbnail API] Unauthorized request", { workflowId: params.id });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            console.warn("[Thumbnail API] Missing file in request", { workflowId: params.id });
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        console.log("[Thumbnail API] File received", {
            workflowId: params.id,
            size: file.size,
            type: file.type,
        });

        // Verify ownership
        const workflow = await prisma.workflow.findUnique({
            where: { id: params.id },
            select: {
                id: true,
                userId: true,
                thumbnail: true,
            },
        });

        if (!workflow) {
            console.warn("[Thumbnail API] Workflow not found", { workflowId: params.id });
            return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
        }

        if (workflow.userId !== session.user.id) {
            console.warn("[Thumbnail API] Forbidden workflow access", {
                workflowId: params.id,
                sessionUserId: session.user.id,
                ownerId: workflow.userId,
            });
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const key = `workflows/${workflow.id}/thumbnail.png`;
        const oldThumbnailKey = workflow.thumbnail ? extractStorageKeyFromUrl(workflow.thumbnail) : null;
        const isLegacyThumbnailKey =
            oldThumbnailKey !== null &&
            oldThumbnailKey !== key &&
            oldThumbnailKey.startsWith(`workflows/${workflow.id}/`);

        // Keep exactly one thumbnail object per workflow key.
        // If the same key already exists, delete it first before uploading replacement.
        if (oldThumbnailKey === key) {
            try {
                await deleteFile(key);
                console.log("[Thumbnail API] Existing thumbnail key deleted before upload", { workflowId: workflow.id, key });
            } catch (deleteError) {
                console.warn("[Thumbnail API] Existing key delete skipped/failed before upload", {
                    workflowId: workflow.id,
                    key,
                    error: deleteError,
                });
            }
        }

        // Upload to R2 (single key per workflow so updates overwrite the existing thumbnail)
        const buffer = Buffer.from(await file.arrayBuffer());
        const url = await uploadFile(buffer, key, file.type || "image/png");
        console.log("[Thumbnail API] Uploaded to storage", { workflowId: workflow.id, key, url });

        // Always update to bump updatedAt even when URL/key remains unchanged.
        await prisma.workflow.update({
            where: { id: workflow.id },
            data: { thumbnail: url },
            select: { id: true },
        });
        console.log("[Thumbnail API] Database thumbnail updated", { workflowId: workflow.id });

        // Clean up old key from timestamp-based naming (or any legacy key)
        if (isLegacyThumbnailKey && oldThumbnailKey) {
            try {
                await deleteFile(oldThumbnailKey);
                console.log("[Thumbnail API] Legacy thumbnail deleted", { workflowId: workflow.id, oldThumbnailKey });
            } catch (deleteError) {
                console.error("Old thumbnail cleanup failed:", deleteError);
            }
        }

        console.log("[Thumbnail API] Request completed", { workflowId: workflow.id, success: true });
        return NextResponse.json({ success: true, url });
    } catch (error) {
        console.error("Thumbnail Upload Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
