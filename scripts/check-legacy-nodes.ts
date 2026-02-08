import prisma from '../lib/prisma';

async function main() {
    const workflows = await prisma.workflow.findMany();

    const nodeTypes = new Set<string>();
    const totalNodes = 0;

    console.log(`Scanning ${workflows.length} workflows...`);

    for (const workflow of workflows) {
        const data = workflow.data as any;
        if (!data || !data.nodes || !Array.isArray(data.nodes)) {
            continue;
        }

        for (const node of data.nodes) {
            if (node.type) {
                nodeTypes.add(node.type);
            }
        }
    }

    console.log('--- Distinct Node Types Found ---');
    Array.from(nodeTypes).sort().forEach(type => {
        console.log(`- ${type}`);
    });
    console.log('---------------------------------');

    console.log('\n--- Edge Connections for Legacy Nodes ---');
    for (const workflow of workflows) {
        const data = workflow.data as any;
        if (data && data.edges && data.edges.length > 0) {
            data.edges.forEach((edge: any) => {
                const sourceNode = data.nodes.find((n: any) => n.id === edge.source);
                if (sourceNode && ['imagen', 'veo3', 'nanoBanana', 'nanoBananaPro'].includes(sourceNode.type)) {
                    console.log(`Workflow ${workflow.id}: ${sourceNode.type} (${edge.sourceHandle}) -> ${edge.targetHandle}`);
                }
            });
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
