import { useState, useMemo, type ElementType } from 'react';
import {
  Archive, AlertTriangle, TrendingUp, TrendingDown, ArrowLeftRight,
  DollarSign, Printer, Download, Search, Package, Plus, Trash2,
  Calendar, Users, BarChart3, Target, FileDown,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { COMPANY_INFO } from '@/lib/printInvoice';

type Tab = 'inventory' | 'shortages' | 'movement' | 'inbound' | 'outbound' | 'transfers' | 'financial' | 'profit' | 'damaged' | 'workers';

interface InvRow {
  id: string; quantity: number;
  products: { id: string; name: string; sku: string; unit: string; min_stock: number; purchase_price: number; price: number; min_sale_price: number; max_sale_price: number } | null;
  warehouses: { id: string; name: string } | null;
}
interface PurchaseRow { id: string; supplier_name: string; warehouse_name: string; total_amount: number; paid_amount: number; status: string; purchase_date: string; }
interface SaleRow {
  id: string; customer_name: string; warehouse_name: string; total_amount: number;
  paid_amount: number; discount: number; status: string; sale_date: string;
  sale_items?: { product_name: string; quantity: number; unit: string; unit_price: number; total_price: number; product_id?: string }[];
}
interface TransferRow { id: string; from_warehouse_name: string; to_warehouse_name: string; status: string; driver_name: string; total_items: number; created_at: string; }
interface SaleItemRow { product_name: string; quantity: number; unit: string; }
interface PurchaseItemRow { product_name: string; quantity: number; unit: string; }
interface DamageRow { id: string; product_name: string; warehouse_name: string | null; quantity: number; reason: string | null; damage_date: string; unit?: string; unit_cost?: number; }
interface WorkerRow { id: string; full_name: string | null; username: string | null; email: string; role: string; phone: string | null; active: boolean | null; max_salary: number | null; }
interface WTxnRow { id: string; worker_id: string; worker_name: string; type: string; amount: number; notes: string | null; transaction_date: string; }
interface WhOpt { id: string; name: string; }
interface ProductRow { id: string; name: string; sku: string; purchase_price: number; price: number; }

const EGP = (v: number) => v.toLocaleString('ar-EG', { minimumFractionDigits: 0 }) + ' ج.م';

const TABS: { id: Tab; label: string; shortLabel: string; icon: ElementType; color: string }[] = [
  { id: 'inventory', label: 'جرد المخزون', shortLabel: 'الجرد', icon: Archive, color: 'blue' },
  { id: 'shortages', label: 'النواقص', shortLabel: 'النواقص', icon: AlertTriangle, color: 'red' },
  { id: 'movement', label: 'حركة الأصناف', shortLabel: 'الحركة', icon: TrendingUp, color: 'violet' },
  { id: 'profit', label: 'تقرير الأرباح', shortLabel: 'الأرباح', icon: Target, color: 'emerald' },
  { id: 'inbound', label: 'تقرير الوارد', shortLabel: 'الوارد', icon: Package, color: 'emerald' },
  { id: 'outbound', label: 'تقرير الصادر', shortLabel: 'الصادر', icon: TrendingDown, color: 'amber' },
  { id: 'transfers', label: 'التحويلات', shortLabel: 'التحويلات', icon: ArrowLeftRight, color: 'blue' },
  { id: 'financial', label: 'التقييم المالي', shortLabel: 'المالي', icon: DollarSign, color: 'emerald' },
  { id: 'damaged', label: 'الهالك والتالف', shortLabel: 'الهالك', icon: Trash2, color: 'red' },
  { id: 'workers', label: 'تقرير العمال', shortLabel: 'العمال', icon: Users, color: 'violet' },
];

const SC: Record<string, string> = {
  'مكتملة': 'text-emerald-700 bg-emerald-100 border-emerald-200',
  'مكتمل': 'text-emerald-700 bg-emerald-100 border-emerald-200',
  'معلقة': 'text-amber-700 bg-amber-100 border-amber-200',
  'معلق': 'text-amber-700 bg-amber-100 border-amber-200',
  'قيد التنفيذ': 'text-blue-700 bg-blue-100 border-blue-200',
  'ملغاة': 'text-red-700 bg-red-100 border-red-200',
  'ملغي': 'text-red-700 bg-red-100 border-red-200',
  'آجل': 'text-blue-700 bg-blue-100 border-blue-200',
  'جزئي': 'text-amber-700 bg-amber-100 border-amber-200',
};

const KpiCard = ({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) => (
  <div className={`rounded-xl p-4 border ${color}`}>
    <p className="text-xs text-muted-foreground mb-1">{label}</p>
    <p className={`text-xl font-bold text-foreground`}>{value}</p>
    {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
  </div>
);

const getInvStatus = (qty: number, min: number) => qty === 0 ? 'نافد' : qty < min ? 'منخفض' : 'وفير';
const getInvClass = (s: string) =>
  s === 'وفير' ? 'text-emerald-700 bg-emerald-100 border-emerald-200' :
  s === 'منخفض' ? 'text-amber-700 bg-amber-100 border-amber-200' :
  'text-red-700 bg-red-100 border-red-200';

const Reports = () => {
  const { interact } = useInteraction();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<Tab>('inventory');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [showDamageForm, setShowDamageForm] = useState(false);
  const emptyDmg = { product_name: '', warehouse_name: '', quantity: 1, reason: '', damage_date: new Date().toISOString().split('T')[0], unit: '', unit_cost: 0 };
  const [damageForm, setDamageForm] = useState(emptyDmg);

  // ─── Queries ─────────────────────────────────────────────────────────────────
  const { data: warehouses = [] } = useQuery({
    queryKey: ['wh-opts'],
    queryFn: async () => { const { data } = await supabase.from('warehouses').select('id, name').order('name'); return (data ?? []) as WhOpt[]; },
    staleTime: 60000,
  });

  const { data: inventory = [], isLoading: invLoad } = useQuery({
    queryKey: ['inv-report'],
    queryFn: async () => {
      const { data } = await supabase.from('inventory').select('id, quantity, products(id, name, sku, unit, min_stock, purchase_price, price, min_sale_price, max_sale_price), warehouses(id, name)');
      return (data ?? []) as InvRow[];
    },
    staleTime: 60000,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products-report'],
    queryFn: async () => { const { data } = await supabase.from('products').select('id, name, sku, purchase_price, price'); return (data ?? []) as ProductRow[]; },
    staleTime: 60000,
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ['pur-report', dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase.from('purchases').select('id, supplier_name, warehouse_name, total_amount, paid_amount, status, purchase_date').order('purchase_date', { ascending: false });
      if (dateFrom) q = q.gte('purchase_date', dateFrom);
      if (dateTo) q = q.lte('purchase_date', dateTo);
      const { data } = await q;
      return (data ?? []) as PurchaseRow[];
    },
    staleTime: 30000,
  });

  const { data: sales = [] } = useQuery({
    queryKey: ['sal-report', dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase.from('sales').select('id, customer_name, warehouse_name, total_amount, paid_amount, discount, status, sale_date, sale_items(product_name, quantity, unit, unit_price, total_price, product_id)').order('sale_date', { ascending: false });
      if (dateFrom) q = q.gte('sale_date', dateFrom);
      if (dateTo) q = q.lte('sale_date', dateTo);
      const { data } = await q;
      return (data ?? []) as SaleRow[];
    },
    staleTime: 30000,
  });

  const { data: transfers = [] } = useQuery({
    queryKey: ['tr-report', dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase.from('transfers').select('id, from_warehouse_name, to_warehouse_name, status, driver_name, total_items, created_at').order('created_at', { ascending: false });
      if (dateFrom) q = q.gte('created_at', dateFrom);
      if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59');
      const { data } = await q;
      return (data ?? []) as TransferRow[];
    },
    staleTime: 30000,
  });

  const { data: saleItems = [] } = useQuery({
    queryKey: ['si-report'],
    queryFn: async () => { const { data } = await supabase.from('sale_items').select('product_name, quantity, unit'); return (data ?? []) as SaleItemRow[]; },
    staleTime: 60000,
  });

  const { data: purchaseItems = [] } = useQuery({
    queryKey: ['pi-report'],
    queryFn: async () => { const { data } = await supabase.from('purchase_items').select('product_name, quantity, unit'); return (data ?? []) as PurchaseItemRow[]; },
    staleTime: 60000,
  });

  const { data: workersData = [] } = useQuery({
    queryKey: ['workers-report'],
    queryFn: async () => { const { data } = await supabase.from('user_profiles').select('id, full_name, username, email, role, phone, active, max_salary').order('full_name'); return (data ?? []) as WorkerRow[]; },
    staleTime: 60000,
  });

  const { data: workerTxns = [] } = useQuery({
    queryKey: ['worker-txns-report'],
    queryFn: async () => { const { data } = await supabase.from('worker_transactions').select('*').order('transaction_date', { ascending: false }); return (data ?? []) as WTxnRow[]; },
    staleTime: 60000,
  });

  const { data: damages = [] } = useQuery({
    queryKey: ['damages'],
    queryFn: async () => { const { data } = await supabase.from('damages').select('*').order('damage_date', { ascending: false }); return (data ?? []) as DamageRow[]; },
    staleTime: 30000,
  });

  const addDamageMutation = useMutation({
    mutationFn: async (p: typeof emptyDmg) => { const { error } = await supabase.from('damages').insert(p); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['damages'] }); interact('success'); toast.success('تم تسجيل الهالك'); setShowDamageForm(false); setDamageForm(emptyDmg); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const delDamageMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('damages').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['damages'] }); interact('delete'); },
  });

  // ─── Computed ─────────────────────────────────────────────────────────────────
  const selectedWh = warehouses.find((w: WhOpt) => w.id === warehouseFilter);

  const filteredInv = useMemo(() => inventory.filter(i => {
    const mWh = !warehouseFilter || i.warehouses?.id === warehouseFilter;
    const mSr = !productSearch || (i.products?.name || '').includes(productSearch) || (i.products?.sku || '').includes(productSearch);
    return mWh && mSr;
  }), [inventory, warehouseFilter, productSearch]);

  const shortages = useMemo(() =>
    filteredInv.filter(i => (i.quantity || 0) < (i.products?.min_stock || 0))
      .sort((a, b) => ((b.products?.min_stock || 0) - b.quantity) - ((a.products?.min_stock || 0) - a.quantity)),
    [filteredInv]);

  const productMovement = useMemo(() => {
    const map = new Map<string, { name: string; unit: string; sold: number; purchased: number }>();
    for (const it of saleItems) {
      const e = map.get(it.product_name) || { name: it.product_name, unit: it.unit, sold: 0, purchased: 0 };
      e.sold += it.quantity; map.set(it.product_name, e);
    }
    for (const it of purchaseItems) {
      const e = map.get(it.product_name) || { name: it.product_name, unit: it.unit, sold: 0, purchased: 0 };
      e.purchased += it.quantity; map.set(it.product_name, e);
    }
    const arr = Array.from(map.values());
    return productSearch ? arr.filter(p => p.name.includes(productSearch)) : arr.sort((a, b) => b.sold - a.sold);
  }, [saleItems, purchaseItems, productSearch]);

  const filteredPurchases = useMemo(() => purchases.filter(p => {
    const mWh = !selectedWh || p.warehouse_name === selectedWh.name;
    const mSr = !productSearch || (p.supplier_name || '').includes(productSearch);
    return mWh && mSr;
  }), [purchases, selectedWh, productSearch]);

  const filteredSales = useMemo(() => sales.filter(s => {
    const mWh = !selectedWh || s.warehouse_name === selectedWh.name;
    const mSr = !productSearch || (s.customer_name || '').includes(productSearch);
    return mWh && mSr;
  }), [sales, selectedWh, productSearch]);

  const filteredTransfers = useMemo(() => transfers.filter(t => {
    const mWh = !selectedWh || t.from_warehouse_name === selectedWh.name || t.to_warehouse_name === selectedWh.name;
    const mSr = !productSearch || (t.from_warehouse_name || '').includes(productSearch) || (t.to_warehouse_name || '').includes(productSearch);
    return mWh && mSr;
  }), [transfers, selectedWh, productSearch]);

  const financialData = useMemo(() => filteredInv
    .filter(i => i.quantity > 0 && (i.products?.purchase_price || 0) > 0)
    .map(i => {
      const pp = i.products?.purchase_price || 0;
      const sp = i.products?.price || i.products?.min_sale_price || 0;
      return {
        productName: i.products?.name || '', sku: i.products?.sku || '',
        warehouseName: i.warehouses?.name || '', quantity: i.quantity,
        purchasePrice: pp, salePrice: sp,
        totalValuePP: i.quantity * pp,
        totalValueSP: sp > 0 ? i.quantity * sp : 0,
        potentialProfit: sp > 0 ? i.quantity * (sp - pp) : 0,
      };
    })
    .sort((a, b) => b.totalValuePP - a.totalValuePP),
    [filteredInv]);

  const totalFinValPP = useMemo(() => financialData.reduce((s, r) => s + r.totalValuePP, 0), [financialData]);
  const totalFinValSP = useMemo(() => financialData.reduce((s, r) => s + r.totalValueSP, 0), [financialData]);
  const totalPotentialProfit = useMemo(() => financialData.reduce((s, r) => s + r.potentialProfit, 0), [financialData]);

  // Profit report per sale item
  const profitData = useMemo(() => {
    const rows: { product: string; qty: number; unit: string; buyPrice: number; sellPrice: number; revenue: number; cost: number; profit: number; margin: number; date: string; customer: string }[] = [];
    for (const sale of filteredSales) {
      for (const item of (sale.sale_items || [])) {
        const prod = products.find(p => p.id === (item as any).product_id);
        const buyPrice = prod?.purchase_price || 0;
        const revenue = item.total_price;
        const cost = buyPrice * item.quantity;
        const profit = buyPrice > 0 ? revenue - cost : 0;
        const margin = revenue > 0 && buyPrice > 0 ? (profit / revenue) * 100 : 0;
        rows.push({
          product: item.product_name, qty: item.quantity, unit: item.unit || '',
          buyPrice, sellPrice: item.unit_price, revenue, cost, profit, margin,
          date: sale.sale_date, customer: sale.customer_name || 'نقدي',
        });
      }
    }
    return rows.sort((a, b) => b.profit - a.profit);
  }, [filteredSales, products]);

  const totalRevenue = useMemo(() => profitData.reduce((s, r) => s + r.revenue, 0), [profitData]);
  const totalCost = useMemo(() => profitData.reduce((s, r) => s + r.cost, 0), [profitData]);
  const totalProfit = useMemo(() => profitData.reduce((s, r) => s + r.profit, 0), [profitData]);
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const workerSummary = useMemo(() => workersData.map(w => {
    const txns = workerTxns.filter(t => t.worker_id === w.id);
    const collected = txns.filter(t => t.type === 'قبض').reduce((s, t) => s + t.amount, 0);
    const advances = txns.filter(t => t.type === 'سلفة').reduce((s, t) => s + t.amount, 0);
    return { ...w, collected, advances, net: advances - collected };
  }), [workersData, workerTxns]);

  // ─── Save PDF ─────────────────────────────────────────────────────────────
  const handleSavePDF = () => {
    interact('click');
    toast.info('في نافذة الطباعة، اختر «حفظ كـ PDF» من قائمة الطابعة');
    handlePrint();
  };

  // ─── Print ─────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    interact('click');
    const win = window.open('', '_blank');
    if (!win) { toast.error('يرجى السماح بالنوافذ المنبثقة في المتصفح'); return; }
    const tabLabel = TABS.find(t => t.id === activeTab)?.label || 'تقرير';
    const dateStr = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    const filterInfo = `${dateFrom ? ` من: ${dateFrom}` : ''}${dateTo ? ` إلى: ${dateTo}` : ''}${selectedWh ? ` | المخزن: ${selectedWh.name}` : ''}`;

    let bodyHTML = '';
    if (activeTab === 'inventory' || activeTab === 'shortages') {
      const data = activeTab === 'inventory' ? filteredInv : shortages;
      bodyHTML = `<div class="kpis">
        <div class="kpi"><div class="kv">${data.length}</div><div class="kl">إجمالي الأصناف</div></div>
        <div class="kpi"><div class="kv">${data.filter(i => i.quantity >= (i.products?.min_stock||0) && i.quantity > 0).length}</div><div class="kl">وفير</div></div>
        <div class="kpi"><div class="kv" style="color:#ca8a04">${data.filter(i => i.quantity > 0 && i.quantity < (i.products?.min_stock||0)).length}</div><div class="kl">منخفض</div></div>
        <div class="kpi"><div class="kv" style="color:#dc2626">${data.filter(i => i.quantity === 0).length}</div><div class="kl">نافد</div></div>
        <div class="kpi"><div class="kv" style="color:#2563eb">${EGP(data.reduce((s,i) => s + i.quantity * (i.products?.purchase_price||0), 0))}</div><div class="kl">قيمة بالشراء</div></div>
      </div>
      <table><thead><tr><th>#</th><th>اسم الصنف</th><th>الكود</th><th>المخزن</th><th>الكمية</th><th>الوحدة</th><th>سعر الشراء</th><th>سعر البيع</th><th>قيمة الشراء</th><th>قيمة البيع</th><th>حد التنبيه</th><th>الحالة</th></tr></thead><tbody>
      ${data.map((i, idx) => {
        const qty = i.quantity||0; const min = i.products?.min_stock||0;
        const pp = i.products?.purchase_price||0; const sp = i.products?.price||0;
        const st = getInvStatus(qty, min);
        const c = st==='وفير'?'#16a34a':st==='منخفض'?'#ca8a04':'#dc2626';
        return `<tr><td>${idx+1}</td><td class="td-product">${i.products?.name||''}</td><td>${i.products?.sku||''}</td><td>${i.warehouses?.name||''}</td><td>${qty}</td><td>${i.products?.unit||''}</td><td>${pp>0?EGP(pp):'—'}</td><td>${sp>0?EGP(sp):'—'}</td><td style="color:#2563eb;font-weight:600">${pp>0?EGP(qty*pp):'—'}</td><td style="color:#16a34a;font-weight:600">${sp>0?EGP(qty*sp):'—'}</td><td>${min}</td><td style="color:${c};font-weight:600">${st}</td></tr>`;
      }).join('')}</tbody></table>`;
    } else if (activeTab === 'profit') {
      bodyHTML = `<div class="kpis">
        <div class="kpi"><div class="kv">${EGP(totalRevenue)}</div><div class="kl">إجمالي المبيعات</div></div>
        <div class="kpi"><div class="kv" style="color:#7c3aed">${EGP(totalCost)}</div><div class="kl">إجمالي التكلفة</div></div>
        <div class="kpi"><div class="kv" style="color:${totalProfit>=0?'#16a34a':'#dc2626'}">${EGP(totalProfit)}</div><div class="kl">صافي الربح</div></div>
        <div class="kpi"><div class="kv" style="color:#ca8a04">${avgMargin.toFixed(1)}%</div><div class="kl">هامش الربح</div></div>
      </div>
      <table><thead><tr><th>#</th><th>اسم الصنف</th><th>العميل</th><th>التاريخ</th><th>الكمية</th><th>سعر الشراء</th><th>سعر البيع</th><th>الإيراد</th><th>التكلفة</th><th>الربح</th><th>الهامش</th></tr></thead><tbody>
      ${profitData.map((r, idx) => `<tr><td>${idx+1}</td><td class="td-product">${r.product}</td><td>${r.customer}</td><td>${r.date}</td><td>${r.qty} ${r.unit}</td><td>${r.buyPrice>0?EGP(r.buyPrice):'—'}</td><td>${EGP(r.sellPrice)}</td><td>${EGP(r.revenue)}</td><td>${r.cost>0?EGP(r.cost):'—'}</td><td style="font-weight:700;color:${r.profit>=0?'#16a34a':'#dc2626'}">${r.buyPrice>0?EGP(r.profit):'—'}</td><td style="color:${r.margin>=0?'#16a34a':'#dc2626'}">${r.buyPrice>0?r.margin.toFixed(1)+'%':'—'}</td></tr>`).join('')}</tbody></table>`;
    } else if (activeTab === 'movement') {
      bodyHTML = `<table><thead><tr><th>#</th><th>اسم الصنف</th><th>الوحدة</th><th>الصادر (مباع)</th><th>الوارد (مشترى)</th></tr></thead><tbody>${productMovement.map((p, i) => `<tr><td>${i+1}</td><td class="td-product">${p.name}</td><td>${p.unit}</td><td>${p.sold}</td><td>${p.purchased}</td></tr>`).join('')}</tbody></table>`;
    } else if (activeTab === 'inbound') {
      const total = filteredPurchases.reduce((s, p) => s + p.total_amount, 0);
      const paid = filteredPurchases.reduce((s, p) => s + p.paid_amount, 0);
      bodyHTML = `<div class="kpis"><div class="kpi"><div class="kv">${filteredPurchases.length}</div><div class="kl">عدد الفواتير</div></div><div class="kpi"><div class="kv">${EGP(total)}</div><div class="kl">الإجمالي</div></div><div class="kpi"><div class="kv" style="color:#16a34a">${EGP(paid)}</div><div class="kl">المدفوع</div></div><div class="kpi"><div class="kv" style="color:#dc2626">${EGP(total-paid)}</div><div class="kl">المتبقي</div></div></div>
      <table><thead><tr><th>#</th><th>التاريخ</th><th>المورد</th><th>المخزن</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th></tr></thead><tbody>${filteredPurchases.map((p, i) => `<tr><td>${i+1}</td><td>${p.purchase_date}</td><td class="td-product">${p.supplier_name||''}</td><td>${p.warehouse_name||''}</td><td>${EGP(p.total_amount)}</td><td style="color:#16a34a">${EGP(p.paid_amount)}</td><td style="color:#dc2626">${EGP(p.total_amount-p.paid_amount)}</td><td>${p.status}</td></tr>`).join('')}</tbody></table>`;
    } else if (activeTab === 'outbound') {
      const total = filteredSales.reduce((s, sl) => s + sl.total_amount, 0);
      const paid = filteredSales.reduce((s, sl) => s + sl.paid_amount, 0);
      bodyHTML = `<div class="kpis"><div class="kpi"><div class="kv">${filteredSales.length}</div><div class="kl">عدد الفواتير</div></div><div class="kpi"><div class="kv">${EGP(total)}</div><div class="kl">الإجمالي</div></div><div class="kpi"><div class="kv" style="color:#16a34a">${EGP(paid)}</div><div class="kl">المحصّل</div></div><div class="kpi"><div class="kv" style="color:#8b5cf6">${EGP(filteredSales.reduce((s,sl)=>s+sl.discount,0))}</div><div class="kl">الخصومات</div></div></div>
      <table><thead><tr><th>#</th><th>التاريخ</th><th>العميل</th><th>المخزن</th><th>الأصناف</th><th>الإجمالي</th><th>المحصّل</th><th>الحالة</th></tr></thead><tbody>${filteredSales.map((s, i) => {
        const items = (s.sale_items || []).map(it => `${it.product_name} ×${it.quantity}`).join('، ');
        return `<tr><td>${i+1}</td><td>${s.sale_date}</td><td class="td-product">${s.customer_name||''}</td><td>${s.warehouse_name||''}</td><td style="font-size:11px;color:#374151">${items||'—'}</td><td>${EGP(s.total_amount)}</td><td style="color:#16a34a">${EGP(s.paid_amount)}</td><td>${s.status}</td></tr>`;
      }).join('')}</tbody></table>`;
    } else if (activeTab === 'transfers') {
      bodyHTML = `<div class="kpis"><div class="kpi"><div class="kv">${filteredTransfers.length}</div><div class="kl">التحويلات</div></div><div class="kpi"><div class="kv" style="color:#16a34a">${filteredTransfers.filter(t=>t.status==='مكتمل').length}</div><div class="kl">مكتملة</div></div></div>
      <table><thead><tr><th>#</th><th>التاريخ</th><th>من المخزن</th><th>إلى المخزن</th><th>الأصناف</th><th>السائق</th><th>الحالة</th></tr></thead><tbody>${filteredTransfers.map((t, i) => `<tr><td>${i+1}</td><td>${new Date(t.created_at).toLocaleDateString('ar-EG')}</td><td>${t.from_warehouse_name||''}</td><td>${t.to_warehouse_name||''}</td><td>${t.total_items}</td><td>${t.driver_name||''}</td><td>${t.status}</td></tr>`).join('')}</tbody></table>`;
    } else if (activeTab === 'financial') {
      bodyHTML = `<div class="kpis"><div class="kpi"><div class="kv">${EGP(totalFinValPP)}</div><div class="kl">قيمة بسعر الشراء</div></div><div class="kpi"><div class="kv" style="color:#16a34a">${EGP(totalFinValSP)}</div><div class="kl">قيمة بسعر البيع</div></div><div class="kpi"><div class="kv" style="color:#ca8a04">${EGP(totalPotentialProfit)}</div><div class="kl">ربح محتمل</div></div></div>
      <table><thead><tr><th>#</th><th>اسم الصنف</th><th>المخزن</th><th>الكمية</th><th>سعر الشراء</th><th>سعر البيع</th><th>قيمة الشراء</th><th>قيمة البيع</th><th>ربح محتمل</th></tr></thead><tbody>${financialData.map((r, i) => `<tr><td>${i+1}</td><td class="td-product">${r.productName}</td><td>${r.warehouseName}</td><td>${r.quantity}</td><td>${EGP(r.purchasePrice)}</td><td>${r.salePrice>0?EGP(r.salePrice):'—'}</td><td style="color:#2563eb;font-weight:600">${EGP(r.totalValuePP)}</td><td style="color:#16a34a;font-weight:600">${r.totalValueSP>0?EGP(r.totalValueSP):'—'}</td><td style="color:#ca8a04;font-weight:600">${r.potentialProfit>0?EGP(r.potentialProfit):'—'}</td></tr>`).join('')}</tbody></table>`;
    } else if (activeTab === 'damaged') {
      const totalCost = damages.reduce((s, d) => s + (d.quantity * (d.unit_cost || 0)), 0);
      bodyHTML = `<div class="kpis"><div class="kpi"><div class="kv" style="color:#dc2626">${damages.length}</div><div class="kl">السجلات</div></div><div class="kpi"><div class="kv" style="color:#f97316">${damages.reduce((s,d)=>s+d.quantity,0)}</div><div class="kl">الكميات التالفة</div></div>${totalCost>0?`<div class="kpi"><div class="kv" style="color:#dc2626">${EGP(totalCost)}</div><div class="kl">تكلفة الهالك</div></div>`:''}</div>
      <table><thead><tr><th>#</th><th>التاريخ</th><th>اسم المنتج</th><th>المخزن</th><th>الكمية</th><th>الوحدة</th><th>سعر التكلفة</th><th>القيمة المفقودة</th><th>السبب</th></tr></thead><tbody>${damages.map((d, i) => `<tr><td>${i+1}</td><td>${d.damage_date}</td><td class="td-product">${d.product_name}</td><td>${d.warehouse_name||''}</td><td>${d.quantity}</td><td>${d.unit||''}</td><td>${d.unit_cost?EGP(d.unit_cost):'—'}</td><td style="color:#dc2626;font-weight:600">${d.unit_cost?EGP(d.quantity*(d.unit_cost||0)):'—'}</td><td>${d.reason||''}</td></tr>`).join('')}</tbody></table>`;
    } else if (activeTab === 'workers') {
      bodyHTML = `<div class="kpis"><div class="kpi"><div class="kv">${workersData.length}</div><div class="kl">العمال</div></div><div class="kpi"><div class="kv" style="color:#16a34a">${EGP(workerTxns.filter(t=>t.type==='قبض').reduce((s,t)=>s+t.amount,0))}</div><div class="kl">المقبوض</div></div><div class="kpi"><div class="kv" style="color:#ca8a04">${EGP(workerTxns.filter(t=>t.type==='سلفة').reduce((s,t)=>s+t.amount,0))}</div><div class="kl">السلف</div></div></div>
      <table><thead><tr><th>#</th><th>العامل</th><th>الوظيفة</th><th>الهاتف</th><th>الحد الأقصى</th><th>المقبوض</th><th>السلف</th><th>المستحق</th></tr></thead><tbody>${workerSummary.map((w, i) => `<tr><td>${i+1}</td><td class="td-product">${w.full_name||w.username||'—'}</td><td>${w.role}</td><td>${w.phone||'—'}</td><td>${w.max_salary?EGP(w.max_salary):'—'}</td><td style="color:#16a34a">${w.collected>0?EGP(w.collected):'—'}</td><td style="color:#ca8a04">${w.advances>0?EGP(w.advances):'—'}</td><td style="color:#dc2626">${w.net>0?EGP(w.net):'—'}</td></tr>`).join('')}</tbody></table>`;
    }

    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"/><title>${tabLabel} — الإمري</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Cairo',Arial,sans-serif;direction:rtl;background:#fff;color:#1a1a1a;font-size:13px;min-height:100vh;display:flex;flex-direction:column}
.rpt-hdr{background:#1d6b6b;color:#fff;padding:16px 24px;display:flex;align-items:center;justify-content:space-between}
.rpt-hdr-title{font-size:24px;font-weight:900;letter-spacing:-1px}
.rpt-hdr-sub{font-size:10.5px;color:rgba(255,255,255,.65);margin-top:3px}
.rpt-hdr-right{text-align:left;font-size:11.5px;color:rgba(255,255,255,.9);line-height:2}
.rpt-tab-banner{background:#f0fafa;border-bottom:2px solid #1d6b6b;padding:10px 24px;display:flex;align-items:center;gap:10px}
.rpt-tab-label{font-size:16px;font-weight:700;color:#1d6b6b}
.rpt-tab-filter{font-size:11.5px;color:#64748b}
.rpt-body{padding:16px 24px;flex:1}
.kpis{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap}
.kpi{border:1.5px solid #c8e8e8;border-radius:10px;padding:10px 14px;min-width:130px;background:#f0fafa}
.kv{font-size:17px;font-weight:700;color:#1d6b6b}
.kl{font-size:11px;color:#64748b;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:12.5px}
thead tr{background:#1d6b6b}
th{padding:9px 10px;text-align:right;font-weight:700;color:#fff;white-space:nowrap;font-size:12px}
th:first-child{width:36px;text-align:center}
td{padding:8px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
td:first-child{text-align:center;color:#94a3b8;font-size:11px}
.td-product{font-size:13px;font-weight:700;color:#1a1a1a}
tr:nth-child(even) td{background:#f8fafa}
.rpt-footer{background:#1d6b6b;color:#fff;padding:14px 24px;text-align:center;margin-top:auto}
.rpt-footer strong{font-size:20px;font-weight:900;display:block;margin-bottom:3px}
.rpt-footer p{font-size:11px;color:rgba(255,255,255,.65)}
@media print{body{min-height:0}@page{margin:0;size:A4 landscape}}
</style></head>
<body>
<div class="rpt-hdr">
  <div>
    <div class="rpt-hdr-title">الإمري</div>
    <div class="rpt-hdr-sub">${COMPANY_INFO.subname}</div>
  </div>
  <div class="rpt-hdr-right">
    تاريخ الإصدار: ${dateStr}<br>
    📞 ${COMPANY_INFO.phone} | 📍 ${COMPANY_INFO.address}
  </div>
</div>
<div class="rpt-tab-banner">
  <div class="rpt-tab-label">${tabLabel}</div>
  ${filterInfo ? `<div class="rpt-tab-filter">${filterInfo}</div>` : ''}
</div>
<div class="rpt-body">${bodyHTML}</div>
<div class="rpt-footer">
  <strong>الإمري — ${tabLabel}</strong>
  <p>طُبع في: ${new Date().toLocaleString('ar-EG')}</p>
</div>
</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  };

  // ─── CSV Export ────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    interact('success');
    let headers: string[] = [];
    let rows: string[][] = [];
    let filename = activeTab;

    if (activeTab === 'inventory' || activeTab === 'shortages') {
      const data = activeTab === 'inventory' ? filteredInv : shortages;
      headers = ['المنتج', 'الكود', 'المخزن', 'الكمية', 'الوحدة', 'سعر الشراء', 'سعر البيع', 'قيمة الشراء', 'حد التنبيه', 'الحالة'];
      rows = data.map(i => { const qty=i.quantity||0; const min=i.products?.min_stock||0; const pp=i.products?.purchase_price||0; const sp=i.products?.price||0; return [i.products?.name||'', i.products?.sku||'', i.warehouses?.name||'', String(qty), i.products?.unit||'', String(pp), String(sp), String(qty*pp), String(min), getInvStatus(qty, min)]; });
    } else if (activeTab === 'profit') {
      headers = ['المنتج', 'العميل', 'التاريخ', 'الكمية', 'سعر الشراء', 'سعر البيع', 'الإيراد', 'التكلفة', 'الربح', 'هامش الربح %'];
      rows = profitData.map(r => [r.product, r.customer, r.date, String(r.qty), String(r.buyPrice), String(r.sellPrice), String(r.revenue), String(r.cost), String(r.profit), r.buyPrice > 0 ? r.margin.toFixed(1) : '—']);
    } else if (activeTab === 'inbound') {
      headers = ['التاريخ', 'المورد', 'المخزن', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة'];
      rows = filteredPurchases.map(p => [p.purchase_date, p.supplier_name||'', p.warehouse_name||'', String(p.total_amount), String(p.paid_amount), String(p.total_amount-p.paid_amount), p.status]);
    } else if (activeTab === 'outbound') {
      headers = ['التاريخ', 'العميل', 'المخزن', 'الإجمالي', 'المحصّل', 'الخصم', 'الحالة'];
      rows = filteredSales.map(s => [s.sale_date, s.customer_name||'', s.warehouse_name||'', String(s.total_amount), String(s.paid_amount), String(s.discount), s.status]);
    } else if (activeTab === 'financial') {
      headers = ['المنتج', 'المخزن', 'الكمية', 'سعر الشراء', 'سعر البيع', 'قيمة الشراء', 'قيمة البيع', 'ربح محتمل'];
      rows = financialData.map(r => [r.productName, r.warehouseName, String(r.quantity), String(r.purchasePrice), String(r.salePrice), String(r.totalValuePP), String(r.totalValueSP), String(r.potentialProfit)]);
    } else if (activeTab === 'damaged') {
      headers = ['التاريخ', 'المنتج', 'المخزن', 'الكمية', 'الوحدة', 'سعر التكلفة', 'القيمة المفقودة', 'السبب'];
      rows = damages.map(d => [d.damage_date, d.product_name, d.warehouse_name||'', String(d.quantity), d.unit||'', String(d.unit_cost||0), String(d.quantity*(d.unit_cost||0)), d.reason||'']);
    } else if (activeTab === 'workers') {
      headers = ['العامل', 'الوظيفة', 'الهاتف', 'الحد الأقصى', 'المقبوض', 'السلف', 'المستحق'];
      rows = workerSummary.map(w => [w.full_name||w.username||'', w.role, w.phone||'', String(w.max_salary||0), String(w.collected), String(w.advances), String(w.net)]);
    }

    if (headers.length === 0) { toast.error('هذا التقرير لا يدعم التصدير بعد'); return; }
    const csv = '\uFEFF' + [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success('تم تصدير التقرير');
  };

  if (invLoad) return (
    <div className="flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 gradient-blue rounded-xl animate-pulse" />
        <p className="text-sm text-muted-foreground">جاري تحميل البيانات...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* ─── Filters Bar ─── */}
      <div className="bg-white rounded-2xl p-4 border border-border shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />من تاريخ</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-blue-400" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />إلى تاريخ</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-blue-400" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">المخزن</label>
            <select value={warehouseFilter} onChange={e => setWarehouseFilter(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-blue-400 min-w-32">
              <option value="">كل المخازن</option>
              {warehouses.map((w: WhOpt) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-40">
            <label className="text-xs text-muted-foreground">بحث</label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="text" placeholder="اسم المنتج أو المورد أو العميل..." value={productSearch} onChange={e => setProductSearch(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 pr-10 pl-3 text-sm focus:outline-none focus:border-blue-400" />
            </div>
          </div>
          {(dateFrom || dateTo || warehouseFilter || productSearch) && (
            <button className="px-3 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200"
              onClick={() => { setDateFrom(''); setDateTo(''); setWarehouseFilter(''); setProductSearch(''); }}>
              مسح الفلاتر
            </button>
          )}
          <div className="flex gap-2 mr-auto">
            <button className="icon-btn gap-2 px-3 py-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-xl text-sm font-medium border border-gray-200" onClick={handleExportCSV}>
              <Download className="w-4 h-4" /><span className="hidden sm:inline">CSV</span>
            </button>
            <button className="icon-btn gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-sm font-semibold" onClick={handlePrint}>
              <Printer className="w-4 h-4" /><span className="hidden sm:inline">طباعة</span>
            </button>
            <button className="icon-btn gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold" onClick={handleSavePDF}>
              <FileDown className="w-4 h-4" /><span className="hidden sm:inline">PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── Tab Navigation ─── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => { interact('click'); setActiveTab(tab.id); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 border',
                isActive
                  ? 'text-white border-transparent shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-[#1d6b6b]/40 hover:text-[#1d6b6b]'
              )}
              style={isActive ? { background: 'linear-gradient(135deg, #1d6b6b 0%, #2a8f8f 100%)', border: 'none' } : {}}>
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{tab.label}</span>
              <span className="md:hidden">{tab.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* ══ Tab: جرد المخزون ══ */}
      {activeTab === 'inventory' && (
        <div className="space-y-4 animate-fade-up">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="إجمالي الأصناف" value={filteredInv.length} color="border-blue-200 bg-blue-50/60" />
            <KpiCard label="وفير" value={filteredInv.filter(i => i.quantity >= (i.products?.min_stock||0) && i.quantity > 0).length} color="border-emerald-200 bg-emerald-50/60" />
            <KpiCard label="منخفض" value={filteredInv.filter(i => i.quantity > 0 && i.quantity < (i.products?.min_stock||0)).length} color="border-amber-200 bg-amber-50/60" />
            <KpiCard label="نافد" value={filteredInv.filter(i => i.quantity === 0).length} color="border-red-200 bg-red-50/60" />
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-white">
                  <tr>{['اسم المنتج', 'المخزن', 'الكمية', 'سعر الشراء', 'سعر البيع', 'قيمة (شراء)', 'قيمة (بيع)', 'حد التنبيه', 'الحالة'].map(c => <th key={c} className="px-4 py-3 text-right font-semibold text-xs whitespace-nowrap">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {filteredInv.map((item, i) => {
                    const qty = item.quantity||0; const min = item.products?.min_stock||0;
                    const pp = item.products?.purchase_price||0; const sp = item.products?.price||0;
                    const status = getInvStatus(qty, min);
                    return (
                      <tr key={item.id} className="border-b border-gray-50 hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3"><p className="font-bold text-sm text-gray-900">{item.products?.name||'—'}</p><p className="text-xs text-gray-400">{item.products?.sku}</p></td>
                        <td className="px-4 py-3 text-sm text-gray-500">{item.warehouses?.name||'—'}</td>
                        <td className="px-4 py-3"><span className={`font-bold text-sm ${status === 'نافد' ? 'text-red-500' : status === 'منخفض' ? 'text-amber-500' : 'text-emerald-600'}`}>{qty}<span className="text-xs font-normal text-gray-400 mr-1">{item.products?.unit}</span></span></td>
                        <td className="px-4 py-3 text-sm text-gray-500">{pp > 0 ? EGP(pp) : '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{sp > 0 ? EGP(sp) : '—'}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-blue-600">{pp > 0 ? EGP(qty * pp) : '—'}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-emerald-600">{sp > 0 ? EGP(qty * sp) : '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-400">{min}</td>
                        <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-lg border font-medium ${getInvClass(status)}`}>{status}</span></td>
                      </tr>
                    );
                  })}
                  {filteredInv.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">لا توجد بيانات</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ Tab: النواقص ══ */}
      {activeTab === 'shortages' && (
        <div className="space-y-4 animate-fade-up">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard label="إجمالي النواقص" value={shortages.length} color="border-red-200 bg-red-50/60" />
            <KpiCard label="نافد تماماً" value={shortages.filter(i=>i.quantity===0).length} color="border-red-200 bg-red-50/60" />
            <KpiCard label="أقل من الحد" value={shortages.filter(i=>i.quantity>0).length} color="border-amber-200 bg-amber-50/60" />
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-white">
                  <tr>{['اسم المنتج', 'المخزن', 'الكمية الحالية', 'حد التنبيه', 'النقص المطلوب', 'الحالة'].map(c => <th key={c} className="px-4 py-3 text-right font-semibold text-xs">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {shortages.map((item, i) => {
                    const qty = item.quantity||0; const min = item.products?.min_stock||0;
                    return (
                      <tr key={item.id} className="border-b border-gray-50 hover:bg-slate-50/60">
                        <td className="px-4 py-3"><p className="font-bold text-gray-900">{item.products?.name||'—'}</p><p className="text-xs text-gray-400">{item.products?.sku}</p></td>
                        <td className="px-4 py-3 text-gray-500">{item.warehouses?.name||'—'}</td>
                        <td className="px-4 py-3 font-bold text-red-500">{qty}<span className="text-xs font-normal text-gray-400 mr-1">{item.products?.unit}</span></td>
                        <td className="px-4 py-3 text-gray-400">{min}</td>
                        <td className="px-4 py-3 font-bold text-amber-500">+{min - qty}</td>
                        <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-lg border font-medium ${getInvClass(getInvStatus(qty, min))}`}>{getInvStatus(qty, min)}</span></td>
                      </tr>
                    );
                  })}
                  {shortages.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-emerald-600 text-sm font-medium">المخزون في مستوى جيد — لا توجد نواقص</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ Tab: تقرير الأرباح ══ */}
      {activeTab === 'profit' && (
        <div className="space-y-4 animate-fade-up">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="إجمالي المبيعات" value={EGP(totalRevenue)} color="border-blue-200 bg-blue-50/60" />
            <KpiCard label="إجمالي التكلفة" value={EGP(totalCost)} color="border-violet-200 bg-violet-50/60" />
            <KpiCard label="صافي الربح" value={EGP(totalProfit)} color={totalProfit >= 0 ? "border-emerald-200 bg-emerald-50/60" : "border-red-200 bg-red-50/60"} />
            <KpiCard label="هامش الربح" value={`${avgMargin.toFixed(1)}%`} color="border-amber-200 bg-amber-50/60" sub={profitData.length + ' بند'} />
          </div>
          {profitData.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 text-center">
              لا توجد بيانات أرباح — تأكد من إدخال سعر الشراء للمنتجات وتحديد فترة زمنية
            </div>
          )}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-white">
                  <tr>{['اسم الصنف', 'العميل', 'التاريخ', 'الكمية', 'سعر الشراء', 'سعر البيع', 'الإيراد', 'التكلفة', 'الربح', 'الهامش %'].map(c => <th key={c} className="px-3 py-3 text-right font-semibold text-xs whitespace-nowrap">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {profitData.map((r, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-slate-50/60">
                      <td className="px-3 py-3 font-bold text-gray-900">{r.product}</td>
                      <td className="px-3 py-3 text-gray-500 text-xs">{r.customer}</td>
                      <td className="px-3 py-3 text-gray-400 text-xs whitespace-nowrap">{r.date}</td>
                      <td className="px-3 py-3 text-gray-700">{r.qty} {r.unit}</td>
                      <td className="px-3 py-3 text-gray-400">{r.buyPrice > 0 ? EGP(r.buyPrice) : '—'}</td>
                      <td className="px-3 py-3 text-gray-700">{EGP(r.sellPrice)}</td>
                      <td className="px-3 py-3 font-semibold text-blue-600">{EGP(r.revenue)}</td>
                      <td className="px-3 py-3 text-violet-500">{r.cost > 0 ? EGP(r.cost) : '—'}</td>
                      <td className="px-3 py-3"><span className={`font-bold ${r.buyPrice > 0 ? (r.profit >= 0 ? 'text-emerald-600' : 'text-red-500') : 'text-gray-300'}`}>{r.buyPrice > 0 ? EGP(r.profit) : '—'}</span></td>
                      <td className="px-3 py-3"><span className={`text-sm font-bold ${r.buyPrice > 0 ? (r.margin >= 0 ? 'text-emerald-600' : 'text-red-500') : 'text-gray-300'}`}>{r.buyPrice > 0 ? r.margin.toFixed(1) + '%' : '—'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ Tab: حركة الأصناف ══ */}
      {activeTab === 'movement' && (
        <div className="space-y-4 animate-fade-up">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard label="أصناف متحركة" value={productMovement.length} color="border-violet-200 bg-violet-50/60" />
            <KpiCard label="إجمالي الصادر" value={saleItems.reduce((s,i)=>s+i.quantity,0).toLocaleString()} color="border-amber-200 bg-amber-50/60" />
            <KpiCard label="إجمالي الوارد" value={purchaseItems.reduce((s,i)=>s+i.quantity,0).toLocaleString()} color="border-emerald-200 bg-emerald-50/60" />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            {[
              { title: 'الأكثر مبيعاً', icon: BarChart3, color: 'text-amber-500', data: productMovement.slice(0, 15) },
              { title: 'الأقل حركة', icon: TrendingDown, color: 'text-blue-500', data: [...productMovement].sort((a,b) => a.sold - b.sold).slice(0, 15) },
            ].map(({ title, icon: Icon, color, data }) => (
              <div key={title} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 bg-gray-50/60">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <h3 className="font-bold text-gray-800 text-sm">{title}</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800 text-white">
                      <tr>{['#', 'اسم الصنف', 'الوحدة', 'مباع', 'مشترى'].map(c => <th key={c} className="px-4 py-2.5 text-right font-semibold text-xs">{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {data.map((p, i) => (
                        <tr key={p.name} className="border-b border-gray-50 hover:bg-slate-50/60">
                          <td className="px-4 py-2.5 text-xs text-gray-400">{i+1}</td>
                          <td className="px-4 py-2.5 font-semibold text-gray-800">{p.name}</td>
                          <td className="px-4 py-2.5 text-gray-400">{p.unit}</td>
                          <td className="px-4 py-2.5 font-bold text-amber-500">{p.sold.toLocaleString()}</td>
                          <td className="px-4 py-2.5 font-bold text-emerald-600">{p.purchased.toLocaleString()}</td>
                        </tr>
                      ))}
                      {data.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">لا توجد بيانات</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ Tab: الوارد ══ */}
      {activeTab === 'inbound' && (
        <div className="space-y-4 animate-fade-up">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="عدد الفواتير" value={filteredPurchases.length} color="border-blue-200 bg-blue-50/60" />
            <KpiCard label="الإجمالي" value={EGP(filteredPurchases.reduce((s,p)=>s+p.total_amount,0))} color="border-emerald-200 bg-emerald-50/60" />
            <KpiCard label="المدفوع" value={EGP(filteredPurchases.reduce((s,p)=>s+p.paid_amount,0))} color="border-amber-200 bg-amber-50/60" />
            <KpiCard label="المتبقي" value={EGP(filteredPurchases.reduce((s,p)=>s+(p.total_amount-p.paid_amount),0))} color="border-red-200 bg-red-50/60" />
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-white">
                  <tr>{['التاريخ', 'المورد', 'المخزن', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة'].map(c => <th key={c} className="px-4 py-3 text-right font-semibold text-xs">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {filteredPurchases.map((p, i) => (
                    <tr key={p.id} className="border-b border-gray-50 hover:bg-slate-50/60">
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{p.purchase_date}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{p.supplier_name||'—'}</td>
                      <td className="px-4 py-3 text-gray-500">{p.warehouse_name||'—'}</td>
                      <td className="px-4 py-3 font-bold text-gray-900">{EGP(p.total_amount)}</td>
                      <td className="px-4 py-3 font-bold text-emerald-600">{EGP(p.paid_amount)}</td>
                      <td className="px-4 py-3 font-bold text-red-500">{EGP(p.total_amount-p.paid_amount)}</td>
                      <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-lg border font-medium ${SC[p.status]||''}`}>{p.status}</span></td>
                    </tr>
                  ))}
                  {filteredPurchases.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">لا توجد بيانات</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ Tab: الصادر ══ */}
      {activeTab === 'outbound' && (
        <div className="space-y-4 animate-fade-up">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="عدد الفواتير" value={filteredSales.length} color="border-blue-200 bg-blue-50/60" />
            <KpiCard label="الإجمالي" value={EGP(filteredSales.reduce((s,sl)=>s+sl.total_amount,0))} color="border-amber-200 bg-amber-50/60" />
            <KpiCard label="المحصّل" value={EGP(filteredSales.reduce((s,sl)=>s+sl.paid_amount,0))} color="border-emerald-200 bg-emerald-50/60" />
            <KpiCard label="الخصومات" value={EGP(filteredSales.reduce((s,sl)=>s+sl.discount,0))} color="border-violet-200 bg-violet-50/60" />
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-white">
                  <tr>{['التاريخ', 'العميل', 'المخزن', 'الأصناف', 'الإجمالي', 'المحصّل', 'الخصم', 'الحالة'].map(c => <th key={c} className="px-4 py-3 text-right font-semibold text-xs">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {filteredSales.map((s, i) => {
                    const items = s.sale_items || [];
                    return (
                      <tr key={s.id} className="border-b border-gray-50 hover:bg-slate-50/60">
                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{s.sale_date}</td>
                        <td className="px-4 py-3 font-semibold text-gray-800">{s.customer_name||'—'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{s.warehouse_name||'—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {items.map((it, j) => (
                              <span key={j} className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-md font-semibold">
                                {it.product_name} ×{it.quantity}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-bold text-gray-900">{EGP(s.total_amount)}</td>
                        <td className="px-4 py-3 font-bold text-emerald-600">{EGP(s.paid_amount)}</td>
                        <td className="px-4 py-3 text-violet-500">{s.discount > 0 ? EGP(s.discount) : '—'}</td>
                        <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-lg border font-medium ${SC[s.status]||''}`}>{s.status}</span></td>
                      </tr>
                    );
                  })}
                  {filteredSales.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">لا توجد بيانات</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ Tab: التحويلات ══ */}
      {activeTab === 'transfers' && (
        <div className="space-y-4 animate-fade-up">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="الإجمالي" value={filteredTransfers.length} color="border-blue-200 bg-blue-50/60" />
            <KpiCard label="مكتملة" value={filteredTransfers.filter(t=>t.status==='مكتمل').length} color="border-emerald-200 bg-emerald-50/60" />
            <KpiCard label="قيد التنفيذ" value={filteredTransfers.filter(t=>t.status==='قيد التنفيذ').length} color="border-amber-200 bg-amber-50/60" />
            <KpiCard label="معلقة" value={filteredTransfers.filter(t=>t.status==='معلق').length} color="border-red-200 bg-red-50/60" />
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-white">
                  <tr>{['التاريخ', 'من المخزن', 'إلى المخزن', 'الأصناف', 'السائق', 'الحالة'].map(c => <th key={c} className="px-4 py-3 text-right font-semibold text-xs">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {filteredTransfers.map((t, i) => (
                    <tr key={t.id} className="border-b border-gray-50 hover:bg-slate-50/60">
                      <td className="px-4 py-3 text-gray-400 text-xs">{new Date(t.created_at).toLocaleDateString('ar-EG')}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{t.from_warehouse_name||'—'}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{t.to_warehouse_name||'—'}</td>
                      <td className="px-4 py-3 font-bold text-blue-600">{t.total_items}</td>
                      <td className="px-4 py-3 text-gray-500">{t.driver_name||'—'}</td>
                      <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-lg border font-medium ${SC[t.status]||''}`}>{t.status}</span></td>
                    </tr>
                  ))}
                  {filteredTransfers.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">لا توجد تحويلات</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ Tab: التقييم المالي ══ */}
      {activeTab === 'financial' && (
        <div className="space-y-4 animate-fade-up">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard label="قيمة المخزون (شراء)" value={EGP(totalFinValPP)} color="border-blue-200 bg-blue-50/60" />
            <KpiCard label="قيمة المخزون (بيع)" value={EGP(totalFinValSP)} color="border-emerald-200 bg-emerald-50/60" />
            <KpiCard label="الربح المحتمل" value={EGP(totalPotentialProfit)} color="border-amber-200 bg-amber-50/60" />
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-white">
                  <tr>{['اسم الصنف', 'المخزن', 'الكمية', 'سعر الشراء', 'سعر البيع', 'قيمة (شراء)', 'قيمة (بيع)', 'ربح محتمل'].map(c => <th key={c} className="px-4 py-3 text-right font-semibold text-xs">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {financialData.map((r, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-slate-50/60">
                      <td className="px-4 py-3"><p className="font-bold text-gray-900">{r.productName}</p><p className="text-xs text-gray-400">{r.sku}</p></td>
                      <td className="px-4 py-3 text-gray-500">{r.warehouseName}</td>
                      <td className="px-4 py-3 font-semibold text-gray-700">{r.quantity.toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-400">{EGP(r.purchasePrice)}</td>
                      <td className="px-4 py-3 text-gray-400">{r.salePrice > 0 ? EGP(r.salePrice) : '—'}</td>
                      <td className="px-4 py-3 font-bold text-blue-600">{EGP(r.totalValuePP)}</td>
                      <td className="px-4 py-3 font-bold text-emerald-600">{r.totalValueSP > 0 ? EGP(r.totalValueSP) : '—'}</td>
                      <td className="px-4 py-3 font-bold text-amber-500">{r.potentialProfit > 0 ? EGP(r.potentialProfit) : '—'}</td>
                    </tr>
                  ))}
                  {financialData.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">لا توجد بيانات — تأكد من إدخال سعر الشراء للمنتجات</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ Tab: الهالك والتالف ══ */}
      {activeTab === 'damaged' && (
        <div className="space-y-4 animate-fade-up">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="grid grid-cols-2 gap-3 flex-1">
              <KpiCard label="سجلات الهالك" value={damages.length} color="border-red-200 bg-red-50/60" />
              <KpiCard label="الكميات التالفة" value={damages.reduce((s,d)=>s+d.quantity,0).toLocaleString()} color="border-orange-200 bg-orange-50/60" />
            </div>
            <button className="icon-btn gap-2 px-4 py-3 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-semibold hover:bg-red-100 flex-shrink-0"
              onClick={() => { interact('add'); setShowDamageForm(true); }}>
              <Plus className="w-4 h-4" />تسجيل هالك
            </button>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-white">
                  <tr>{['التاريخ', 'اسم المنتج', 'المخزن', 'الكمية', 'الوحدة', 'سعر التكلفة', 'القيمة المفقودة', 'السبب', ''].map(c => <th key={c} className="px-4 py-3 text-right font-semibold text-xs">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {damages.map((d, i) => (
                    <tr key={d.id} className="border-b border-gray-50 hover:bg-slate-50/60">
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{d.damage_date}</td>
                      <td className="px-4 py-3 font-bold text-gray-900">{d.product_name}</td>
                      <td className="px-4 py-3 text-gray-500">{d.warehouse_name||'—'}</td>
                      <td className="px-4 py-3 font-bold text-red-500">{d.quantity}</td>
                      <td className="px-4 py-3 text-gray-400">{d.unit||'—'}</td>
                      <td className="px-4 py-3 text-gray-400">{d.unit_cost ? EGP(d.unit_cost) : '—'}</td>
                      <td className="px-4 py-3 font-bold text-red-600">{d.unit_cost ? EGP(d.quantity * d.unit_cost) : '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{d.reason||'—'}</td>
                      <td className="px-4 py-3">
                        <button className="icon-btn w-7 h-7 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg" onClick={() => delDamageMutation.mutate(d.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {damages.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">لا توجد سجلات هالك</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ Tab: تقرير العمال ══ */}
      {activeTab === 'workers' && (
        <div className="space-y-4 animate-fade-up">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="إجمالي العمال" value={workersData.length} color="border-blue-200 bg-blue-50/60" />
            <KpiCard label="نشطون" value={workersData.filter(w=>w.active!==false).length} color="border-emerald-200 bg-emerald-50/60" />
            <KpiCard label="إجمالي المقبوض" value={EGP(workerTxns.filter(t=>t.type==='قبض').reduce((s,t)=>s+t.amount,0))} color="border-emerald-200 bg-emerald-50/60" />
            <KpiCard label="إجمالي السلف" value={EGP(workerTxns.filter(t=>t.type==='سلفة').reduce((s,t)=>s+t.amount,0))} color="border-amber-200 bg-amber-50/60" />
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-white">
                  <tr>{['العامل', 'الوظيفة', 'الهاتف', 'الحد الأقصى', 'المقبوض', 'السلف', 'المستحق', 'الحالة'].map(c => <th key={c} className="px-4 py-3 text-right font-semibold text-xs">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {workerSummary.map((w, i) => {
                    const roleMap: Record<string,string> = { admin:'مدير', warehouse_manager:'مدير مخزن', driver:'سائق', worker:'عامل', boss:'الرئيس' };
                    return (
                      <tr key={w.id} className="border-b border-gray-50 hover:bg-slate-50/60">
                        <td className="px-4 py-3"><p className="font-bold text-gray-900">{w.full_name||w.username||'—'}</p><p className="text-xs text-gray-400">{w.email}</p></td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{roleMap[w.role]||w.role}</td>
                        <td className="px-4 py-3 text-gray-400">{w.phone||'—'}</td>
                        <td className="px-4 py-3 text-gray-600">{w.max_salary ? EGP(w.max_salary) : '—'}</td>
                        <td className="px-4 py-3 font-bold text-emerald-600">{w.collected > 0 ? EGP(w.collected) : '—'}</td>
                        <td className="px-4 py-3 font-bold text-amber-500">{w.advances > 0 ? EGP(w.advances) : '—'}</td>
                        <td className="px-4 py-3 font-bold text-red-500">{w.net > 0 ? EGP(w.net) : '—'}</td>
                        <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-lg border font-medium ${w.active !== false ? 'text-emerald-700 bg-emerald-100 border-emerald-200' : 'text-red-700 bg-red-100 border-red-200'}`}>{w.active !== false ? 'نشط' : 'معطّل'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Damage Form Modal ── */}
      {showDamageForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl border border-gray-200 shadow-xl p-6 animate-fade-up">
            <h2 className="text-lg font-bold text-gray-900 mb-5">تسجيل هالك / تالف</h2>
            <div className="space-y-3">
              {[
                { label: 'اسم المنتج *', key: 'product_name', type: 'text' },
                { label: 'المخزن', key: 'warehouse_name', type: 'text' },
                { label: 'الكمية *', key: 'quantity', type: 'number' },
                { label: 'الوحدة', key: 'unit', type: 'text' },
                { label: 'سعر التكلفة للوحدة', key: 'unit_cost', type: 'number' },
                { label: 'سبب الهالك', key: 'reason', type: 'text' },
                { label: 'تاريخ الهالك', key: 'damage_date', type: 'date' },
              ].map(({ label, key, type }) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500">{label}</label>
                  <input type={type} value={String(damageForm[key as keyof typeof damageForm])}
                    onChange={e => setDamageForm(p => ({ ...p, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
                    className="bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-blue-400" />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 font-semibold"
                onClick={() => {
                  if (!damageForm.product_name || !damageForm.quantity) { toast.error('يرجى تعبئة البيانات المطلوبة'); return; }
                  addDamageMutation.mutate(damageForm);
                }} disabled={addDamageMutation.isPending}>
                تسجيل الهالك
              </button>
              <button className="flex-1 bg-gray-100 text-gray-600 rounded-xl py-2.5 hover:bg-gray-200" onClick={() => { interact('click'); setShowDamageForm(false); }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
