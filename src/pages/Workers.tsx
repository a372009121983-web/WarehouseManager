
import { useState, type ElementType } from 'react';
import { Shield, UserCheck, UserX, Edit2, Search, Truck as TruckIcon, User, Plus, Trash2, CreditCard, TrendingDown, DollarSign } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useAuth } from '@/contexts/AuthContext';

const EGP = (v: number) => v.toLocaleString('ar-EG', { minimumFractionDigits: 2 }) + ' ج.م';

interface Worker {
  id: string;
  username: string | null;
  email: string;
  role: string;
  full_name: string | null;
  phone: string | null;
  active: boolean | null;
  max_salary: number | null;
  hire_date: string | null;
}

interface WorkerTransaction {
  id: string;
  worker_id: string;
  worker_name: string;
  type: string;
  amount: number;
  notes: string | null;
  transaction_date: string;
}

interface TxnResult {
  split?: boolean;
  allAdvance?: boolean;
  normal?: boolean;
  paid?: number;
  advance?: number;
}

const ROLES: Record<string, { label: string; color: string; icon: ElementType }> = {
  admin:             { label: 'مدير النظام', color: 'text-red-600 bg-red-50 border-red-200',              icon: Shield },
  warehouse_manager: { label: 'مدير مخزن',   color: 'text-blue-600 bg-blue-50 border-blue-200',           icon: User },
  driver:            { label: 'سائق',         color: 'text-emerald-600 bg-emerald-50 border-emerald-200',  icon: TruckIcon },
  worker:            { label: 'عامل',          color: 'text-orange-600 bg-orange-50 border-orange-200',    icon: User },
  boss:              { label: 'الرئيس',         color: 'text-purple-600 bg-purple-50 border-purple-200',    icon: Shield },
};

const Workers = () => {
  const { interact } = useInteraction();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const isAdmin   = profile?.role === 'admin';
  const canManage = profile?.role === 'admin' || profile?.role === 'warehouse_manager';

  const [search, setSearch]         = useState('');
  const [filterRole, setFilterRole] = useState('الكل');
  const [editItem, setEditItem]     = useState<Worker | null>(null);
  const [editForm, setEditForm]     = useState({ full_name: '', phone: '', role: 'worker', max_salary: 0, active: true });

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm]         = useState({ phone: '', full_name: '', role: 'worker', max_salary: 0 });
  const [tempPwd, setTempPwd]         = useState('');

  const [txnWorker, setTxnWorker] = useState<Worker | null>(null);
  const [txnType, setTxnType]     = useState<'قبض' | 'سلفة'>('قبض');
  const [txnForm, setTxnForm]     = useState({ amount: 0, notes: '', transaction_date: new Date().toISOString().split('T')[0] });

  // ─── Queries ─────────────────────────────────────────────────────────────
  const { data: workers = [], isLoading } = useQuery({
    queryKey: ['workers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_profiles')
        .select('id, username, email, role, full_name, phone, active, max_salary, hire_date')
        .order('full_name');
      if (error) throw error;
      return data as Worker[];
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['worker-transactions'],
    queryFn: async () => {
      const { data } = await supabase.from('worker_transactions').select('*').order('transaction_date', { ascending: false });
      return (data || []) as WorkerTransaction[];
    },
  });

  // ─── Mutations ────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Worker> }) => {
      const { error } = await supabase.from('user_profiles').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workers'] }); interact('success'); toast.success('تم تحديث البيانات'); setEditItem(null); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_profiles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workers'] }); interact('delete'); toast.success('تم حذف العامل'); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const addWorkerMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('create-worker', {
        body: { phone: addForm.phone, full_name: addForm.full_name, role: addForm.role, max_salary: addForm.max_salary },
      });
      if (error) {
        let msg = error.message;
        if (error instanceof FunctionsHttpError) {
          try { const txt = await error.context?.text(); msg = txt || msg; } catch { /* noop */ }
        }
        throw new Error(msg);
      }
      return data as { tempPassword?: string };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['workers'] });
      interact('success');
      if (data?.tempPassword) setTempPwd(data.tempPassword);
      toast.success('تم إنشاء حساب العامل بنجاح');
    },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  // ─── Smart Transaction Mutation ──────────────────────────────────────────
  const txnMutation = useMutation<TxnResult | null, Error>({
    mutationFn: async (): Promise<TxnResult | null> => {
      if (!txnWorker) return null;
      const name      = txnWorker.full_name || txnWorker.username || txnWorker.email;
      const maxSalary = txnWorker.max_salary || 0;

      if (txnType === 'قبض' && maxSalary > 0) {
        const { collected } = getWorkerBalance(txnWorker.id);
        const remaining = maxSalary - collected;

        if (txnForm.amount > remaining && remaining > 0) {
          const excess = txnForm.amount - remaining;
          const { error: e1 } = await supabase.from('worker_transactions').insert({
            worker_id: txnWorker.id, worker_name: name, type: 'قبض',
            amount: remaining, notes: txnForm.notes || null, transaction_date: txnForm.transaction_date,
          });
          if (e1) throw e1;
          const { error: e2 } = await supabase.from('worker_transactions').insert({
            worker_id: txnWorker.id, worker_name: name, type: 'سلفة',
            amount: excess, notes: 'تحويل تلقائي — تجاوز الحد الأقصى',
            transaction_date: txnForm.transaction_date,
          });
          if (e2) throw e2;
          await supabase.from('expenses').insert({
            description: `مرتب: ${name}`, amount: remaining,
            category: 'مرتبات', expense_date: txnForm.transaction_date,
          });
          return { split: true, paid: remaining, advance: excess };

        } else if (remaining <= 0) {
          const { error } = await supabase.from('worker_transactions').insert({
            worker_id: txnWorker.id, worker_name: name, type: 'سلفة',
            amount: txnForm.amount,
            notes: (txnForm.notes ? txnForm.notes + ' — ' : '') + 'تجاوز الحد الأقصى للراتب',
            transaction_date: txnForm.transaction_date,
          });
          if (error) throw error;
          return { allAdvance: true };
        } else {
          const { error } = await supabase.from('worker_transactions').insert({
            worker_id: txnWorker.id, worker_name: name, type: 'قبض',
            amount: txnForm.amount, notes: txnForm.notes || null, transaction_date: txnForm.transaction_date,
          });
          if (error) throw error;
          await supabase.from('expenses').insert({
            description: `مرتب: ${name}`, amount: txnForm.amount,
            category: 'مرتبات', expense_date: txnForm.transaction_date,
          });
          return { normal: true };
        }
      }

      const { error } = await supabase.from('worker_transactions').insert({
        worker_id: txnWorker.id, worker_name: name, type: txnType,
        amount: txnForm.amount, notes: txnForm.notes || null, transaction_date: txnForm.transaction_date,
      });
      if (error) throw error;
      return { normal: true };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['worker-transactions'] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      interact('success');
      if (data?.split) toast.success(`تم: قبض ${EGP(data.paid!)} + سلفة تلقائية ${EGP(data.advance!)}`);
      else if (data?.allAdvance) toast.warning('تجاوز الحد — سُجِّل المبلغ كاملاً كسلفة');
      else toast.success(`تم تسجيل ${txnType}`);
      setTxnWorker(null);
      setTxnForm({ amount: 0, notes: '', transaction_date: new Date().toISOString().split('T')[0] });
    },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const filtered = workers.filter(w => {
    const mS = (w.full_name || '').includes(search) || (w.email || '').includes(search) || (w.username || '').includes(search) || (w.phone || '').includes(search);
    const mR = filterRole === 'الكل' || w.role === filterRole;
    return mS && mR;
  });

  const counts = {
    total:    workers.length,
    active:   workers.filter(w => w.active !== false).length,
    inactive: workers.filter(w => w.active === false).length,
    admins:   workers.filter(w => w.role === 'admin').length,
  };

  const currentMonthPrefix = new Date().toISOString().slice(0, 7);
  const getWorkerTxns = (wid: string) => transactions.filter(t => t.worker_id === wid);

  const getWorkerBalance = (wid: string) => {
    const txns = getWorkerTxns(wid);
    const collected = txns
      .filter(t => t.type === 'قبض' && t.transaction_date.startsWith(currentMonthPrefix))
      .reduce((s, t) => s + t.amount, 0);
    const advances = txns
      .filter(t => t.type === 'سلفة')
      .reduce((s, t) => s + t.amount, 0);
    return { collected, advances, net: advances - collected };
  };

  const monthlyResetMutation = useMutation({
    mutationFn: async (worker: Worker) => {
      const name = worker.full_name || worker.username || worker.email;
      const prevMonth = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
      const prevAdvances = transactions
        .filter(t => t.worker_id === worker.id && t.type === 'سلفة' && t.transaction_date.startsWith(prevMonth))
        .reduce((s, t) => s + t.amount, 0);
      if (prevAdvances > 0) {
        const { error } = await supabase.from('worker_transactions').insert({
          worker_id: worker.id, worker_name: name, type: 'قبض',
          amount: prevAdvances, notes: `تحويل سلف شهر ${prevMonth} إلى قبض`,
          transaction_date: currentMonthPrefix + '-01',
        });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['worker-transactions'] }); interact('success'); toast.success('تم تحويل سلف الشهر السابق إلى قبض'); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  if (isLoading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 gradient-blue rounded-xl animate-pulse" /></div>;

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي العمال',   value: counts.total,    color: 'text-blue-600',    border: 'border-blue-200 bg-blue-50/60' },
          { label: 'نشطون',            value: counts.active,   color: 'text-emerald-600', border: 'border-emerald-200 bg-emerald-50/60' },
          { label: 'غير نشطين',        value: counts.inactive, color: 'text-red-600',     border: 'border-red-200 bg-red-50/60' },
          { label: 'مديرو النظام',     value: counts.admins,   color: 'text-amber-600',   border: 'border-amber-200 bg-amber-50/60' },
        ].map(k => (
          <div key={k.label} className={`rounded-xl p-4 border stat-shine cursor-pointer ${k.border}`} onClick={() => interact('click')}>
            <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-44">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="البحث بالاسم أو الهاتف..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-white border border-border rounded-xl py-2.5 pr-10 pl-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
        </div>
        {['الكل', 'admin', 'warehouse_manager', 'driver', 'worker'].map(r => (
          <button key={r} onClick={() => { interact('click'); setFilterRole(r); }}
            className={cn('px-3 py-2 rounded-xl text-xs font-medium transition-all border',
              filterRole === r ? 'gradient-blue text-white border-blue-500/30' : 'bg-white text-muted-foreground border-border hover:border-blue-300')}>
            {r === 'الكل' ? 'الكل' : (ROLES[r]?.label || r)}
          </button>
        ))}
        {canManage && (
          <button className="icon-btn gradient-blue text-white px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold flex-shrink-0"
            onClick={() => { interact('add'); setTempPwd(''); setAddForm({ phone: '', full_name: '', role: 'worker', max_salary: 0 }); setShowAddForm(true); }}>
            <Plus className="w-4 h-4" /><span>إضافة عامل</span>
          </button>
        )}
      </div>

      {/* Workers Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((worker, i) => {
          const roleInfo  = ROLES[worker.role] || { label: worker.role, color: 'text-muted-foreground bg-muted border-border', icon: User };
          const RoleIcon  = roleInfo.icon;
          const initial   = (worker.full_name || worker.username || worker.email || 'ع').charAt(0);
          const isActive  = worker.active !== false;
          const { collected, advances, net } = getWorkerBalance(worker.id);
          const maxSalary = worker.max_salary || 0;
          const salaryPct = maxSalary > 0 ? Math.min(100, (collected / maxSalary) * 100) : 0;
          const remaining = maxSalary > 0 ? Math.max(0, maxSalary - collected) : 0;

          return (
            <div key={worker.id}
              className={cn('bg-white rounded-2xl p-4 border border-border glass-hover shadow-sm animate-fade-up', !isActive && 'opacity-60')}
              style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0', isActive ? 'gradient-blue' : 'bg-muted')}>
                    <span className="text-white font-bold text-lg">{initial}</span>
                  </div>
                  <div>
                    <p className="font-bold text-sm text-foreground">{worker.full_name || worker.username || '—'}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-36">{worker.phone || worker.email}</p>
                  </div>
                </div>
                <span className={cn('flex items-center gap-1 text-xs px-2 py-1 rounded-lg border font-medium flex-shrink-0',
                  isActive ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-red-600 bg-red-50 border-red-200')}>
                  {isActive ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                  {isActive ? 'نشط' : 'معطّل'}
                </span>
              </div>

              <div className="space-y-1.5 mb-3">
                <div className="flex items-center gap-2">
                  <RoleIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className={cn('text-xs px-2 py-0.5 rounded-lg border font-medium', roleInfo.color)}>{roleInfo.label}</span>
                </div>
              </div>

              {maxSalary > 0 && (
                <div className="mb-3 bg-muted/40 rounded-xl p-3 border border-border">
                  <div className="flex justify-between text-xs mb-2">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <DollarSign className="w-3 h-3" />
                      <span>الحد الشهري: <span className="text-foreground font-medium">{EGP(maxSalary)}</span></span>
                    </div>
                    <span className={cn('font-semibold', remaining === 0 ? 'text-red-600' : 'text-emerald-600')}>
                      متبقي: {EGP(remaining)}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all duration-500',
                      salaryPct >= 100 ? 'bg-red-500' : salaryPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
                    )} style={{ width: `${salaryPct}%` }} />
                  </div>
                </div>
              )}

              {(collected > 0 || advances > 0) && (
                <div className="flex gap-2 mb-3 text-xs">
                  <div className="flex-1 bg-emerald-50 rounded-lg p-2 border border-emerald-100 text-center">
                    <p className="text-emerald-700 font-semibold">{EGP(collected)}</p>
                    <p className="text-emerald-600/70">محصّل</p>
                  </div>
                  <div className="flex-1 bg-amber-50 rounded-lg p-2 border border-amber-100 text-center">
                    <p className="text-amber-700 font-semibold">{EGP(advances)}</p>
                    <p className="text-amber-600/70">سلف</p>
                  </div>
                  {net > 0 && (
                    <div className="flex-1 bg-red-50 rounded-lg p-2 border border-red-100 text-center">
                      <p className="text-red-700 font-semibold">{EGP(net)}</p>
                      <p className="text-red-600/70">مستحق</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-1.5 flex-wrap">
                <button className="flex-1 icon-btn gap-1 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs rounded-xl border border-emerald-200"
                  onClick={() => { interact('click'); setTxnWorker(worker); setTxnType('قبض'); setTxnForm({ amount: 0, notes: '', transaction_date: new Date().toISOString().split('T')[0] }); }}>
                  <CreditCard className="w-3 h-3" /><span>قبض</span>
                </button>
                <button className="flex-1 icon-btn gap-1 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs rounded-xl border border-amber-200"
                  onClick={() => { interact('click'); setTxnWorker(worker); setTxnType('سلفة'); setTxnForm({ amount: 0, notes: '', transaction_date: new Date().toISOString().split('T')[0] }); }}>
                  <TrendingDown className="w-3 h-3" /><span>سلفة</span>
                </button>
                {canManage && (
                  <>
                    <button className="flex-1 icon-btn gap-1 py-1.5 bg-muted text-muted-foreground hover:bg-blue-50 hover:text-blue-600 text-xs rounded-xl border border-border"
                      onClick={() => { interact('click'); setEditItem(worker); setEditForm({ full_name: worker.full_name || '', phone: worker.phone || '', role: worker.role, max_salary: worker.max_salary || 0, active: worker.active !== false }); }}>
                      <Edit2 className="w-3 h-3" /><span>تعديل</span>
                    </button>
                    <button className="icon-btn w-8 h-8 bg-muted hover:bg-red-50 text-muted-foreground hover:text-red-500 rounded-xl border border-border"
                      onClick={() => { if (confirm('هل تريد حذف هذا العامل؟')) deleteMutation.mutate(worker.id); }}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                    {(() => {
                      const prevMonth = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
                      const prevAdvances = transactions
                        .filter(t => t.worker_id === worker.id && t.type === 'سلفة' && t.transaction_date.startsWith(prevMonth))
                        .reduce((s, t) => s + t.amount, 0);
                      return prevAdvances > 0 ? (
                        <button className="w-full icon-btn gap-1 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs rounded-xl border border-blue-200"
                          onClick={() => { if (confirm(`تحويل سلف شهر ${prevMonth} (${EGP(prevAdvances)}) إلى قبض هذا الشهر؟`)) monthlyResetMutation.mutate(worker); }}>
                          <span>↻ تحويل سلف شهر {prevMonth}</span>
                        </button>
                      ) : null;
                    })()}
                    {isAdmin && (
                      <button className={cn('flex-1 icon-btn gap-1 py-1.5 text-xs rounded-xl border',
                        isActive ? 'bg-muted text-muted-foreground hover:bg-amber-50 hover:text-amber-600 border-border' : 'bg-emerald-50 text-emerald-600 border-emerald-200')}
                        onClick={() => { interact('click'); updateMutation.mutate({ id: worker.id, payload: { active: !isActive } }); }}>
                        {isActive ? <><UserX className="w-3 h-3" /><span>تعطيل</span></> : <><UserCheck className="w-3 h-3" /><span>تنشيط</span></>}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="col-span-full text-center py-12 text-muted-foreground text-sm">لا توجد نتائج</div>}
      </div>

      {/* ─── Add Worker Modal ─── */}
      {showAddForm && canManage && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl border border-border shadow-xl p-6 animate-fade-up">
            <h2 className="text-lg font-bold text-foreground mb-5">إضافة عامل جديد</h2>
            {tempPwd ? (
              <div className="space-y-4">
                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
                  <p className="text-sm font-bold text-emerald-700 mb-2">✓ تم إنشاء الحساب بنجاح!</p>
                  <p className="text-xs text-emerald-700 mb-1">كلمة المرور المؤقتة (شاركها مع العامل):</p>
                  <p className="font-mono text-lg font-bold text-emerald-800 bg-white px-3 py-2 rounded-lg border border-emerald-200 text-center tracking-widest">{tempPwd}</p>
                  <p className="text-[11px] text-emerald-600 mt-2">يدخل العامل برقم هاتفه وكلمة المرور هذه، ويمكنه تغييرها لاحقاً.</p>
                </div>
                <button className="w-full gradient-blue text-white rounded-xl py-2.5 font-semibold"
                  onClick={() => { setShowAddForm(false); setTempPwd(''); setAddForm({ phone: '', full_name: '', role: 'worker', max_salary: 0 }); }}>
                  تم
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {([{ label: 'رقم الهاتف *', key: 'phone', type: 'tel' }, { label: 'الاسم الكامل *', key: 'full_name', type: 'text' }] as const).map(f => (
                    <div key={f.key} className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground">{f.label}</label>
                      <input type={f.type} value={String(addForm[f.key])}
                        onChange={e => setAddForm(p => ({ ...p, [f.key]: e.target.value }))}
                        placeholder={f.key === 'phone' ? '01XXXXXXXXX' : ''}
                        className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground">الوظيفة</label>
                      <select value={addForm.role} onChange={e => setAddForm(p => ({ ...p, role: e.target.value }))}
                        className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50">
                        <option value="worker">عامل</option>
                        <option value="warehouse_manager">مدير مخزن</option>
                        <option value="driver">سائق</option>
                        <option value="admin">مدير النظام</option>
                        <option value="boss">الرئيس (مشاهدة فقط)</option>
                      </select> {/* Added closing tag for select */}
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground">الحد الأقصى (ج.م)</label>
                      <input type="number" value={addForm.max_salary || ''}
                        onChange={e => setAddForm(p => ({ ...p, max_salary: Number(e.target.value) }))}
                        className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button className="flex-1 gradient-blue text-white rounded-xl py-2.5 font-semibold"
                    onClick={() => { if (!addForm.phone || !addForm.full_name) { toast.error('يرجى تعبئة الحقول المطلوبة'); return; } addWorkerMutation.mutate(); }}
                    disabled={addWorkerMutation.isPending}>
                    {addWorkerMutation.isPending ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
                  </button>
                  <button className="flex-1 bg-muted text-muted-foreground rounded-xl py-2.5"
                    onClick={() => { interact('click'); setShowAddForm(false); }}>إلغاء</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Transaction Modal ─── */}
      {txnWorker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl border border-border shadow-xl p-6 animate-fade-up">
            <h2 className="text-lg font-bold text-foreground mb-1">
              {txnType === 'قبض' ? 'تسجيل قبض' : 'تسجيل سلفة'}
            </h2>
            <p className="text-sm text-muted-foreground mb-3">
              العامل: <span className="text-foreground font-semibold">{txnWorker.full_name || txnWorker.username}</span>
            </p>

            {txnType === 'قبض' && (txnWorker.max_salary || 0) > 0 && (() => {
              const { collected } = getWorkerBalance(txnWorker.id);
              const rem = Math.max(0, (txnWorker.max_salary || 0) - collected);
              const pct = Math.min(100, (collected / (txnWorker.max_salary || 1)) * 100);
              return (
                <div className="mb-4 bg-blue-50 rounded-xl p-3 border border-blue-200">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-blue-700">الحد الأقصى: {EGP(txnWorker.max_salary || 0)}</span>
                    <span className={cn('font-bold', rem === 0 ? 'text-red-600' : 'text-emerald-600')}>المتبقي: {EGP(rem)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-blue-100 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500')}
                      style={{ width: `${pct}%` }} />
                  </div>
                  {rem === 0 && <p className="text-xs text-red-600 mt-1.5 font-medium">⚠ استُنفد الحد — سيُسجَّل المبلغ كسلفة</p>}
                  {txnForm.amount > rem && rem > 0 && (
                    <p className="text-xs text-amber-700 mt-1.5 font-medium">⚡ تقسيم: قبض {EGP(rem)} + سلفة {EGP(txnForm.amount - rem)}</p>
                  )}
                </div>
              );
            })()}

            <div className="flex gap-2 mb-4">
              {(['قبض', 'سلفة'] as const).map(t => (
                <button key={t} onClick={() => setTxnType(t)}
                  className={cn('flex-1 py-2 rounded-xl text-sm font-medium transition-all border',
                    txnType === t ? 'gradient-blue text-white border-blue-500/30' : 'bg-muted text-muted-foreground border-border')}>
                  {t}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">المبلغ (ج.م) *</label>
                <input type="number" value={txnForm.amount || ''}
                  onChange={e => setTxnForm(p => ({ ...p, amount: Number(e.target.value) }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">التاريخ</label>
                <input type="date" value={txnForm.transaction_date}
                  onChange={e => setTxnForm(p => ({ ...p, transaction_date: e.target.value }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">ملاحظات</label>
                <input type="text" value={txnForm.notes}
                  onChange={e => setTxnForm(p => ({ ...p, notes: e.target.value }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
            </div>
            {getWorkerTxns(txnWorker.id).length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">آخر المعاملات:</p>
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {getWorkerTxns(txnWorker.id).slice(0, 5).map(t => (
                    <div key={t.id} className="flex justify-between text-xs px-2 py-1.5 bg-muted/40 rounded-lg">
                      <span className={t.type === 'قبض' ? 'text-emerald-600' : 'text-amber-600'}>{t.type}</span>
                      <span className="font-medium">{EGP(t.amount)}</span>
                      <span className="text-muted-foreground">{t.transaction_date}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-3 mt-5">
              <button className="flex-1 gradient-blue text-white rounded-xl py-2.5 font-semibold"
                onClick={() => { if (!txnForm.amount) { toast.error('يرجى إدخال المبلغ'); return; } txnMutation.mutate(); }}
                disabled={txnMutation.isPending}>تسجيل</button>
              <button className="flex-1 bg-muted text-muted-foreground rounded-xl py-2.5"
                onClick={() => { interact('click'); setTxnWorker(null); }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Edit Modal ─── */}
      {editItem && canManage && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl border border-border shadow-xl p-6 animate-fade-up">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 gradient-blue rounded-xl flex items-center justify-center">
                <span className="text-white font-bold">{(editItem.full_name || editItem.username || 'ع').charAt(0)}</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">تعديل بيانات العامل</h2>
                <p className="text-xs text-muted-foreground">{editItem.phone || editItem.email}</p>
              </div>
            </div>
            <div className="space-y-3">
              {[{ label: 'الاسم الكامل', key: 'full_name' }, { label: 'رقم الهاتف', key: 'phone' }].map(f => (
                <div key={f.key} className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">{f.label}</label>
                  <input type="text" value={String(editForm[f.key as keyof typeof editForm])}
                    onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">الدور الوظيفي</label>
                  <select value={editForm.role} onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))}
                    className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50">
                    <option value="worker">عامل</option>
                    <option value="admin">مدير النظام</option>
                    <option value="warehouse_manager">مدير مخزن</option>
                    <option value="driver">سائق</option>
                    <option value="boss">الرئيس (مشاهدة فقط)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">الحد الأقصى (ج.م)</label>
                  <input type="number" value={editForm.max_salary || ''}
                    onChange={e => setEditForm(p => ({ ...p, max_salary: Number(e.target.value) }))}
                    className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button className="flex-1 gradient-blue text-white rounded-xl py-2.5 font-semibold"
                onClick={() => updateMutation.mutate({ id: editItem.id, payload: { full_name: editForm.full_name, phone: editForm.phone, role: editForm.role, max_salary: editForm.max_salary } })}
                disabled={updateMutation.isPending}>حفظ التعديلات</button>
              <button className="flex-1 bg-muted text-muted-foreground rounded-xl py-2.5"
                onClick={() => { interact('click'); setEditItem(null); }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Workers;
