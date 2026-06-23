import { useState, useMemo } from 'react';
import { AlertTriangle, Plus, Trash2, Search, Edit2, Calendar, Package } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const EGP = (v: number) => v.toLocaleString('ar-EG', { minimumFractionDigits: 2 }) + ' ج.م';
const todayStr = () => new Date().toISOString().split('T')[0];

const DAMAGE_TYPES = ['تالف', 'منتهي الصلاحية', 'مسروق', 'حريق', 'كسر', 'رطوبة', 'أخرى'];

const TYPE_COLORS: Record<string, string> = {
  'تالف':              'text-red-600 bg-red-50 border-red-200',
  'منتهي الصلاحية':    'text-orange-600 bg-orange-50 border-orange-200',
  'مسروق':             'text-violet-600 bg-violet-50 border-violet-200',
  'حريق':              'text-red-700 bg-red-100 border-red-300',
  'كسر':               'text-amber-600 bg-amber-50 border-amber-200',
  'رطوبة':             'text-blue-600 bg-blue-50 border-blue-200',
  'أخرى':              'text-muted-foreground bg-muted border-border',
};

interface Damage {
  id: string;
  product_name: string;
  warehouse_name: string | null;
  quantity: number;
  unit: string | null;
  damage_type: string;
  reason: string | null;
  damage_date: string;
  unit_cost: number | null;
  created_at: string;
}

interface ProductOpt { id: string; name: string; unit: string | null; purchase_price: number | null; }
interface WarehouseOpt { id: string; name: string; }

type DmgForm = {
  product_name: string;
  warehouse_name: string;
  quantity: number;
  unit: string;
  damage_type: string;
  reason: string;
  damage_date: string;
  unit_cost: number;
};

const Damages = () => {
  const { interact } = useInteraction();
  const { profile } = useAuth();
  const qc = useQueryClient();

  const [search, setSearch]           = useState('');
  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [wFilter, setWFilter]         = useState('');
  const [typeFilter, setTypeFilter]   = useState('');
  const [showForm, setShowForm]       = useState(false);
  const [editItem, setEditItem]       = useState<Damage | null>(null);

  const empty: DmgForm = { product_name: '', warehouse_name: '', quantity: 1, unit: '', damage_type: 'تالف', reason: '', damage_date: todayStr(), unit_cost: 0 };
  const [form, setForm] = useState<DmgForm>(empty);

  // ─── Queries ─────────────────────────────────────────────────────────────
  const { data: damages = [], isLoading } = useQuery({
    queryKey: ['damages'],
    queryFn: async () => {
      const { data, error } = await supabase.from('damages').select('*').order('damage_date', { ascending: false });
      if (error) throw error;
      return data as Damage[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products-dmg'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name, unit, purchase_price').order('name');
      return (data || []) as ProductOpt[];
    },
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses-dmg'],
    queryFn: async () => {
      const { data } = await supabase.from('warehouses').select('id, name').order('name');
      return (data || []) as WarehouseOpt[];
    },
  });

  // ─── Mutations ────────────────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: async (payload: DmgForm) => {
      const { error } = await supabase.from('damages').insert({ ...payload, created_by: profile?.id });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['damages'] }); interact('success'); toast.success('تم تسجيل الهالك'); setShowForm(false); setForm(empty); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: DmgForm }) => {
      const { error } = await supabase.from('damages').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['damages'] }); interact('success'); toast.success('تم تحديث السجل'); setShowForm(false); setEditItem(null); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('damages').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['damages'] }); interact('delete'); toast.success('تم حذف السجل'); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const handleProductSelect = (productId: string) => {
    const p = products.find(x => x.id === productId);
    if (p) setForm(prev => ({ ...prev, product_name: p.name, unit: p.unit || '', unit_cost: p.purchase_price || 0 }));
  };

  const handleSave = () => {
    if (!form.product_name || form.quantity < 1) { interact('error'); toast.error('يرجى تعبئة اسم المنتج والكمية'); return; }
    if (editItem) updateMutation.mutate({ id: editItem.id, payload: form });
    else addMutation.mutate(form);
  };

  const openEdit = (d: Damage) => {
    setEditItem(d);
    setForm({ product_name: d.product_name, warehouse_name: d.warehouse_name || '', quantity: d.quantity, unit: d.unit || '', damage_type: d.damage_type || 'تالف', reason: d.reason || '', damage_date: d.damage_date, unit_cost: d.unit_cost || 0 });
    setShowForm(true);
  };

  // ─── Computed ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => damages.filter(d => {
    const mS = !search      || d.product_name.includes(search) || (d.warehouse_name || '').includes(search);
    const mW = !wFilter     || d.warehouse_name === wFilter;
    const mT = !typeFilter  || d.damage_type === typeFilter;
    const mF = !dateFrom    || d.damage_date >= dateFrom;
    const mTo = !dateTo     || d.damage_date <= dateTo;
    return mS && mW && mT && mF && mTo;
  }), [damages, search, wFilter, typeFilter, dateFrom, dateTo]);

  const totalQty   = filtered.reduce((s, d) => s + d.quantity, 0);
  const totalValue = filtered.reduce((s, d) => s + d.quantity * (d.unit_cost || 0), 0);
  const thisMonth  = new Date().toISOString().slice(0, 7);
  const monthCount = damages.filter(d => d.damage_date.startsWith(thisMonth)).length;

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 gradient-red rounded-xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* ─── KPIs ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي سجلات الهالك',    value: filtered.length,                       color: 'text-red-600',    border: 'border-red-200 bg-red-50/60' },
          { label: 'إجمالي الكميات التالفة',  value: totalQty.toLocaleString('ar-EG'),      color: 'text-orange-600', border: 'border-orange-200 bg-orange-50/60' },
          { label: 'القيمة الإجمالية للهالك', value: EGP(totalValue),                       color: 'text-violet-600', border: 'border-violet-200 bg-violet-50/60' },
          { label: 'هالك هذا الشهر',          value: monthCount,                            color: 'text-amber-600',  border: 'border-amber-200 bg-amber-50/60' },
        ].map(k => (
          <div key={k.label} className={`rounded-xl p-4 border stat-shine cursor-pointer ${k.border}`} onClick={() => interact('click')}>
            <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
            <p className={`text-lg font-bold break-all ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* ─── Filter Bar ─── */}
      <div className="bg-white rounded-2xl p-4 border border-border shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="relative flex-1 min-w-44">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="البحث بالمنتج أو المخزن..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-border rounded-xl py-2.5 pr-10 pl-4 text-sm text-foreground focus:outline-none focus:border-primary/50" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />من</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="bg-white border border-border rounded-xl py-2 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />إلى</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="bg-white border border-border rounded-xl py-2 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
          </div>
          <select value={wFilter} onChange={e => setWFilter(e.target.value)}
            className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50">
            <option value="">كل المخازن</option>
            {warehouses.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50">
            <option value="">كل الأنواع</option>
            {DAMAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {(search || dateFrom || dateTo || wFilter || typeFilter) && (
            <button className="px-3 py-2 bg-muted text-muted-foreground rounded-xl text-sm hover:bg-muted/80"
              onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); setWFilter(''); setTypeFilter(''); }}>
              مسح
            </button>
          )}
          <button className="icon-btn gradient-red text-white px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold flex-shrink-0"
            onClick={() => { interact('add'); setEditItem(null); setForm(empty); setShowForm(true); }}>
            <Plus className="w-4 h-4" /><span>تسجيل هالك</span>
          </button>
        </div>
      </div>

      {/* ─── Table ─── */}
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['التاريخ', 'المنتج', 'المخزن', 'الكمية', 'نوع الهالك', 'السبب', 'سعر الوحدة', 'القيمة', 'إجراء'].map(h => (
                  <th key={h} className="text-right text-xs text-muted-foreground px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr key={d.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors animate-fade-up" style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}>
                  <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{d.damage_date}</td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{d.product_name}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{d.warehouse_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-bold text-red-600">{d.quantity}</span>
                    {d.unit && <span className="text-xs text-muted-foreground mr-1">{d.unit}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs px-2 py-1 rounded-lg border font-medium', TYPE_COLORS[d.damage_type] || TYPE_COLORS['أخرى'])}>
                      {d.damage_type || 'تالف'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground max-w-32 truncate">{d.reason || '—'}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{d.unit_cost ? EGP(d.unit_cost) : '—'}</td>
                  <td className="px-4 py-3 text-sm font-bold text-red-500">{d.unit_cost ? EGP(d.quantity * d.unit_cost) : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button className="icon-btn w-8 h-8 bg-muted/60 hover:bg-blue-50 text-muted-foreground hover:text-blue-600 rounded-xl border border-border"
                        onClick={() => { interact('click'); openEdit(d); }}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button className="icon-btn w-8 h-8 bg-muted/60 hover:bg-red-50 text-muted-foreground hover:text-red-500 rounded-xl border border-border"
                        onClick={() => { if (confirm('هل تريد حذف هذا السجل؟')) deleteMutation.mutate(d.id); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-14 text-center">
                  <Package className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-muted-foreground text-sm">لا توجد سجلات هالك</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border flex justify-between items-center bg-muted/20">
            <p className="text-xs text-muted-foreground">{filtered.length} سجل</p>
            <div className="flex gap-5 text-sm">
              <span className="text-muted-foreground">الكميات: <span className="font-bold text-red-600">{totalQty.toLocaleString('ar-EG')}</span></span>
              <span className="text-muted-foreground">القيمة الإجمالية: <span className="font-bold text-red-600">{EGP(totalValue)}</span></span>
            </div>
          </div>
        )}
      </div>

      {/* ─── Form Modal ─── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl border border-border shadow-xl p-6 animate-fade-up my-4">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 gradient-red rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-lg font-bold text-foreground">{editItem ? 'تعديل سجل الهالك' : 'تسجيل هالك جديد'}</h2>
            </div>

            <div className="space-y-3">
              {/* Product selector */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">اختر من قائمة المنتجات (اختياري)</label>
                <select onChange={e => { if (e.target.value) handleProductSelect(e.target.value); }}
                  className="w-full bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50">
                  <option value="">— اختر منتجاً للتعبئة التلقائية —</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">اسم المنتج *</label>
                  <input type="text" value={form.product_name}
                    onChange={e => setForm(p => ({ ...p, product_name: e.target.value }))}
                    placeholder="اسم المنتج التالف"
                    className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">المخزن</label>
                  <select value={form.warehouse_name} onChange={e => setForm(p => ({ ...p, warehouse_name: e.target.value }))}
                    className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50">
                    <option value="">اختر المخزن</option>
                    {warehouses.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">الكمية *</label>
                  <input type="number" min={1} value={form.quantity || ''}
                    onChange={e => setForm(p => ({ ...p, quantity: Number(e.target.value) }))}
                    className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">الوحدة</label>
                  <input type="text" value={form.unit} placeholder="قطعة / كجم"
                    onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}
                    className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">سعر الوحدة (ج.م)</label>
                  <input type="number" min={0} value={form.unit_cost || ''}
                    onChange={e => setForm(p => ({ ...p, unit_cost: Number(e.target.value) }))}
                    className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">نوع الهالك</label>
                  <select value={form.damage_type} onChange={e => setForm(p => ({ ...p, damage_type: e.target.value }))}
                    className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50">
                    {DAMAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">تاريخ الهالك</label>
                  <input type="date" value={form.damage_date}
                    onChange={e => setForm(p => ({ ...p, damage_date: e.target.value }))}
                    className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">سبب الهالك / ملاحظات</label>
                <input type="text" value={form.reason} placeholder="وصف مختصر للسبب..."
                  onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>

              {form.quantity > 0 && form.unit_cost > 0 && (
                <div className="flex items-center justify-between bg-red-50 rounded-xl px-4 py-3 border border-red-100">
                  <span className="text-sm text-red-700">القيمة الإجمالية للهالك:</span>
                  <span className="font-bold text-red-700 text-base">{EGP(form.quantity * form.unit_cost)}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <button className="flex-1 gradient-red text-white rounded-xl py-2.5 font-semibold transition-all"
                onClick={handleSave}
                disabled={addMutation.isPending || updateMutation.isPending}>
                {editItem ? 'حفظ التعديلات' : 'تسجيل الهالك'}
              </button>
              <button className="flex-1 bg-muted text-muted-foreground rounded-xl py-2.5 hover:bg-muted/80"
                onClick={() => { interact('click'); setShowForm(false); setEditItem(null); }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Damages;
