import React from 'react';
import type { Incident } from '../types';

interface StatusBadgeProps {
  status: Incident['status'];
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'medium', showLabel = true }) => {
  const statusConfig: Record<string, { dot: string; text: string; bg: string; border: string; label: string }> = {
    'Pendente': {
      dot:    'bg-yellow-400',
      text:   'text-yellow-700',
      bg:     'bg-yellow-50',
      border: 'border-yellow-300',
      label:  'PENDENTE',
    },
    'Visualizada': {
      dot:    'bg-blue-500',
      text:   'text-blue-700',
      bg:     'bg-blue-50',
      border: 'border-blue-300',
      label:  'VISUALIZADA',
    },
    'Em Andamento': {
      dot:    'bg-orange-500',
      text:   'text-orange-700',
      bg:     'bg-orange-50',
      border: 'border-orange-300',
      label:  'EM ANDAMENTO',
    },
    'Resolvida': {
      dot:    'bg-green-500',
      text:   'text-green-700',
      bg:     'bg-green-50',
      border: 'border-green-300',
      label:  'RESOLVIDA',
    },
    // Compatibilidade com valores legados
    'Em Análise': {
      dot:    'bg-orange-500',
      text:   'text-orange-700',
      bg:     'bg-orange-50',
      border: 'border-orange-300',
      label:  'EM ANDAMENTO',
    },
    'Resolvido': {
      dot:    'bg-green-500',
      text:   'text-green-700',
      bg:     'bg-green-50',
      border: 'border-green-300',
      label:  'RESOLVIDA',
    },
  };

  const sizeClasses = {
    small:  'text-[7px] px-2 py-0.5 gap-1',
    medium: 'text-[8px] px-3 py-1 gap-1.5',
    large:  'text-[9px] px-4 py-1.5 gap-2',
  };

  const dotSize = {
    small:  'w-1.5 h-1.5',
    medium: 'w-2 h-2',
    large:  'w-2.5 h-2.5',
  };

  const cfg = statusConfig[status] ?? statusConfig['Pendente'];

  return (
    <span
      className={`
        inline-flex items-center
        ${sizeClasses[size]}
        ${cfg.bg} ${cfg.text} ${cfg.border}
        border rounded-full font-black uppercase tracking-wider shadow-sm whitespace-nowrap
      `}
    >
      <span className={`${dotSize[size]} ${cfg.dot} rounded-full flex-shrink-0`} />
      {showLabel && <span>{cfg.label}</span>}
    </span>
  );
};

export default StatusBadge;
