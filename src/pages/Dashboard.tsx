import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Warehouse, Package, ArrowLeftRight, AlertTriangle, TrendingUp, TrendingDown,
  DollarSign, Users, ShoppingCart, Activity, BarChart3, RefreshCw,
  CreditCard, Boxes, FileText, Clock, CheckCircle, AlertCircle,
} from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts';

const EGP = (v: number) => v.toLocaleString('ar-EG', { minimumFractionDigits: 0 }) + ' ج.م';

const today = () => new Date().toISOString().split('T')[0];
const thisMonth = () => new Date().toISOString().slice(0, 7);

const Dashboard = () => {
  const navigate = useNavigate();
  const { interact } = useInteraction();
  const { profile } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    interact('click');
    setTimeout(() => { window.location.reload(); }, 600);
  };

  // ─── Data Queries ──────────────────────────────────────────────────────────
  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses-dash'],
    queryFn: async () => {
      const { data } = await supabase.from('warehouses').select('id,name,status,used,capacity,city').order('name');
      return data || [];
    },
    staleTime: 60000,
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventory-dash'],
    queryFn: async () => {
      const { data } = await supabase.from('inventory').select('quantity, products(name,min_stock,purchase_price,price)');
      return data || [];
    },
    staleTime: 60000,
  });

  const { data: todaySales = [] } = useQuery({
    queryKey: ['today-sales-dash'],
    queryFn: async () => {
      const { data } = await supabase.from('sales').select('total_amount,paid_amount,status,sale_items(product_name,quantity,unit_price,total_price)').eq('sale_date', today());
      return data || [];
    },
    staleTime: 30000,
  });

  const { data: monthSales = [] } = useQuery({
    queryKey: ['month-sales-dash'],
    queryFn: async () => {
      const { data } = await supabase.from('sales').select('total_amount,paid_amount,sale_date,status').gte('sale_date', thisMonth() + '-01').order('sale_date');
      return data || [];
    },
    staleTime: 60000,
  });

  const { data: monthPurchases = [] } = useQuery({
    queryKey: ['month-purchases-dash'],
    queryFn: async () => {
      const { data } = await supabase.from('purchases').select('total_amount,purchase_date').gte('purchase_date', thisMonth() + '-01').order('purchase_date');
      return data || [];
    },
    staleTime: 60000,
  });

  const { data: criticalAlerts = 0 } = useQuery({
    queryKey: ['alerts-critical-dash'],
    queryFn: async () => {
      const { count } = await supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('read', false);
      return count ?? 0;
    },
    staleTime: 30000,
  });

  const { data: pendingTransfers = 0 } = useQuery({
    queryKey: ['transfers-pending-dash'],
    queryFn: async () => {
      const { count } = await supabase.from('transfers').select('*', { count: 'exact', head: true }).in('status', ['معلق', 'قيد التنفيذ']);
      return count ?? 0;
    },
    staleTime: 60000,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-dash'],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('name,balance').order('balance', { ascending: false }).limit(5);
      return data || [];
    },
    staleTime: 60000,
  });

  const { data: recentSales = [] } = useQuery({
    queryKey: ['recent-sales-dash'],
    queryFn: async () => {
      const { data } = await supabase.from('sales').select('customer_name,total_amount,paid_amount,status,sale_date,sale_items(product_name,quantity)').order('created_at', { ascending: false }).limit(5);
      return data || [];
    },
    staleTime: 30000,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses-month-dash'],
    queryFn: async () => {
      const { data } = await supabase.from('expenses').select('amount,category').gte('expense_date', thisMonth() + '-01');
      return data || [];
    },
    staleTime: 60000,
  });

  // ─── Computed Values ───────────────────────────────────────────────────────
  const inventoryTotal = inventoryItems.reduce((s: number, i: any) => s + (i.quantity || 0), 0);
  const activeWarehouses = warehouses.filter((w: any) => w.status === 'نشط').length;
  const todaySalesTotal = todaySales.reduce((s: number, x: any) => s + x.total_amount, 0);
  const todayCollected = todaySales.reduce((s: number, x: any) => s + x.paid_amount, 0);
  const monthSalesTotal = monthSales.reduce((s: number, x: any) => s + x.total_amount, 0);
  const monthPurchasesTotal = monthPurchases.reduce((s: number, x: any) => s + x.total_amount, 0);
  const monthExpensesTotal = expenses.reduce((s: number, x: any) => s + x.amount, 0);
  const netProfit = monthSalesTotal - monthPurchasesTotal - monthExpensesTotal;
  const totalDebt = customers.reduce((s: number, c: any) => s + (c.balance > 0 ? c.balance : 0), 0);

  // Low stock items
  const lowStockItems = inventoryItems.filter((i: any) =>
    i.quantity > 0 && i.quantity < (i.products?.min_stock || 0)
  ).length;
  const outOfStockItems = inventoryItems.filter((i: any) => i.quantity === 0).length;

  // Build last 7 days sales chart
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().split('T')[0];
    const daySales = monthSales.filter((s: any) => s.sale_date === dateStr).reduce((sum: number, s: any) => sum + s.total_amount, 0);
    const dayPurch = monthPurchases.filter((p: any) => p.purchase_date === dateStr).reduce((sum: number, p: any) => sum + p.total_amount, 0);
    return {
      day: d.toLocaleDateString('ar-EG', { weekday: 'short' }),
      مبيعات: daySales,
      مشتريات: dayPurch,
    };
  });

  const statusColor: Record<string, string> = {
    'مكتملة': 'text-emerald-600 bg-emerald-50 border-emerald-200',
    'آجل': 'text-blue-600 bg-blue-50 border-blue-200',
    'جزئي': 'text-amber-600 bg-amber-50 border-amber-200',
    'ملغاة': 'text-red-600 bg-red-50 border-red-200',
  };

  return (
    <div className="space-y-5">
      {/* ─── Top KPIs ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'مبيعات اليوم', value: EGP(todaySalesTotal),
            sub: `محصّل: ${EGP(todayCollected)}`, icon: ShoppingCart,
            grad: 'gradient-blue', border: 'border-blue-500/20',
            onClick: () => navigate('/sales'),
          },
          {
            label: 'مبيعات الشهر', value: EGP(monthSalesTotal),
            sub: `${monthSales.length} فاتورة`, icon: TrendingUp,
            grad: 'gradient-emerald', border: 'border-emerald-500/20',
            onClick: () => navigate('/sales'),
          },
          {
            label: 'صافي ربح الشهر', value: EGP(netProfit),
            sub: netProfit >= 0 ? 'أرباح' : 'خسارة', icon: DollarSign,
            grad: netProfit >= 0 ? 'gradient-emerald' : 'gradient-red',
            border: netProfit >= 0 ? 'border-emerald-500/20' : 'border-red-500/20',
            onClick: () => navigate('/reports'),
          },
          {
            label: 'مديونيات العملاء', value: EGP(totalDebt),
            sub: `${customers.filter((c: any) => c.balance > 0).length} عميل دائن`,
            icon: CreditCard, grad: 'gradient-amber', border: 'border-amber-500/20',
            onClick: () => navigate('/customers'),
          },
        ].map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i}
              className={`glass rounded-2xl p-4 border ${card.border} cursor-pointer stat-shine hover:scale-[1.02] transition-transform animate-fade-up`}
              style={{ animationDelay: `${i * 60}ms` }}
              onClick={() => { interact('click'); card.onClick(); }}>
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 ${card.grad} rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
              <p className="text-lg font-bold text-foreground break-all">{card.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
            </div>
          );
        })}
      </div>

      {/* ─── Secondary KPIs ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'المخازن النشطة', value: activeWarehouses, sub: `من أصل ${warehouses.length} مخزن`, icon: Warehouse, color: 'text-blue-400', border: 'border-blue-500/15', onClick: () => navigate('/warehouses') },
          { label: 'إجمالي المخزون', value: inventoryTotal.toLocaleString('ar-EG'), sub: 'وحدة في جميع المخازن', icon: Boxes, color: 'text-violet-400', border: 'border-violet-500/15', onClick: () => navigate('/inventory') },
          { label: 'تنبيهات غير مقروءة', value: criticalAlerts, sub: 'تحتاج متابعة', icon: AlertTriangle, color: criticalAlerts > 0 ? 'text-red-400' : 'text-emerald-400', border: criticalAlerts > 0 ? 'border-red-500/15' : 'border-emerald-500/15', onClick: () => navigate('/alerts') },
          { label: 'تحويلات معلقة', value: pendingTransfers, sub: 'قيد التنفيذ', icon: ArrowLeftRight, color: 'text-amber-400', border: 'border-amber-500/15', onClick: () => navigate('/transfers') },
        ].map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i}
              className={`glass rounded-xl p-4 border ${card.border} cursor-pointer hover:border-primary/30 transition-all animate-fade-up`}
              style={{ animationDelay: `${240 + i * 50}ms` }}
              onClick={() => { interact('click'); card.onClick(); }}>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/5`}>
                  <Icon className={`w-4 h-4 ${card.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{card.label}</p>
                  <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.sub}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Charts Row ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 7-Day Chart */}
        <div className="lg:col-span-2 glass rounded-2xl p-5 border border-border animate-fade-up" style={{ animationDelay: '450ms' }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-foreground">حركة آخر 7 أيام</h2>
              <p className="text-xs text-muted-foreground">المبيعات والمشتريات اليومية</p>
            </div>
            <div className="w-9 h-9 gradient-blue rounded-xl flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={last7Days} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={60}
                tickFormatter={(v) => v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v} />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', color: '#1a1a1a', fontSize: '12px' }}
                formatter={(val: number) => [EGP(val)]}
              />
              <Bar dataKey="مبيعات" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="مشتريات" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-3 justify-center">
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" /><span className="text-xs text-muted-foreground">مبيعات</span></div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /><span className="text-xs text-muted-foreground">مشتريات</span></div>
          </div>
        </div>

        {/* Financial Summary */}
        <div className="glass rounded-2xl p-5 border border-border animate-fade-up" style={{ animationDelay: '500ms' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-foreground">ملخص الشهر</h2>
              <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}</p>
            </div>
            <div className="w-9 h-9 gradient-violet rounded-xl flex items-center justify-center">
              <Activity className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="space-y-3">
            {[
              { label: 'مبيعات', value: EGP(monthSalesTotal), color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: TrendingUp },
              { label: 'مشتريات', value: EGP(monthPurchasesTotal), color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200', icon: TrendingDown },
              { label: 'مصروفات', value: EGP(monthExpensesTotal), color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', icon: CreditCard },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className={`flex items-center justify-between p-3 ${item.bg} border ${item.border} rounded-xl`}>
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${item.color}`} />
                    <span className="text-sm font-medium text-gray-700">{item.label}</span>
                  </div>
                  <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
                </div>
              );
            })}
            <div className={`flex items-center justify-between p-3 rounded-xl border ${netProfit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2">
                <DollarSign className={`w-4 h-4 ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
                <span className="text-sm font-bold text-gray-700">صافي الربح</span>
              </div>
              <span className={`text-sm font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{EGP(netProfit)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Bottom Row ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Sales */}
        <div className="lg:col-span-2 glass rounded-2xl p-5 border border-border animate-fade-up" style={{ animationDelay: '600ms' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-400" />
              <h2 className="font-bold text-foreground">آخر الفواتير</h2>
            </div>
            <button className="text-xs text-blue-500 hover:text-blue-600 font-medium" onClick={() => { interact('nav'); navigate('/sales'); }}>
              عرض الكل
            </button>
          </div>
          <div className="space-y-2">
            {recentSales.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-30" />
                لا توجد فواتير بعد
              </div>
            ) : recentSales.map((sale: any, i: number) => {
              const items = sale.sale_items || [];
              return (
                <div key={i}
                  className="flex items-center gap-3 p-3 rounded-xl bg-gray-50/80 hover:bg-blue-50/60 cursor-pointer transition-all border border-gray-100 hover:border-blue-200"
                  onClick={() => { interact('click'); navigate('/sales'); }}>
                  <div className="w-9 h-9 gradient-blue rounded-xl flex items-center justify-center flex-shrink-0">
                    <ShoppingCart className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{sale.customer_name || 'عميل نقدي'}</p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {items.slice(0, 2).map((it: any, j: number) => (
                        <span key={j} className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md font-medium">
                          {it.product_name} ×{it.quantity}
                        </span>
                      ))}
                      {items.length > 2 && <span className="text-[10px] text-muted-foreground">+{items.length - 2}</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-emerald-600">{EGP(sale.total_amount)}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${statusColor[sale.status] || 'text-gray-500 bg-gray-100 border-gray-200'}`}>
                      {sale.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Alerts + Stock Status */}
        <div className="space-y-4">
          {/* Stock Status */}
          <div className="glass rounded-2xl p-4 border border-border animate-fade-up" style={{ animationDelay: '650ms' }}>
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-violet-400" />
              <h3 className="font-bold text-foreground text-sm">حالة المخزون</h3>
            </div>
            <div className="space-y-2">
              {[
                { label: 'وفير', count: inventoryItems.filter((i: any) => i.quantity >= (i.products?.min_stock || 0) && i.quantity > 0).length, color: 'bg-emerald-500', textColor: 'text-emerald-600', icon: CheckCircle },
                { label: 'منخفض', count: lowStockItems, color: 'bg-amber-500', textColor: 'text-amber-600', icon: AlertCircle },
                { label: 'نافد', count: outOfStockItems, color: 'bg-red-500', textColor: 'text-red-600', icon: AlertTriangle },
              ].map((item, i) => {
                const Icon = item.icon;
                const total = inventoryItems.length || 1;
                const pct = Math.round((item.count / total) * 100);
                return (
                  <div key={i} className="flex items-center gap-2 cursor-pointer" onClick={() => { interact('click'); navigate('/inventory'); }}>
                    <Icon className={`w-3.5 h-3.5 ${item.textColor} flex-shrink-0`} />
                    <span className="text-xs text-muted-foreground w-12 flex-shrink-0">{item.label}</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`text-xs font-bold ${item.textColor} w-6 text-left flex-shrink-0`}>{item.count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Debtors */}
          <div className="glass rounded-2xl p-4 border border-border animate-fade-up" style={{ animationDelay: '700ms' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-red-400" />
                <h3 className="font-bold text-foreground text-sm">أكبر المديونيات</h3>
              </div>
              <button className="text-xs text-blue-500" onClick={() => { interact('nav'); navigate('/customers'); }}>الكل</button>
            </div>
            <div className="space-y-2">
              {customers.filter((c: any) => c.balance > 0).slice(0, 4).map((c: any, i: number) => (
                <div key={i} className="flex items-center justify-between cursor-pointer hover:bg-red-50/50 px-2 py-1 rounded-lg transition-colors" onClick={() => { interact('click'); navigate('/customers'); }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-red-600">{c.name[0]}</span>
                    </div>
                    <span className="text-xs font-medium text-foreground truncate max-w-20">{c.name}</span>
                  </div>
                  <span className="text-xs font-bold text-red-500">{EGP(c.balance)}</span>
                </div>
              ))}
              {customers.filter((c: any) => c.balance > 0).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">لا توجد مديونيات</p>
              )}
            </div>
          </div>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="w-full icon-btn gap-2 py-2.5 glass text-muted-foreground hover:text-primary border border-border rounded-xl text-sm font-medium transition-all animate-fade-up"
            style={{ animationDelay: '750ms' }}>
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
            <span>تحديث البيانات</span>
          </button>
        </div>
      </div>

      {/* ─── Warehouses Overview ─── */}
      <div className="glass rounded-2xl p-5 border border-border animate-fade-up" style={{ animationDelay: '800ms' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Warehouse className="w-4 h-4 text-blue-400" />
            <h2 className="font-bold text-foreground">نظرة على المخازن</h2>
          </div>
          <button className="text-xs text-blue-500 font-medium" onClick={() => { interact('nav'); navigate('/warehouses'); }}>
            إدارة المخازن
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {warehouses.slice(0, 6).map((w: any, i: number) => {
            const pct = Math.round(((w.used || 0) / (w.capacity || 1)) * 100);
            const statusClr = w.status === 'نشط' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : w.status === 'مغلق' ? 'text-red-600 bg-red-50 border-red-200' : 'text-amber-600 bg-amber-50 border-amber-200';
            return (
              <div key={w.id}
                className="p-3 bg-white/60 rounded-xl border border-gray-100 hover:border-blue-200 cursor-pointer transition-all hover:bg-blue-50/30"
                onClick={() => { interact('click'); navigate('/warehouses'); }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-foreground truncate">{w.name}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusClr}`}>{w.status}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span>{w.city || '—'}</span>
                  <span>{pct}% مستخدم</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full transition-all ${pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
