import { useState } from 'react';

import { APPLICATION_AGENTS } from '../../../core/src/index.js';
import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';

interface TaskCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (agentId: string, title: string, description: string) => void;
  defaultAgentId?: string;
}

const TEMPLATES = [
  {
    agentId: 'researcher',
    title: 'Analyze this task',
    description: 'Explain the main objective of this task and provide a concise structured analysis.',
  },
  {
    agentId: 'researcher',
    title: 'Analyze the business fundamentals of NVIDIA based only on information provided in the task.',
    description:
      'Company Overview: NVIDIA is a semiconductor and accelerated computing pioneer. Key Segments: Data Center (AI GPUs including Hopper & Blackwell architectures, NVLink, InfiniBand networking), Gaming (GeForce RTX), Professional Visualization, Automotive. Financial Metrics: Rapid datacenter revenue scaling, gross margins >70%, high cash conversion. Competitive Moat: CUDA software ecosystem lock-in. Key Risks: Supply chain dependency on TSMC advanced packaging, custom ASICs from hyperscalers (Google TPU, AWS Trainium), geopolitical export controls.',
  },
  {
    agentId: 'analyst',
    title: 'Quantitative & Risk Audit: Fintech Payment Processing',
    description:
      'Evaluate transaction latency patterns, failover redundancy, and financial reconciliation risks for high-throughput payment architectures.',
  },
  {
    agentId: 'manager',
    title: 'Synthesize Cross-Team Project Directives',
    description:
      'Decompose the upcoming infrastructure milestone into concrete deliverables and set coordination priorities.',
  },
];

export function TaskCreateModal({
  isOpen,
  onClose,
  onSubmit,
  defaultAgentId = 'researcher',
}: TaskCreateModalProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string>(defaultAgentId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit(selectedAgentId, title.trim(), description.trim() || title.trim());
    setTitle('');
    setDescription('');
    onClose();
  };

  const handleSelectTemplate = (tpl: { agentId: string; title: string; description: string }) => {
    setSelectedAgentId(tpl.agentId);
    setTitle(tpl.title);
    setDescription(tpl.description);
  };

  const agentsList = Object.values(APPLICATION_AGENTS);

  return (
    <Modal title="Deploy Team Task" isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
        {/* Agent Assignment Selection */}
        <div>
          <label className="block text-xs uppercase text-text-muted mb-1 font-bold">Assignee Agent</label>
          <div className="grid grid-cols-3 gap-1.5">
            {agentsList.map((ag) => (
              <button
                key={ag.id}
                type="button"
                onClick={() => setSelectedAgentId(ag.id)}
                className={`p-2 border-2 transition-colors flex flex-col items-center justify-center gap-1 min-h-[44px] ${
                  selectedAgentId === ag.id
                    ? 'bg-accent/25 border-accent text-white font-bold shadow-pixel'
                    : 'bg-bg-dark border-border hover:bg-btn-hover text-text'
                }`}
              >
                <span className="text-xl">{ag.avatar}</span>
                <span className="text-xs truncate w-full text-center">{ag.name.split(' ')[0]}</span>
                <span className="text-[10px] text-text-muted truncate w-full text-center">({ag.role.split(' ')[0]})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Quick Templates */}
        <div>
          <label className="block text-xs uppercase text-text-muted mb-1 font-bold">Quick Templates</label>
          <div className="flex flex-col gap-1.5">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.title}
                type="button"
                onClick={() => handleSelectTemplate(tpl)}
                className="text-left p-2 bg-bg-dark hover:bg-btn-hover border border-border transition-colors text-xs flex flex-col min-h-[44px] justify-center"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-accent-bright line-clamp-1">{tpl.title}</span>
                  <span className="text-[10px] uppercase font-bold text-text-muted px-1.5 py-0.2 bg-bg border border-border">
                    {tpl.agentId}
                  </span>
                </div>
                <span className="text-text-muted line-clamp-2 text-[12px] mt-0.5">{tpl.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Task Objective Title */}
        <div>
          <label className="block text-xs uppercase text-text-muted mb-1 font-bold">Task Objective</label>
          <input
            type="text"
            required
            placeholder="e.g. Analyze this task..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-bg-dark border-2 border-border p-2 text-text focus:border-accent outline-none text-sm min-h-[44px]"
          />
        </div>

        {/* Task Description */}
        <div>
          <label className="block text-xs uppercase text-text-muted mb-1 font-bold">Directives & Context</label>
          <textarea
            rows={3}
            placeholder="Specify context, facts, numbers, or constraints for the agent..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-bg-dark border-2 border-border p-2 text-text focus:border-accent outline-none text-sm resize-none"
          />
        </div>

        <div className="flex justify-end gap-2 mt-1">
          <Button type="button" onClick={onClose} className="min-h-[44px] px-4">
            Cancel
          </Button>
          <Button type="submit" variant="accent" disabled={!title.trim()} className="min-h-[44px] px-4">
            🚀 Submit Task
          </Button>
        </div>
      </form>
    </Modal>
  );
}
