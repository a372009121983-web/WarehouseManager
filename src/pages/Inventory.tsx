import { useState, type ReactNode } from 'react';
import { Package, Search, AlertTriangle, TrendingDown, CheckCircle, Edit2, RefreshCw } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

interface InventoryRow {
  id: string;
  quantity: number;
  last_updated: string;
  products: { name: string; min_stock: number; category?: string };
  warehouses: { name: string };
}

const Inventory = () => {
  const { interact } = useInteraction();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('الكل');
  const [adjustItem, setAdjustItem] = useState<InventoryRow | null>(null);
  const [newQty, setNewQty] = useState('');

  const { data: rawItems = [], isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('id, quantity, last_updated, products(name, min_stock, category), warehouses(name)')
        .order('last_updated', { ascending: false });
      if (error) throw error;
      return data as InventoryRow[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, quantity }: { id: string; quantity: number }) => {
      const { error } = await supabase.from('inventory').update({ quantity, last_updated: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); interact('success'); toast.success('تم تحديث المخزون'); setAdjustItem(null); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const getStatus = (qty: number, minStock: number) => {
    if (qty === 0) return 'نافد';
    if (qty <= minStock) return 'منخفض';
    return 'وفير';
  };

  const items = rawItems.map(r => ({
    ...r,
    status: getStatus(r.quantity, r.products.min_stock),
  }));

  const filtered = items.filter(item => {
    const matchSearch = item.products.name.includes(search) || item.warehouses.name.includes(search) || (item.products.category || '').includes(search);
    const matchStatus = filterStatus === 'الكل' || item.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const statusConfig: Record<string, { icon: ReactNode; color: string; bg: string }> = {
    'وفير':   { icon: <CheckCircle className="w-3.5 h-3.5" />,  color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
    'منخفض':  { icon: <TrendingDown className="w-3.5 h-3.5" />, color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200' },
    'نافد':   { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: 'text-red-600',     bg: 'bg-red-50 border-red-200' },
  };

  const counts = {
    total:   items.length,
    وفير:    items.filter(i => i.status === 'وفير').length,
    منخفض:   items.filter(i => i.status === 'منخفض').length,
    نافد:    items.filter(i => i.status === 'نافد').length,
  };

  const handleAdjust = () => {
    if (!adjustItem) return;
    const qty = parseInt(newQty);
    if (isNaN(qty) || qty < 0) { interact('error'); toast.error('يرجى إدخال كمية صحيحة'); return; }
    updateMutation.mutate({ id: adjustItem.id, quantity: qty });
  };

  if (isLoading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 gradient-blue rounded-xl animate-pulse" /></div>;

  return (
    <div className="space-y-5">
      {/* ─── KPIs ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي الأصناف', value: counts.total,    color: 'text-blue-600',    border: 'border-blue-200 bg-blue-50/60',     filter: 'الكل' },
          { label: 'وفير',            value: counts['وفير'],  color: 'text-emerald-600', border: 'border-emerald-200 bg-emerald-50/60', filter: 'وفير' },
          { label: 'منخفض',           value: counts['منخفض'], color: 'text-amber-600',   border: 'border-amber-200 bg-amber-50/60',     filter: 'منخفض' },
          { label: 'نافد',            value: counts['نافد'],  color: 'text-red-600',     border: 'border-red-200 bg-red-50/60',         filter: 'نافد' },
        ].map((c) => (
          <div key={c.label}
            className={cn('rounded-xl p-4 border cursor-pointer stat-shine', c.border, filterStatus === c.filter && 'ring-2 ring-primary/30')}
            onClick={() => { interact('click'); setFilterStatus(c.filter); }}>
            <p className="text-muted-foreground text-xs mb-1">{c.label}</p>
            <p className={cn('text-2xl font-bold', c.color)}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* ─── Toolbar ─── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="بحث بالمنتج أو المخزن أو الفئة..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white border border-border rounded-xl py-2.5 pr-10 pl-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['الكل', 'وفير', 'منخفض', 'نافد'].map(s => (
            <button key={s}
              className={cn('px-3 py-2 rounded-xl text-sm font-medium transition-all border',
                filterStatus === s
                  ? 'gradient-blue text-white border-blue-500/30'
                  : 'bg-white text-muted-foreground border-border hover:border-blue-300')}
              onClick={() => { interact('click'); setFilterStatus(s); }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Table ─── */}
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['المنتج', 'المخزن', 'الكمية', 'آخر تحديث', 'الحالة', 'إجراء'].map(h => (
                  <th key={h} className="text-right text-xs text-muted-foreground px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => {
                const sc = statusConfig[item.status];
                return (
                  <tr key={item.id}
                    className={cn('border-b border-border/50 hover:bg-muted/20 transition-colors animate-fade-up', item.status === 'نافد' && 'bg-red-50/40')}
                    style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 gradient-blue rounded-lg flex items-center justify-center flex-shrink-0">
                          <Package className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.products.name}</p>
                          {item.products.category && (
                            <p className="text-xs text-muted-foreground">{item.products.category}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{item.warehouses.name}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-sm font-bold',
                        item.status === 'نافد' ? 'text-red-600' : item.status === 'منخفض' ? 'text-amber-600' : 'text-emerald-600')}>
                        {item.quantity.toLocaleString('ar-EG')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(item.last_updated).toLocaleDateString('ar-EG')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('flex items-center gap-1 w-fit text-xs px-2 py-1 rounded-lg border font-medium', sc.color, sc.bg)}>
                        {sc.icon}{item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="icon-btn w-8 h-8 bg-muted/60 hover:bg-blue-50 text-muted-foreground hover:text-blue-600 rounded-xl border border-border"
                        onClick={() => { interact('click'); setAdjustItem(item); setNewQty(String(item.quantity)); }}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-14 text-center">
                  <Package className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-muted-foreground text-sm">لا توجد بيانات</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border bg-muted/20 flex justify-between items-center">
            <p className="text-xs text-muted-foreground">{filtered.length} صنف</p>
            <p className="text-xs text-muted-foreground">
              إجمالي الكميات: <span className="font-bold text-foreground">{filtered.reduce((s, i) => s + i.quantity, 0).toLocaleString('ar-EG')}</span>
            </p>
          </div>
        )}
      </div>

      {/* ─── Adjust Modal ─── */}
      {adjustItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl border border-border shadow-xl p-6 animate-fade-up">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 gradient-blue rounded-xl flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-foreground">تعديل المخزون</h2>
                <p className="text-xs text-muted-foreground">{adjustItem.products.name} — {adjustItem.warehouses.name}</p>
              </div>
            </div>
            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-3">
                الكمية الحالية: <span className="text-foreground font-bold text-base">{adjustItem.quantity.toLocaleString('ar-EG')}</span>
              </p>
              <label className="text-xs text-muted-foreground block mb-1.5">الكمية الجديدة</label>
              <input type="number" value={newQty}
                onChange={e => setNewQty(e.target.value)} min={0}
                className="w-full bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
            </div>
            <div className="flex gap-3">
              <button className="flex-1 gradient-blue text-white rounded-xl py-2.5 font-semibold"
                onClick={handleAdjust} disabled={updateMutation.isPending}>
                حفظ
              </button>
              <button className="flex-1 bg-muted text-muted-foreground rounded-xl py-2.5"
                onClick={() => { interact('click'); setAdjustItem(null); }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
