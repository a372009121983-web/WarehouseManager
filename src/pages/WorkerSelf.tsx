import { useState } from 'react';
import { CreditCard, TrendingDown, DollarSign, Calendar, User } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const EGP = (v: number) => v.toLocaleString('ar-EG', { minimumFractionDigits: 2 }) + ' ج.م';

interface WorkerTransaction {
  id: string;
  worker_id: string;
  worker_name: string;
  type: string;
  amount: number;
  notes: string | null;
  transaction_date: string;
}

const WorkerSelf = () => {
  const { interact } = useInteraction();
  const { profile } = useAuth();
  const qc = useQueryClient();

  const [txnType, setTxnType] = useState<'قبض' | 'سلفة'>('قبض');
  const [form, setForm] = useState({
    amount: 0,
    notes: '',
    transaction_date: new Date().toISOString().split('T')[0],
  });

  const workerId = profile?.id || '';
  const workerName = profile?.full_name || profile?.username || '';
  const maxSalary = (profile as any)?.max_salary || 0;

  const currentMonthPrefix = new Date().toISOString().slice(0, 7);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['my-transactions', workerId],
    queryFn: async () => {
      if (!workerId) return [];
      const { data } = await supabase
        .from('worker_transactions')
        .select('*')
        .eq('worker_id', workerId)
        .order('transaction_date', { ascending: false });
      return (data || []) as WorkerTransaction[];
    },
    enabled: !!workerId,
  });

  // Current month collected
  const monthCollected = transactions
    .filter(t => t.type === 'قبض' && t.transaction_date.startsWith(currentMonthPrefix))
    .reduce((s, t) => s + t.amount, 0);

  const totalAdvances = transactions
    .filter(t => t.type === 'سلفة')
    .reduce((s, t) => s + t.amount, 0);

  const remaining = maxSalary > 0 ? Math.max(0, maxSalary - monthCollected) : null;
  const salaryPct = maxSalary > 0 ? Math.min(100, (monthCollected / maxSalary) * 100) : 0;

  const addTxnMutation = useMutation({
    mutationFn: async () => {
      if (!workerId) throw new Error('لم يتم التعرف على المستخدم');
      if (!form.amount || form.amount <= 0) throw new Error('يرجى إدخال مبلغ صحيح');

      if (txnType === 'قبض' && maxSalary > 0) {
        const rem = maxSalary - monthCollected;
        if (rem <= 0) {
          // All as advance
          const { error } = await supabase.from('worker_transactions').insert({
            worker_id: workerId,
            worker_name: workerName,
            type: 'سلفة',
            amount: form.amount,
            notes: (form.notes ? form.notes + ' — ' : '') + 'تجاوز الحد الأقصى للراتب',
            transaction_date: form.transaction_date,
          });
          if (error) throw error;
          return 'allAdvance';
        } else if (form.amount > rem) {
          // Split
          const { error: e1 } = await supabase.from('worker_transactions').insert({
            worker_id: workerId, worker_name: workerName, type: 'قبض',
            amount: rem, notes: form.notes || null, transaction_date: form.transaction_date,
          });
          if (e1) throw e1;
          const { error: e2 } = await supabase.from('worker_transactions').insert({
            worker_id: workerId, worker_name: workerName, type: 'سلفة',
            amount: form.amount - rem, notes: 'تحويل تلقائي — تجاوز الحد الأقصى',
            transaction_date: form.transaction_date,
          });
          if (e2) throw e2;
          return 'split';
        }
      }

      const { error } = await supabase.from('worker_transactions').insert({
        worker_id: workerId,
        worker_name: workerName,
        type: txnType,
        amount: form.amount,
        notes: form.notes || null,
        transaction_date: form.transaction_date,
      });
      if (error) throw error;
      return 'normal';
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['my-transactions', workerId] });
      interact('success');
      if (result === 'allAdvance') toast.warning('تجاوزت الحد — سُجِّل المبلغ كاملاً كسلفة');
      else if (result === 'split') toast.success('تم تقسيم المبلغ: جزء قبض + سلفة تلقائية');
      else toast.success(`تم تسجيل ${txnType} بنجاح`);
      setForm({ amount: 0, notes: '', transaction_date: new Date().toISOString().split('T')[0] });
    },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  if (isLoading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 gradient-blue rounded-xl animate-pulse" /></div>;

  return (
    <div className="space-y-5 max-w-lg">
      {/* Profile Summary */}
      <div className="bg-white rounded-2xl p-5 border border-border shadow-sm animate-fade-up">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 gradient-blue rounded-2xl flex items-center justify-center glow-blue flex-shrink-0">
            <span className="text-white text-2xl font-bold">{(workerName || 'ع').charAt(0)}</span>
          </div>
          <div>
            <h2 className="font-bold text-foreground text-lg">{workerName || 'عامل'}</h2>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> عامل
            </p>
          </div>
        </div>

        {maxSalary > 0 && (
          <div className="bg-muted/40 rounded-xl p-3 border border-border mb-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" /> الحد الشهري
              </span>
              <span className="font-bold text-foreground">{EGP(maxSalary)}</span>
            </div>
            <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden mb-2">
              <div
                className={cn('h-full rounded-full transition-all duration-700',
                  salaryPct >= 100 ? 'bg-red-500' : salaryPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
                )}
                style={{ width: `${salaryPct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-emerald-600">محصّل هذا الشهر: <strong>{EGP(monthCollected)}</strong></span>
              {remaining !== null && (
                <span className={cn('font-semibold', remaining === 0 ? 'text-red-500' : 'text-blue-600')}>
                  متبقي: {EGP(remaining)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-emerald-700">{EGP(monthCollected)}</p>
            <p className="text-xs text-emerald-600 mt-0.5">قبض هذا الشهر</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-amber-700">{EGP(totalAdvances)}</p>
            <p className="text-xs text-amber-600 mt-0.5">إجمالي السلف</p>
          </div>
        </div>
      </div>

      {/* Add Transaction */}
      <div className="bg-white rounded-2xl p-5 border border-border shadow-sm animate-fade-up" style={{ animationDelay: '50ms' }}>
        <h3 className="font-bold text-foreground mb-4">تسجيل معاملة جديدة</h3>

        {/* Type selector */}
        <div className="flex gap-2 mb-4">
          {(['قبض', 'سلفة'] as const).map(t => (
            <button key={t} onClick={() => { interact('click'); setTxnType(t); }}
              className={cn('flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border',
                txnType === t ? 'gradient-blue text-white border-blue-500/30' : 'bg-muted text-muted-foreground border-border')}>
              {t === 'قبض' ? <span className="flex items-center justify-center gap-1.5"><CreditCard className="w-4 h-4" />قبض</span>
                : <span className="flex items-center justify-center gap-1.5"><TrendingDown className="w-4 h-4" />سلفة</span>}
            </button>
          ))}
        </div>

        {/* Remaining warning for قبض */}
        {txnType === 'قبض' && maxSalary > 0 && (() => {
          const rem = maxSalary - monthCollected;
          return (
            <div className={cn('rounded-xl px-3 py-2.5 mb-3 text-xs', rem <= 0 ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-blue-50 border border-blue-200 text-blue-700')}>
              {rem <= 0
                ? '⚠ استُنفد الحد الأقصى — سيُسجَّل المبلغ تلقائياً كسلفة'
                : `المتبقي من الراتب هذا الشهر: ${EGP(rem)}`}
              {form.amount > rem && rem > 0 && (
                <p className="mt-1 text-amber-700 font-medium">⚡ سيتم التقسيم: قبض {EGP(rem)} + سلفة {EGP(form.amount - rem)}</p>
              )}
            </div>
          );
        })()}

        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">المبلغ (ج.م) *</label>
            <input
              type="number"
              value={form.amount || ''}
              onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))}
              placeholder="0.00"
              className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" /> التاريخ
            </label>
            <input
              type="date"
              value={form.transaction_date}
              onChange={e => setForm(p => ({ ...p, transaction_date: e.target.value }))}
              className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">ملاحظات (اختياري)</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="..."
              className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
        </div>

        <button
          className="w-full gradient-blue glow-blue text-white rounded-xl py-3 font-bold text-sm mt-4 disabled:opacity-60 transition-all active:scale-95"
          onClick={() => addTxnMutation.mutate()}
          disabled={addTxnMutation.isPending || !form.amount}>
          {addTxnMutation.isPending ? 'جاري الحفظ...' : `تسجيل ${txnType}`}
        </button>
      </div>

      {/* Transactions History */}
      {transactions.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-border shadow-sm animate-fade-up" style={{ animationDelay: '100ms' }}>
          <h3 className="font-bold text-foreground mb-3">سجل معاملاتي</h3>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {transactions.map((t, i) => (
              <div key={t.id}
                className={cn('flex items-center justify-between px-3 py-2.5 rounded-xl border animate-fade-up',
                  t.type === 'قبض' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200')}
                style={{ animationDelay: `${i * 30}ms` }}>
                <div>
                  <p className={cn('text-sm font-bold', t.type === 'قبض' ? 'text-emerald-700' : 'text-amber-700')}>{t.type}</p>
                  <p className="text-xs text-muted-foreground">{t.transaction_date}{t.notes ? ` • ${t.notes}` : ''}</p>
                </div>
                <span className={cn('text-sm font-bold', t.type === 'قبض' ? 'text-emerald-700' : 'text-amber-700')}>
                  {EGP(t.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkerSelf;
