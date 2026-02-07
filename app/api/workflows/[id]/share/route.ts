import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

function ensureObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
      select: { id: true, userId: true, data: true },
    });

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    if (workflow.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update the local data only to reflect the change visually in the JSON if needed,
    // but the source of truth is now the column.
    // We can actually remove the share object from data if we want to cleanup,
    // or just leave it for potential backward compatibility until backfill.
    // For now, let's just update the column.

    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { isShared: true },
    });

    const sharePath = `/shared/${workflow.id}`;

    return NextResponse.json({
      success: true,
      access: "view",
      sharePath,
    });
  } catch (error) {
    console.error("Share Workflow Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(
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
      select: { id: true, userId: true, isShared: true },
    });

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    if (workflow.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const shared = workflow.isShared;

    return NextResponse.json({
      success: true,
      shared,
      sharePath: shared ? `/shared/${workflow.id}` : null,
    });
  } catch (error) {
    console.error("Get Share Workflow Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
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
      select: { id: true, userId: true, data: true },
    });

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    if (workflow.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { isShared: false },
    });

    return NextResponse.json({
      success: true,
      shared: false,
    });
  } catch (error) {
    console.error("Disable Share Workflow Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
