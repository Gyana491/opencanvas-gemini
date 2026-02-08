import prisma from '../lib/prisma';
import { OUTPUT_HANDLE_IDS } from '../data/models';

const NODE_TYPE_MAPPING: Record<string, string> = {
    'imagen': 'imagen-4.0-generate-001',
    'veo3': 'veo-3.1-generate-preview',
    'nanoBanana': 'gemini-2.5-flash-image',
    'nanoBananaPro': 'gemini-3-pro-image-preview',
    'gemini-1.5-pro-image': 'gemini-2.5-pro-image',
    'gemini-1.5-flash-image': 'gemini-2.5-flash-image',
};

async function main() {
    const workflows = await prisma.workflow.findMany();
    let updatedCount = 0;

    console.log(`Checking ${workflows.length} workflows for migration...`);

    for (const workflow of workflows) {
        const data = workflow.data as any;
        if (!data || !data.nodes || !Array.isArray(data.nodes)) {
            continue;
        }

        let hasChanges = false;
        const nodeIdToNewType: Record<string, string> = {};

        // 1. Migrate Nodes
        for (const node of data.nodes) {
            if (NODE_TYPE_MAPPING[node.type]) {
                const oldType = node.type;
                const newType = NODE_TYPE_MAPPING[oldType];

                console.log(`[Workflow ${workflow.id}] Migrating node ${node.id}: ${oldType} -> ${newType}`);

                node.type = newType;
                // Update label if it was the default
                if (node.data && node.data.label === oldType) {
                    // We could update label to new title, but maybe safer to leave user interaction?
                    // User said "update according to new nodes", so let's update default labels.
                    // But we don't have titles here easily without importing MODELS.
                    // Let's just update the type. The UI might pick up the new default label if it renders dynamically.
                }

                nodeIdToNewType[node.id] = newType;
                hasChanges = true;
            }
        }

        // 2. Migrate Edges (Handles)
        if (data.edges && Array.isArray(data.edges)) {
            for (const edge of data.edges) {
                const sourceNode = data.nodes.find((n: any) => n.id === edge.source);
                if (!sourceNode) continue;

                // Check if we need to update source handle
                // Legacy 'image' -> 'imageOutput'
                if (edge.sourceHandle === 'image' || edge.sourceHandle === 'source') {
                    // If source is an image model or image upload
                    if (sourceNode.type.includes('image') || sourceNode.type.includes('imagen') || sourceNode.type === 'imageUpload') {
                        if (edge.sourceHandle !== OUTPUT_HANDLE_IDS.image) {
                            console.log(`[Workflow ${workflow.id}] Updating edge ${edge.id}: sourceHandle ${edge.sourceHandle} -> ${OUTPUT_HANDLE_IDS.image}`);
                            edge.sourceHandle = OUTPUT_HANDLE_IDS.image;
                            hasChanges = true;
                        }
                    }
                }

                // Legacy 'video' -> 'videoOutput'
                if (edge.sourceHandle === 'video') {
                    if (sourceNode.type.includes('video') || sourceNode.type.includes('veo')) {
                        if (edge.sourceHandle !== OUTPUT_HANDLE_IDS.video) {
                            console.log(`[Workflow ${workflow.id}] Updating edge ${edge.id}: sourceHandle ${edge.sourceHandle} -> ${OUTPUT_HANDLE_IDS.video}`);
                            edge.sourceHandle = OUTPUT_HANDLE_IDS.video;
                            hasChanges = true;
                        }
                    }
                }

                // Legacy 'text' -> 'textOutput' (for textInput)
                if (sourceNode.type === 'textInput' && edge.sourceHandle !== OUTPUT_HANDLE_IDS.text) {
                    console.log(`[Workflow ${workflow.id}] Updating edge ${edge.id}: sourceHandle ${edge.sourceHandle} -> ${OUTPUT_HANDLE_IDS.text}`);
                    edge.sourceHandle = OUTPUT_HANDLE_IDS.text;
                    hasChanges = true;
                }
            }
        }

        if (hasChanges) {
            await prisma.workflow.update({
                where: { id: workflow.id },
                data: {
                    data: data
                }
            });
            updatedCount++;
        }
    }

    console.log(`Migration complete. Updated ${updatedCount} workflows.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
