import { useState } from 'react';
import { BookOpen, Plus, Trash2, Calendar, Printer, Download, TrendingUp, TrendingDown, CreditCard, Wallet, FileDown } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Expense } from '@/types';
import { COMPANY_INFO } from '@/lib/printInvoice';
import { cn } from '@/lib/utils';

const EGP = (v: number) => v.toLocaleString('ar-EG', { minimumFractionDigits: 2 }) + ' ج.م';
const fmtN = (v: number) => v.toLocaleString('ar-EG', { minimumFractionDigits: 2 });
const toDateStr = (d: Date) => d.toISOString().split('T')[0];

const INPUT = 'w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all';
const BTN_GHOST = 'flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-sm font-medium transition-all duration-200';

const Daily = () => {
  const { interact } = useInteraction();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: 0, category: 'عام' });

  const isReadOnly = profile?.role === 'boss';

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

  const { data: products = [] } = useQuery({
    queryKey: ['products-for-daily'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id,name,purchase_price,price,min_sale_price,max_sale_price');
      return (data || []) as { id: string; name: string; purchase_price: number; price: number; min_sale_price: number; max_sale_price: number }[];
    },
    staleTime: 60000,
  });

  const { data: dayExpenses = [] } = useQuery({
    queryKey: ['daily-expenses', selectedDate],
    queryFn: async () => {
      const { data } = await supabase.from('expenses').select('*').eq('expense_date', selectedDate).order('created_at', { ascending: false });
      return (data || []) as Expense[];
    },
    staleTime: 30000,
  });

  const { data: dayCustomerPayments = [] } = useQuery({
    queryKey: ['daily-cpayments', selectedDate],
    queryFn: async () => {
      const { data } = await supabase.from('customer_payments').select('*').eq('payment_date', selectedDate).order('created_at', { ascending: false });
      return data || [];
    },
    staleTime: 30000,
  });

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

  const getProfit = (item: any): number | null => {
    const prod = products.find(p => p.id === item.product_id);
    if (!prod || !prod.purchase_price) return null;
    return (item.unit_price - prod.purchase_price) * item.quantity;
  };

  const getPurchasePrice = (productId: string): number => {
    return products.find(p => p.id === productId)?.purchase_price || 0;
  };

  // ── Build print/pdf HTML ─────────────────────────────────────────────────
  const buildDailyHTML = () => {
    const dateStr = new Date(selectedDate).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

    const salesRows = (daySales as any[]).map((s: any, idx: number) => {
      const items = (s.sale_items || []) as any[];
      const groupRow = `<tr style="background:#f0fdf4;border-top:2px solid #d1fae5">
        <td colspan="7" style="padding:8px 14px;font-size:12px;color:#374151">
          <strong style="color:#065f46;font-size:13.5px">${s.customer_name || 'عميل نقدي'}</strong>
          ${s.warehouse_name ? ` &bull; ${s.warehouse_name}` : ''}
          &bull; الإجمالي: <strong style="color:#059669">${fmtN(s.total_amount)} ج.م</strong>
          &bull; المدفوع: <strong style="color:#16a34a">${fmtN(s.paid_amount)} ج.م</strong>
          &bull; <span style="color:${s.status === 'مكتملة' ? '#16a34a' : '#d97706'};font-weight:700">${s.status}</span>
        </td>
      </tr>`;
      const itemRows = items.map((it: any) => {
        const pp = getPurchasePrice(it.product_id);
        const profit = pp > 0 ? (it.unit_price - pp) * it.quantity : null;
        return `<tr>
          <td style="padding:9px 12px;color:#6b7280;font-size:11px;text-align:center">${idx + 1}</td>
          <td style="padding:9px 12px;font-weight:700;color:#111827;font-size:13.5px">${it.product_name || '—'}</td>
          <td style="padding:9px 12px;text-align:center;color:#374151">${it.quantity} ${it.unit || ''}</td>
          <td style="padding:9px 12px;text-align:center;color:#6b7280;font-size:12px">${pp > 0 ? fmtN(pp) + ' ج.م' : '—'}</td>
          <td style="padding:9px 12px;text-align:center;font-weight:700;color:#1d4ed8">${fmtN(it.unit_price)} ج.م</td>
          <td style="padding:9px 12px;text-align:center;font-weight:700;color:#111827">${fmtN(it.total_price)} ج.م</td>
          <td style="padding:9px 12px;text-align:center;font-weight:700;color:${profit !== null ? (profit >= 0 ? '#16a34a' : '#dc2626') : '#9ca3af'}">${profit !== null ? fmtN(profit) + ' ج.م' : '—'}</td>
        </tr>`;
      }).join('');
      return groupRow + itemRows;
    }).join('');

    const purchasesRows = (dayPurchases as any[]).map((p: any, idx: number) => {
      const items = (p.purchase_items || []) as any[];
      const groupRow = `<tr style="background:#fef3c7;border-top:2px solid #fde68a">
        <td colspan="5" style="padding:8px 14px;font-size:12px;color:#374151">
          <strong style="color:#92400e;font-size:13.5px">${p.supplier_name || '—'}</strong>
          ${p.warehouse_name ? ` &bull; ${p.warehouse_name}` : ''}
          &bull; الإجمالي: <strong style="color:#b45309">${fmtN(p.total_amount)} ج.م</strong>
          &bull; <span style="color:${p.status === 'مكتملة' ? '#16a34a' : '#d97706'};font-weight:700">${p.status}</span>
        </td>
      </tr>`;
      const itemRows = items.map((it: any) => `<tr>
        <td style="padding:9px 12px;color:#6b7280;font-size:11px;text-align:center">${idx + 1}</td>
        <td style="padding:9px 12px;font-weight:700;color:#111827;font-size:13.5px">${it.product_name || '—'}</td>
        <td style="padding:9px 12px;text-align:center;color:#374151">${it.quantity} ${it.unit || ''}</td>
        <td style="padding:9px 12px;text-align:center;font-weight:700;color:#7c3aed">${fmtN(it.unit_price)} ج.م</td>
        <td style="padding:9px 12px;text-align:center;font-weight:700;color:#111827">${fmtN(it.total_price)} ج.م</td>
      </tr>`).join('');
      return groupRow + itemRows;
    }).join('');

    return `<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8"/>
<title>يومية ${selectedDate}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Cairo',Arial,sans-serif;direction:rtl;background:#fff;color:#1a1a1a;font-size:14px;min-height:100vh;display:flex;flex-direction:column}
.hdr{background:#1e293b;color:#fff;padding:20px 32px;display:flex;align-items:center;justify-content:space-between}
.hdr-title{font-size:26px;font-weight:900;letter-spacing:-1px}
.hdr-sub{font-size:12px;color:rgba(255,255,255,.65);margin-top:4px}
.hdr-right{text-align:left;font-size:13px;color:rgba(255,255,255,.9);line-height:2.1}
.big-date{font-size:15px;font-weight:900;color:#1e293b;padding:14px 32px 4px;display:flex;align-items:center;gap:10px}
.big-date span{font-size:32px;font-weight:900;letter-spacing:-1px}
.kpis{display:flex;gap:10px;flex-wrap:wrap;padding:10px 32px 16px}
.kpi{border:1.5px solid #e2e8f0;border-radius:10px;padding:12px 16px;min-width:140px;background:#f8fafc}
.kv{font-size:17px;font-weight:700;color:#1e293b}
.kl{font-size:11.5px;color:#64748b;margin-top:2px}
.sec-hdr{margin:0 32px 10px;font-size:15px;font-weight:700;color:#1e293b;padding:9px 14px;background:#f1f5f9;border-right:4px solid #1e293b;border-radius:0 8px 8px 0}
table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px}
thead tr{background:#1e293b}
th{padding:11px 12px;font-weight:700;text-align:right;color:#fff;white-space:nowrap;font-size:12.5px}
th.tc{text-align:center}
td{padding:9px 12px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
tr:nth-child(even) td{background:#fafafa}
.tbl-wrap{padding:0 32px}
.summary{margin:16px 32px 20px;background:#1e293b;color:#fff;border-radius:12px;padding:18px 22px}
.sum-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.1);font-size:13.5px}
.sum-row:last-child{border-bottom:none;font-size:16px;font-weight:700;padding-top:12px}
.footer{background:#1e293b;color:#fff;padding:24px 32px;text-align:center;margin-top:auto}
.footer-thanks{font-size:38px;font-weight:900;letter-spacing:-1px;margin-bottom:6px}
.footer-p{font-size:12.5px;color:rgba(255,255,255,.75)}
@media print{
  body{min-height:0}
  @page{margin:0;size:A4 portrait}
  table{page-break-inside:auto;width:100% !important}
  tr{page-break-inside:avoid}
  thead{display:table-header-group}
  th,td{padding:9px 10px !important;font-size:12px !important}
}
</style></head><body>
<div class="hdr">
  <div>
    <div class="hdr-title">${COMPANY_INFO.name}</div>
    <div class="hdr-sub">${COMPANY_INFO.subname}</div>
  </div>
  <div class="hdr-right">
    📅 ${dateStr}<br>
    📞 ${COMPANY_INFO.phone} &nbsp;|&nbsp; 📍 ${COMPANY_INFO.address}
  </div>
</div>

<div class="big-date"><span>يـوميـة</span>${dateStr}</div>

<div class="kpis">
  <div class="kpi"><div class="kv" style="color:#059669">${fmtN(totalSales)} ج.م</div><div class="kl">إجمالي المبيعات</div></div>
  <div class="kpi"><div class="kv" style="color:#7c3aed">${fmtN(totalPurchases)} ج.م</div><div class="kl">إجمالي المشتريات</div></div>
  <div class="kpi"><div class="kv" style="color:#dc2626">${fmtN(totalExpenses)} ج.م</div><div class="kl">المصروفات</div></div>
  <div class="kpi"><div class="kv" style="color:#0284c7">${fmtN(totalCPayments)} ج.م</div><div class="kl">دفعات العملاء</div></div>
  <div class="kpi"><div class="kv" style="color:#d97706">${fmtN(totalSPayments)} ج.م</div><div class="kl">دفعات الموردين</div></div>
  <div class="kpi"><div class="kv" style="color:${netCash >= 0 ? '#16a34a' : '#dc2626'}">${fmtN(netCash)} ج.م</div><div class="kl">صافي الحركة</div></div>
</div>

${(daySales as any[]).length > 0 ? `
<div class="sec-hdr">المبيعات — ${(daySales as any[]).length} فاتورة &nbsp;|&nbsp; الإجمالي: ${fmtN(totalSales)} ج.م</div>
<div class="tbl-wrap">
<table>
  <thead><tr>
    <th style="width:36px" class="tc">#</th>
    <th>اسم الصنف</th>
    <th class="tc" style="width:75px">الكمية</th>
    <th class="tc" style="width:95px">سعر الشراء</th>
    <th class="tc" style="width:95px">سعر البيع</th>
    <th class="tc" style="width:105px">الإجمالي</th>
    <th class="tc" style="width:95px">الربح</th>
  </tr></thead>
  <tbody>${salesRows}</tbody>
</table>
</div>` : ''}

${(dayPurchases as any[]).length > 0 ? `
<div class="sec-hdr">المشتريات — ${(dayPurchases as any[]).length} أمر &nbsp;|&nbsp; الإجمالي: ${fmtN(totalPurchases)} ج.م</div>
<div class="tbl-wrap">
<table>
  <thead><tr>
    <th style="width:36px" class="tc">#</th>
    <th>اسم الصنف</th>
    <th class="tc" style="width:75px">الكمية</th>
    <th class="tc" style="width:105px">سعر الشراء</th>
    <th class="tc" style="width:115px">الإجمالي</th>
  </tr></thead>
  <tbody>${purchasesRows}</tbody>
</table>
</div>` : ''}

${dayExpenses.length > 0 ? `
<div class="sec-hdr">المصروفات — ${dayExpenses.length} بند</div>
<div class="tbl-wrap">
<table>
  <thead><tr><th>البيان</th><th>الفئة</th><th class="tc" style="width:120px">المبلغ</th></tr></thead>
  <tbody>${dayExpenses.map(e => `<tr><td style="font-weight:600">${e.description}</td><td style="color:#6b7280">${e.category}</td><td style="text-align:center;font-weight:700;color:#dc2626">${fmtN(e.amount)} ج.م</td></tr>`).join('')}</tbody>
</table>
</div>` : ''}

<div class="summary">
  <div class="sum-row"><span>إجمالي المبيعات</span><span style="color:#86efac">${fmtN(totalSales)} ج.م</span></div>
  <div class="sum-row"><span>إجمالي المشتريات</span><span style="color:#c4b5fd">${fmtN(totalPurchases)} ج.م</span></div>
  <div class="sum-row"><span>إجمالي المصروفات</span><span style="color:#fca5a5">${fmtN(totalExpenses)} ج.م</span></div>
  <div class="sum-row"><span>دفعات العملاء المحصلة</span><span style="color:#7dd3fc">${fmtN(totalCPayments)} ج.م</span></div>
  <div class="sum-row"><span>دفعات الموردين المدفوعة</span><span style="color:#fcd34d">${fmtN(totalSPayments)} ج.م</span></div>
  <div class="sum-row"><span>صافي الحركة النقدية</span><span style="color:${netCash >= 0 ? '#86efac' : '#f87171'};font-size:20px">${fmtN(netCash)} ج.م</span></div>
</div>

<div class="footer">
  <div class="footer-thanks">${COMPANY_INFO.thanks}</div>
  <div class="footer-p">${COMPANY_INFO.footer}</div>
</div>
</body></html>`;
  };

  const handlePrint = () => {
    interact('click');
    const win = window.open('', '_blank');
    if (!win) { toast.error('يرجى السماح بالنوافذ المنبثقة'); return; }
    win.document.write(buildDailyHTML());
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  };

  const handleSavePDF = async () => {
    interact('click');
    toast.info('جاري تجهيز ملف PDF...');
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const container = document.createElement('div');
      container.innerHTML = buildDailyHTML();
      const bodyEl = container.querySelector('body');
      const el = document.createElement('div');
      el.style.cssText = 'direction:rtl;font-family:Cairo,Arial,sans-serif;background:#fff;';
      el.innerHTML = bodyEl ? bodyEl.innerHTML : container.innerHTML;
      document.body.appendChild(el);
      await html2pdf().set({
        margin: 0,
        filename: `يومية-${selectedDate}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).from(el).save();
      document.body.removeChild(el);
      toast.success('تم حفظ ملف PDF');
    } catch (e) {
      toast.error('فشل تحميل ملف PDF، جرب الطباعة');
    }
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
        const pp = getPurchasePrice(it.product_id);
        const profit = pp > 0 ? (it.unit_price - pp) * it.quantity : '';
        rows.push(`${s.customer_name || 'نقدي'},${it.product_name || ''},${it.quantity},${pp},${it.unit_price},${it.total_price},${profit},${s.status}`);
      });
    });
    rows.push('');
    rows.push('المشتريات');
    rows.push('المورد,المنتج,الكمية,سعر الشراء,الإجمالي,الحالة');
    (dayPurchases as any[]).forEach((p: any) => {
      (p.purchase_items || []).forEach((it: any) => {
        rows.push(`${p.supplier_name || ''},${it.product_name || ''},${it.quantity},${it.unit_price},${it.total_price},${p.status}`);
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
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `daily-${selectedDate}.csv`; a.click(); URL.revokeObjectURL(url);
    toast.success('تم تصدير ملف Excel');
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-slate-500" />
            <span className="font-bold text-slate-700">اليومية</span>
          </div>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className={cn(INPUT, 'flex-1 max-w-44')} />
          <div className="flex gap-1.5 flex-wrap">
            {[
              { label: 'اليوم', fn: () => setSelectedDate(toDateStr(new Date())) },
              { label: 'أمس', fn: () => { const d = new Date(); d.setDate(d.getDate() - 1); setSelectedDate(toDateStr(d)); } },
              { label: 'قبل يومين', fn: () => { const d = new Date(); d.setDate(d.getDate() - 2); setSelectedDate(toDateStr(d)); } },
            ].map(btn => (
              <button key={btn.label} onClick={() => { interact('click'); btn.fn(); }}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-medium transition-all">
                {btn.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mr-auto flex-wrap">
            <button onClick={handlePrint} className={BTN_GHOST}>
              <Printer className="w-4 h-4 text-slate-500" /><span className="hidden sm:inline text-xs">طباعة</span>
            </button>
            <button onClick={handleSavePDF} className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-all">
              <FileDown className="w-4 h-4" /><span className="hidden sm:inline">PDF</span>
            </button>
            <button onClick={handleExportExcel} className={BTN_GHOST}>
              <Download className="w-4 h-4 text-amber-500" /><span className="hidden sm:inline text-xs">Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: 'إجمالي المبيعات', val: EGP(totalSales), color: 'text-emerald-600', border: 'border-emerald-200', bg: 'bg-emerald-50', icon: TrendingUp },
          { label: 'إجمالي المشتريات', val: EGP(totalPurchases), color: 'text-violet-600', border: 'border-violet-200', bg: 'bg-violet-50', icon: TrendingDown },
          { label: 'إجمالي المصروفات', val: EGP(totalExpenses), color: 'text-red-600', border: 'border-red-200', bg: 'bg-red-50', icon: Wallet },
          { label: 'دفعات العملاء', val: EGP(totalCPayments), color: 'text-blue-600', border: 'border-blue-200', bg: 'bg-blue-50', icon: CreditCard },
          { label: 'دفعات الموردين', val: EGP(totalSPayments), color: 'text-amber-600', border: 'border-amber-200', bg: 'bg-amber-50', icon: CreditCard },
          { label: 'صافي الحركة', val: EGP(netCash), color: netCash >= 0 ? 'text-emerald-600' : 'text-red-600', border: netCash >= 0 ? 'border-emerald-200' : 'border-red-200', bg: netCash >= 0 ? 'bg-emerald-50' : 'bg-red-50', icon: BookOpen },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className={`rounded-xl p-4 border ${s.border} ${s.bg}`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${s.color}`} />
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
              <p className={`text-lg font-bold ${s.color} break-all`}>{s.val}</p>
            </div>
          );
        })}
      </div>

      {/* ── Sales Detail Table ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <h3 className="font-bold text-sm text-slate-800">مبيعات اليوم</h3>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{(daySales as any[]).length} فاتورة</span>
          </div>
          <span className="text-sm font-bold text-emerald-600">{EGP(totalSales)}</span>
        </div>
        {(daySales as any[]).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <TrendingUp className="w-10 h-10 mb-2 opacity-20" />
            <p className="text-sm">لا توجد مبيعات في هذا اليوم</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-white">
                <tr>
                  <th className="px-4 py-3 text-right text-xs font-semibold">اسم الصنف</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold hidden sm:table-cell">العميل</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold hidden md:table-cell">الكمية</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold hidden lg:table-cell">سعر الشراء</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold">سعر البيع</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold">الإجمالي</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold">الربح</th>
                </tr>
              </thead>
              <tbody>
                {(daySales as any[]).map((sale: any, sIdx: number) => {
                  const items = (sale.sale_items || []) as any[];
                  return items.map((it: any, iIdx: number) => {
                    const pp = getPurchasePrice(it.product_id);
                    const profit = pp > 0 ? (it.unit_price - pp) * it.quantity : null;
                    return (
                      <tr key={`${sIdx}-${iIdx}`} className={cn('border-b border-slate-50 hover:bg-slate-50/60 transition-colors', iIdx === 0 && sIdx > 0 ? 'border-t-2 border-slate-200' : '')}>
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-800">{it.product_name}</p>
                          <p className="text-xs text-slate-400 sm:hidden">{sale.customer_name || 'نقدي'}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500 hidden sm:table-cell">
                          {iIdx === 0 ? (
                            <span className="font-semibold text-slate-700">{sale.customer_name || 'نقدي'}</span>
                          ) : ''}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-slate-600 hidden md:table-cell">
                          {it.quantity} {it.unit || ''}
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-slate-400 hidden lg:table-cell">
                          {pp > 0 ? EGP(pp) : '—'}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-blue-600">{EGP(it.unit_price)}</td>
                        <td className="px-4 py-3 text-center font-bold text-slate-800">{EGP(it.total_price)}</td>
                        <td className="px-4 py-3 text-center">
                          {profit !== null ? (
                            <span className={cn('font-bold text-sm', profit >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                              {EGP(profit)}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Purchases + Expenses + Payments ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Purchases */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/60">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-violet-500" />
              <h3 className="font-bold text-sm text-slate-800">مشتريات اليوم</h3>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{(dayPurchases as any[]).length}</span>
            </div>
            <span className="text-sm font-bold text-violet-600">{EGP(totalPurchases)}</span>
          </div>
          {(dayPurchases as any[]).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <p className="text-sm">لا توجد مشتريات</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-700 text-white">
                  <tr>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold">الصنف</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold hidden sm:table-cell">المورد</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold">الكمية</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {(dayPurchases as any[]).map((p: any, pIdx: number) =>
                    (p.purchase_items || []).map((it: any, iIdx: number) => (
                      <tr key={`${pIdx}-${iIdx}`} className="border-b border-slate-50 hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 font-semibold text-slate-800">{it.product_name}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs hidden sm:table-cell">{iIdx === 0 ? p.supplier_name || '—' : ''}</td>
                        <td className="px-4 py-2.5 text-center text-slate-600">{it.quantity} {it.unit || ''}</td>
                        <td className="px-4 py-2.5 text-center font-bold text-violet-600">{EGP(it.total_price)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Expenses */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/60">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-red-500" />
              <h3 className="font-bold text-sm text-slate-800">المصروفات</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-red-600">{EGP(totalExpenses)}</span>
              {!isReadOnly && (
                <button className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-xs font-semibold transition-all"
                  onClick={() => { interact('add'); setShowExpenseForm(true); }}>
                  <Plus className="w-3 h-3" />إضافة
                </button>
              )}
            </div>
          </div>
          {dayExpenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <p className="text-sm">لا توجد مصروفات</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {dayExpenses.map((e, i) => (
                <div key={i} className="flex justify-between items-center px-4 py-3 hover:bg-slate-50/60 group transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{e.description}</p>
                    <p className="text-xs text-slate-400">{e.category}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-red-600">{EGP(e.amount)}</span>
                    {!isReadOnly && (
                      <button className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-7 h-7 bg-red-50 hover:bg-red-100 text-red-400 rounded-lg transition-all"
                        onClick={() => deleteExpenseMutation.mutate(e.id)}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payments */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden lg:col-span-2">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50/60">
            <CreditCard className="w-4 h-4 text-blue-500" />
            <h3 className="font-bold text-sm text-slate-800">دفعات العملاء والموردين</h3>
          </div>
          {(dayCustomerPayments as any[]).length === 0 && (daySupplierPayments as any[]).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <p className="text-sm">لا توجد دفعات</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {(dayCustomerPayments as any[]).map((p: any, i: number) => (
                <div key={`c-${i}`} className="flex justify-between items-center px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium border border-emerald-200">وارد</span>
                    <span className="text-sm text-slate-700">{p.customer_name || 'عميل'}</span>
                    {p.notes && <span className="text-xs text-slate-400 hidden sm:inline">— {p.notes}</span>}
                  </div>
                  <span className="font-bold text-emerald-600">+{EGP(p.amount)}</span>
                </div>
              ))}
              {(daySupplierPayments as any[]).map((p: any, i: number) => (
                <div key={`s-${i}`} className="flex justify-between items-center px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium border border-amber-200">صادر</span>
                    <span className="text-sm text-slate-700">{p.supplier_name || 'مورد'}</span>
                    {p.notes && <span className="text-xs text-slate-400 hidden sm:inline">— {p.notes}</span>}
                  </div>
                  <span className="font-bold text-amber-600">-{EGP(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Expense Form Modal */}
      {showExpenseForm && !isReadOnly && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 animate-fade-up">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-9 h-9 bg-red-500 rounded-xl flex items-center justify-center">
                <Wallet className="w-4.5 h-4.5 text-white" />
              </div>
              <h2 className="text-base font-bold text-slate-800">إضافة مصروف</h2>
            </div>
            <div className="p-6 space-y-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">البيان *</label>
                <input type="text" value={expenseForm.description} onChange={e => setExpenseForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="وصف المصروف" className={INPUT} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">المبلغ (ج.م)</label>
                <input type="number" value={expenseForm.amount || ''} onChange={e => setExpenseForm(p => ({ ...p, amount: Number(e.target.value) }))} className={INPUT} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">الفئة</label>
                <select value={expenseForm.category} onChange={e => setExpenseForm(p => ({ ...p, category: e.target.value }))} className={INPUT}>
                  {['عام', 'إيجار', 'كهرباء', 'مياه', 'نقل', 'صيانة', 'تسويق', 'إدارية'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 font-semibold transition-all" onClick={() => {
                if (!expenseForm.description || !expenseForm.amount) { interact('error'); toast.error('يرجى تعبئة البيان والمبلغ'); return; }
                addExpenseMutation.mutate();
              }} disabled={addExpenseMutation.isPending}>
                إضافة المصروف
              </button>
              <button className="flex-1 bg-slate-100 text-slate-600 rounded-xl py-2.5 hover:bg-slate-200 transition-all"
                onClick={() => { interact('click'); setShowExpenseForm(false); }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Daily;
