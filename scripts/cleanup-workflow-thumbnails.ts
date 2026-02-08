import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../lib/generated/prisma";
import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { r2 } from "../lib/r2";

type ThumbnailObject = {
    key: string;
    lastModified: number;
};

const THUMBNAIL_KEY_REGEX = /^workflows\/([^/]+)\/thumbnail(?:-\d+)?\.[a-z0-9]+$/i;
const isApplyMode = process.argv.includes("--apply");
const bucketName = process.env.R2_BUCKET_NAME;
const databaseUrl = process.env.DATABASE_URL;

if (!bucketName) {
    console.error("Missing R2_BUCKET_NAME.");
    process.exit(1);
}

if (!databaseUrl) {
    console.error("Missing DATABASE_URL.");
    process.exit(1);
}

function extractStorageKeyFromUrl(url: string): string | null {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.pathname.replace(/^\/+/, "") || null;
    } catch {
        return null;
    }
}

function getWorkflowIdFromThumbnailKey(key: string): string | null {
    const match = key.match(THUMBNAIL_KEY_REGEX);
    return match ? match[1] : null;
}

function chunk<T>(input: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < input.length; i += size) {
        out.push(input.slice(i, i + size));
    }
    return out;
}

async function main() {
    console.log(isApplyMode ? "Running in APPLY mode." : "Running in DRY-RUN mode.");

    const adapter = new PrismaNeon({ connectionString: databaseUrl });
    const prisma = new PrismaClient({ adapter });

    try {
        await prisma.$connect();

        const workflows = await prisma.workflow.findMany({
            select: {
                id: true,
                thumbnail: true,
            },
        });

        const currentThumbnailKeyByWorkflowId = new Map<string, string>();
        for (const workflow of workflows) {
            if (!workflow.thumbnail) {
                continue;
            }
            const key = extractStorageKeyFromUrl(workflow.thumbnail);
            if (!key) {
                continue;
            }
            const workflowId = getWorkflowIdFromThumbnailKey(key);
            if (workflowId === workflow.id) {
                currentThumbnailKeyByWorkflowId.set(workflow.id, key);
            }
        }

        const thumbnailsByWorkflowId = new Map<string, ThumbnailObject[]>();
        let continuationToken: string | undefined = undefined;
        let scannedObjects = 0;

        do {
            const response = await r2.send(
                new ListObjectsV2Command({
                    Bucket: bucketName,
                    Prefix: "workflows/",
                    ContinuationToken: continuationToken,
                    MaxKeys: 1000,
                })
            );

            for (const object of response.Contents ?? []) {
                if (!object.Key) {
                    continue;
                }
                scannedObjects++;
                const workflowId = getWorkflowIdFromThumbnailKey(object.Key);
                if (!workflowId) {
                    continue;
                }

                const group = thumbnailsByWorkflowId.get(workflowId) ?? [];
                group.push({
                    key: object.Key,
                    lastModified: object.LastModified?.getTime() ?? 0,
                });
                thumbnailsByWorkflowId.set(workflowId, group);
            }

            continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
        } while (continuationToken);

        const keysToDelete: string[] = [];
        let workflowsWithExtraThumbnails = 0;

        for (const [workflowId, objects] of thumbnailsByWorkflowId.entries()) {
            if (objects.length <= 1) {
                continue;
            }

            workflowsWithExtraThumbnails++;

            const currentDbKey = currentThumbnailKeyByWorkflowId.get(workflowId);
            const canonicalKey = `workflows/${workflowId}/thumbnail.png`;

            let keepKey: string;
            if (currentDbKey && objects.some((obj) => obj.key === currentDbKey)) {
                keepKey = currentDbKey;
            } else if (objects.some((obj) => obj.key === canonicalKey)) {
                keepKey = canonicalKey;
            } else {
                keepKey = [...objects].sort((a, b) => b.lastModified - a.lastModified)[0].key;
            }

            for (const object of objects) {
                if (object.key !== keepKey) {
                    keysToDelete.push(object.key);
                }
            }
        }

        console.log(`Scanned R2 objects: ${scannedObjects}`);
        console.log(`Workflows with duplicate thumbnails: ${workflowsWithExtraThumbnails}`);
        console.log(`Thumbnail objects to delete: ${keysToDelete.length}`);

        if (!isApplyMode || keysToDelete.length === 0) {
            if (keysToDelete.length > 0) {
                console.log("Dry-run complete. Re-run with --apply to delete these objects.");
            }
            return;
        }

        const batches = chunk(keysToDelete, 1000);
        let deletedCount = 0;

        for (const batch of batches) {
            const result = await r2.send(
                new DeleteObjectsCommand({
                    Bucket: bucketName,
                    Delete: {
                        Objects: batch.map((key) => ({ Key: key })),
                        Quiet: true,
                    },
                })
            );

            deletedCount += batch.length - (result.Errors?.length ?? 0);

            if ((result.Errors?.length ?? 0) > 0) {
                for (const error of result.Errors ?? []) {
                    console.error(`Failed to delete ${error.Key}: ${error.Message}`);
                }
            }
        }

        console.log(`Deleted thumbnail objects: ${deletedCount}`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error("Cleanup failed:", error);
    process.exit(1);
});
