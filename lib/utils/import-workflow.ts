import { 
    safeValidateWorkflow, 
    validateWorkflowHasContent,
    type WorkflowData 
} from '@/lib/validation/workflow-schema';

export type WorkflowImportData = WorkflowData;

/**
 * Imports a workflow from a JSON file
 */
export async function importWorkflowFromJson(file: File): Promise<WorkflowImportData> {
    try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Validate using Zod schema
        const validation = safeValidateWorkflow(data);
        
        if (!validation.success) {
            // Provide detailed error information
            const errorMessage = `Invalid workflow JSON:\n${validation.details.join('\n')}`;
            console.error(errorMessage);
            throw new Error(validation.error + '. Check console for details.');
        }

        // Additional content validation
        const contentCheck = validateWorkflowHasContent(validation.data);
        if (!contentCheck.valid) {
            throw new Error(contentCheck.message);
        }

        return {
            ...validation.data,
            name: validation.data.name || 'Imported Workflow',
        };
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error('Invalid JSON file - file is corrupted or not valid JSON');
        }
        throw error;
    }
}
