import { useCallback, useState } from 'react';
import type { Node, Edge } from '@xyflow/react';

type HistoryState = {
    nodes: Node[];
    edges: Edge[];
};

/**
 * Custom hook for managing undo/redo functionality in React Flow.
 * Stores history snapshots client-side only.
 * 
 * @param maxHistory - Maximum number of history states to keep (default: 50)
 */
export function useUndoRedo(maxHistory = 50) {
    const [past, setPast] = useState<HistoryState[]>([]);
    const [future, setFuture] = useState<HistoryState[]>([]);

    /**
     * Take a snapshot of the current state before making changes.
     * Call this before performing any action that should be undoable.
     */
    const takeSnapshot = useCallback(
        (nodes: Node[], edges: Edge[]) => {
            // Deep clone to avoid reference issues
            const snapshot: HistoryState = {
                nodes: JSON.parse(JSON.stringify(nodes)),
                edges: JSON.parse(JSON.stringify(edges)),
            };

            setPast((p) => {
                // Keep only the last (maxHistory - 1) items, then add new snapshot
                const newPast = p.length >= maxHistory ? p.slice(1) : p;
                return [...newPast, snapshot];
            });

            // Clear future when a new action is taken
            setFuture([]);
        },
        [maxHistory]
    );

    /**
     * Undo the last action and restore the previous state.
     */
    const undo = useCallback(
        (
            setNodes: (nodes: Node[]) => void,
            setEdges: (edges: Edge[]) => void,
            currentNodes: Node[],
            currentEdges: Edge[]
        ) => {
            if (past.length === 0) return;

            const previous = past[past.length - 1];

            // Save current state to future for redo
            const currentSnapshot: HistoryState = {
                nodes: JSON.parse(JSON.stringify(currentNodes)),
                edges: JSON.parse(JSON.stringify(currentEdges)),
            };

            setPast((p) => p.slice(0, -1));
            setFuture((f) => [...f, currentSnapshot]);

            // Restore previous state
            setNodes(previous.nodes);
            setEdges(previous.edges);
        },
        [past]
    );

    /**
     * Redo the last undone action.
     */
    const redo = useCallback(
        (
            setNodes: (nodes: Node[]) => void,
            setEdges: (edges: Edge[]) => void,
            currentNodes: Node[],
            currentEdges: Edge[]
        ) => {
            if (future.length === 0) return;

            const next = future[future.length - 1];

            // Save current state to past for undo
            const currentSnapshot: HistoryState = {
                nodes: JSON.parse(JSON.stringify(currentNodes)),
                edges: JSON.parse(JSON.stringify(currentEdges)),
            };

            setFuture((f) => f.slice(0, -1));
            setPast((p) => [...p, currentSnapshot]);

            // Restore next state
            setNodes(next.nodes);
            setEdges(next.edges);
        },
        [future]
    );

    /**
     * Clear all history (past and future).
     * Useful when loading a new workflow.
     */
    const clearHistory = useCallback(() => {
        setPast([]);
        setFuture([]);
    }, []);

    return {
        takeSnapshot,
        undo,
        redo,
        clearHistory,
        canUndo: past.length > 0,
        canRedo: future.length > 0,
    };
}
