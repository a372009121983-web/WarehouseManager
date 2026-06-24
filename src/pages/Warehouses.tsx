import { useState } from 'react';
import { Warehouse, MapPin, Phone, User, Plus, Edit2, Trash2, Search, Building2 } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Warehouse as WarehouseType } from '@/types';

// ── Shared Design Tokens ─────────────────────────────────────────────────────
const INPUT = 'w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all';
const BTN_PRIMARY = 'flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95';
const BTN_SECONDARY = 'flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-sm font-medium transition-all duration-200';
const BTN_DANGER = 'flex items-center justify-center w-9 h-9 bg-white hover:bg-red-50 text-slate-400 hover:text-red-500 border border-slate-200 rounded-xl transition-all duration-200';
const CARD = 'bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200';

const typeConfig: Record<string, { gradient: string; label: string }> = {
  'رئيسي':       { gradient: 'bg-blue-600',   label: 'رئيسي' },
  'فرعي':        { gradient: 'bg-emerald-600', label: 'فرعي' },
  'تبريد':       { gradient: 'bg-cyan-600',    label: 'تبريد' },
  'مواد خطرة':   { gradient: 'bg-red-600',     label: 'خطر' },
  'بضائع جافة':  { gradient: 'bg-amber-600',   label: 'جاف' },
};

const Warehouses = () => {
  const { interact } = useInteraction();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const canEdit = profile?.role === 'admin' || profile?.role === 'warehouse_manager';

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<WarehouseType | null>(null);
  const emptyForm = { name: '', code: '', type: 'رئيسي' as WarehouseType['type'], location: '', city: '', manager: '', phone: '' };
  const [form, setForm] = useState(emptyForm);

  const { data: warehouses = [], isLoading } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouses').select('*').order('name');
      if (error) throw error;
      return data as WarehouseType[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (payload: Partial<WarehouseType>) => {
      const { error } = await supabase.from('warehouses').insert({ ...payload, capacity: 0, used: 0, status: 'نشط' });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['warehouses'] }); interact('success'); toast.success('تم إضافة المخزن بنجاح'); setShowForm(false); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<WarehouseType> }) => {
      const { error } = await supabase.from('warehouses').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['warehouses'] }); interact('success'); toast.success('تم تحديث المخزن'); setShowForm(false); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('warehouses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['warehouses'] }); interact('delete'); toast.success('تم حذف المخزن'); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const filtered = warehouses.filter(w =>
    w.name.includes(search) || (w.city || '').includes(search) || (w.manager || '').includes(search)
  );

  const handleSave = () => {
    if (!form.name || !form.code) { interact('error'); toast.error('يرجى تعبئة الحقول المطلوبة'); return; }
    if (editItem) updateMutation.mutate({ id: editItem.id, payload: form });
    else addMutation.mutate(form);
  };

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
      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'إجمالي المخازن', val: warehouses.length, color: 'border-blue-200', text: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'نشطة', val: warehouses.filter(w => w.status === 'نشط').length, color: 'border-emerald-200', text: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'المدن', val: [...new Set(warehouses.map(w => w.city).filter(Boolean))].length, color: 'border-amber-200', text: 'text-amber-700', bg: 'bg-amber-50' },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl p-4 border ${s.color} ${s.bg}`}>
            <p className="text-xs text-slate-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.text}`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="البحث بالاسم أو المدينة أو المدير..." value={search}
            onChange={e => setSearch(e.target.value)} className={cn(INPUT, 'pr-10')} />
        </div>
        {canEdit && (
          <button className={BTN_PRIMARY} onClick={() => { interact('add'); setEditItem(null); setForm(emptyForm); setShowForm(true); }}>
            <Plus className="w-4 h-4" /><span>إضافة مخزن</span>
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((w, i) => {
          const cfg = typeConfig[w.type] || typeConfig['رئيسي'];
          return (
            <div key={w.id} className={cn(CARD, 'p-5 animate-fade-up')} style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center', cfg.gradient)}>
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-slate-800 leading-tight">{w.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-slate-400">{w.code}</span>
                      <span className="w-1 h-1 bg-slate-300 rounded-full" />
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', cfg.gradient, 'text-white')}>{w.type}</span>
                    </div>
                  </div>
                </div>
                <span className={cn('text-xs px-2 py-1 rounded-lg font-medium border',
                  w.status === 'نشط' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200')}>
                  {w.status || 'نشط'}
                </span>
              </div>

              <div className="space-y-2 mb-4">
                {w.location && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="truncate">{w.location}</span>
                  </div>
                )}
                {w.city && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Warehouse className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span>{w.city}</span>
                  </div>
                )}
                {w.manager && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <User className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span>{w.manager}</span>
                  </div>
                )}
                {w.phone && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span dir="ltr">{w.phone}</span>
                  </div>
                )}
              </div>

              {canEdit && (
                <div className="flex gap-2 pt-3 border-t border-slate-100">
                  <button className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 text-sm font-medium transition-all"
                    onClick={() => { interact('click'); setEditItem(w); setForm({ name: w.name, code: w.code, type: w.type, location: w.location || '', city: w.city || '', manager: w.manager || '', phone: w.phone || '' }); setShowForm(true); }}>
                    <Edit2 className="w-3.5 h-3.5" /><span>تعديل</span>
                  </button>
                  <button className={BTN_DANGER}
                    onClick={() => { if (confirm('هل تريد حذف هذا المخزن؟')) deleteMutation.mutate(w.id); }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-slate-400">
            <Building2 className="w-12 h-12 mb-3 opacity-25" />
            <p className="text-sm font-medium mb-1">لا توجد مخازن</p>
            <p className="text-xs opacity-70">اضغط "إضافة مخزن" لإنشاء أول مخزن</p>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 animate-fade-up">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center">
                <Building2 className="w-4.5 h-4.5 text-white" />
              </div>
              <h2 className="text-base font-bold text-slate-800">{editItem ? 'تعديل المخزن' : 'إضافة مخزن جديد'}</h2>
            </div>
            <div className="p-6 grid grid-cols-2 gap-3">
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">اسم المخزن *</label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={INPUT} placeholder="أدخل اسم المخزن" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">كود المخزن *</label>
                <input type="text" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} className={INPUT} placeholder="مثال: WH-001" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">نوع المخزن</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as WarehouseType['type'] }))} className={INPUT}>
                  {['رئيسي', 'فرعي', 'تبريد', 'مواد خطرة', 'بضائع جافة'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">المدينة</label>
                <input type="text" value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} className={INPUT} placeholder="المدينة" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">مدير المخزن</label>
                <input type="text" value={form.manager} onChange={e => setForm(p => ({ ...p, manager: e.target.value }))} className={INPUT} placeholder="اسم المدير" />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">الموقع التفصيلي</label>
                <input type="text" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} className={INPUT} placeholder="العنوان التفصيلي" />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">رقم الهاتف</label>
                <input type="text" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className={INPUT} placeholder="رقم التواصل" />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button className={cn(BTN_PRIMARY, 'flex-1')} onClick={handleSave} disabled={addMutation.isPending || updateMutation.isPending}>
                {(addMutation.isPending || updateMutation.isPending) ? 'جاري الحفظ...' : editItem ? 'حفظ التعديلات' : 'إضافة المخزن'}
              </button>
              <button className={cn(BTN_SECONDARY, 'flex-1')} onClick={() => { interact('click'); setShowForm(false); }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Warehouses;
