import { useState, useRef } from 'react';
import { Users, Plus, Edit2, Trash2, Search, Phone, MapPin, CreditCard, TrendingDown, Upload, FileText, ChevronDown, ChevronUp, XCircle, CheckCircle } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Customer, CustomerPayment } from '@/types';

const EGP = (v: number) => v.toLocaleString('ar-EG', { minimumFractionDigits: 2 }) + ' ج.م';

const INPUT = 'w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all';
const BTN_PRIMARY = 'flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95';
const BTN_SECONDARY = 'flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-sm font-medium transition-all duration-200';
const CARD = 'bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200';

const Customers = () => {
  const { interact } = useInteraction();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; errors: string[] } | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editItem, setEditItem] = useState<Customer | null>(null);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const emptyForm = { name: '', phone: '', location: '', notes: '' };
  const [form, setForm] = useState(emptyForm);
  const [paymentForm, setPaymentForm] = useState({ amount: 0, type: 'دفعة', notes: '' });

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('*').order('name');
      if (error) throw error;
      return data as Customer[];
    },
    staleTime: 30000,
  });

  const { data: deferredSales = [] } = useQuery({
    queryKey: ['customer-deferred-sales'],
    queryFn: async () => {
      const { data } = await supabase.from('sales').select('id,customer_id,customer_name,total_amount,paid_amount,sale_date,status').in('status', ['آجل', 'جزئي']).order('sale_date', { ascending: false });
      return (data || []) as { id: string; customer_id: string | null; customer_name: string; total_amount: number; paid_amount: number; sale_date: string; status: string }[];
    },
    staleTime: 30000,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['customer-payments', selectedCustomer?.id],
    enabled: !!selectedCustomer,
    queryFn: async () => {
      const { data } = await supabase.from('customer_payments').select('*').eq('customer_id', selectedCustomer!.id).order('payment_date', { ascending: false }).limit(20);
      return (data || []) as CustomerPayment[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (p: typeof emptyForm) => { const { error } = await supabase.from('customers').insert({ ...p, balance: 0 }); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); interact('success'); toast.success('تم إضافة العميل'); setShowForm(false); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: typeof emptyForm }) => { const { error } = await supabase.from('customers').update(payload).eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); interact('success'); toast.success('تم تحديث العميل'); setShowForm(false); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('customers').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); interact('delete'); toast.success('تم حذف العميل'); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const paymentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer) return;
      const { error: e1 } = await supabase.from('customer_payments').insert({ customer_id: selectedCustomer.id, customer_name: selectedCustomer.name, amount: paymentForm.amount, type: paymentForm.type, notes: paymentForm.notes, payment_date: new Date().toISOString().split('T')[0] });
      if (e1) throw e1;
      const delta = paymentForm.type === 'دفعة' ? -paymentForm.amount : paymentForm.amount;
      const { error: e2 } = await supabase.from('customers').update({ balance: (selectedCustomer.balance || 0) + delta }).eq('id', selectedCustomer.id);
      if (e2) throw e2;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); qc.invalidateQueries({ queryKey: ['customer-payments'] }); interact('success'); toast.success('تم تسجيل العملية'); setShowPayment(false); setPaymentForm({ amount: 0, type: 'دفعة', notes: '' }); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const rawLines = text.split('\n').slice(1).filter(l => l.trim());
      const total = rawLines.length;
      if (total === 0) { toast.error('الملف فارغ أو لا يحتوي على بيانات'); return; }
      setImportProgress({ current: 0, total, errors: [] });
      let count = 0;
      const errors: string[] = [];
      for (let idx = 0; idx < rawLines.length; idx++) {
        const line = rawLines[idx];
        try {
          const cols = line.split(',');
          const name = cols[0]?.trim();
          if (!name) { errors.push(`سطر ${idx + 2}: اسم العميل فارغ`); setImportProgress({ current: idx + 1, total, errors: [...errors] }); continue; }
          const { error } = await supabase.from('customers').insert({ name, phone: cols[1]?.trim() || '', location: cols[2]?.trim() || '', notes: cols[3]?.trim() || '', balance: 0 });
          if (error) errors.push(`سطر ${idx + 2} (${name}): ${error.message}`);
          else count++;
        } catch { errors.push(`سطر ${idx + 2}: خطأ غير متوقع`); }
        setImportProgress({ current: idx + 1, total, errors: [...errors] });
      }
      qc.invalidateQueries({ queryKey: ['customers'] });
      interact('success');
      if (errors.length === 0) { toast.success(`تم استيراد ${count} عميل بنجاح`); setTimeout(() => setImportProgress(null), 2000); }
      else toast.warning(`تم استيراد ${count} عميل — ${errors.length} سطر به خطأ`);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const filtered = customers.filter(c => c.name.includes(search) || (c.phone || '').includes(search));
  const totalDebt = customers.reduce((s, c) => s + (c.balance > 0 ? c.balance : 0), 0);

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 bg-slate-800 rounded-xl animate-pulse" />
        <p className="text-sm text-slate-400">جاري التحميل...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Import Progress */}
      {importProgress && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl p-6 w-full max-w-md animate-fade-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center flex-shrink-0">
                <Upload className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-slate-800">استيراد العملاء</p>
                <p className="text-xs text-slate-500">{importProgress.current < importProgress.total ? `جاري رفع ${importProgress.current} من ${importProgress.total}...` : `اكتمل — ${importProgress.current} سطر`}</p>
              </div>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
              <div className="h-full bg-slate-800 rounded-full transition-all duration-300" style={{ width: `${Math.round((importProgress.current / importProgress.total) * 100)}%` }} />
            </div>
            <p className="text-xs text-slate-400 text-center mb-3">{Math.round((importProgress.current / importProgress.total) * 100)}% مكتمل</p>
            {importProgress.errors.length > 0 && (
              <div className="max-h-32 overflow-y-auto space-y-1">
                {importProgress.errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                    <XCircle className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />
                    <span className="text-red-700">{err}</span>
                  </div>
                ))}
              </div>
            )}
            {importProgress.current >= importProgress.total && importProgress.errors.length === 0 && (
              <div className="flex items-center gap-2 text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-700 font-semibold">تم الاستيراد بنجاح!</span>
              </div>
            )}
            {importProgress.current >= importProgress.total && (
              <button className="mt-3 w-full bg-slate-800 text-white rounded-xl py-2.5 text-sm font-semibold" onClick={() => setImportProgress(null)}>إغلاق</button>
            )}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: 'إجمالي العملاء', val: customers.length, border: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-700' },
          { label: 'إجمالي المديونيات', val: EGP(totalDebt), border: 'border-red-200', bg: 'bg-red-50', text: 'text-red-700' },
          { label: 'عملاء بمديونية', val: customers.filter(c => c.balance > 0).length, border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700' },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl p-4 border ${s.border} ${s.bg} ${i === 2 ? 'col-span-2 lg:col-span-1' : ''}`}>
            <p className="text-xs text-slate-500 mb-1">{s.label}</p>
            <p className={`text-xl font-bold ${s.text} break-all`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="البحث بالاسم أو الهاتف..." value={search} onChange={e => setSearch(e.target.value)} className={cn(INPUT, 'pr-10')} />
        </div>
        <button className={cn(BTN_SECONDARY, 'gap-2')} onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-4 h-4" /><span className="hidden sm:inline">استيراد Excel</span>
        </button>
        <input ref={fileInputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleImportExcel} />
        <button className={BTN_PRIMARY} onClick={() => { interact('add'); setEditItem(null); setForm(emptyForm); setShowForm(true); }}>
          <Plus className="w-4 h-4" /><span>إضافة عميل</span>
        </button>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((customer, i) => {
          const custDeferred = deferredSales.filter(s => s.customer_id === customer.id);
          const totalDeferred = custDeferred.reduce((sum, s) => sum + (s.total_amount - s.paid_amount), 0);
          const isExpanded = expandedCustomer === customer.id;

          return (
            <div key={customer.id} className={cn(CARD, 'animate-fade-up')} style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}>
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-slate-800 rounded-xl flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-base">{customer.name.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-800">{customer.name}</p>
                      {customer.phone && (
                        <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                          <Phone className="w-3 h-3" /><span dir="ltr">{customer.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium border',
                      customer.balance > 0 ? 'bg-red-50 text-red-600 border-red-200' : customer.balance < 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200')}>
                      {customer.balance > 0 ? 'مديون' : customer.balance < 0 ? 'دائن' : 'سوا'}
                    </span>
                    <p className={cn('font-bold text-sm mt-1', customer.balance > 0 ? 'text-red-600' : customer.balance < 0 ? 'text-emerald-600' : 'text-slate-400')}>
                      {EGP(Math.abs(customer.balance))}
                    </p>
                  </div>
                </div>

                {customer.location && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
                    <MapPin className="w-3 h-3" /><span>{customer.location}</span>
                  </div>
                )}

                {custDeferred.length > 0 && (
                  <div className="mb-3">
                    <button
                      className="w-full flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs hover:bg-red-100 transition-colors"
                      onClick={() => { interact('click'); setExpandedCustomer(isExpanded ? null : customer.id); }}>
                      <div className="flex items-center gap-1.5 text-red-700">
                        <FileText className="w-3.5 h-3.5" />
                        <span className="font-semibold">{custDeferred.length} فاتورة آجلة — متبقي: {EGP(totalDeferred)}</span>
                      </div>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-red-500" /> : <ChevronDown className="w-3.5 h-3.5 text-red-500" />}
                    </button>
                    {isExpanded && (
                      <div className="mt-1.5 space-y-1 max-h-48 overflow-y-auto">
                        {custDeferred.map(s => (
                          <div key={s.id} className="flex justify-between items-center bg-white border border-red-100 rounded-lg px-3 py-2 text-xs">
                            <div>
                              <span className="font-semibold text-slate-700">{s.sale_date}</span>
                              <span className={cn('mr-2 px-1.5 py-0.5 rounded text-[10px] font-medium', s.status === 'آجل' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700')}>{s.status}</span>
                            </div>
                            <div className="text-right">
                              <div className="text-slate-400">الإجمالي: {EGP(s.total_amount)}</div>
                              <div className="text-red-600 font-bold">متبقي: {EGP(s.total_amount - s.paid_amount)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2 pt-3 border-t border-slate-100">
                  <button className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs border border-emerald-200 rounded-xl font-medium transition-all"
                    onClick={() => { interact('click'); setSelectedCustomer(customer); setPaymentForm({ amount: 0, type: 'دفعة', notes: '' }); setShowPayment(true); }}>
                    <CreditCard className="w-3.5 h-3.5" /><span>دفعة</span>
                  </button>
                  <button className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs border border-amber-200 rounded-xl font-medium transition-all"
                    onClick={() => { interact('click'); setSelectedCustomer(customer); setPaymentForm({ amount: 0, type: 'سلفة', notes: '' }); setShowPayment(true); }}>
                    <TrendingDown className="w-3.5 h-3.5" /><span>سلفة</span>
                  </button>
                  <button className="flex items-center justify-center w-9 h-9 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-blue-600 border border-slate-200 rounded-xl transition-all"
                    onClick={() => { interact('click'); setEditItem(customer); setForm({ name: customer.name, phone: customer.phone || '', location: customer.location || '', notes: customer.notes || '' }); setShowForm(true); }}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button className="flex items-center justify-center w-9 h-9 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 border border-slate-200 rounded-xl transition-all"
                    onClick={() => deleteMutation.mutate(customer.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-slate-400">
            <Users className="w-12 h-12 mb-3 opacity-25" />
            <p className="text-sm font-medium mb-1">لا توجد عملاء</p>
            <p className="text-xs opacity-70">اضغط "إضافة عميل" لإضافة أول عميل</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 animate-fade-up">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center">
                <Users className="w-4.5 h-4.5 text-white" />
              </div>
              <h2 className="text-base font-bold text-slate-800">{editItem ? 'تعديل العميل' : 'إضافة عميل جديد'}</h2>
            </div>
            <div className="p-6 space-y-3">
              {[{ label: 'اسم العميل *', key: 'name', placeholder: 'أدخل اسم العميل' }, { label: 'رقم الهاتف', key: 'phone', placeholder: 'رقم التواصل' }, { label: 'الموقع / العنوان', key: 'location', placeholder: 'المنطقة أو العنوان' }, { label: 'ملاحظات', key: 'notes', placeholder: 'أي ملاحظات إضافية' }].map(({ label, key, placeholder }) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">{label}</label>
                  <input type="text" value={String(form[key as keyof typeof form])} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} className={INPUT} />
                </div>
              ))}
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button className={cn(BTN_PRIMARY, 'flex-1')} onClick={() => {
                if (!form.name) { interact('error'); toast.error('يرجى إدخال اسم العميل'); return; }
                if (editItem) updateMutation.mutate({ id: editItem.id, payload: form });
                else addMutation.mutate(form);
              }} disabled={addMutation.isPending || updateMutation.isPending}>
                {editItem ? 'حفظ التعديلات' : 'إضافة العميل'}
              </button>
              <button className={cn(BTN_SECONDARY, 'flex-1')} onClick={() => { interact('click'); setShowForm(false); }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 animate-fade-up">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center">
                <CreditCard className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800">{paymentForm.type === 'دفعة' ? 'تسجيل دفعة' : 'تسجيل سلفة'}</h2>
                <p className="text-xs text-slate-400">{selectedCustomer.name} | رصيد: <span className={selectedCustomer.balance > 0 ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'}>{EGP(selectedCustomer.balance)}</span></p>
              </div>
            </div>
            <div className="p-6 space-y-3">
              <div className="flex gap-2">
                {['دفعة', 'سلفة'].map(t => (
                  <button key={t} onClick={() => setPaymentForm(p => ({ ...p, type: t }))}
                    className={cn('flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border', paymentForm.type === t ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">المبلغ (ج.م)</label>
                <input type="number" value={paymentForm.amount || ''} onChange={e => setPaymentForm(p => ({ ...p, amount: Number(e.target.value) }))} className={INPUT} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">ملاحظات</label>
                <input type="text" value={paymentForm.notes} onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات اختيارية" className={INPUT} />
              </div>
              {payments.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-2 font-medium">آخر المعاملات:</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {payments.slice(0, 5).map(pay => (
                      <div key={pay.id} className="flex justify-between text-xs px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg">
                        <span className={pay.type === 'دفعة' ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>{pay.type}</span>
                        <span className="text-slate-700 font-semibold">{EGP(pay.amount)}</span>
                        <span className="text-slate-400">{pay.payment_date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button className={cn(BTN_PRIMARY, 'flex-1')} onClick={() => paymentMutation.mutate()} disabled={paymentMutation.isPending || !paymentForm.amount}>
                {paymentMutation.isPending ? 'جاري الحفظ...' : 'تسجيل'}
              </button>
              <button className={cn(BTN_SECONDARY, 'flex-1')} onClick={() => { interact('click'); setShowPayment(false); }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
