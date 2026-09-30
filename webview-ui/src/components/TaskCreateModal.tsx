import { useState } from 'react';

import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';

interface TaskCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, description: string) => void;
}

const TEMPLATES = [
  {
    title: 'Analyze the business fundamentals of NVIDIA based only on information provided in the task.',
    description:
      'Company Overview: NVIDIA is a semiconductor and accelerated computing pioneer. Key Segments: Data Center (AI GPUs including Hopper & Blackwell architectures, NVLink, InfiniBand networking), Gaming (GeForce RTX), Professional Visualization, Automotive. Financial Metrics: Rapid datacenter revenue scaling, gross margins >70%, high cash conversion. Competitive Moat: CUDA software ecosystem lock-in. Key Risks: Supply chain dependency on TSMC advanced packaging, custom ASICs from hyperscalers (Google TPU, AWS Trainium), geopolitical export controls.',
  },
  {
    title: 'Design Microservices Architecture for High-Scale Fintech',
    description:
      'System Architecture: Event-driven payment gateway processing 100k TPS with Apache Kafka, Redis cluster for idempotent caching, PostgreSQL UDS for transactional integrity, and zero-trust mutual TLS encryption.',
  },
  {
    title: 'Audit AI Security & Governance Framework',
    description:
      'Risk Vectors: System prompt injection vulnerabilities, indirect context poisoning, PII sanitization in LLM training and inference logs, compliance with EU AI Act and SOC2 Type II controls.',
  },
];

export function TaskCreateModal({ isOpen, onClose, onSubmit }: TaskCreateModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit(title.trim(), description.trim() || title.trim());
    setTitle('');
    setDescription('');
    onClose();
  };

  const handleSelectTemplate = (tpl: { title: string; description: string }) => {
    setTitle(tpl.title);
    setDescription(tpl.description);
  };

  return (
    <Modal title="Deploy Team Task" isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
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
                <span className="font-bold text-accent-bright line-clamp-1">{tpl.title}</span>
                <span className="text-text-muted line-clamp-2 text-[12px] mt-0.5">{tpl.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs uppercase text-text-muted mb-1 font-bold">Task Objective</label>
          <input
            type="text"
            required
            placeholder="e.g. Analyze the business fundamentals of NVIDIA..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-bg-dark border-2 border-border p-2 text-text focus:border-accent outline-none text-sm min-h-[44px]"
          />
        </div>

        <div>
          <label className="block text-xs uppercase text-text-muted mb-1 font-bold">Directives & Provided Information</label>
          <textarea
            rows={3}
            placeholder="Specify context, facts, numbers, or constraints for the team..."
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
            🚀 Launch Workflow
          </Button>
        </div>
      </form>
    </Modal>
  );
}
