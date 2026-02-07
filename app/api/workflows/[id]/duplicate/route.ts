import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

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
        // 1. Verify ownership of the original workflow
        const originalWorkflow = await prisma.workflow.findUnique({
            where: { id: params.id },
        });

        if (!originalWorkflow) {
            return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
        }

        if (originalWorkflow.userId !== session.user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // 2. Create a copy
        const newWorkflow = await prisma.workflow.create({
            data: {
                name: `Copy of ${originalWorkflow.name}`,
                data: originalWorkflow.data as any, // Cast JSON
                thumbnail: originalWorkflow.thumbnail, // Copy thumbnail URL too
                userId: session.user.id,
            },
        });

        return NextResponse.json({ success: true, data: newWorkflow });
    } catch (error) {
        console.error("Duplicate Workflow Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
