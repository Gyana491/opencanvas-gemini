import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

function ensureObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isShared(data: unknown): boolean {
  const obj = ensureObject(data);
  const share = ensureObject(obj.share);
  return Boolean(share.enabled);
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
    const workflow = await prisma.workflow.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        data: true,
        thumbnail: true,
        isShared: true,
      },
    });

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    if (!workflow.isShared) {
      return NextResponse.json(
        { error: "This workflow is not shared" },
        { status: 403 }
      );
    }

    const duplicated = await prisma.workflow.create({
      data: {
        name: `Copy of ${workflow.name}`,
        data: workflow.data ?? {},
        thumbnail: workflow.thumbnail,
        userId: session.user.id,
      },
      select: { id: true },
    });

    return NextResponse.json({ success: true, workflowId: duplicated.id });
  } catch (error) {
    console.error("Duplicate Shared Workflow Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
