import { useState } from 'react';
import { Warehouse, MapPin, Phone, User, Plus, Edit2, Trash2, Search } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Warehouse as WarehouseType } from '@/types';

const Warehouses = () => {
  const { interact } = useInteraction();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const canEdit = profile?.role === 'admin' || profile?.role === 'warehouse_manager';

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<WarehouseType | null>(null);
  const [form, setForm] = useState({
    name: '', code: '', type: 'رئيسي' as WarehouseType['type'],
    location: '', city: '', manager: '', phone: '',
  });

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

  const typeGradient: Record<string, string> = {
    'رئيسي': 'gradient-blue', 'فرعي': 'gradient-emerald', 'تبريد': 'gradient-violet',
    'مواد خطرة': 'gradient-red', 'بضائع جافة': 'gradient-amber',
  };

  const handleSave = () => {
    if (!form.name || !form.code) { interact('error'); toast.error('يرجى تعبئة الحقول المطلوبة'); return; }
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, payload: form });
    } else {
      addMutation.mutate(form);
    }
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 gradient-blue rounded-xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* ─── Toolbar ─── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="البحث بالاسم أو المدينة أو المدير..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white border border-border rounded-xl py-2.5 pr-10 pl-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
        </div>
        {canEdit && (
          <button className="icon-btn gradient-blue text-white px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold flex-shrink-0"
            onClick={() => { interact('add'); setEditItem(null); setForm({ name: '', code: '', type: 'رئيسي', location: '', city: '', manager: '', phone: '' }); setShowForm(true); }}>
            <Plus className="w-4 h-4" /><span>إضافة مخزن</span>
          </button>
        )}
      </div>

      {/* ─── Warehouses Grid ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((w, i) => (
          <div key={w.id}
            className="bg-white rounded-2xl p-5 border border-border glass-hover shadow-sm animate-fade-up"
            style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center', typeGradient[w.type] || 'gradient-blue')}>
                  <Warehouse className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-sm text-foreground leading-tight">{w.name}</p>
                  <p className="text-xs text-muted-foreground">{w.code} • {w.type}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2 mb-4 text-sm">
              {w.location && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{w.location}</span>
                </div>
              )}
              {w.city && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{w.city}</span>
                </div>
              )}
              {w.manager && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{w.manager}</span>
                </div>
              )}
              {w.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                  <span dir="ltr">{w.phone}</span>
                </div>
              )}
            </div>

            {canEdit && (
              <div className="flex gap-2">
                <button
                  className="flex-1 icon-btn gap-2 py-2 bg-muted/60 hover:bg-blue-50 text-muted-foreground hover:text-blue-600 rounded-xl border border-border text-sm"
                  onClick={() => {
                    interact('click');
                    setEditItem(w);
                    setForm({ name: w.name, code: w.code, type: w.type, location: w.location || '', city: w.city || '', manager: w.manager || '', phone: w.phone || '' });
                    setShowForm(true);
                  }}>
                  <Edit2 className="w-3.5 h-3.5" /><span>تعديل</span>
                </button>
                <button
                  className="icon-btn w-9 h-9 bg-muted/60 hover:bg-red-50 text-muted-foreground hover:text-red-500 rounded-xl border border-border"
                  onClick={() => { if (confirm('هل تريد حذف هذا المخزن؟')) deleteMutation.mutate(w.id); }}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-14 text-muted-foreground">
            <Warehouse className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">لا توجد مخازن</p>
          </div>
        )}
      </div>

      {/* ─── Form Modal ─── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl border border-border shadow-xl p-6 animate-fade-up">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 gradient-blue rounded-xl flex items-center justify-center">
                <Warehouse className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-lg font-bold text-foreground">{editItem ? 'تعديل المخزن' : 'إضافة مخزن جديد'}</h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">اسم المخزن *</label>
                <input type="text" value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">كود المخزن *</label>
                <input type="text" value={form.code}
                  onChange={e => setForm(p => ({ ...p, code: e.target.value }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">نوع المخزن</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as WarehouseType['type'] }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50">
                  {['رئيسي', 'فرعي', 'تبريد', 'مواد خطرة', 'بضائع جافة'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">المدينة</label>
                <input type="text" value={form.city}
                  onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">مدير المخزن</label>
                <input type="text" value={form.manager}
                  onChange={e => setForm(p => ({ ...p, manager: e.target.value }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">الموقع</label>
                <input type="text" value={form.location}
                  onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">رقم الهاتف</label>
                <input type="text" value={form.phone}
                  onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button className="flex-1 gradient-blue text-white rounded-xl py-2.5 font-semibold"
                onClick={handleSave}
                disabled={addMutation.isPending || updateMutation.isPending}>
                {editItem ? 'حفظ التعديلات' : 'إضافة المخزن'}
              </button>
              <button className="flex-1 bg-muted text-muted-foreground rounded-xl py-2.5"
                onClick={() => { interact('click'); setShowForm(false); }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Warehouses;
