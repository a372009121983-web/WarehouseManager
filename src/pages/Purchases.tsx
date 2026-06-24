import { useState, useCallback } from 'react';
import { ShoppingBag, Plus, Trash2, Search, Printer, Eye, Package, CreditCard, CheckCircle, Clock, X, FileDown } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Purchase, PurchaseItem, Supplier, Product } from '@/types';
import { printInvoice, saveInvoiceAsPDF } from '@/lib/printInvoice';

const EGP = (v: number) => v.toLocaleString('ar-EG', { minimumFractionDigits: 2 }) + ' ج.م';
const today = () => new Date().toISOString().split('T')[0];

const INPUT = 'w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all';
const INPUT_SM = 'w-full bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 transition-all';
const BTN_PRIMARY = 'flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95';
const BTN_SECONDARY = 'flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-sm font-medium transition-all duration-200';

const calcStatus = (total: number, paid: number): string => {
  if (total <= 0) return 'مكتملة';
  if (paid <= 0) return 'آجل';
  if (paid >= total) return 'مكتملة';
  return 'جزئي';
};

interface FormItem {
  id: string; product_id?: string; product_name: string;
  quantity: number; unit_price: number; total_price: number; unit: string;
}

let _id = 0;
const newItem = (): FormItem => ({ id: String(++_id), product_name: '', quantity: 1, unit_price: 0, total_price: 0, unit: '' });

const STATUS_CONFIG: Record<string, string> = {
  'مكتملة': 'text-emerald-700 bg-emerald-50 border-emerald-200',
  'آجل':    'text-blue-700 bg-blue-50 border-blue-200',
  'جزئي':   'text-amber-700 bg-amber-50 border-amber-200',
  'ملغاة':  'text-red-700 bg-red-50 border-red-200',
};

const Purchases = () => {
  const { interact } = useInteraction();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('الكل');
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState<Purchase | null>(null);
  const [showPayment, setShowPayment] = useState<Purchase | null>(null);
  const [purchaseItems, setPurchaseItems] = useState<FormItem[]>([]);
  const [form, setForm] = useState({ supplier_id: '', supplier_name: '', warehouse_id: '', warehouse_name: '', paid_amount: 0, notes: '', purchase_date: today() });
  const [paymentForm, setPaymentForm] = useState({ amount: 0, notes: '', payment_date: today() });

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['purchases'],
    queryFn: async () => {
      const { data, error } = await supabase.from('purchases').select('*, purchase_items(*)').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Purchase[];
    },
    staleTime: 30000,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => { const { data } = await supabase.from('suppliers').select('id,name,balance').order('name'); return (data || []) as (Pick<Supplier, 'id' | 'name'> & { balance?: number })[]; },
    staleTime: 60000,
  });
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => { const { data } = await supabase.from('products').select('id,name,purchase_price,unit,sku').order('name'); return (data || []) as Pick<Product, 'id' | 'name' | 'purchase_price' | 'unit' | 'sku'>[]; },
    staleTime: 60000,
  });
  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => { const { data } = await supabase.from('warehouses').select('id,name').order('name'); return (data || []) as { id: string; name: string }[]; },
    staleTime: 60000,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const total = purchaseItems.reduce((s, i) => s + i.total_price, 0);
      const autoStatus = calcStatus(total, form.paid_amount);
      const remaining = total - form.paid_amount;
      const { data: pData, error: pErr } = await supabase.from('purchases').insert({
        supplier_id: form.supplier_id || null, supplier_name: form.supplier_name || suppliers.find(s => s.id === form.supplier_id)?.name || 'مورد غير محدد',
        warehouse_id: form.warehouse_id || null, warehouse_name: form.warehouse_name || warehouses.find(w => w.id === form.warehouse_id)?.name || '',
        total_amount: total, paid_amount: form.paid_amount, status: autoStatus, notes: form.notes, purchase_date: form.purchase_date,
      }).select('id,supplier_id,supplier_name').single();
      if (pErr) throw pErr;
      if (purchaseItems.length > 0) {
        const rows = purchaseItems.map(({ id: _id, ...it }) => ({ ...it, purchase_id: pData.id }));
        const { error: itemsErr } = await supabase.from('purchase_items').insert(rows);
        if (itemsErr) throw itemsErr;
      }
      if (remaining > 0 && pData.supplier_id) {
        const { data: sup } = await supabase.from('suppliers').select('balance').eq('id', pData.supplier_id).single();
        if (sup) await supabase.from('suppliers').update({ balance: (sup.balance || 0) + remaining }).eq('id', pData.supplier_id);
      }
      if (form.paid_amount > 0 && pData.supplier_id) {
        await supabase.from('supplier_payments').insert({ supplier_id: pData.supplier_id, supplier_name: pData.supplier_name, amount: form.paid_amount, notes: `دفعة أولى - أمر شراء ${pData.id.slice(-6)}`, payment_date: form.purchase_date });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchases'] }); qc.invalidateQueries({ queryKey: ['suppliers'] }); interact('success'); toast.success('تم تسجيل أمر الشراء'); setShowForm(false); setPurchaseItems([]); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const paymentMutation = useMutation({
    mutationFn: async () => {
      if (!showPayment) return;
      const newPaid = showPayment.paid_amount + paymentForm.amount;
      const newStatus = calcStatus(showPayment.total_amount, newPaid);
      const remaining = showPayment.total_amount - showPayment.paid_amount;
      if (paymentForm.amount > remaining) throw new Error(`المبلغ أكبر من المتبقي (${EGP(remaining)})`);
      const { error } = await supabase.from('purchases').update({ paid_amount: newPaid, status: newStatus }).eq('id', showPayment.id);
      if (error) throw error;
      if (showPayment.supplier_id) {
        const { data: sup } = await supabase.from('suppliers').select('balance').eq('id', showPayment.supplier_id).single();
        if (sup) await supabase.from('suppliers').update({ balance: Math.max(0, (sup.balance || 0) - paymentForm.amount) }).eq('id', showPayment.supplier_id);
        await supabase.from('supplier_payments').insert({ supplier_id: showPayment.supplier_id, supplier_name: showPayment.supplier_name, amount: paymentForm.amount, notes: paymentForm.notes || `دفعة على أمر شراء ${showPayment.id.slice(-6)}`, payment_date: paymentForm.payment_date });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchases'] }); qc.invalidateQueries({ queryKey: ['suppliers'] }); interact('success'); toast.success('تم تسجيل الدفعة'); setShowPayment(null); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('purchases').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchases'] }); interact('delete'); toast.success('تم حذف أمر الشراء'); },
  });

  const addItem = useCallback(() => setPurchaseItems(prev => [...prev, newItem()]), []);
  const updateItem = useCallback((stableId: string, field: string, value: string | number) => {
    setPurchaseItems(prev => prev.map(item => {
      if (item.id !== stableId) return item;
      const updated = { ...item, [field]: value };
      if (field === 'product_id') { const p = products.find(p => p.id === value); if (p) { updated.product_name = p.name; updated.unit_price = p.purchase_price || 0; updated.unit = p.unit || ''; updated.total_price = updated.quantity * (p.purchase_price || 0); } }
      if (field === 'quantity' || field === 'unit_price') { updated.total_price = (field === 'quantity' ? Number(value) : updated.quantity) * (field === 'unit_price' ? Number(value) : updated.unit_price); }
      return updated;
    }));
  }, [products]);
  const removeItem = useCallback((stableId: string) => setPurchaseItems(prev => prev.filter(i => i.id !== stableId)), []);

  const totalAmount = purchaseItems.reduce((s, i) => s + i.total_price, 0);
  const autoStatus = calcStatus(totalAmount, form.paid_amount);

  const buildPurchaseOpts = (purchase: Purchase) => {
    const items = ((purchase as any).purchase_items || []) as PurchaseItem[];
    return { type: 'purchase' as const, invoiceDate: purchase.purchase_date, status: purchase.status, warehouseName: purchase.warehouse_name || '', partyLabel: 'المورد', partyName: purchase.supplier_name || 'مورد غير محدد', items: items.map(it => ({ name: it.product_name, quantity: it.quantity, unit: it.unit || '', unit_price: it.unit_price, total_price: it.total_price })), totalAmount: purchase.total_amount, paidAmount: purchase.paid_amount, notes: (purchase as any).notes || '' };
  };

  const handlePrint = (purchase: Purchase) => {
    interact('click');
    printInvoice(buildPurchaseOpts(purchase));
  };

  const handleSavePDF = async (purchase: Purchase) => {
    interact('click');
    toast.info('جاري تجهيز PDF...');
    await saveInvoiceAsPDF(buildPurchaseOpts(purchase));
    toast.success('تم حفظ PDF');
  };

  const allStatuses = ['الكل', 'مكتملة', 'آجل', 'جزئي', 'ملغاة'];
  const filtered = purchases.filter(p => {
    const mSearch = (p.supplier_name || '').includes(search) || p.purchase_date.includes(search) || p.status.includes(search);
    const mStatus = filterStatus === 'الكل' || p.status === filterStatus;
    return mSearch && mStatus;
  });
  const deferredTotal = purchases.filter(p => p.status === 'آجل' || p.status === 'جزئي').reduce((s, x) => s + (x.total_amount - x.paid_amount), 0);

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
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي المشتريات', val: EGP(purchases.reduce((s, x) => s + x.total_amount, 0)), border: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-700' },
          { label: 'مشتريات اليوم', val: EGP(purchases.filter(p => p.purchase_date === today()).reduce((s, x) => s + x.total_amount, 0)), border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700' },
          { label: 'ديون الموردين', val: EGP(deferredTotal), border: 'border-red-200', bg: 'bg-red-50', text: 'text-red-700' },
          { label: 'فواتير اليوم', val: purchases.filter(p => p.purchase_date === today()).length, border: 'border-slate-200', bg: 'bg-slate-50', text: 'text-slate-700' },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl p-4 border ${s.border} ${s.bg}`}>
            <p className="text-xs text-slate-500 mb-1">{s.label}</p>
            <p className={`text-lg font-bold ${s.text} break-all`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="البحث بالمورد أو التاريخ..." value={search} onChange={e => setSearch(e.target.value)} className={cn(INPUT, 'pr-10')} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {allStatuses.map(s => (
            <button key={s} onClick={() => { interact('click'); setFilterStatus(s); }}
              className={cn('px-3 py-2 rounded-xl text-xs font-medium border transition-all',
                filterStatus === s ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400')}>
              {s}
            </button>
          ))}
        </div>
        <button className={BTN_PRIMARY}
          onClick={() => { interact('add'); setPurchaseItems([]); setForm({ supplier_id: '', supplier_name: '', warehouse_id: '', warehouse_name: '', paid_amount: 0, notes: '', purchase_date: today() }); setShowForm(true); }}>
          <Plus className="w-4 h-4" /><span>أمر شراء جديد</span>
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="px-4 py-3 text-right text-xs font-semibold">المورد</th>
                <th className="px-4 py-3 text-right text-xs font-semibold hidden md:table-cell">التاريخ</th>
                <th className="px-4 py-3 text-right text-xs font-semibold hidden lg:table-cell">المخزن</th>
                <th className="px-4 py-3 text-right text-xs font-semibold hidden md:table-cell">الأصناف</th>
                <th className="px-4 py-3 text-right text-xs font-semibold">الإجمالي</th>
                <th className="px-4 py-3 text-right text-xs font-semibold hidden sm:table-cell">الحالة</th>
                <th className="px-4 py-3 text-right text-xs font-semibold">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((purchase, i) => {
                const pItems = ((purchase as any).purchase_items || []) as PurchaseItem[];
                return (
                  <tr key={purchase.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                    <td className="px-4 py-3">
                      <p className="font-bold text-sm text-slate-800">{purchase.supplier_name || 'مورد غير محدد'}</p>
                      <p className="text-xs text-slate-400 md:hidden">{purchase.purchase_date}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 hidden md:table-cell whitespace-nowrap">{purchase.purchase_date}</td>
                    <td className="px-4 py-3 text-sm text-slate-400 hidden lg:table-cell">{purchase.warehouse_name || '—'}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {pItems.slice(0, 3).map((it, j) => (
                          <span key={j} className="text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded-md">
                            {it.product_name} ×{it.quantity}
                          </span>
                        ))}
                        {pItems.length > 3 && <span className="text-[10px] text-slate-400">+{pItems.length - 3}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-sm text-blue-600">{EGP(purchase.total_amount)}</p>
                      {purchase.total_amount !== purchase.paid_amount && <p className="text-xs text-amber-600">متبقي: {EGP(purchase.total_amount - purchase.paid_amount)}</p>}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={cn('text-xs px-2 py-1 rounded-lg border font-medium', STATUS_CONFIG[purchase.status] || 'text-slate-600 bg-slate-100 border-slate-200')}>{purchase.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button className="flex items-center justify-center w-8 h-8 bg-slate-100 hover:bg-blue-50 text-slate-500 hover:text-blue-600 rounded-lg transition-all" onClick={() => { interact('click'); setShowDetail(purchase); }} title="تفاصيل"><Eye className="w-3.5 h-3.5" /></button>
                        {(purchase.status === 'آجل' || purchase.status === 'جزئي') && (
                          <button className="flex items-center justify-center w-8 h-8 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-lg transition-all" onClick={() => { interact('click'); setShowPayment(purchase); setPaymentForm({ amount: 0, notes: '', payment_date: today() }); }} title="دفعة"><CreditCard className="w-3.5 h-3.5" /></button>
                        )}
                        <button className="flex items-center justify-center w-8 h-8 bg-slate-100 hover:bg-emerald-50 text-slate-500 hover:text-emerald-600 rounded-lg transition-all" onClick={() => handlePrint(purchase)} title="طباعة"><Printer className="w-3.5 h-3.5" /></button>
                        <button className="flex items-center justify-center w-8 h-8 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-all" onClick={() => handleSavePDF(purchase)} title="حفظ PDF"><FileDown className="w-3.5 h-3.5" /></button>
                        <button className="flex items-center justify-center w-8 h-8 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-all" onClick={() => deleteMutation.mutate(purchase.id)} title="حذف"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <ShoppingBag className="w-12 h-12 mb-3 opacity-25" />
              <p className="text-sm font-medium mb-1">لا توجد أوامر شراء</p>
              <p className="text-xs opacity-70">اضغط "أمر شراء جديد" للبدء</p>
            </div>
          )}
        </div>
      </div>

      {/* New Purchase Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-100 animate-fade-up my-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center">
                  <ShoppingBag className="w-4.5 h-4.5 text-white" />
                </div>
                <h2 className="text-base font-bold text-slate-800">أمر شراء جديد</h2>
              </div>
              <button className="flex items-center justify-center w-8 h-8 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl" onClick={() => { interact('click'); setShowForm(false); }}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">المورد</label>
                  <select value={form.supplier_id} onChange={e => setForm(p => ({ ...p, supplier_id: e.target.value, supplier_name: suppliers.find(s => s.id === e.target.value)?.name || '' }))} className={INPUT}>
                    <option value="">اختر المورد</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{(s.balance || 0) > 0 ? ` (مديونية: ${EGP(s.balance!)})` : ''}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">المخزن</label>
                  <select value={form.warehouse_id} onChange={e => setForm(p => ({ ...p, warehouse_id: e.target.value, warehouse_name: warehouses.find(w => w.id === e.target.value)?.name || '' }))} className={INPUT}>
                    <option value="">اختر المخزن</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">تاريخ الشراء</label>
                  <input type="date" value={form.purchase_date} onChange={e => setForm(p => ({ ...p, purchase_date: e.target.value }))} className={INPUT} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">الحالة (تلقائية)</label>
                  <div className={cn('border rounded-xl py-2.5 px-3 text-sm font-semibold flex items-center gap-2', autoStatus === 'مكتملة' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : autoStatus === 'آجل' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-amber-50 border-amber-200 text-amber-700')}>
                    {autoStatus === 'مكتملة' ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}{autoStatus}
                  </div>
                </div>
              </div>

              {autoStatus !== 'مكتملة' && totalAmount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4">
                  <p className="text-xs text-amber-700">⚡ المتبقي <strong>{EGP(totalAmount - form.paid_amount)}</strong> سيُضاف على مديونية المورد</p>
                </div>
              )}

              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-slate-700">أصناف الأمر</p>
                  <button className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-white rounded-xl text-xs font-semibold" onClick={addItem}><Plus className="w-3 h-3" /><span>إضافة صنف</span></button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {purchaseItems.map(item => (
                    <div key={item.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                      <select value={item.product_id || ''} onChange={e => updateItem(item.id, 'product_id', e.target.value)} className={INPUT_SM}>
                        <option value="">— اختر منتجاً —</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <div className="grid grid-cols-12 gap-1.5 items-center">
                        <input type="text" placeholder="اسم الصنف *" value={item.product_name} onChange={e => updateItem(item.id, 'product_name', e.target.value)} className={cn(INPUT_SM, 'col-span-5')} />
                        <input type="number" placeholder="كمية" value={item.quantity || ''} onChange={e => updateItem(item.id, 'quantity', Number(e.target.value))} className={cn(INPUT_SM, 'col-span-2')} />
                        <input type="number" placeholder="سعر الشراء" value={item.unit_price || ''} onChange={e => updateItem(item.id, 'unit_price', Number(e.target.value))} className={cn(INPUT_SM, 'col-span-3')} />
                        <div className="col-span-1 text-xs text-blue-600 font-bold text-center">{item.total_price > 0 ? (item.total_price >= 1000 ? (item.total_price / 1000).toFixed(1) + 'k' : item.total_price.toFixed(0)) : '—'}</div>
                        <button className="col-span-1 flex items-center justify-center w-6 h-6 bg-red-50 hover:bg-red-100 text-red-400 rounded-lg" onClick={() => removeItem(item.id)}><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </div>
                  ))}
                  {purchaseItems.length === 0 && (
                    <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">اضغط "إضافة صنف"</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">المدفوع (ج.م)</label>
                  <input type="number" value={form.paid_amount || ''} onChange={e => setForm(p => ({ ...p, paid_amount: Number(e.target.value) }))} className={INPUT} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">الإجمالي</label>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl py-2.5 px-3 text-sm text-blue-700 font-bold">{EGP(totalAmount)}</div>
                </div>
              </div>

              <div className="flex gap-3">
                <button className={cn(BTN_PRIMARY, 'flex-1')} onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>{addMutation.isPending ? 'جاري الحفظ...' : 'حفظ أمر الشراء'}</button>
                <button className={cn(BTN_SECONDARY, 'flex-1')} onClick={() => { interact('click'); setShowForm(false); }}>إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 animate-fade-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center"><CreditCard className="w-4.5 h-4.5 text-amber-700" /></div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">تسجيل دفعة للمورد</h2>
                  <p className="text-xs text-slate-400">{showPayment.supplier_name}</p>
                </div>
              </div>
              <button className="flex items-center justify-center w-8 h-8 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl" onClick={() => setShowPayment(null)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">الإجمالي:</span><span className="font-semibold">{EGP(showPayment.total_amount)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">مدفوع:</span><span className="text-emerald-600 font-semibold">{EGP(showPayment.paid_amount)}</span></div>
                <div className="flex justify-between border-t border-amber-200 pt-1.5"><span className="text-amber-700 font-bold">المتبقي:</span><span className="text-amber-700 font-bold">{EGP(showPayment.total_amount - showPayment.paid_amount)}</span></div>
              </div>
              <div className="space-y-3">
                <div className="flex flex-col gap-1.5"><label className="text-xs font-medium text-slate-600">مبلغ الدفعة (ج.م) *</label><input type="number" value={paymentForm.amount || ''} onChange={e => setPaymentForm(p => ({ ...p, amount: Number(e.target.value) }))} max={showPayment.total_amount - showPayment.paid_amount} className={INPUT} /></div>
                <div className="flex flex-col gap-1.5"><label className="text-xs font-medium text-slate-600">تاريخ الدفعة</label><input type="date" value={paymentForm.payment_date} onChange={e => setPaymentForm(p => ({ ...p, payment_date: e.target.value }))} className={INPUT} /></div>
                <div className="flex flex-col gap-1.5"><label className="text-xs font-medium text-slate-600">ملاحظات</label><input type="text" value={paymentForm.notes} onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات اختيارية" className={INPUT} /></div>
              </div>
              {paymentForm.amount >= (showPayment.total_amount - showPayment.paid_amount) && paymentForm.amount > 0 && (
                <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                  <p className="text-xs text-emerald-700 flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> أمر الشراء سيكتمل</p>
                </div>
              )}
              <div className="flex gap-3 mt-5">
                <button className={cn(BTN_PRIMARY, 'flex-1')} onClick={() => { if (!paymentForm.amount) { toast.error('يرجى إدخال المبلغ'); return; } paymentMutation.mutate(); }} disabled={paymentMutation.isPending}>{paymentMutation.isPending ? 'جاري الحفظ...' : 'تسجيل الدفعة'}</button>
                <button className={cn(BTN_SECONDARY, 'flex-1')} onClick={() => { interact('click'); setShowPayment(null); }}>إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 animate-fade-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h2 className="font-bold text-slate-800">تفاصيل أمر الشراء</h2>
              <button className="flex items-center justify-center w-8 h-8 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl" onClick={() => setShowDetail(null)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[['المورد', showDetail.supplier_name || '—'], ['التاريخ', showDetail.purchase_date], ['المخزن', showDetail.warehouse_name || '—'], ['الحالة', showDetail.status]].map(([k, v]) => (
                  <div key={k} className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-0.5">{k}</p><p className="font-semibold text-sm text-slate-800">{v}</p></div>
                ))}
              </div>
              {((showDetail as any).purchase_items || []).length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">الأصناف</p>
                  <div className="space-y-2">
                    {((showDetail as any).purchase_items as PurchaseItem[]).map((it, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-xl">
                        <div><p className="text-sm font-bold text-blue-900">{it.product_name}</p><p className="text-xs text-blue-500">{it.quantity} {it.unit || ''} × {EGP(it.unit_price)}</p></div>
                        <span className="text-blue-600 font-bold text-sm">{EGP(it.total_price)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2 text-sm border-t border-slate-100 pt-4">
                <div className="flex justify-between font-bold text-base"><span>الإجمالي:</span><span className="text-blue-600">{EGP(showDetail.total_amount)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">المدفوع:</span><span className="text-emerald-600">{EGP(showDetail.paid_amount)}</span></div>
                <div className="flex justify-between text-amber-600 font-semibold"><span>المتبقي:</span><span>{EGP(showDetail.total_amount - showDetail.paid_amount)}</span></div>
              </div>
              <div className="flex gap-2 mt-4 flex-wrap">
                {(showDetail.status === 'آجل' || showDetail.status === 'جزئي') && (
                  <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-sm font-semibold" onClick={() => { setShowDetail(null); setShowPayment(showDetail); setPaymentForm({ amount: 0, notes: '', payment_date: today() }); }}>
                    <CreditCard className="w-4 h-4" />تسجيل دفعة
                  </button>
                )}
                <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold" onClick={() => handlePrint(showDetail)}>
                  <Printer className="w-4 h-4" />طباعة
                </button>
                <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-semibold" onClick={() => handleSavePDF(showDetail)}>
                  <FileDown className="w-4 h-4" />PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Purchases;
