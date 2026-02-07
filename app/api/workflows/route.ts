import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const session = await auth.api.getSession({
        headers: req.headers,
    });

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const workflows = await prisma.workflow.findMany({
            where: {
                userId: session.user.id,
            },
            orderBy: {
                updatedAt: "desc",
            },
        });

        return NextResponse.json(workflows);
    } catch (error) {
        console.error("List Workflows Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await auth.api.getSession({
        headers: req.headers,
    });

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { name } = body;

        const workflow = await prisma.workflow.create({
            data: {
                name: name || "Untitled Workflow",
                userId: session.user.id,
                data: {
                    nodes: [],
                    edges: [],
                    viewport: { x: 0, y: 0, zoom: 1 },
                },
            },
        });

        return NextResponse.json(workflow);
    } catch (error) {
        console.error("Create Workflow Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
