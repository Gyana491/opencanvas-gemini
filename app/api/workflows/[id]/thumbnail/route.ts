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
    const session = await auth.api.getSession({
        headers: req.headers,
    });

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

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
            return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
        }

        if (workflow.userId !== session.user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const key = `workflows/${workflow.id}/thumbnail.png`;
        const oldThumbnailKey = workflow.thumbnail ? extractStorageKeyFromUrl(workflow.thumbnail) : null;
        const isLegacyThumbnailKey =
            oldThumbnailKey !== null &&
            oldThumbnailKey !== key &&
            oldThumbnailKey.startsWith(`workflows/${workflow.id}/`);

        // Upload to R2 (single key per workflow so updates overwrite the existing thumbnail)
        const buffer = Buffer.from(await file.arrayBuffer());
        const url = await uploadFile(buffer, key, file.type || "image/png");

        // Update database
        if (workflow.thumbnail !== url) {
            await prisma.workflow.update({
                where: { id: workflow.id },
                data: { thumbnail: url },
                select: { id: true },
            });
        }

        // Clean up old key from timestamp-based naming (or any legacy key)
        if (isLegacyThumbnailKey && oldThumbnailKey) {
            try {
                await deleteFile(oldThumbnailKey);
            } catch (deleteError) {
                console.error("Old thumbnail cleanup failed:", deleteError);
            }
        }

        return NextResponse.json({ success: true, url });
    } catch (error) {
        console.error("Thumbnail Upload Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
