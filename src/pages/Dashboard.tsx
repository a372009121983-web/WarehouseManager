import { useNavigate } from 'react-router-dom';
import {
  Warehouse, Package, TrendingUp, TrendingDown,
  DollarSign, ShoppingCart, ArrowLeftRight, AlertTriangle,
  ChevronLeft, CheckCircle, Clock,
} from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

const EGP = (v: number) =>
  v === 0 ? '٠ ج.م' : v.toLocaleString('ar-EG', { minimumFractionDigits: 0 }) + ' ج.م';

const today = () => new Date().toISOString().split('T')[0];
const thisMonthStart = () => new Date().toISOString().slice(0, 7) + '-01';

// ── Custom Tooltip ────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2.5 text-xs">
      <p className="font-bold text-gray-700 mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: p.color }} />
          <span className="text-gray-500">{p.dataKey}:</span>
          <span className="font-semibold text-gray-800">{EGP(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { interact } = useInteraction();
  const { profile } = useAuth();

  // ─── Queries ──────────────────────────────────────────────────────────────
  const { data: todaySales = [] } = useQuery({
    queryKey: ['dash-today-sales'],
    queryFn: async () => {
      const { data } = await supabase.from('sales')
        .select('total_amount, paid_amount, status, customer_name, sale_items(product_name, quantity)')
        .eq('sale_date', today());
      return data || [];
    },
    staleTime: 30000,
  });

  const { data: monthSales = [] } = useQuery({
    queryKey: ['dash-month-sales'],
    queryFn: async () => {
      const { data } = await supabase.from('sales')
        .select('total_amount, paid_amount, sale_date')
        .gte('sale_date', thisMonthStart())
        .order('sale_date');
      return data || [];
    },
    staleTime: 60000,
  });

  const { data: monthPurchases = [] } = useQuery({
    queryKey: ['dash-month-purch'],
    queryFn: async () => {
      const { data } = await supabase.from('purchases')
        .select('total_amount, purchase_date')
        .gte('purchase_date', thisMonthStart())
        .order('purchase_date');
      return data || [];
    },
    staleTime: 60000,
  });

  const { data: monthExpenses = [] } = useQuery({
    queryKey: ['dash-month-exp'],
    queryFn: async () => {
      const { data } = await supabase.from('expenses')
        .select('amount')
        .gte('expense_date', thisMonthStart());
      return data || [];
    },
    staleTime: 60000,
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['dash-inv'],
    queryFn: async () => {
      const { data } = await supabase.from('inventory')
        .select('quantity, products(min_stock, purchase_price, price)');
      return data || [];
    },
    staleTime: 60000,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ['dash-wh'],
    queryFn: async () => {
      const { data } = await supabase.from('warehouses')
        .select('id, name, status, used, capacity, city');
      return data || [];
    },
    staleTime: 60000,
  });

  const { data: alertCount = 0 } = useQuery({
    queryKey: ['dash-alerts'],
    queryFn: async () => {
      const { count } = await supabase.from('alerts')
        .select('*', { count: 'exact', head: true })
        .eq('read', false);
      return count ?? 0;
    },
    staleTime: 30000,
  });

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['dash-pending'],
    queryFn: async () => {
      const { count } = await supabase.from('transfers')
        .select('*', { count: 'exact', head: true })
        .in('status', ['معلق', 'قيد التنفيذ']);
      return count ?? 0;
    },
    staleTime: 60000,
  });

  // ─── Computed ─────────────────────────────────────────────────────────────
  const todayTotal   = todaySales.reduce((s: number, x: any) => s + Number(x.total_amount), 0);
  const monthTotal   = monthSales.reduce((s: number, x: any) => s + Number(x.total_amount), 0);
  const purchTotal   = monthPurchases.reduce((s: number, x: any) => s + Number(x.total_amount), 0);
  const expTotal     = monthExpenses.reduce((s: number, x: any) => s + Number(x.amount), 0);
  const netProfit    = monthTotal - purchTotal - expTotal;
  const invTotal     = inventory.reduce((s: number, i: any) => s + (i.quantity || 0), 0);
  const lowStock     = inventory.filter((i: any) => i.quantity > 0 && i.quantity < (i.products?.min_stock || 0)).length;
  const outOfStock   = inventory.filter((i: any) => i.quantity === 0).length;
  const goodStock    = inventory.filter((i: any) => i.quantity >= (i.products?.min_stock || 0) && i.quantity > 0).length;
  const activeWh     = warehouses.filter((w: any) => w.status === 'نشط').length;

  // Last 14 days chart
  const chartData = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const ds = d.toISOString().split('T')[0];
    const dayLabel = d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
    const s = monthSales.filter((x: any) => x.sale_date === ds)
      .reduce((sum: number, x: any) => sum + Number(x.total_amount), 0);
    const p = monthPurchases.filter((x: any) => x.purchase_date === ds)
      .reduce((sum: number, x: any) => sum + Number(x.total_amount), 0);
    return { day: dayLabel, مبيعات: s, مشتريات: p };
  });

  const greet = () => {
    const h = new Date().getHours();
    if (h < 12) return 'صباح الخير';
    if (h < 17) return 'مساء الخير';
    return 'مساء النور';
  };

  const name = profile?.full_name?.split(' ')[0] || profile?.username || '';

  const statusBadge: Record<string, string> = {
    'مكتملة': 'text-emerald-700 bg-emerald-50 border-emerald-200',
    'آجل': 'text-blue-700 bg-blue-50 border-blue-200',
    'جزئي': 'text-amber-700 bg-amber-50 border-amber-200',
    'ملغاة': 'text-red-700 bg-red-50 border-red-200',
  };

  return (
    <div className="space-y-6 pb-4">

      {/* ── Greeting ────────────────────────────────────────────────────── */}
      <div className="animate-fade-up">
        <h1 className="text-xl font-bold text-foreground">
          {greet()}، {name} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* ── 3 Primary KPI Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fade-up" style={{ animationDelay: '60ms' }}>

        {/* Card 1 — Today Sales */}
        <div
          className="kpi-card cursor-pointer group"
          onClick={() => { interact('click'); navigate('/sales'); }}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="kpi-icon bg-blue-50">
              <ShoppingCart className="w-5 h-5 text-blue-600" strokeWidth={1.5} />
            </div>
            <ChevronLeft className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-colors" />
          </div>
          <p className="kpi-label">مبيعات اليوم</p>
          <p className="kpi-value text-blue-600">{EGP(todayTotal)}</p>
          <p className="kpi-sub">{todaySales.length} فاتورة حتى الآن</p>
        </div>

        {/* Card 2 — Monthly Net */}
        <div
          className="kpi-card cursor-pointer group"
          onClick={() => { interact('click'); navigate('/reports'); }}
        >
          <div className="flex items-start justify-between mb-4">
            <div className={`kpi-icon ${netProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <DollarSign className={`w-5 h-5 ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`} strokeWidth={1.5} />
            </div>
            <ChevronLeft className="w-4 h-4 text-gray-300 group-hover:text-emerald-400 transition-colors" />
          </div>
          <p className="kpi-label">صافي ربح الشهر</p>
          <p className={`kpi-value ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{EGP(netProfit)}</p>
          <p className="kpi-sub">مبيعات {EGP(monthTotal)}</p>
        </div>

        {/* Card 3 — Inventory */}
        <div
          className="kpi-card cursor-pointer group"
          onClick={() => { interact('click'); navigate('/inventory'); }}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="kpi-icon bg-violet-50">
              <Package className="w-5 h-5 text-violet-600" strokeWidth={1.5} />
            </div>
            <ChevronLeft className="w-4 h-4 text-gray-300 group-hover:text-violet-400 transition-colors" />
          </div>
          <p className="kpi-label">إجمالي المخزون</p>
          <p className="kpi-value text-violet-600">{invTotal.toLocaleString('ar-EG')}</p>
          <p className="kpi-sub">
            {outOfStock > 0
              ? <span className="text-red-500">{outOfStock} صنف نافد · </span>
              : null}
            {lowStock > 0
              ? <span className="text-amber-500">{lowStock} صنف منخفض</span>
              : <span className="text-emerald-500">المخزون جيد</span>}
          </p>
        </div>
      </div>

      {/* ── Full-Width Smooth Area Chart ─────────────────────────────────── */}
      <div className="dashboard-card animate-fade-up" style={{ animationDelay: '180ms' }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-bold text-foreground">حركة آخر 14 يوماً</h2>
            <p className="text-xs text-muted-foreground mt-0.5">المبيعات والمشتريات اليومية</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
              مبيعات
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
              مشتريات
            </span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="gPurch" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(0,0,0,0.04)"
              vertical={false}
            />
            <XAxis
              dataKey="day"
              tick={{ fill: '#9ca3af', fontSize: 10.5 }}
              axisLine={false}
              tickLine={false}
              interval={1}
            />
            <YAxis
              tick={{ fill: '#9ca3af', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={55}
              tickFormatter={(v) => v === 0 ? '٠' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : String(v)}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="مبيعات"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#gSales)"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: '#3b82f6' }}
            />
            <Area
              type="monotone"
              dataKey="مشتريات"
              stroke="#34d399"
              strokeWidth={2}
              fill="url(#gPurch)"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: '#34d399' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Month Summary + Quick Stats ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 animate-fade-up" style={{ animationDelay: '300ms' }}>

        {/* Month Financial Summary — 3 cols */}
        <div className="lg:col-span-3 dashboard-card">
          <h2 className="text-sm font-bold text-foreground mb-4">
            ملخص {new Date().toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}
          </h2>
          <div className="space-y-3">
            {[
              { label: 'إجمالي المبيعات', value: monthTotal, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50', nav: '/sales' },
              { label: 'إجمالي المشتريات', value: purchTotal, icon: TrendingDown, color: 'text-violet-600', bg: 'bg-violet-50', nav: '/purchases' },
              { label: 'المصروفات', value: expTotal, icon: DollarSign, color: 'text-amber-600', bg: 'bg-amber-50', nav: '/expenses' },
            ].map(({ label, value, icon: Icon, color, bg, nav }) => (
              <div
                key={label}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors group"
                onClick={() => { interact('click'); navigate(nav); }}
              >
                <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-4 h-4 ${color}`} strokeWidth={1.5} />
                </div>
                <span className="flex-1 text-sm text-gray-600">{label}</span>
                <span className={`text-sm font-bold ${color}`}>{EGP(value)}</span>
                <ChevronLeft className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
              </div>
            ))}

            {/* Divider + Net */}
            <div className="border-t border-dashed border-gray-200 pt-3">
              <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl ${netProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <span className={`text-sm font-bold ${netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>صافي الربح</span>
                <span className={`text-base font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{EGP(netProfit)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats — 2 cols */}
        <div className="lg:col-span-2 space-y-3">

          {/* Warehouses */}
          <div
            className="dashboard-card cursor-pointer group"
            onClick={() => { interact('click'); navigate('/warehouses'); }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center">
                <Warehouse className="w-4 h-4 text-slate-500" strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-foreground">المخازن</p>
                <p className="text-[11px] text-muted-foreground">{activeWh} نشطة من {warehouses.length}</p>
              </div>
              <ChevronLeft className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500" />
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {warehouses.slice(0, 3).map((w: any) => {
                const pct = Math.round(((w.used || 0) / (w.capacity || 1)) * 100);
                return (
                  <div key={w.id} className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-muted-foreground truncate mb-1">{w.name.split(' ')[0]}</p>
                    <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pct > 85 ? 'bg-red-400' : pct > 60 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{pct}%</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stock Status */}
          <div
            className="dashboard-card cursor-pointer group"
            onClick={() => { interact('click'); navigate('/inventory'); }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-violet-50 rounded-xl flex items-center justify-center">
                <Package className="w-4 h-4 text-violet-500" strokeWidth={1.5} />
              </div>
              <p className="text-xs font-semibold text-foreground flex-1">حالة المخزون</p>
              <ChevronLeft className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500" />
            </div>
            <div className="space-y-2.5">
              {[
                { label: 'وفير', count: goodStock,    color: 'bg-emerald-400', text: 'text-emerald-600' },
                { label: 'منخفض', count: lowStock,   color: 'bg-amber-400',   text: 'text-amber-600' },
                { label: 'نافد',  count: outOfStock, color: 'bg-red-400',     text: 'text-red-500' },
              ].map(({ label, count, color, text }) => {
                const total = (inventory as any[]).length || 1;
                const pct   = Math.min(Math.round((count / total) * 100), 100);
                return (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground w-10 flex-shrink-0">{label}</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`text-[11px] font-bold ${text} w-5 text-right flex-shrink-0`}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Alerts + Transfers */}
          <div className="grid grid-cols-2 gap-3">
            <div
              className="dashboard-card cursor-pointer group text-center py-3"
              onClick={() => { interact('click'); navigate('/alerts'); }}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-2 ${(alertCount as number) > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                <AlertTriangle className={`w-4 h-4 ${(alertCount as number) > 0 ? 'text-red-500' : 'text-gray-400'}`} strokeWidth={1.5} />
              </div>
              <p className={`text-xl font-bold ${(alertCount as number) > 0 ? 'text-red-500' : 'text-gray-400'}`}>{alertCount as number}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">تنبيه</p>
            </div>
            <div
              className="dashboard-card cursor-pointer group text-center py-3"
              onClick={() => { interact('click'); navigate('/transfers'); }}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-2 ${(pendingCount as number) > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
                <ArrowLeftRight className={`w-4 h-4 ${(pendingCount as number) > 0 ? 'text-amber-500' : 'text-gray-400'}`} strokeWidth={1.5} />
              </div>
              <p className={`text-xl font-bold ${(pendingCount as number) > 0 ? 'text-amber-500' : 'text-gray-400'}`}>{pendingCount as number}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">تحويل معلق</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent Sales ────────────────────────────────────────────────── */}
      <div className="dashboard-card animate-fade-up" style={{ animationDelay: '420ms' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-foreground">آخر الفواتير</h2>
          <button
            className="text-xs text-blue-500 hover:text-blue-600 font-medium flex items-center gap-1 transition-colors"
            onClick={() => { interact('nav'); navigate('/sales'); }}
          >
            عرض الكل
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        {todaySales.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-3">
            <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-gray-300" strokeWidth={1.5} />
            </div>
            <p className="text-sm text-muted-foreground">لا توجد فواتير اليوم بعد</p>
            <button
              className="text-xs text-blue-500 hover:text-blue-600 font-medium"
              onClick={() => { interact('click'); navigate('/sales'); }}
            >
              إضافة فاتورة جديدة ←
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {(todaySales as any[]).slice(0, 5).map((sale: any, i: number) => {
              const items = sale.sale_items || [];
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors group border border-transparent hover:border-gray-100"
                  onClick={() => { interact('click'); navigate('/sales'); }}
                >
                  <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <ShoppingCart className="w-4 h-4 text-blue-500" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {sale.customer_name || 'عميل نقدي'}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {items.slice(0, 2).map((it: any, j: number) => (
                        <span key={j} className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded-md font-medium">
                          {it.product_name} ×{it.quantity}
                        </span>
                      ))}
                      {items.length > 2 && (
                        <span className="text-[10px] text-muted-foreground">+{items.length - 2}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1">
                    <p className="text-sm font-bold text-emerald-600">{EGP(sale.total_amount)}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${statusBadge[sale.status] || 'text-gray-500 bg-gray-50 border-gray-200'}`}>
                      {sale.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Warehouses Strip ───────────────────────────────────────────── */}
      {(warehouses as any[]).length > 0 && (
        <div className="animate-fade-up" style={{ animationDelay: '520ms' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-foreground">المخازن</h2>
            <button
              className="text-xs text-blue-500 hover:text-blue-600 font-medium flex items-center gap-1"
              onClick={() => { interact('nav'); navigate('/warehouses'); }}
            >
              إدارة
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {(warehouses as any[]).map((w: any) => {
              const pct = Math.round(((w.used || 0) / (w.capacity || 1)) * 100);
              const isActive = w.status === 'نشط';
              return (
                <div
                  key={w.id}
                  className="dashboard-card cursor-pointer group p-3"
                  onClick={() => { interact('click'); navigate('/warehouses'); }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                    <p className="text-xs font-semibold text-foreground truncate flex-1">{w.name.split(' - ')[0]}</p>
                  </div>
                  <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                    <div
                      className={`h-full rounded-full transition-all ${pct > 85 ? 'bg-red-400' : pct > 60 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground text-left">{pct}% مستخدم</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};

export default Dashboard;
