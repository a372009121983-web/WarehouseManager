import { useState, type ReactNode } from 'react';
import { Bell, AlertTriangle, Info, CheckCircle, XCircle, Trash2, CheckCheck } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Alert } from '@/types';

const Alerts = () => {
  const { interact } = useInteraction();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('الكل');

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('alerts').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Alert[];
    },
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('alerts').update({ read: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alerts'] }); qc.invalidateQueries({ queryKey: ['alerts-unread'] }); },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('alerts').update({ read: true }).eq('read', false);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alerts'] }); qc.invalidateQueries({ queryKey: ['alerts-unread'] }); interact('success'); toast.success('تم تعليم جميع التنبيهات كمقروءة'); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('alerts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alerts'] }); interact('delete'); toast.info('تم حذف التنبيه'); },
  });

  const typeConfig: Record<string, { icon: ReactNode; color: string; bg: string; border: string }> = {
    'خطأ': { icon: <XCircle className="w-4 h-4" />, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/25' },
    'تحذير': { icon: <AlertTriangle className="w-4 h-4" />, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/25' },
    'معلومة': { icon: <Info className="w-4 h-4" />, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/25' },
    'نجاح': { icon: <CheckCircle className="w-4 h-4" />, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25' },
  };

  const filtered = alerts.filter(a => {
    if (filter === 'الكل') return true;
    if (filter === 'غير مقروء') return !a.read;
    return a.type === filter;
  });

  const unreadCount = alerts.filter(a => !a.read).length;

  if (isLoading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 gradient-red rounded-xl animate-pulse" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 gradient-red rounded-xl flex items-center justify-center glow-red">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-foreground">مركز التنبيهات</p>
            <p className="text-xs text-muted-foreground">{unreadCount} تنبيه غير مقروء</p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button className="icon-btn gap-2 px-4 py-2 glass text-muted-foreground hover:text-emerald-400 text-sm"
            onClick={() => markAllReadMutation.mutate()}>
            <CheckCheck className="w-4 h-4" /><span>تعليم الكل كمقروء</span>
          </button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {['الكل', 'غير مقروء', 'خطأ', 'تحذير', 'معلومة', 'نجاح'].map(f => (
          <button key={f}
            className={cn('px-3 py-2 rounded-xl text-sm font-medium transition-all', filter === f ? 'gradient-blue text-white' : 'glass text-muted-foreground hover:text-foreground')}
            onClick={() => { interact('click'); setFilter(f); }}>
            {f}
            {f === 'غير مقروء' && unreadCount > 0 && (
              <span className="mr-1.5 bg-red-500 text-white text-xs px-1.5 rounded-full">{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="glass rounded-2xl p-10 border border-border text-center">
            <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-muted-foreground">لا توجد تنبيهات</p>
          </div>
        ) : (
          filtered.map((alert, i) => {
            const tc = typeConfig[alert.type] || typeConfig['معلومة'];
            return (
              <div key={alert.id}
                className={cn('rounded-2xl p-4 border transition-all animate-fade-up cursor-pointer', tc.bg, tc.border, !alert.read && 'ring-1 ring-inset ring-white/10')}
                style={{ animationDelay: `${i * 60}ms` }}
                onClick={() => { interact('click'); if (!alert.read) markReadMutation.mutate(alert.id); }}>
                <div className="flex items-start gap-3">
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', tc.color)}>
                    {tc.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn('text-xs font-bold px-2 py-0.5 rounded-md', tc.color, tc.bg, 'border', tc.border)}>{alert.type}</span>
                          {!alert.read && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse-glow" />}
                        </div>
                        <p className="text-sm text-foreground font-medium">{alert.message}</p>
                        {alert.warehouse_name && <p className="text-xs text-muted-foreground mt-0.5">{alert.warehouse_name}</p>}
                        <p className="text-xs text-muted-foreground mt-1">{new Date(alert.created_at).toLocaleString('ar-SA')}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!alert.read && (
                          <button className="icon-btn w-7 h-7 glass text-muted-foreground hover:text-emerald-400"
                            onClick={() => { interact('click'); markReadMutation.mutate(alert.id); }}>
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button className="icon-btn w-7 h-7 glass text-muted-foreground hover:text-red-400"
                          onClick={() => deleteMutation.mutate(alert.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Alerts;
