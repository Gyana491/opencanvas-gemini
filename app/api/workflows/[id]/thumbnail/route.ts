import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { uploadFile } from "@/lib/r2";

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
        });

        if (!workflow) {
            return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
        }

        if (workflow.userId !== session.user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Upload to R2
        const buffer = Buffer.from(await file.arrayBuffer());
        const timestamp = Date.now();
        const key = `workflows/${workflow.id}/thumbnail-${timestamp}.png`;

        const url = await uploadFile(buffer, key, file.type);

        // Update database
        const updatedWorkflow = await prisma.workflow.update({
            where: { id: workflow.id },
            data: { thumbnail: url },
        });

        return NextResponse.json({ success: true, url });
    } catch (error) {
        console.error("Thumbnail Upload Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
