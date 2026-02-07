import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadFile } from "@/lib/r2";
import { nanoid } from "nanoid";

export async function POST(req: NextRequest) {
    // Check authentication
    const session = await auth.api.getSession({
        headers: req.headers,
    });

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        const workflowId = formData.get("workflowId") as string;
        const nodeId = formData.get("nodeId") as string;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const ext = file.name.split(".").pop();
        const key = `workflows/${workflowId}/assets/${nodeId || "global"}_${nanoid()}.${ext}`;

        const url = await uploadFile(buffer, key, file.type);

        return NextResponse.json({ url });
    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
