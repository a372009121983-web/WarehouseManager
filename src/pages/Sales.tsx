import { useState, useCallback } from 'react';
import { ShoppingCart, Plus, Trash2, Search, Printer, Eye, Package, CreditCard, CheckCircle, Clock } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Sale, SaleItem, Customer, Product } from '@/types';
import { printInvoice } from '@/lib/printInvoice';
import { useAuth } from '@/contexts/AuthContext';

const EGP = (v: number) => v.toLocaleString('ar-EG', { minimumFractionDigits: 2 }) + ' ج.م';
const today = () => new Date().toISOString().split('T')[0];

// Auto-calculate status based on paid_amount vs total_amount
const calcStatus = (total: number, paid: number): string => {
  if (total <= 0) return 'مكتملة';
  if (paid <= 0) return 'آجل';
  if (paid >= total) return 'مكتملة';
  return 'جزئي';
};

interface FormItem {
  id: string;
  product_id?: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  unit: string;
}

let _id = 0;
const newItem = (): FormItem => ({
  id: String(++_id),
  product_name: '', quantity: 1, unit_price: 0, total_price: 0, unit: '',
});

const Sales = () => {
  const { interact } = useInteraction();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('الكل');
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState<Sale | null>(null);
  const [showPayment, setShowPayment] = useState<Sale | null>(null);
  const [saleItems, setSaleItems] = useState<FormItem[]>([]);
  const [form, setForm] = useState({
    customer_id: '', customer_name: '', warehouse_id: '', warehouse_name: '',
    paid_amount: 0, discount: 0, notes: '', sale_date: today(),
  });
  const [paymentForm, setPaymentForm] = useState({ amount: 0, notes: '', payment_date: today() });

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['sales'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sales').select('*, sale_items(*)').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Sale[];
    },
    staleTime: 30000,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => { const { data } = await supabase.from('customers').select('id,name,balance').order('name'); return (data || []) as (Pick<Customer, 'id' | 'name'> & { balance?: number })[]; },
    staleTime: 60000,
  });
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => { const { data } = await supabase.from('products').select('id,name,price,min_sale_price,max_sale_price,unit,sku').order('name'); return (data || []) as (Pick<Product, 'id' | 'name' | 'price' | 'unit' | 'sku'> & { min_sale_price?: number; max_sale_price?: number })[]; },
    staleTime: 60000,
  });
  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => { const { data } = await supabase.from('warehouses').select('id,name').order('name'); return (data || []) as { id: string; name: string }[]; },
    staleTime: 60000,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const total = saleItems.reduce((s, i) => s + i.total_price, 0) - form.discount;
      const autoStatus = calcStatus(total, form.paid_amount);
      const remaining = total - form.paid_amount;

      const { data: saleData, error: saleErr } = await supabase.from('sales').insert({
        customer_id: form.customer_id || null,
        customer_name: form.customer_name || customers.find(c => c.id === form.customer_id)?.name || 'عميل نقدي',
        warehouse_id: form.warehouse_id || null,
        warehouse_name: form.warehouse_name || warehouses.find(w => w.id === form.warehouse_id)?.name || '',
        total_amount: total, paid_amount: form.paid_amount, discount: form.discount,
        status: autoStatus, notes: form.notes, sale_date: form.sale_date,
      }).select('id,customer_id,customer_name,total_amount,paid_amount').single();
      if (saleErr) throw saleErr;

      if (saleItems.length > 0) {
        const rows = saleItems.map(({ id: _id, ...it }) => ({ ...it, sale_id: saleData.id }));
        const { error: itemsErr } = await supabase.from('sale_items').insert(rows);
        if (itemsErr) throw itemsErr;
      }

      // Add remaining to customer balance if آجل or جزئي
      if (remaining > 0 && saleData.customer_id) {
        const { data: cust } = await supabase.from('customers').select('balance').eq('id', saleData.customer_id).single();
        if (cust) {
          await supabase.from('customers').update({ balance: (cust.balance || 0) + remaining }).eq('id', saleData.customer_id);
        }
      }

      // Record partial payment in customer_payments if any paid
      if (form.paid_amount > 0 && saleData.customer_id) {
        await supabase.from('customer_payments').insert({
          customer_id: saleData.customer_id,
          customer_name: saleData.customer_name,
          amount: form.paid_amount,
          type: 'دفعة',
          notes: `دفعة أولى - فاتورة ${saleData.id.slice(-6)}`,
          payment_date: form.sale_date,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      interact('success');
      toast.success('تم تسجيل الفاتورة');
      setShowForm(false);
      setSaleItems([]);
    },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  // Add payment to an existing deferred sale
  const paymentMutation = useMutation({
    mutationFn: async () => {
      if (!showPayment) return;
      const newPaid = showPayment.paid_amount + paymentForm.amount;
      const newStatus = calcStatus(showPayment.total_amount, newPaid);
      const remaining = showPayment.total_amount - showPayment.paid_amount;

      if (paymentForm.amount > remaining) throw new Error(`المبلغ المدخل (${EGP(paymentForm.amount)}) أكبر من المتبقي (${EGP(remaining)})`);

      const { error } = await supabase.from('sales')
        .update({ paid_amount: newPaid, status: newStatus })
        .eq('id', showPayment.id);
      if (error) throw error;

      // Deduct from customer balance
      if (showPayment.customer_id) {
        const { data: cust } = await supabase.from('customers').select('balance').eq('id', showPayment.customer_id).single();
        if (cust) {
          await supabase.from('customers').update({ balance: Math.max(0, (cust.balance || 0) - paymentForm.amount) }).eq('id', showPayment.customer_id);
        }

        // Record in customer_payments
        await supabase.from('customer_payments').insert({
          customer_id: showPayment.customer_id,
          customer_name: showPayment.customer_name,
          amount: paymentForm.amount,
          type: 'دفعة',
          notes: paymentForm.notes || `دفعة على فاتورة ${showPayment.id.slice(-6)}`,
          payment_date: paymentForm.payment_date,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      interact('success');
      toast.success('تم تسجيل الدفعة');
      setShowPayment(null);
    },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('sales').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales'] }); interact('delete'); toast.success('تم حذف الفاتورة'); },
  });

  const addItem = useCallback(() => setSaleItems(prev => [...prev, newItem()]), []);

  const updateItem = useCallback((stableId: string, field: string, value: string | number) => {
    setSaleItems(prev => prev.map(item => {
      if (item.id !== stableId) return item;
      const updated = { ...item, [field]: value };
      if (field === 'product_id') {
        const p = products.find(p => p.id === value);
        if (p) { updated.product_name = p.name; updated.unit_price = p.price; updated.unit = p.unit || ''; updated.total_price = updated.quantity * p.price; }
      }
      if (field === 'quantity' || field === 'unit_price') {
        updated.total_price = (field === 'quantity' ? Number(value) : updated.quantity) * (field === 'unit_price' ? Number(value) : updated.unit_price);
      }
      return updated;
    }));
  }, [products]);

  const removeItem = useCallback((stableId: string) => setSaleItems(prev => prev.filter(i => i.id !== stableId)), []);

  const totalAmount = saleItems.reduce((s, i) => s + i.total_price, 0) - form.discount;
  const autoStatus = calcStatus(totalAmount, form.paid_amount);

  const handlePrint = (sale: Sale) => {
    interact('click');
    const items = ((sale as any).sale_items || []) as SaleItem[];
    printInvoice({
      type: 'sale',
      invoiceDate: sale.sale_date,
      status: sale.status,
      warehouseName: sale.warehouse_name || '',
      partyLabel: 'العميل',
      partyName: sale.customer_name || 'عميل نقدي',
      items: items.map(it => ({ name: it.product_name, quantity: it.quantity, unit: it.unit || '', unit_price: it.unit_price, total_price: it.total_price })),
      totalAmount: sale.total_amount,
      paidAmount: sale.paid_amount,
      discount: sale.discount || 0,
      notes: (sale as any).notes || '',
    });
  };

  const statusColor: Record<string, string> = {
    'مكتملة': 'text-emerald-600 bg-emerald-50 border border-emerald-200',
    'آجل': 'text-blue-600 bg-blue-50 border border-blue-200',
    'جزئي': 'text-amber-600 bg-amber-50 border border-amber-200',
    'ملغاة': 'text-red-600 bg-red-50 border border-red-200',
  };

  const allStatuses = ['الكل', 'مكتملة', 'آجل', 'جزئي', 'ملغاة'];
  const filtered = sales.filter(s => {
    const mSearch = (s.customer_name || '').includes(search) || s.sale_date.includes(search) || s.status.includes(search);
    const mStatus = filterStatus === 'الكل' || s.status === filterStatus;
    return mSearch && mStatus;
  });

  const deferredTotal = sales.filter(s => s.status === 'آجل' || s.status === 'جزئي').reduce((s, x) => s + (x.total_amount - x.paid_amount), 0);

  if (isLoading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 gradient-blue rounded-xl animate-pulse" /></div>;

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي المبيعات', val: EGP(sales.reduce((s, x) => s + x.total_amount, 0)), color: 'text-emerald-600', border: 'border-emerald-200 bg-emerald-50/60' },
          { label: 'مبيعات اليوم', val: EGP(sales.filter(s => s.sale_date === today()).reduce((s, x) => s + x.total_amount, 0)), color: 'text-blue-600', border: 'border-blue-200 bg-blue-50/60' },
          { label: 'ديون العملاء (آجل)', val: EGP(deferredTotal), color: 'text-amber-600', border: 'border-amber-200 bg-amber-50/60' },
          { label: 'فواتير اليوم', val: sales.filter(s => s.sale_date === today()).length, color: 'text-violet-600', border: 'border-violet-200 bg-violet-50/60' },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl p-4 border stat-shine cursor-pointer ${s.border}`} onClick={() => interact('click')}>
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-lg font-bold ${s.color} break-all`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="البحث بالعميل أو التاريخ..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-white border border-border rounded-xl py-2.5 pr-10 pl-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {allStatuses.map(s => (
            <button key={s} onClick={() => { interact('click'); setFilterStatus(s); }}
              className={cn('px-3 py-2 rounded-xl text-xs font-medium border transition-all',
                filterStatus === s ? 'gradient-blue text-white border-blue-500/30' : 'bg-white text-muted-foreground border-border hover:border-blue-300')}>
              {s}
            </button>
          ))}
        </div>
        <button className="icon-btn gradient-blue glow-blue text-white px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold"
          onClick={() => { interact('add'); setSaleItems([]); setForm({ customer_id: '', customer_name: '', warehouse_id: '', warehouse_name: '', paid_amount: 0, discount: 0, notes: '', sale_date: today() }); setShowForm(true); }}>
          <Plus className="w-4 h-4" /><span>فاتورة جديدة</span>
        </button>
      </div>

      {/* Sales List */}
      <div className="space-y-3">
        {filtered.map((sale, i) => (
          <div key={sale.id} className="bg-white rounded-2xl p-4 border border-border glass-hover shadow-sm animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 gradient-blue rounded-xl flex items-center justify-center flex-shrink-0">
                  <ShoppingCart className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-foreground truncate">{sale.customer_name || 'عميل نقدي'}</p>
                  <p className="text-xs text-muted-foreground">{sale.sale_date} • {sale.warehouse_name || '—'}</p>
                  {/* Product names - prominent */}
                  {((sale as any).sale_items || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {((sale as any).sale_items as SaleItem[]).map((it, idx) => (
                        <span key={idx} className="text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-lg">
                          {it.product_name} ×{it.quantity}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2 flex-shrink-0">
                <span className={cn('text-xs px-2 py-1 rounded-lg font-medium', statusColor[sale.status] || 'text-muted-foreground bg-muted')}>{sale.status}</span>
                <div className="text-right">
                  <p className="font-bold text-emerald-600">{EGP(sale.total_amount)}</p>
                  {sale.total_amount !== sale.paid_amount && (
                    <p className="text-xs text-amber-600">متبقي: {EGP(sale.total_amount - sale.paid_amount)}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button className="flex-1 icon-btn gap-1.5 py-1.5 bg-muted/60 hover:bg-blue-50 text-muted-foreground hover:text-blue-600 text-xs rounded-xl border border-border"
                onClick={() => { interact('click'); setShowDetail(sale); }}>
                <Eye className="w-3 h-3" /><span>تفاصيل</span>
              </button>
              {(sale.status === 'آجل' || sale.status === 'جزئي') && (
                <button className="flex-1 icon-btn gap-1.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs rounded-xl border border-amber-200"
                  onClick={() => { interact('click'); setShowPayment(sale); setPaymentForm({ amount: 0, notes: '', payment_date: today() }); }}>
                  <CreditCard className="w-3 h-3" /><span>تسجيل دفعة</span>
                </button>
              )}
              <button className="flex-1 icon-btn gap-1.5 py-1.5 bg-muted/60 hover:bg-emerald-50 text-muted-foreground hover:text-emerald-600 text-xs rounded-xl border border-border"
                onClick={() => handlePrint(sale)}>
                <Printer className="w-3 h-3" /><span>طباعة</span>
              </button>
              <button className="icon-btn w-8 h-8 bg-muted/60 hover:bg-red-50 text-muted-foreground hover:text-red-500 rounded-xl border border-border"
                onClick={() => deleteMutation.mutate(sale.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">لا توجد فواتير</div>}
      </div>

      {/* ─── New Sale Form ─── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-2xl border border-border shadow-xl p-6 animate-fade-up my-4">
            <h2 className="text-lg font-bold text-foreground mb-5">فاتورة مبيعات جديدة</h2>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">العميل</label>
                <select value={form.customer_id}
                  onChange={e => setForm(p => ({ ...p, customer_id: e.target.value, customer_name: customers.find(c => c.id === e.target.value)?.name || '' }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50">
                  <option value="">عميل نقدي</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}{(c.balance || 0) > 0 ? ` (مديونية: ${EGP(c.balance!)})` : ''}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">المخزن</label>
                <select value={form.warehouse_id}
                  onChange={e => setForm(p => ({ ...p, warehouse_id: e.target.value, warehouse_name: warehouses.find(w => w.id === e.target.value)?.name || '' }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50">
                  <option value="">اختر المخزن</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">تاريخ الفاتورة</label>
                <input type="date" value={form.sale_date} onChange={e => setForm(p => ({ ...p, sale_date: e.target.value }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">الحالة (تلقائية)</label>
                <div className={cn('border rounded-xl py-2.5 px-3 text-sm font-semibold flex items-center gap-2',
                  autoStatus === 'مكتملة' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                  autoStatus === 'آجل' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                  'bg-amber-50 border-amber-200 text-amber-700')}>
                  {autoStatus === 'مكتملة' ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                  {autoStatus}
                </div>
              </div>
            </div>

            {/* Status info */}
            {autoStatus === 'آجل' && totalAmount > 0 && (
              <div className="bg-blue-50 rounded-xl px-4 py-2.5 border border-blue-200 mb-3">
                <p className="text-xs text-blue-700">⚡ المبلغ الكامل <strong>{EGP(totalAmount)}</strong> سيُضاف على مديونية العميل</p>
              </div>
            )}
            {autoStatus === 'جزئي' && (
              <div className="bg-amber-50 rounded-xl px-4 py-2.5 border border-amber-200 mb-3">
                <p className="text-xs text-amber-700">⚡ المتبقي <strong>{EGP(totalAmount - form.paid_amount)}</strong> سيُضاف على مديونية العميل</p>
              </div>
            )}

            {/* Items */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-foreground">أصناف الفاتورة</p>
                <button className="icon-btn gap-1 px-3 py-1.5 gradient-blue text-white rounded-xl text-xs" onClick={addItem}>
                  <Plus className="w-3 h-3" /><span>إضافة صنف</span>
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {saleItems.map(item => {
                  const prod = products.find(p => p.id === item.product_id);
                  return (
                    <div key={item.id} className="bg-muted/40 rounded-xl p-2 space-y-1.5">
                      <select value={item.product_id || ''}
                        onChange={e => updateItem(item.id, 'product_id', e.target.value)}
                        className="w-full bg-white border border-border rounded-lg py-1.5 px-2 text-xs text-foreground focus:outline-none focus:border-primary/50">
                        <option value="">— اختر منتجاً للتعبئة التلقائية —</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      {prod && (prod.min_sale_price || prod.max_sale_price) ? (
                        <p className="text-[10px] text-blue-600 px-1">نطاق البيع: {EGP(prod.min_sale_price || 0)} — {EGP(prod.max_sale_price || 0)}</p>
                      ) : null}
                      <div className="grid grid-cols-12 gap-1.5 items-center">
                        <input type="text" placeholder="اسم الصنف *" value={item.product_name}
                          onChange={e => updateItem(item.id, 'product_name', e.target.value)}
                          className="col-span-5 w-full bg-white border border-border rounded-lg py-1.5 px-2 text-xs text-foreground focus:outline-none focus:border-primary/50" />
                        <input type="number" placeholder="كمية" value={item.quantity || ''}
                          onChange={e => updateItem(item.id, 'quantity', Number(e.target.value))}
                          className="col-span-2 w-full bg-white border border-border rounded-lg py-1.5 px-2 text-xs text-foreground focus:outline-none focus:border-primary/50" />
                        <input type="number" placeholder="سعر البيع" value={item.unit_price || ''}
                          onChange={e => updateItem(item.id, 'unit_price', Number(e.target.value))}
                          className="col-span-3 w-full bg-white border border-border rounded-lg py-1.5 px-2 text-xs text-foreground focus:outline-none focus:border-primary/50" />
                        <div className="col-span-1 text-xs text-emerald-600 font-bold text-center">{EGP(item.total_price)}</div>
                        <button className="col-span-1 icon-btn w-6 h-6 bg-red-50 text-red-500 rounded-lg" onClick={() => removeItem(item.id)}>
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {saleItems.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm bg-muted/30 rounded-xl">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>اضغط "إضافة صنف" لإضافة منتجات للفاتورة</p>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">خصم (ج.م)</label>
                <input type="number" value={form.discount || ''}
                  onChange={e => setForm(p => ({ ...p, discount: Number(e.target.value) }))}
                  className="bg-white border border-border rounded-xl py-2 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">المدفوع (ج.م)</label>
                <input type="number" value={form.paid_amount || ''}
                  onChange={e => setForm(p => ({ ...p, paid_amount: Number(e.target.value) }))}
                  className="bg-white border border-border rounded-xl py-2 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">الإجمالي</label>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl py-2 px-3 text-sm text-emerald-700 font-bold">{EGP(totalAmount)}</div>
              </div>
            </div>

            <div className="flex gap-3">
              <button className="flex-1 gradient-blue text-white rounded-xl py-2.5 font-semibold" onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
                {addMutation.isPending ? 'جاري الحفظ...' : 'حفظ الفاتورة'}
              </button>
              <button className="flex-1 bg-muted text-muted-foreground rounded-xl py-2.5 hover:bg-muted/80" onClick={() => { interact('click'); setShowForm(false); }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Payment Modal ─── */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl border border-border shadow-xl p-6 animate-fade-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h2 className="font-bold text-foreground">تسجيل دفعة</h2>
                <p className="text-xs text-muted-foreground">{showPayment.customer_name || 'عميل نقدي'}</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">إجمالي الفاتورة:</span>
                <span className="font-semibold">{EGP(showPayment.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">مدفوع سابقاً:</span>
                <span className="text-emerald-600 font-semibold">{EGP(showPayment.paid_amount)}</span>
              </div>
              <div className="flex justify-between border-t border-amber-200 pt-1.5">
                <span className="text-amber-700 font-bold">المتبقي:</span>
                <span className="text-amber-700 font-bold">{EGP(showPayment.total_amount - showPayment.paid_amount)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">مبلغ الدفعة (ج.م) *</label>
                <input type="number" value={paymentForm.amount || ''}
                  onChange={e => setPaymentForm(p => ({ ...p, amount: Number(e.target.value) }))}
                  max={showPayment.total_amount - showPayment.paid_amount}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">تاريخ الدفعة</label>
                <input type="date" value={paymentForm.payment_date}
                  onChange={e => setPaymentForm(p => ({ ...p, payment_date: e.target.value }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">ملاحظات</label>
                <input type="text" value={paymentForm.notes}
                  onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
            </div>

            {paymentForm.amount > 0 && paymentForm.amount < (showPayment.total_amount - showPayment.paid_amount) && (
              <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                <p className="text-xs text-blue-700">بعد الدفعة: متبقي {EGP(showPayment.total_amount - showPayment.paid_amount - paymentForm.amount)} — الحالة: جزئي</p>
              </div>
            )}
            {paymentForm.amount >= (showPayment.total_amount - showPayment.paid_amount) && paymentForm.amount > 0 && (
              <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                <p className="text-xs text-emerald-700 flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> الفاتورة ستكتمل بعد هذه الدفعة</p>
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button className="flex-1 gradient-blue text-white rounded-xl py-2.5 font-semibold"
                onClick={() => { if (!paymentForm.amount) { toast.error('يرجى إدخال المبلغ'); return; } paymentMutation.mutate(); }}
                disabled={paymentMutation.isPending}>
                {paymentMutation.isPending ? 'جاري الحفظ...' : 'تسجيل الدفعة'}
              </button>
              <button className="flex-1 bg-muted text-muted-foreground rounded-xl py-2.5" onClick={() => { interact('click'); setShowPayment(null); }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Detail Modal ─── */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl border border-border shadow-xl p-6 animate-fade-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-foreground">تفاصيل الفاتورة</h2>
              <button className="icon-btn w-8 h-8 bg-muted text-muted-foreground rounded-xl" onClick={() => setShowDetail(null)}>✕</button>
            </div>
            <div className="space-y-2 text-sm mb-4">
              {[['العميل', showDetail.customer_name || 'نقدي'], ['التاريخ', showDetail.sale_date], ['المخزن', showDetail.warehouse_name || '-'], ['الحالة', showDetail.status]].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1 border-b border-muted"><span className="text-muted-foreground">{k}:</span><span className="font-medium">{v}</span></div>
              ))}
            </div>
            {/* Product names as main prominent items */}
            {((showDetail as any).sale_items || []).length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-muted-foreground font-semibold mb-2 uppercase tracking-wide">أصناف الفاتورة</p>
                <div className="space-y-2">
                  {((showDetail as any).sale_items as SaleItem[]).map((it, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                      <div>
                        <p className="text-sm font-bold text-blue-900">{it.product_name}</p>
                        <p className="text-xs text-blue-600">{it.quantity} {it.unit || ''} × {EGP(it.unit_price)}</p>
                      </div>
                      <span className="text-emerald-600 font-bold text-sm">{EGP(it.total_price)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1 text-sm border-t border-border pt-3">
              {(showDetail.discount || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">خصم:</span><span className="text-violet-600">- {EGP(showDetail.discount || 0)}</span></div>}
              <div className="flex justify-between font-bold text-base"><span>الإجمالي:</span><span className="text-emerald-600">{EGP(showDetail.total_amount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">المدفوع:</span><span className="text-emerald-600">{EGP(showDetail.paid_amount)}</span></div>
              <div className="flex justify-between text-amber-600 font-semibold"><span>المتبقي:</span><span>{EGP(showDetail.total_amount - showDetail.paid_amount)}</span></div>
            </div>
            <div className="flex gap-2 mt-4">
              {(showDetail.status === 'آجل' || showDetail.status === 'جزئي') && (
                <button className="flex-1 icon-btn gap-2 py-2.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-sm font-semibold"
                  onClick={() => { setShowDetail(null); setShowPayment(showDetail); setPaymentForm({ amount: 0, notes: '', payment_date: today() }); }}>
                  <CreditCard className="w-4 h-4" />تسجيل دفعة
                </button>
              )}
              <button className="flex-1 icon-btn gap-2 py-2.5 gradient-blue text-white rounded-xl text-sm font-semibold" onClick={() => handlePrint(showDetail)}>
                <Printer className="w-4 h-4" />طباعة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sales;
