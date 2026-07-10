'use client';

import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { strings } from '@/lib/strings';
import type { DesignedNode, DesignedResponse, NodeAlternative } from '@/lib/api-types';
import NodeCard from '@/components/NodeCard';

interface NodeEditorProps {
  response: DesignedResponse;
  onUpdate: (updated: DesignedResponse) => void;
}

export default function NodeEditor({ response, onUpdate }: NodeEditorProps) {
  const [nodes, setNodes] = useState<DesignedNode[]>(
    [...response.nodes].sort((a, b) => a.position - b.position)
  );
  const [assembled, setAssembled] = useState(response.assembled);
  const [regeneratingType, setRegeneratingType] = useState<string | null>(null);
  const [error, setError] = useState('');

  const serialize = useCallback(async (updatedNodes: DesignedNode[]) => {
    try {
      const res = await api.serialize({
        platform_id: response.platformId,
        nodes: updatedNodes,
      });
      setAssembled(res.assembled);
      onUpdate({ ...response, nodes: updatedNodes, assembled: res.assembled });
    } catch {
      // serialize failed — keep old assembled
    }
  }, [response, onUpdate]);

  const handleEditValue = useCallback((nodeType: string, newValue: string) => {
    setNodes((prev) => {
      const updated = prev.map((n) =>
        n.type === nodeType ? { ...n, value: newValue } : n
      );
      serialize(updated);
      return updated;
    });
  }, [serialize]);

  const handleToggleLock = useCallback((nodeType: string) => {
    setNodes((prev) => {
      const updated = prev.map((n) =>
        n.type === nodeType ? { ...n, locked: !n.locked } : n
      );
      return updated;
    });
  }, []);

  const handleRegenerate = useCallback(async (nodeType: string) => {
    setRegeneratingType(nodeType);
    setError('');
    try {
      const res = await api.redraftNode({
        platform_id: response.platformId,
        task_type: response.taskType,
        nodes,
        target_node_type: nodeType,
      });
      // If redraft succeeded (not 501), update the node
      if (res && 'value' in res) {
        setNodes((prev) => {
          const updated = prev.map((n) =>
            n.type === nodeType
              ? { ...n, value: res.value, rationale: res.rationale, alternatives: res.alternatives as NodeAlternative[], locked: false }
              : n
          );
          serialize(updated);
          return updated;
        });
      }
    } catch {
      setError(strings.nodeRegenerateError);
    } finally {
      setRegeneratingType(null);
    }
  }, [response, nodes, serialize]);

  const handleSelectAlternative = useCallback((nodeType: string, alt: NodeAlternative) => {
    setNodes((prev) => {
      const updated = prev.map((n) => {
        if (n.type !== nodeType) return n;
        // Add current value as an alternative before swapping
        const currentAlt: NodeAlternative = {
          value: n.value,
          rationale: n.rationale ?? '',
          rank: n.alternatives.length + 1,
        };
        const newAlts = [currentAlt, ...n.alternatives.filter((a) => a.value !== alt.value)];
        return {
          ...n,
          value: alt.value,
          rationale: alt.rationale,
          alternatives: newAlts,
        };
      });
      serialize(updated);
      return updated;
    });
  }, [serialize]);

  const handleCopy = () => {
    navigator.clipboard.writeText(assembled).then(() => {
      const btn = document.activeElement as HTMLButtonElement | null;
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = strings.copied;
        setTimeout(() => { btn.textContent = orig; }, 1500);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Assembled preview */}
      <div className="rounded-lg border border-gray-200">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
          <h3 className="text-sm font-medium text-gray-700">{strings.resultAssembled}</h3>
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap px-4 py-3 font-mono text-sm text-gray-800">
          {assembled}
        </pre>
      </div>

      <button
        onClick={handleCopy}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700"
      >
        {strings.resultCopy}
      </button>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-700">{error}</p>
        </div>
      )}

      {/* Node list */}
      <div className="space-y-3">
        {nodes.map((node) => (
          <NodeCard
            key={node.type}
            node={node}
            onEditValue={handleEditValue}
            onToggleLock={handleToggleLock}
            onRegenerate={handleRegenerate}
            onSelectAlternative={handleSelectAlternative}
            isRegenerating={regeneratingType === node.type}
          />
        ))}
      </div>
    </div>
  );
}
