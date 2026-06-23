import { useState } from 'react';
import { Receipt, Plus, Edit2, Trash2, Search } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const EGP = (v: number) => v.toLocaleString('ar-EG', { minimumFractionDigits: 2 }) + ' ج.م';

// 'مرتبات' removed — salaries are managed exclusively in the Workers module
const CATEGORIES = ['عام', 'إيجار', 'مواصلات', 'صيانة', 'تشغيل', 'وقود', 'مشتريات إدارية', 'أخرى'];

const CAT_COLORS: Record<string, string> = {
  'مرتبات': 'text-blue-400 bg-blue-500/15 border-blue-500/25',
  'إيجار': 'text-violet-400 bg-violet-500/15 border-violet-500/25',
  'مواصلات': 'text-cyan-400 bg-cyan-500/15 border-cyan-500/25',
  'صيانة': 'text-amber-400 bg-amber-500/15 border-amber-500/25',
  'تشغيل': 'text-emerald-400 bg-emerald-500/15 border-emerald-500/25',
  'وقود': 'text-orange-400 bg-orange-500/15 border-orange-500/25',
  'مشتريات إدارية': 'text-pink-400 bg-pink-500/15 border-pink-500/25',
  'عام': 'text-gray-400 bg-white/8 border-white/15',
};

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  expense_date: string;
  created_at: string;
}

const Expenses = () => {
  const { interact } = useInteraction();
  const { profile } = useAuth();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('الكل');
  const [filterMonth, setFilterMonth] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Expense | null>(null);
  const today = new Date().toISOString().split('T')[0];
  const emptyForm = { description: '', amount: 0, category: 'عام', expense_date: today };
  const [form, setForm] = useState({ ...emptyForm, category: 'عام' });

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses')
        .select('id, description, amount, category, expense_date, created_at')
        .order('expense_date', { ascending: false });
      if (error) throw error;
      return data as Expense[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (payload: typeof emptyForm) => {
      const { error } = await supabase.from('expenses').insert({ ...payload, created_by: profile?.id });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); interact('success'); toast.success('تم إضافة المصروف'); setShowForm(false); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: typeof emptyForm }) => {
      const { error } = await supabase.from('expenses').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); interact('success'); toast.success('تم تحديث المصروف'); setShowForm(false); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); interact('delete'); toast.success('تم حذف المصروف'); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const filtered = expenses.filter(e => {
    const mSearch = e.description.includes(search) || e.category.includes(search);
    const mCat = filterCategory === 'الكل' || e.category === filterCategory;
    const mMonth = !filterMonth || e.expense_date.startsWith(filterMonth);
    return mSearch && mCat && mMonth;
  });

  const thisMonth = new Date().toISOString().slice(0, 7);
  const thisMonthTotal = expenses.filter(e => e.expense_date.startsWith(thisMonth)).reduce((s, e) => s + e.amount, 0);
  const filteredTotal = filtered.reduce((s, e) => s + e.amount, 0);

  const categoryTotals = CATEGORIES.map(cat => ({
    cat,
    total: filtered.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  const handleSave = () => {
    if (!form.description || !form.amount) { interact('error'); toast.error('يرجى تعبئة الحقول المطلوبة'); return; }
    if (form.category === 'مرتبات') { interact('error'); toast.error('تسجيل المرتبات يتم من صفحة العمال فقط'); return; }
    if (editItem) updateMutation.mutate({ id: editItem.id, payload: form });
    else addMutation.mutate(form);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 gradient-amber rounded-xl animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي المصروفات (المعروضة)', value: EGP(filteredTotal), color: 'text-red-400', border: 'border-red-500/20' },
          { label: 'مصروفات هذا الشهر', value: EGP(thisMonthTotal), color: 'text-amber-400', border: 'border-amber-500/20' },
          { label: 'عدد السجلات', value: filtered.length, color: 'text-blue-400', border: 'border-blue-500/20' },
          { label: 'أكثر فئة إنفاقاً', value: categoryTotals[0]?.cat || '—', color: 'text-violet-400', border: 'border-violet-500/20' },
        ].map(k => (
          <div key={k.label} className={`glass rounded-xl p-4 border ${k.border} cursor-pointer stat-shine`} onClick={() => interact('click')}>
            <div className="flex items-center gap-1.5 mb-1"><Receipt className={`w-3.5 h-3.5 ${k.color}`} /><p className="text-xs text-muted-foreground">{k.label}</p></div>
            <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Category breakdown */}
      {categoryTotals.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categoryTotals.slice(0, 6).map(c => (
            <button key={c.cat} onClick={() => { interact('click'); setFilterCategory(filterCategory === c.cat ? 'الكل' : c.cat); }}
              className={cn('flex-shrink-0 glass rounded-xl px-4 py-2.5 text-right transition-all border min-w-28',
                filterCategory === c.cat ? 'border-amber-500/40 bg-amber-500/10' : 'border-border hover:border-amber-500/25')}>
              <p className="text-xs text-muted-foreground">{c.cat}</p>
              <p className="text-sm font-bold text-amber-400">{EGP(c.total)}</p>
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-44">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="البحث في المصروفات..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-xl py-2.5 pr-10 pl-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
        </div>
        <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
          className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
        <select value={filterCategory} onChange={e => { interact('click'); setFilterCategory(e.target.value); }}
          className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50">
          <option value="الكل">كل الفئات</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="icon-btn gradient-blue text-white px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold"
          onClick={() => { interact('add'); setEditItem(null); setForm(emptyForm); setShowForm(true); }}>
          <Plus className="w-4 h-4" /><span>إضافة مصروف</span>
        </button>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-white/3">
                {['التاريخ', 'الوصف', 'الفئة', 'المبلغ', 'إجراء'].map(h => (
                  <th key={h} className="text-right text-xs text-muted-foreground px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((expense, i) => (
                <tr key={expense.id} className="border-b border-border/50 hover:bg-white/3 transition-colors animate-fade-up" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                  <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{expense.expense_date}</td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{expense.description}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs px-2 py-1 rounded-lg border font-medium', CAT_COLORS[expense.category] || 'text-muted-foreground bg-white/5 border-border')}>
                      {expense.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-red-400">{EGP(expense.amount)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button className="icon-btn w-8 h-8 glass text-muted-foreground hover:text-primary"
                        onClick={() => { interact('click'); setEditItem(expense); setForm({ description: expense.description, amount: expense.amount, category: expense.category, expense_date: expense.expense_date }); setShowForm(true); }}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button className="icon-btn w-8 h-8 glass text-muted-foreground hover:text-red-400" onClick={() => deleteMutation.mutate(expense.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-sm">لا توجد مصروفات مسجلة</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border flex justify-between items-center">
            <p className="text-xs text-muted-foreground">{filtered.length} سجل</p>
            <p className="text-sm font-bold text-red-400">الإجمالي: {EGP(filteredTotal)}</p>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="glass w-full max-w-md rounded-2xl border border-border p-6 animate-fade-up">
            <h2 className="text-lg font-bold text-foreground mb-5">{editItem ? 'تعديل المصروف' : 'إضافة مصروف جديد'}</h2>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">وصف المصروف *</label>
                <input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  placeholder="مثال: إيجار مخزن يناير" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">المبلغ (ج.م) *</label>
                  <input type="number" value={form.amount} min={0} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))}
                    className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">التاريخ</label>
                  <input type="date" value={form.expense_date} onChange={e => setForm(p => ({ ...p, expense_date: e.target.value }))}
                    className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">الفئة</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                  className="bg-card border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button className="flex-1 gradient-blue text-white rounded-xl py-2.5 font-semibold" onClick={handleSave} disabled={addMutation.isPending || updateMutation.isPending}>
                {editItem ? 'حفظ التعديلات' : 'إضافة المصروف'}
              </button>
              <button className="flex-1 glass text-muted-foreground rounded-xl py-2.5" onClick={() => { interact('click'); setShowForm(false); }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
