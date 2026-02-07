import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Node, Edge, Viewport } from '@xyflow/react';

export type WorkflowData = {
    id: string;
    name: string;
    data: {
        nodes: Node[];
        edges: Edge[];
        viewport: Viewport;
    };
    updatedAt: string;
};

export function useWorkflow() {
    const [isLoading, setIsLoading] = useState(false);

    const createWorkflow = useCallback(async (name?: string) => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/workflows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            if (!res.ok) throw new Error('Failed to create workflow');
            const data = await res.json();
            return { success: true, data };
        } catch (error) {
            console.error(error);
            return { success: false, error: (error as Error).message };
        } finally {
            setIsLoading(false);
        }
    }, []);

    const loadWorkflow = useCallback(async (id: string) => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/workflows/${id}`);
            if (!res.ok) {
                if (res.status === 404) return { success: false, error: 'Workflow not found' };
                throw new Error('Failed to load workflow');
            }
            const data = await res.json();
            return { success: true, data };
        } catch (error) {
            console.error(error);
            return { success: false, error: (error as Error).message };
        } finally {
            setIsLoading(false);
        }
    }, []);

    const saveWorkflow = useCallback(async (id: string, nodes: Node[], edges: Edge[], viewport: Viewport) => {
        try {
            const res = await fetch(`/api/workflows/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: { nodes, edges, viewport },
                }),
            });
            if (!res.ok) throw new Error('Failed to save workflow');
            return { success: true };
        } catch (error) {
            console.error(error);
            return { success: false, error: (error as Error).message };
        }
    }, []);

    const renameWorkflow = useCallback(async (id: string, name: string) => {
        try {
            const res = await fetch(`/api/workflows/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            if (!res.ok) throw new Error('Failed to rename workflow');
            return { success: true };
        } catch (error) {
            console.error(error);
            return { success: false, error: (error as Error).message };
        }
    }, []);

    const deleteWorkflow = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/workflows/${id}`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('Failed to delete workflow');
            return { success: true };
        } catch (error) {
            console.error(error);
            return { success: false, error: (error as Error).message };
        }
    }, []);

    // Duplicate not natively supported in API yet without reading first, 
    // but we can implement it by reading then creating.
    // implementing a specific duplicate endpoint would be better, but for now:
    const duplicateWorkflow = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/workflows/${id}/duplicate`, {
                method: 'POST',
            });
            if (!res.ok) throw new Error('Failed to duplicate workflow');
            const result = await res.json();
            return result; // { success: true, data: newWorkflow }
        } catch (error) {
            console.error(error);
            return { success: false, error: (error as Error).message };
        }
    }, []);

    return {
        createWorkflow,
        loadWorkflow,
        saveWorkflow,
        renameWorkflow,
        deleteWorkflow,
        duplicateWorkflow,
        isLoading
    };
}
