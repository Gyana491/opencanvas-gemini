import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

function ensureObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isSharedEnabled(data: unknown): boolean {
  const obj = ensureObject(data);
  const share = ensureObject(obj.share);
  return Boolean(share.enabled);
}

function normalizeGraph(data: unknown) {
  const obj = ensureObject(data);
  const nodes = Array.isArray(obj.nodes) ? obj.nodes : [];
  const edges = Array.isArray(obj.edges) ? obj.edges : [];
  const viewport = ensureObject(obj.viewport);

  return {
    nodes,
    edges,
    viewport: {
      x: typeof viewport.x === "number" ? viewport.x : 0,
      y: typeof viewport.y === "number" ? viewport.y : 0,
      zoom: typeof viewport.zoom === "number" ? viewport.zoom : 1,
    },
  };
}

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;

  try {
    const workflow = await prisma.workflow.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, data: true, isShared: true, thumbnail: true },
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

    const graph = normalizeGraph(workflow.data);

    return NextResponse.json({
      id: workflow.id,
      name: workflow.name,
      thumbnail: workflow.thumbnail,
      access: "view",
      data: graph,
    });
  } catch (error) {
    console.error("Get Shared Workflow Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
