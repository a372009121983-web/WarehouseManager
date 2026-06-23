import { type LucideIcon } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  gradient: 'blue' | 'emerald' | 'amber' | 'violet' | 'red';
  trend?: { value: number; label: string };
  onClick?: () => void;
  delay?: number;
}

const gradientMap = {
  blue: 'gradient-blue glow-blue',
  emerald: 'gradient-emerald glow-emerald',
  amber: 'gradient-amber glow-amber',
  violet: 'gradient-violet',
  red: 'gradient-red glow-red',
};

const borderMap = {
  blue: 'border-blue-500/20 hover:border-blue-500/40',
  emerald: 'border-emerald-500/20 hover:border-emerald-500/40',
  amber: 'border-amber-500/20 hover:border-amber-500/40',
  violet: 'border-violet-500/20 hover:border-violet-500/40',
  red: 'border-red-500/20 hover:border-red-500/40',
};

const textMap = {
  blue: 'text-blue-400',
  emerald: 'text-emerald-400',
  amber: 'text-amber-400',
  violet: 'text-violet-400',
  red: 'text-red-400',
};

const StatCard = ({ title, value, subtitle, icon: Icon, gradient, trend, onClick, delay = 0 }: StatCardProps) => {
  const { interact } = useInteraction();

  return (
    <div
      className={cn(
        'glass rounded-2xl p-5 border cursor-pointer stat-shine glass-hover animate-fade-up',
        borderMap[gradient],
      )}
      style={{ animationDelay: `${delay}ms` }}
      onClick={() => {
        interact('click');
        onClick?.();
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0', gradientMap[gradient])}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        {trend && (
          <div className={cn(
            'flex items-center gap-1 text-xs px-2 py-1 rounded-lg',
            trend.value > 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
          )}>
            <span>{trend.value > 0 ? '▲' : '▼'}</span>
            <span>{Math.abs(trend.value)}%</span>
          </div>
        )}
      </div>

      <div>
        <p className="text-muted-foreground text-sm mb-1">{title}</p>
        <p className={cn('text-3xl font-bold mb-1', textMap[gradient])}>{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        {trend && <p className="text-xs text-muted-foreground mt-1">{trend.label}</p>}
      </div>
    </div>
  );
};

export default StatCard;
