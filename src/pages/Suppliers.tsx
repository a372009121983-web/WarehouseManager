import { useState } from 'react';
import { useRef } from 'react';
import { Truck, Plus, Edit2, Trash2, Search, Phone, MapPin, CreditCard, Upload } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Supplier, SupplierPayment } from '@/types';

const EGP = (v: number) => v.toLocaleString('ar-EG', { minimumFractionDigits: 2 }) + ' ج.م';

const Suppliers = () => {
  const { interact } = useInteraction();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [editItem, setEditItem] = useState<Supplier | null>(null);
  const emptyForm = { name: '', phone: '', location: '', notes: '' };
  const [form, setForm] = useState(emptyForm);
  const [paymentForm, setPaymentForm] = useState({ amount: 0, notes: '' });

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('*').order('name');
      if (error) throw error;
      return data as Supplier[];
    },
    staleTime: 30000,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['supplier-payments', selectedSupplier?.id],
    enabled: !!selectedSupplier,
    queryFn: async () => {
      const { data } = await supabase.from('supplier_payments').select('*')
        .eq('supplier_id', selectedSupplier!.id).order('payment_date', { ascending: false }).limit(10);
      return (data || []) as SupplierPayment[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (p: typeof emptyForm) => {
      const { error } = await supabase.from('suppliers').insert({ ...p, balance: 0 });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); interact('success'); toast.success('تم إضافة المورد'); setShowForm(false); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: typeof emptyForm }) => {
      const { error } = await supabase.from('suppliers').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); interact('success'); toast.success('تم تحديث المورد'); setShowForm(false); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('suppliers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); interact('delete'); toast.success('تم حذف المورد'); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const paymentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSupplier) return;
      const { error: e1 } = await supabase.from('supplier_payments').insert({
        supplier_id: selectedSupplier.id,
        supplier_name: selectedSupplier.name,
        amount: paymentForm.amount,
        notes: paymentForm.notes,
        payment_date: new Date().toISOString().split('T')[0],
      });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('suppliers').update({ balance: (selectedSupplier.balance || 0) - paymentForm.amount }).eq('id', selectedSupplier.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['supplier-payments'] });
      interact('success'); toast.success('تم تسجيل الدفعة');
      setShowPayment(false); setPaymentForm({ amount: 0, notes: '' });
    },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').slice(1).filter(Boolean);
      let count = 0;
      for (const line of lines) {
        const cols = line.split(',');
        if (!cols[0]?.trim()) continue;
        const { error } = await supabase.from('suppliers').insert({
          name: cols[0]?.trim(),
          phone: cols[1]?.trim() || '',
          location: cols[2]?.trim() || '',
          notes: cols[3]?.trim() || '',
          balance: 0,
        });
        if (!error) count++;
      }
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      interact('success');
      toast.success(`تم استيراد ${count} مورد`);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const filtered = suppliers.filter(s => s.name.includes(search) || (s.phone || '').includes(search));
  const totalOwed = suppliers.reduce((s, c) => s + (c.balance > 0 ? c.balance : 0), 0);

  if (isLoading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 gradient-violet rounded-xl animate-pulse" /></div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="glass rounded-xl p-4 border border-violet-500/20 cursor-pointer stat-shine" onClick={() => interact('click')}>
          <p className="text-xs text-muted-foreground mb-1">إجمالي الموردين</p>
          <p className="text-2xl font-bold text-violet-400">{suppliers.length}</p>
        </div>
        <div className="glass rounded-xl p-4 border border-amber-500/20 cursor-pointer stat-shine" onClick={() => interact('click')}>
          <p className="text-xs text-muted-foreground mb-1">مستحق للموردين</p>
          <p className="text-xl font-bold text-amber-400">{EGP(totalOwed)}</p>
        </div>
        <div className="glass rounded-xl p-4 border border-blue-500/20 cursor-pointer stat-shine col-span-2 lg:col-span-1" onClick={() => interact('click')}>
          <p className="text-xs text-muted-foreground mb-1">موردون برصيد مستحق</p>
          <p className="text-2xl font-bold text-blue-400">{suppliers.filter(s => s.balance > 0).length}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="البحث بالاسم أو الهاتف..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-xl py-2.5 pr-10 pl-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
        </div>
        <button className="icon-btn gap-2 px-3 py-2.5 glass text-cyan-400 border border-cyan-500/25 rounded-xl text-sm" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-4 h-4" /><span className="hidden sm:inline">استيراد Excel</span>
        </button>
        <input ref={fileInputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleImportExcel} />
        <button className="icon-btn gradient-violet text-white px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold"
          onClick={() => { interact('add'); setEditItem(null); setForm(emptyForm); setShowForm(true); }}>
          <Plus className="w-4 h-4" /><span>إضافة مورد</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((supplier, i) => (
          <div key={supplier.id} className="glass rounded-2xl p-4 border border-border glass-hover animate-fade-up" style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 gradient-violet rounded-xl flex items-center justify-center flex-shrink-0">
                  <Truck className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-sm text-foreground">{supplier.name}</p>
                  {supplier.phone && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="w-3 h-3" /><span dir="ltr">{supplier.phone}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className={cn('text-right', supplier.balance > 0 ? 'text-amber-400' : 'text-emerald-400')}>
                <p className="text-xs">{supplier.balance > 0 ? 'مستحق' : 'سوا'}</p>
                <p className="font-bold text-sm">{EGP(Math.abs(supplier.balance))}</p>
              </div>
            </div>
            {supplier.location && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                <MapPin className="w-3 h-3" /><span>{supplier.location}</span>
              </div>
            )}
            <div className="flex gap-2">
              <button className="flex-1 icon-btn gap-1.5 py-2 glass text-violet-400 hover:text-violet-300 text-xs border border-violet-500/20"
                onClick={() => { interact('click'); setSelectedSupplier(supplier); setPaymentForm({ amount: 0, notes: '' }); setShowPayment(true); }}>
                <CreditCard className="w-3.5 h-3.5" /><span>دفعة</span>
              </button>
              <button className="icon-btn w-8 h-8 glass text-muted-foreground hover:text-primary"
                onClick={() => { interact('click'); setEditItem(supplier); setForm({ name: supplier.name, phone: supplier.phone || '', location: supplier.location || '', notes: supplier.notes || '' }); setShowForm(true); }}>
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button className="icon-btn w-8 h-8 glass text-muted-foreground hover:text-red-400" onClick={() => deleteMutation.mutate(supplier.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="glass w-full max-w-md rounded-2xl border border-border p-6 animate-fade-up">
            <h2 className="text-lg font-bold text-foreground mb-5">{editItem ? 'تعديل المورد' : 'إضافة مورد جديد'}</h2>
            <div className="space-y-3">
              {[{ label: 'اسم المورد *', key: 'name' }, { label: 'رقم الهاتف', key: 'phone' }, { label: 'الموقع/العنوان', key: 'location' }, { label: 'ملاحظات', key: 'notes' }].map(({ label, key }) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">{label}</label>
                  <input type="text" value={String(form[key as keyof typeof form])} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                    className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button className="flex-1 gradient-violet text-white rounded-xl py-2.5 font-semibold" onClick={() => {
                if (!form.name) { interact('error'); toast.error('يرجى إدخال اسم المورد'); return; }
                if (editItem) updateMutation.mutate({ id: editItem.id, payload: form });
                else addMutation.mutate(form);
              }} disabled={addMutation.isPending || updateMutation.isPending}>
                {editItem ? 'حفظ التعديلات' : 'إضافة المورد'}
              </button>
              <button className="flex-1 glass text-muted-foreground rounded-xl py-2.5" onClick={() => { interact('click'); setShowForm(false); }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {showPayment && selectedSupplier && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="glass w-full max-w-md rounded-2xl border border-border p-6 animate-fade-up">
            <h2 className="text-lg font-bold text-foreground mb-1">تسجيل دفعة للمورد</h2>
            <p className="text-sm text-muted-foreground mb-4">المورد: <span className="text-foreground font-semibold">{selectedSupplier.name}</span> | الرصيد: <span className="text-amber-400">{EGP(selectedSupplier.balance)}</span></p>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">المبلغ (ج.م)</label>
                <input type="number" value={paymentForm.amount} onChange={e => setPaymentForm(p => ({ ...p, amount: Number(e.target.value) }))}
                  className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">ملاحظات</label>
                <input type="text" value={paymentForm.notes} onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))}
                  className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
            </div>
            {payments.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">آخر الدفعات:</p>
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {payments.slice(0, 5).map(pay => (
                    <div key={pay.id} className="flex justify-between text-xs px-2 py-1 bg-white/5 rounded-lg">
                      <span className="text-violet-400">دفعة</span>
                      <span className="text-foreground">{EGP(pay.amount)}</span>
                      <span className="text-muted-foreground">{pay.payment_date}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-3 mt-5">
              <button className="flex-1 gradient-violet text-white rounded-xl py-2.5 font-semibold" onClick={() => paymentMutation.mutate()} disabled={paymentMutation.isPending || !paymentForm.amount}>
                تسجيل الدفعة
              </button>
              <button className="flex-1 glass text-muted-foreground rounded-xl py-2.5" onClick={() => { interact('click'); setShowPayment(false); }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Suppliers;
