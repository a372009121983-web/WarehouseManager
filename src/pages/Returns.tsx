import { useState } from 'react';
import { RotateCcw, Plus, Trash2, Search, Printer, Eye } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Return, Customer, Supplier } from '@/types';

const EGP = (v: number) => v.toLocaleString('ar-EG', { minimumFractionDigits: 2 }) + ' ج.م';
const today = () => new Date().toISOString().split('T')[0];

const Returns = () => {
  const { interact } = useInteraction();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState<Return | null>(null);
  const [form, setForm] = useState({ type: 'مبيعات' as 'مبيعات' | 'مشتريات', customer_id: '', supplier_id: '', customer_name: '', supplier_name: '', total_amount: 0, reason: '', status: 'معلقة', return_date: today() });

  const { data: returns = [], isLoading } = useQuery({
    queryKey: ['returns'],
    queryFn: async () => {
      const { data, error } = await supabase.from('returns').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Return[];
    },
    staleTime: 30000,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => { const { data } = await supabase.from('customers').select('id,name').order('name'); return (data || []) as Pick<Customer, 'id' | 'name'>[]; },
    staleTime: 60000,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => { const { data } = await supabase.from('suppliers').select('id,name').order('name'); return (data || []) as Pick<Supplier, 'id' | 'name'>[]; },
    staleTime: 60000,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        type: form.type,
        total_amount: form.total_amount,
        reason: form.reason,
        status: form.status,
        return_date: form.return_date,
      };
      if (form.type === 'مبيعات') {
        payload.customer_id = form.customer_id || null;
        payload.customer_name = form.customer_name || customers.find(c => c.id === form.customer_id)?.name || '';
      } else {
        payload.supplier_id = form.supplier_id || null;
        payload.supplier_name = form.supplier_name || suppliers.find(s => s.id === form.supplier_id)?.name || '';
      }
      const { error } = await supabase.from('returns').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['returns'] }); interact('success'); toast.success('تم تسجيل المرتجع'); setShowForm(false); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('returns').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['returns'] }); interact('delete'); toast.success('تم حذف المرتجع'); },
  });

  const filtered = returns.filter(r => (r.customer_name || r.supplier_name || '').includes(search) || r.type.includes(search) || r.status.includes(search));
  const typeColor = { 'مبيعات': 'gradient-blue', 'مشتريات': 'gradient-violet' };
  const statusColor: Record<string, string> = { 'معلقة': 'text-amber-400 bg-amber-500/15', 'مقبولة': 'text-emerald-400 bg-emerald-500/15', 'مرفوضة': 'text-red-400 bg-red-500/15' };

  const handlePrint = (r: Return) => {
    interact('click');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html dir="rtl"><head><title>مرتجع</title>
    <style>body{font-family:Arial;direction:rtl;padding:20px}
    .header{text-align:center;border-bottom:2px solid #dc2626;padding-bottom:10px;margin-bottom:20px}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:right}
    th{background:#dc2626;color:white}</style></head>
    <body>
    <div class="header"><h2>إشعار مرتجع ${r.type}</h2></div>
    <p><b>النوع:</b> مرتجع ${r.type} | <b>التاريخ:</b> ${r.return_date}</p>
    <p><b>${r.type === 'مبيعات' ? 'العميل' : 'المورد'}:</b> ${r.customer_name || r.supplier_name || '-'}</p>
    <p><b>السبب:</b> ${r.reason || '-'}</p>
    <p><b>المبلغ الإجمالي:</b> ${EGP(r.total_amount)}</p>
    <p><b>الحالة:</b> ${r.status}</p>
    </body></html>`);
    win.print();
  };

  if (isLoading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 gradient-red rounded-xl animate-pulse" /></div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي المرتجعات', val: returns.length, color: 'text-red-400', border: 'border-red-500/20' },
          { label: 'مرتجعات مبيعات', val: returns.filter(r => r.type === 'مبيعات').length, color: 'text-blue-400', border: 'border-blue-500/20' },
          { label: 'مرتجعات مشتريات', val: returns.filter(r => r.type === 'مشتريات').length, color: 'text-violet-400', border: 'border-violet-500/20' },
          { label: 'إجمالي المبالغ', val: EGP(returns.reduce((s, r) => s + r.total_amount, 0)), color: 'text-amber-400', border: 'border-amber-500/20' },
        ].map((s, i) => (
          <div key={i} className={`glass rounded-xl p-4 border cursor-pointer stat-shine ${s.border}`} onClick={() => interact('click')}>
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-lg font-bold ${s.color} break-all`}>{s.val}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="البحث..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-xl py-2.5 pr-10 pl-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
        </div>
        <button className="icon-btn gradient-red text-white px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold"
          onClick={() => { interact('add'); setForm({ type: 'مبيعات', customer_id: '', supplier_id: '', customer_name: '', supplier_name: '', total_amount: 0, reason: '', status: 'معلقة', return_date: today() }); setShowForm(true); }}>
          <Plus className="w-4 h-4" /><span>مرتجع جديد</span>
        </button>
      </div>

      <div className="space-y-3">
        {filtered.map((r, i) => (
          <div key={r.id} className="glass rounded-2xl p-4 border border-border glass-hover animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 ${typeColor[r.type] || 'gradient-red'} rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <RotateCcw className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm text-foreground">{r.customer_name || r.supplier_name || 'غير محدد'}</p>
                    <span className="text-xs text-muted-foreground bg-white/10 px-2 py-0.5 rounded-lg">{r.type}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{r.return_date} {r.reason ? `• ${r.reason}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn('text-xs px-2 py-1 rounded-lg font-medium', statusColor[r.status] || 'text-muted-foreground bg-white/10')}>{r.status}</span>
                <p className="font-bold text-red-400">{EGP(r.total_amount)}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button className="flex-1 icon-btn gap-1.5 py-1.5 glass text-muted-foreground hover:text-emerald-400 text-xs" onClick={() => handlePrint(r)}>
                <Printer className="w-3 h-3" /><span>طباعة</span>
              </button>
              <button className="icon-btn w-8 h-8 glass text-muted-foreground hover:text-red-400" onClick={() => deleteMutation.mutate(r.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="glass rounded-2xl p-10 border border-border text-center">
            <RotateCcw className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-muted-foreground">لا توجد مرتجعات</p>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="glass w-full max-w-md rounded-2xl border border-border p-6 animate-fade-up">
            <h2 className="text-lg font-bold text-foreground mb-5">تسجيل مرتجع جديد</h2>
            <div className="space-y-3">
              <div className="flex gap-2">
                {(['مبيعات', 'مشتريات'] as const).map(t => (
                  <button key={t} onClick={() => setForm(p => ({ ...p, type: t }))}
                    className={cn('flex-1 py-2.5 rounded-xl text-sm font-medium transition-all', form.type === t ? (t === 'مبيعات' ? 'gradient-blue text-white' : 'gradient-violet text-white') : 'glass text-muted-foreground')}>
                    مرتجع {t}
                  </button>
                ))}
              </div>
              {form.type === 'مبيعات' ? (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">العميل</label>
                  <select value={form.customer_id} onChange={e => setForm(p => ({ ...p, customer_id: e.target.value }))}
                    className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none">
                    <option value="">اختر العميل</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">المورد</label>
                  <select value={form.supplier_id} onChange={e => setForm(p => ({ ...p, supplier_id: e.target.value }))}
                    className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none">
                    <option value="">اختر المورد</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">المبلغ الإجمالي (ج.م)</label>
                <input type="number" value={form.total_amount} onChange={e => setForm(p => ({ ...p, total_amount: Number(e.target.value) }))}
                  className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">تاريخ المرتجع</label>
                <input type="date" value={form.return_date} onChange={e => setForm(p => ({ ...p, return_date: e.target.value }))}
                  className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">سبب الإرجاع</label>
                <input type="text" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                  className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">الحالة</label>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                  className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none">
                  {['معلقة', 'مقبولة', 'مرفوضة'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button className="flex-1 gradient-red text-white rounded-xl py-2.5 font-semibold" onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
                تسجيل المرتجع
              </button>
              <button className="flex-1 glass text-muted-foreground rounded-xl py-2.5" onClick={() => { interact('click'); setShowForm(false); }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Returns;
