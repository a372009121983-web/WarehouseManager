import { useState, type ReactNode } from 'react';
import { ArrowLeftRight, Plus, Truck, CheckCircle, Clock, XCircle, AlertCircle, Search, Eye, ScanLine } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Transfer, TransferItem } from '@/types';
import BarcodeScanner from '@/components/features/BarcodeScanner';

interface TransferRow {
  id: string;
  from_warehouse_name: string;
  to_warehouse_name: string;
  status: string;
  driver_name: string;
  notes?: string;
  total_items: number;
  created_at: string;
  transfer_items: { product_name: string; quantity: number; unit: string }[];
}

interface WarehouseOption { id: string; name: string }
interface ProductOption { id: string; name: string; unit: string; barcode?: string }

const Transfers = () => {
  const { interact } = useInteraction();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const isAdmin = profile?.role === 'admin';
  const isDriver = profile?.role === 'driver';

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('الكل');
  const [showForm, setShowForm] = useState(false);
  const [viewItem, setViewItem] = useState<TransferRow | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [form, setForm] = useState({ fromWarehouseId: '', toWarehouseId: '', fromName: '', toName: '', driverName: '', notes: '' });
  const [items, setItems] = useState<{ product_name: string; quantity: number; unit: string }[]>([{ product_name: '', quantity: 1, unit: 'كرتون' }]);

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ['transfers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transfers')
        .select('*, transfer_items(product_name, quantity, unit)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as TransferRow[];
    },
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses-list'],
    queryFn: async () => {
      const { data } = await supabase.from('warehouses').select('id,name').eq('status', 'نشط');
      return (data || []) as WarehouseOption[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products-list'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id,name,unit,barcode').order('name');
      return (data || []) as ProductOption[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const fw = warehouses.find(w => w.id === form.fromWarehouseId);
      const tw = warehouses.find(w => w.id === form.toWarehouseId);
      const totalItems = items.reduce((s, i) => s + i.quantity, 0);
      const { data: transfer, error } = await supabase.from('transfers').insert({
        from_warehouse_id: form.fromWarehouseId,
        to_warehouse_id: form.toWarehouseId,
        from_warehouse_name: fw?.name || '',
        to_warehouse_name: tw?.name || '',
        driver_name: form.driverName || 'غير محدد',
        notes: form.notes,
        status: 'معلق',
        total_items: totalItems,
      }).select().single();
      if (error) throw error;
      const { error: itemsError } = await supabase.from('transfer_items').insert(items.map(i => ({ ...i, transfer_id: transfer.id })));
      if (itemsError) throw itemsError;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); interact('transfer'); toast.success('تم إنشاء أمر التحويل'); setShowForm(false); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('transfers').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => { qc.invalidateQueries({ queryKey: ['transfers'] }); interact(status === 'مكتمل' ? 'success' : 'click'); toast.success(`تم تغيير الحالة إلى: ${status}`); },
  });

  const statusConfig: Record<string, { icon: ReactNode; color: string; bg: string }> = {
    'قيد التنفيذ': { icon: <Truck className="w-3.5 h-3.5" />, color: 'text-blue-400', bg: 'bg-blue-500/15 border-blue-500/25' },
    'مكتمل': { icon: <CheckCircle className="w-3.5 h-3.5" />, color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/25' },
    'معلق': { icon: <Clock className="w-3.5 h-3.5" />, color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/25' },
    'ملغي': { icon: <XCircle className="w-3.5 h-3.5" />, color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/25' },
  };

  const filtered = transfers.filter(t => {
    const matchSearch = t.from_warehouse_name.includes(search) || t.to_warehouse_name.includes(search) || t.driver_name.includes(search);
    const matchStatus = filterStatus === 'الكل' || t.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const counts = {
    'قيد التنفيذ': transfers.filter(t => t.status === 'قيد التنفيذ').length,
    'معلق': transfers.filter(t => t.status === 'معلق').length,
    'مكتمل': transfers.filter(t => t.status === 'مكتمل').length,
    'ملغي': transfers.filter(t => t.status === 'ملغي').length,
  };

  const handleBarcodeScan = (barcode: string) => {
    setShowScanner(false);
    const product = products.find(p => p.barcode === barcode || p.name === barcode);
    if (product) {
      setItems(prev => [...prev.slice(0, -1), { product_name: product.name, quantity: 1, unit: product.unit }]);
      toast.success(`تم مسح: ${product.name}`);
    } else {
      toast.warning(`لم يُعثر على منتج بالباركود: ${barcode}`);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 gradient-blue rounded-xl animate-pulse" /></div>;

  return (
    <div className="space-y-5">
      {showScanner && <BarcodeScanner onScan={handleBarcodeScan} onClose={() => setShowScanner(false)} />}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'قيد التنفيذ', value: counts['قيد التنفيذ'], color: 'text-blue-400', border: 'border-blue-500/20' },
          { label: 'معلق', value: counts['معلق'], color: 'text-amber-400', border: 'border-amber-500/20' },
          { label: 'مكتمل', value: counts['مكتمل'], color: 'text-emerald-400', border: 'border-emerald-500/20' },
          { label: 'ملغي', value: counts['ملغي'], color: 'text-red-400', border: 'border-red-500/20' },
        ].map((c) => (
          <div key={c.label} className={cn('glass rounded-xl p-4 border cursor-pointer stat-shine', c.border)}
            onClick={() => { interact('click'); setFilterStatus(c.label); }}>
            <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
            <p className={cn('text-2xl font-bold', c.color)}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="البحث بالمخزن أو السائق..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-xl py-2.5 pr-10 pl-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['الكل', 'قيد التنفيذ', 'معلق', 'مكتمل', 'ملغي'].map(s => (
            <button key={s} className={cn('px-3 py-2 rounded-xl text-sm font-medium transition-all', filterStatus === s ? 'gradient-blue text-white' : 'glass text-muted-foreground hover:text-foreground')}
              onClick={() => { interact('click'); setFilterStatus(s); }}>{s}</button>
          ))}
        </div>
        {!isDriver && (
          <button className="icon-btn gradient-blue glow-blue text-white px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold"
            onClick={() => { interact('add'); setShowForm(true); setItems([{ product_name: '', quantity: 1, unit: 'كرتون' }]); }}>
            <Plus className="w-4 h-4" /><span>تحويل جديد</span>
          </button>
        )}
      </div>

      <div className="space-y-3">
        {filtered.map((t, i) => {
          const sc = statusConfig[t.status] || statusConfig['معلق'];
          return (
            <div key={t.id} className="glass rounded-2xl p-4 border border-border glass-hover animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 gradient-blue rounded-xl flex items-center justify-center flex-shrink-0">
                    <ArrowLeftRight className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-foreground">{t.from_warehouse_name}</span>
                      <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-bold text-sm text-foreground">{t.to_warehouse_name}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>السائق: {t.driver_name}</span>
                      <span>•</span>
                      <span>{new Date(t.created_at).toLocaleDateString('ar-SA')}</span>
                      <span>•</span>
                      <span>{t.total_items} وحدة</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border font-medium', sc.color, sc.bg)}>
                    {sc.icon}{t.status}
                  </span>
                  <button className="icon-btn w-8 h-8 glass text-muted-foreground hover:text-primary" onClick={() => { interact('click'); setViewItem(t); }}>
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {t.transfer_items && t.transfer_items.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {t.transfer_items.map((p, pi) => (
                    <span key={pi} className="text-xs glass px-2.5 py-1 rounded-lg text-muted-foreground border border-border">
                      {p.product_name} × {p.quantity} {p.unit}
                    </span>
                  ))}
                </div>
              )}
              {(t.status === 'معلق' || t.status === 'قيد التنفيذ') && (isAdmin || profile?.role === 'warehouse_manager' || isDriver) && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                  {t.status === 'معلق' && !isDriver && (
                    <button className="text-xs px-3 py-1.5 gradient-blue text-white rounded-lg font-medium"
                      onClick={() => statusMutation.mutate({ id: t.id, status: 'قيد التنفيذ' })}>بدء التنفيذ</button>
                  )}
                  {t.status === 'قيد التنفيذ' && (
                    <button className="text-xs px-3 py-1.5 gradient-emerald text-white rounded-lg font-medium"
                      onClick={() => statusMutation.mutate({ id: t.id, status: 'مكتمل' })}>تم الاستلام</button>
                  )}
                  {!isDriver && (
                    <button className="text-xs px-3 py-1.5 bg-red-500/15 text-red-400 border border-red-500/25 rounded-lg font-medium"
                      onClick={() => statusMutation.mutate({ id: t.id, status: 'ملغي' })}>إلغاء</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* New Transfer Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="glass w-full max-w-md rounded-2xl border border-border p-6 animate-fade-up max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-foreground mb-5">إنشاء أمر تحويل</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">من مخزن *</label>
                  <select value={form.fromWarehouseId}
                    onChange={e => { const w = warehouses.find(w => w.id === e.target.value); setForm(p => ({ ...p, fromWarehouseId: e.target.value, fromName: w?.name || '' })); }}
                    className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50">
                    <option value="">اختر مخزن</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">إلى مخزن *</label>
                  <select value={form.toWarehouseId}
                    onChange={e => { const w = warehouses.find(w => w.id === e.target.value); setForm(p => ({ ...p, toWarehouseId: e.target.value, toName: w?.name || '' })); }}
                    className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50">
                    <option value="">اختر مخزن</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">اسم السائق</label>
                <input type="text" value={form.driverName} onChange={e => setForm(p => ({ ...p, driverName: e.target.value }))} placeholder="اسم السائق"
                  className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-muted-foreground">المنتجات *</label>
                  <div className="flex gap-2">
                    <button className="icon-btn w-7 h-7 glass text-blue-400" onClick={() => setShowScanner(true)} type="button">
                      <ScanLine className="w-3.5 h-3.5" />
                    </button>
                    <button className="text-xs text-primary" onClick={() => setItems(p => [...p, { product_name: '', quantity: 1, unit: 'كرتون' }])}>+ إضافة</button>
                  </div>
                </div>
                {items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <select value={item.product_name} onChange={e => { const p = products.find(p => p.name === e.target.value); setItems(prev => prev.map((it, i) => i === idx ? { ...it, product_name: e.target.value, unit: p?.unit || it.unit } : it)); }}
                      className="flex-1 bg-card border border-border rounded-xl py-2 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50">
                      <option value="">اختر منتج</option>
                      {products.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>
                    <input type="number" value={item.quantity} min={1} onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Number(e.target.value) } : it))}
                      className="w-20 bg-card border border-border rounded-xl py-2 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
                    {items.length > 1 && (
                      <button className="icon-btn w-8 h-8 glass text-red-400" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}>×</button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">ملاحظات</label>
                <input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button className="flex-1 gradient-blue text-white rounded-xl py-2.5 font-semibold" onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>إنشاء التحويل</button>
              <button className="flex-1 glass text-muted-foreground rounded-xl py-2.5" onClick={() => { interact('click'); setShowForm(false); }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewItem && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="glass w-full max-w-md rounded-2xl border border-border p-6 animate-fade-up">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-foreground">تفاصيل التحويل</h2>
              <button className="icon-btn w-8 h-8 glass text-muted-foreground" onClick={() => { interact('click'); setViewItem(null); }}>
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              {[['من', viewItem.from_warehouse_name], ['إلى', viewItem.to_warehouse_name], ['السائق', viewItem.driver_name], ['التاريخ', new Date(viewItem.created_at).toLocaleDateString('ar-SA')], ['الحالة', viewItem.status], ['إجمالي الوحدات', String(viewItem.total_items)]].map(([label, value]) => (
                <div key={label} className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-sm font-medium text-foreground">{value}</span>
                </div>
              ))}
              {viewItem.notes && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <p className="text-xs text-amber-400 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> {viewItem.notes}</p>
                </div>
              )}
              {viewItem.transfer_items?.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">المنتجات</p>
                  {viewItem.transfer_items.map((p, i) => (
                    <div key={i} className="flex justify-between glass rounded-lg px-3 py-2 mb-1.5">
                      <span className="text-sm text-foreground">{p.product_name}</span>
                      <span className="text-sm text-muted-foreground">{p.quantity} {p.unit}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Transfers;
