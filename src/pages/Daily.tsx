import { useState } from 'react';
import { BookOpen, Plus, Trash2, Calendar, Printer, Download, TrendingUp, TrendingDown, CreditCard, Wallet } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Expense } from '@/types';
import { COMPANY_INFO } from '@/lib/printInvoice';

const EGP = (v: number) => v.toLocaleString('ar-EG', { minimumFractionDigits: 2 }) + ' ج.م';
const toDateStr = (d: Date) => d.toISOString().split('T')[0];

const Daily = () => {
  const { interact } = useInteraction();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: 0, category: 'عام' });

  const isReadOnly = profile?.role === 'boss';

  // Sales for selected date (with items including product prices)
  const { data: daySales = [] } = useQuery({
    queryKey: ['daily-sales', selectedDate],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales')
        .select('id,customer_name,warehouse_name,total_amount,paid_amount,discount,status,created_at,sale_items(product_name,quantity,unit,unit_price,total_price,product_id)')
        .eq('sale_date', selectedDate)
        .order('created_at', { ascending: false });
      return data || [];
    },
    staleTime: 30000,
  });

  // Purchases for selected date (with items)
  const { data: dayPurchases = [] } = useQuery({
    queryKey: ['daily-purchases', selectedDate],
    queryFn: async () => {
      const { data } = await supabase
        .from('purchases')
        .select('id,supplier_name,warehouse_name,total_amount,paid_amount,status,created_at,purchase_items(product_name,quantity,unit,unit_price,total_price,product_id)')
        .eq('purchase_date', selectedDate)
        .order('created_at', { ascending: false });
      return data || [];
    },
    staleTime: 30000,
  });

  // Products for purchase price lookup
  const { data: products = [] } = useQuery({
    queryKey: ['products-for-daily'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id,name,purchase_price,price,min_sale_price,max_sale_price');
      return (data || []) as { id: string; name: string; purchase_price: number; price: number; min_sale_price: number; max_sale_price: number }[];
    },
    staleTime: 60000,
  });

  // Expenses for selected date
  const { data: dayExpenses = [] } = useQuery({
    queryKey: ['daily-expenses', selectedDate],
    queryFn: async () => {
      const { data } = await supabase.from('expenses').select('*').eq('expense_date', selectedDate).order('created_at', { ascending: false });
      return (data || []) as Expense[];
    },
    staleTime: 30000,
  });

  // Customer payments for selected date
  const { data: dayCustomerPayments = [] } = useQuery({
    queryKey: ['daily-cpayments', selectedDate],
    queryFn: async () => {
      const { data } = await supabase.from('customer_payments').select('*').eq('payment_date', selectedDate).order('created_at', { ascending: false });
      return data || [];
    },
    staleTime: 30000,
  });

  // Supplier payments for selected date
  const { data: daySupplierPayments = [] } = useQuery({
    queryKey: ['daily-spayments', selectedDate],
    queryFn: async () => {
      const { data } = await supabase.from('supplier_payments').select('*').eq('payment_date', selectedDate).order('created_at', { ascending: false });
      return data || [];
    },
    staleTime: 30000,
  });

  const addExpenseMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('expenses').insert({ ...expenseForm, expense_date: selectedDate });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['daily-expenses', selectedDate] });
      interact('success'); toast.success('تم إضافة المصروف');
      setShowExpenseForm(false); setExpenseForm({ description: '', amount: 0, category: 'عام' });
    },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('expenses').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['daily-expenses', selectedDate] }); interact('delete'); },
  });

  const totalSales = (daySales as any[]).reduce((s: number, x: any) => s + x.total_amount, 0);
  const totalPurchases = (dayPurchases as any[]).reduce((s: number, x: any) => s + x.total_amount, 0);
  const totalExpenses = dayExpenses.reduce((s, e) => s + e.amount, 0);
  const totalCPayments = (dayCustomerPayments as any[]).reduce((s: number, x: any) => s + x.amount, 0);
  const totalSPayments = (daySupplierPayments as any[]).reduce((s: number, x: any) => s + x.amount, 0);
  const netCash = totalSales - totalPurchases - totalExpenses;

  // Calculate gross profit for sales
  const calcProfit = (saleItem: any) => {
    const prod = products.find(p => p.id === saleItem.product_id);
    if (!prod || !prod.purchase_price) return null;
    const cost = prod.purchase_price * saleItem.quantity;
    const revenue = saleItem.total_price;
    return revenue - cost;
  };

  const handlePrint = () => {
    interact('click');
    const win = window.open('', '_blank');
    if (!win) { toast.error('يرجى السماح بالنوافذ المنبثقة'); return; }
    const fmtEGP = (v: number) => v.toLocaleString('ar-EG', { minimumFractionDigits: 2 });
    const dateStr = new Date(selectedDate).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

    // Build sales rows with product details
    const salesRows = (daySales as any[]).map((s: any, idx: number) => {
      const items = (s.sale_items || []) as any[];
      const itemsRows = items.map((it: any) => {
        const prod = products.find(p => p.id === it.product_id);
        const purchasePrice = prod?.purchase_price || 0;
        const profit = purchasePrice > 0 ? (it.unit_price - purchasePrice) * it.quantity : null;
        return `<tr style="background:#f9fff9">
          <td style="padding:6px 10px;color:#999;font-size:11px">${idx + 1}</td>
          <td style="padding:6px 10px;font-weight:700;color:#1a1a1a;font-size:13.5px">${it.product_name || '—'}</td>
          <td style="padding:6px 10px;text-align:center">${it.quantity} ${it.unit || ''}</td>
          <td style="padding:6px 10px;text-align:center;color:#6b7280">${purchasePrice > 0 ? fmtEGP(purchasePrice) : '—'}</td>
          <td style="padding:6px 10px;text-align:center">${fmtEGP(it.unit_price)}</td>
          <td style="padding:6px 10px;text-align:center;font-weight:700">${fmtEGP(it.total_price)}</td>
          <td style="padding:6px 10px;text-align:center;font-weight:700;color:${profit !== null && profit >= 0 ? '#16a34a' : '#dc2626'}">${profit !== null ? fmtEGP(profit) : '—'}</td>
        </tr>`;
      }).join('');
      return `<tr style="background:#f0fdf4">
        <td colspan="7" style="padding:8px 10px;font-size:12px;color:#6b7280;border-top:2px solid #e5e7eb">
          <strong style="color:#1a1a1a">${s.customer_name || 'نقدي'}</strong>
          ${s.warehouse_name ? ` • ${s.warehouse_name}` : ''}
          • الإجمالي: <strong>${fmtEGP(s.total_amount)}</strong>
          • المدفوع: <strong style="color:#16a34a">${fmtEGP(s.paid_amount)}</strong>
          • <span style="color:${s.status==='مكتملة'?'#16a34a':'#d97706'}">${s.status}</span>
        </td>
      </tr>${itemsRows}`;
    }).join('');

    // Build purchases rows
    const purchasesRows = (dayPurchases as any[]).map((p: any, idx: number) => {
      const items = (p.purchase_items || []) as any[];
      const itemsRows = items.map((it: any) => `<tr style="background:#fafaf8">
        <td style="padding:6px 10px;color:#999;font-size:11px">${idx + 1}</td>
        <td style="padding:6px 10px;font-weight:700;color:#1a1a1a;font-size:13.5px">${it.product_name || '—'}</td>
        <td style="padding:6px 10px;text-align:center">${it.quantity} ${it.unit || ''}</td>
        <td style="padding:6px 10px;text-align:center;font-weight:700">${fmtEGP(it.unit_price)}</td>
        <td style="padding:6px 10px;text-align:center;font-weight:700">${fmtEGP(it.total_price)}</td>
      </tr>`).join('');
      return `<tr style="background:#fff7ed">
        <td colspan="5" style="padding:8px 10px;font-size:12px;color:#6b7280;border-top:2px solid #e5e7eb">
          <strong style="color:#1a1a1a">${p.supplier_name || '—'}</strong>
          ${p.warehouse_name ? ` • ${p.warehouse_name}` : ''}
          • الإجمالي: <strong>${fmtEGP(p.total_amount)}</strong>
          • <span style="color:${p.status==='مكتملة'?'#16a34a':'#d97706'}">${p.status}</span>
        </td>
      </tr>${itemsRows}`;
    }).join('');

    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8"/>
<title>يومية ${selectedDate}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Cairo',Arial,sans-serif;direction:rtl;background:#fff;color:#1a1a1a;font-size:13px;min-height:100vh;display:flex;flex-direction:column}
.hdr{background:#2d3d36;color:#fff;padding:18px 28px;display:flex;align-items:center;justify-content:space-between}
.hdr-title{font-size:22px;font-weight:900;letter-spacing:-1px}
.hdr-sub{font-size:12px;color:rgba(255,255,255,.75);margin-top:3px}
.hdr-right{text-align:left;font-size:12px;color:rgba(255,255,255,.9);line-height:2}
.big-date{font-size:52px;font-weight:900;color:#2d3d36;letter-spacing:-2px;padding:16px 28px 4px;border-bottom:3px solid #2d3d36;margin-bottom:16px}
.section{padding:0 28px 20px}
.sec-hdr{font-size:15px;font-weight:700;color:#2d3d36;padding:8px 12px;background:#f0f4f2;border-right:4px solid #2d3d36;border-radius:0 6px 6px 0;margin-bottom:10px}
table{width:100%;border-collapse:collapse;font-size:12.5px}
thead tr{background:#2d3d36}
th{padding:9px 10px;font-weight:700;text-align:right;color:#fff;white-space:nowrap}
th.tc{text-align:center}
td{padding:8px 10px;border-bottom:1px solid #eee;vertical-align:middle}
.kpis{display:flex;gap:12px;flex-wrap:wrap;padding:12px 28px;background:#f8f9fa;border-bottom:1px solid #e5e7eb;margin-bottom:16px}
.kpi{border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 14px;min-width:130px}
.kv{font-size:17px;font-weight:700;color:#2563eb}
.kl{font-size:11px;color:#64748b;margin-top:2px}
.summary{margin:0 28px 24px;background:#2d3d36;color:#fff;border-radius:10px;padding:16px 20px}
.sum-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.1);font-size:13px}
.sum-row:last-child{border-bottom:none;font-size:15px;font-weight:700;padding-top:10px}
.footer{background:#2d3d36;color:#fff;padding:22px 28px;text-align:center;margin-top:auto}
.footer-thanks{font-size:36px;font-weight:900;letter-spacing:-1px;margin-bottom:6px}
.footer-policy{font-size:12px;color:rgba(255,255,255,.8)}
@media print{body{min-height:0}@page{margin:0;size:A4}}
</style></head><body>
<div class="hdr">
  <div>
    <div class="hdr-title">${COMPANY_INFO.name}</div>
    <div class="hdr-sub">${COMPANY_INFO.subname}</div>
  </div>
  <div class="hdr-right">
    يومية: ${dateStr}<br>
    📞 ${COMPANY_INFO.phone} | 📍 ${COMPANY_INFO.address}
  </div>
</div>

<div class="big-date">يـوميـة</div>

<!-- KPIs -->
<div class="kpis">
  <div class="kpi"><div class="kv">${fmtEGP(totalSales)}</div><div class="kl">إجمالي المبيعات</div></div>
  <div class="kpi"><div class="kv" style="color:#7c3aed">${fmtEGP(totalPurchases)}</div><div class="kl">إجمالي المشتريات</div></div>
  <div class="kpi"><div class="kv" style="color:#dc2626">${fmtEGP(totalExpenses)}</div><div class="kl">المصروفات</div></div>
  <div class="kpi"><div class="kv" style="color:${netCash >= 0 ? '#16a34a' : '#dc2626'}">${fmtEGP(netCash)}</div><div class="kl">صافي الحركة</div></div>
</div>

<!-- Sales -->
${(daySales as any[]).length > 0 ? `
<div class="section">
  <div class="sec-hdr">المبيعات — ${(daySales as any[]).length} فاتورة</div>
  <table>
    <thead><tr>
      <th style="width:36px">#</th>
      <th>اسم الصنف</th>
      <th class="tc" style="width:80px">الكمية</th>
      <th class="tc" style="width:90px">سعر الشراء</th>
      <th class="tc" style="width:90px">سعر البيع</th>
      <th class="tc" style="width:100px">الإجمالي</th>
      <th class="tc" style="width:90px">الربح</th>
    </tr></thead>
    <tbody>${salesRows}</tbody>
  </table>
</div>` : ''}

<!-- Purchases -->
${(dayPurchases as any[]).length > 0 ? `
<div class="section">
  <div class="sec-hdr">المشتريات — ${(dayPurchases as any[]).length} أمر</div>
  <table>
    <thead><tr>
      <th style="width:36px">#</th>
      <th>اسم الصنف</th>
      <th class="tc" style="width:80px">الكمية</th>
      <th class="tc" style="width:100px">سعر الشراء</th>
      <th class="tc" style="width:110px">الإجمالي</th>
    </tr></thead>
    <tbody>${purchasesRows}</tbody>
  </table>
</div>` : ''}

<!-- Expenses -->
${dayExpenses.length > 0 ? `
<div class="section">
  <div class="sec-hdr">المصروفات</div>
  <table>
    <thead><tr><th>#</th><th>البيان</th><th>الفئة</th><th class="tc">المبلغ</th></tr></thead>
    <tbody>${dayExpenses.map((e, i) => `<tr><td>${i+1}</td><td style="font-weight:600">${e.description}</td><td style="color:#6b7280">${e.category}</td><td style="text-align:center;font-weight:700;color:#dc2626">${fmtEGP(e.amount)}</td></tr>`).join('')}</tbody>
  </table>
</div>` : ''}

<!-- Summary -->
<div class="summary">
  <div class="sum-row"><span>إجمالي المبيعات</span><span>${fmtEGP(totalSales)}</span></div>
  <div class="sum-row"><span>إجمالي المشتريات</span><span>${fmtEGP(totalPurchases)}</span></div>
  <div class="sum-row"><span>إجمالي المصروفات</span><span>${fmtEGP(totalExpenses)}</span></div>
  <div class="sum-row"><span>دفعات العملاء المحصلة</span><span style="color:#86efac">${fmtEGP(totalCPayments)}</span></div>
  <div class="sum-row"><span>دفعات الموردين المدفوعة</span><span style="color:#fbbf24">${fmtEGP(totalSPayments)}</span></div>
  <div class="sum-row"><span>صافي الحركة النقدية</span><span style="color:${netCash >= 0 ? '#86efac' : '#f87171'};font-size:18px">${fmtEGP(netCash)}</span></div>
</div>

<div class="footer">
  <div class="footer-thanks">${COMPANY_INFO.thanks}</div>
  <div class="footer-policy">${COMPANY_INFO.footer}</div>
</div>
</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  };

  const handleExportExcel = () => {
    interact('success');
    const rows: string[] = [];
    rows.push(`يومية,,${selectedDate}`);
    rows.push('');
    rows.push('المبيعات');
    rows.push('العميل,المنتج,الكمية,سعر الشراء,سعر البيع,الإجمالي,الربح,الحالة');
    (daySales as any[]).forEach((s: any) => {
      (s.sale_items || []).forEach((it: any) => {
        const prod = products.find(p => p.id === it.product_id);
        const pp = prod?.purchase_price || 0;
        const profit = pp > 0 ? (it.unit_price - pp) * it.quantity : '';
        rows.push(`${s.customer_name||'نقدي'},${it.product_name||''},${it.quantity},${pp},${it.unit_price},${it.total_price},${profit},${s.status}`);
      });
    });
    rows.push('');
    rows.push('المشتريات');
    rows.push('المورد,المنتج,الكمية,سعر الشراء,الإجمالي,الحالة');
    (dayPurchases as any[]).forEach((p: any) => {
      (p.purchase_items || []).forEach((it: any) => {
        rows.push(`${p.supplier_name||''},${it.product_name||''},${it.quantity},${it.unit_price},${it.total_price},${p.status}`);
      });
    });
    rows.push('');
    rows.push('المصروفات');
    rows.push('البيان,الفئة,المبلغ');
    dayExpenses.forEach(e => rows.push(`${e.description},${e.category},${e.amount}`));
    rows.push('');
    rows.push(`إجمالي المبيعات,,${totalSales}`);
    rows.push(`إجمالي المشتريات,,${totalPurchases}`);
    rows.push(`إجمالي المصروفات,,${totalExpenses}`);
    rows.push(`صافي الحركة,,${netCash}`);
    const csv = rows.join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `daily-${selectedDate}.csv`; a.click(); URL.revokeObjectURL(url);
    toast.success('تم تصدير ملف Excel');
  };

  return (
    <div className="space-y-5">
      {/* Date filter */}
      <div className="glass rounded-2xl p-4 border border-border">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-400" />
            <span className="font-semibold text-foreground">اليومية</span>
          </div>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="bg-card border border-border rounded-xl py-2 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50 flex-1 max-w-48" />
          <div className="flex gap-2 flex-wrap">
            {[
              { label: 'اليوم', fn: () => setSelectedDate(toDateStr(new Date())) },
              { label: 'أمس', fn: () => { const d = new Date(); d.setDate(d.getDate() - 1); setSelectedDate(toDateStr(d)); } },
              { label: 'قبل يومين', fn: () => { const d = new Date(); d.setDate(d.getDate() - 2); setSelectedDate(toDateStr(d)); } },
            ].map(btn => (
              <button key={btn.label} onClick={() => { interact('click'); btn.fn(); }}
                className="px-3 py-2 glass text-muted-foreground hover:text-foreground rounded-xl text-xs font-medium transition-all">
                {btn.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mr-auto">
            <button onClick={handlePrint} className="icon-btn gap-2 px-3 py-2 glass text-emerald-400 border border-emerald-500/25 rounded-xl text-sm">
              <Printer className="w-4 h-4" /><span className="hidden sm:inline">طباعة</span>
            </button>
            <button onClick={handleExportExcel} className="icon-btn gap-2 px-3 py-2 glass text-amber-400 border border-amber-500/25 rounded-xl text-sm">
              <Download className="w-4 h-4" /><span className="hidden sm:inline">Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: 'إجمالي المبيعات', val: EGP(totalSales), color: 'text-emerald-400', border: 'border-emerald-500/20', icon: TrendingUp },
          { label: 'إجمالي المشتريات', val: EGP(totalPurchases), color: 'text-violet-400', border: 'border-violet-500/20', icon: TrendingDown },
          { label: 'إجمالي المصروفات', val: EGP(totalExpenses), color: 'text-red-400', border: 'border-red-500/20', icon: Wallet },
          { label: 'دفعات العملاء', val: EGP(totalCPayments), color: 'text-blue-400', border: 'border-blue-500/20', icon: CreditCard },
          { label: 'دفعات الموردين', val: EGP(totalSPayments), color: 'text-amber-400', border: 'border-amber-500/20', icon: CreditCard },
          { label: 'صافي الحركة', val: EGP(netCash), color: netCash >= 0 ? 'text-emerald-400' : 'text-red-400', border: netCash >= 0 ? 'border-emerald-500/20' : 'border-red-500/20', icon: BookOpen },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className={`glass rounded-xl p-4 border cursor-pointer stat-shine ${s.border}`} onClick={() => interact('click')}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${s.color}`} />
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
              <p className={`text-lg font-bold ${s.color} break-all`}>{s.val}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sales */}
        <div className="glass rounded-2xl p-4 border border-border">
          <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />مبيعات اليوم ({(daySales as any[]).length})
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(daySales as any[]).length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">لا توجد مبيعات</p> :
              (daySales as any[]).map((s: any, i: number) => {
                const items = (s.sale_items || []) as any[];
                return (
                  <div key={i} className="bg-emerald-50/50 border border-emerald-200/40 rounded-xl p-3">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm font-bold text-foreground">{s.customer_name || 'نقدي'}</span>
                      <span className="text-emerald-600 font-bold text-sm">{EGP(s.total_amount)}</span>
                    </div>
                    {items.length > 0 && (
                      <div className="space-y-1">
                        {items.map((it: any, j: number) => {
                          const profit = calcProfit(it);
                          return (
                            <div key={j} className="flex items-center justify-between text-xs px-2 py-1 bg-white/60 rounded-lg">
                              <span className="font-semibold text-foreground">{it.product_name}</span>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <span>×{it.quantity}</span>
                                <span className="text-blue-600">{EGP(it.unit_price)}</span>
                                {profit !== null && (
                                  <span className={profit >= 0 ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}>
                                    ربح: {EGP(profit)}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {/* Purchases */}
        <div className="glass rounded-2xl p-4 border border-border">
          <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-violet-400" />مشتريات اليوم ({(dayPurchases as any[]).length})
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(dayPurchases as any[]).length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">لا توجد مشتريات</p> :
              (dayPurchases as any[]).map((p: any, i: number) => {
                const items = (p.purchase_items || []) as any[];
                return (
                  <div key={i} className="bg-violet-50/50 border border-violet-200/40 rounded-xl p-3">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm font-bold text-foreground">{p.supplier_name || '—'}</span>
                      <span className="text-violet-600 font-bold text-sm">{EGP(p.total_amount)}</span>
                    </div>
                    {items.length > 0 && (
                      <div className="space-y-1">
                        {items.map((it: any, j: number) => (
                          <div key={j} className="flex items-center justify-between text-xs px-2 py-1 bg-white/60 rounded-lg">
                            <span className="font-semibold text-foreground">{it.product_name}</span>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span>×{it.quantity}</span>
                              <span className="text-violet-600">{EGP(it.unit_price)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {/* Expenses */}
        <div className="glass rounded-2xl p-4 border border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
              <Wallet className="w-4 h-4 text-red-400" />مصروفات اليوم
            </h3>
            {!isReadOnly && (
              <button className="icon-btn gap-1 px-2.5 py-1.5 gradient-red text-white rounded-lg text-xs"
                onClick={() => { interact('add'); setShowExpenseForm(true); }}>
                <Plus className="w-3 h-3" /><span>إضافة</span>
              </button>
            )}
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {dayExpenses.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">لا توجد مصروفات</p> :
              dayExpenses.map((e, i) => (
                <div key={i} className="flex justify-between items-center text-xs px-3 py-2 bg-white/5 rounded-lg group">
                  <div>
                    <span className="text-foreground">{e.description}</span>
                    <span className="text-muted-foreground mr-2">({e.category})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-red-400 font-bold">{EGP(e.amount)}</span>
                    {!isReadOnly && (
                      <button className="opacity-0 group-hover:opacity-100 icon-btn w-5 h-5 glass text-muted-foreground hover:text-red-400 transition-opacity"
                        onClick={() => deleteExpenseMutation.mutate(e.id)}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Customer & Supplier Payments */}
        <div className="glass rounded-2xl p-4 border border-border">
          <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-400" />دفعات العملاء والموردين
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {(dayCustomerPayments as any[]).map((p: any, i: number) => (
              <div key={`c-${i}`} className="flex justify-between items-center text-xs px-3 py-2 bg-emerald-500/5 rounded-lg border border-emerald-500/10">
                <span className="text-foreground">📥 {p.customer_name || 'عميل'}</span>
                <span className="text-emerald-400 font-bold">+{EGP(p.amount)}</span>
              </div>
            ))}
            {(daySupplierPayments as any[]).map((p: any, i: number) => (
              <div key={`s-${i}`} className="flex justify-between items-center text-xs px-3 py-2 bg-amber-500/5 rounded-lg border border-amber-500/10">
                <span className="text-foreground">📤 {p.supplier_name || 'مورد'}</span>
                <span className="text-amber-400 font-bold">-{EGP(p.amount)}</span>
              </div>
            ))}
            {(dayCustomerPayments as any[]).length === 0 && (daySupplierPayments as any[]).length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">لا توجد دفعات</p>
            )}
          </div>
        </div>
      </div>

      {/* Expense Form */}
      {showExpenseForm && !isReadOnly && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="glass w-full max-w-md rounded-2xl border border-border p-6 animate-fade-up">
            <h2 className="text-lg font-bold text-foreground mb-5">إضافة مصروف</h2>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">البيان *</label>
                <input type="text" value={expenseForm.description} onChange={e => setExpenseForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="وصف المصروف" className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">المبلغ (ج.م)</label>
                <input type="number" value={expenseForm.amount} onChange={e => setExpenseForm(p => ({ ...p, amount: Number(e.target.value) }))}
                  className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">الفئة</label>
                <select value={expenseForm.category} onChange={e => setExpenseForm(p => ({ ...p, category: e.target.value }))}
                  className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none">
                  {['عام', 'إيجار', 'كهرباء', 'مياه', 'نقل', 'صيانة', 'تسويق', 'إدارية'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button className="flex-1 gradient-red text-white rounded-xl py-2.5 font-semibold" onClick={() => {
                if (!expenseForm.description || !expenseForm.amount) { interact('error'); toast.error('يرجى تعبئة البيان والمبلغ'); return; }
                addExpenseMutation.mutate();
              }} disabled={addExpenseMutation.isPending}>
                إضافة المصروف
              </button>
              <button className="flex-1 glass text-muted-foreground rounded-xl py-2.5" onClick={() => { interact('click'); setShowExpenseForm(false); }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Daily;
