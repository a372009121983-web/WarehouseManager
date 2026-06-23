import { useState, useRef } from 'react';
import { Package, Plus, Edit2, Trash2, Search, Tag, DollarSign, TrendingDown, TrendingUp, Upload, ShoppingBag } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Product } from '@/types';

const EGP = (v: number) => v.toLocaleString('ar-EG', { minimumFractionDigits: 2 }) + ' ج.م';

const categoryColors: Record<string, string> = {
  'حبوب': 'gradient-blue', 'زيوت': 'gradient-amber', 'مواد أساسية': 'gradient-emerald',
  'منتجات ألبان': 'gradient-violet', 'مشروبات': 'gradient-blue', 'معلبات': 'gradient-red', 'مواد تنظيف': 'gradient-emerald',
};

interface InventoryTotals { [productId: string]: number }

const Products = () => {
  const { interact } = useInteraction();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const canDelete = profile?.role === 'admin' || profile?.role === 'warehouse_manager';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [qtyProduct, setQtyProduct] = useState<Product | null>(null);
  const [qtyForm, setQtyForm]       = useState({ warehouse_id: '', quantity: 0 });
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Product | null>(null);
  const emptyForm = { name: '', category: '', min_stock: 50, price: 0, purchase_price: 0, min_sale_price: 0, max_sale_price: 0 };
  const [form, setForm] = useState(emptyForm);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').order('name');
      if (error) throw error;
      return data as Product[];
    },
    staleTime: 60000,
  });

  // Fetch total inventory quantities per product
  const { data: inventoryTotals = {} } = useQuery<InventoryTotals>({
    queryKey: ['products-inventory-totals'],
    queryFn: async () => {
      const { data } = await supabase.from('inventory').select('product_id, quantity');
      const totals: InventoryTotals = {};
      (data || []).forEach((row: { product_id: string; quantity: number }) => {
        totals[row.product_id] = (totals[row.product_id] || 0) + row.quantity;
      });
      return totals;
    },
    staleTime: 30000,
  });

  const { data: warehousesList = [] } = useQuery({
    queryKey: ['warehouses-product'],
    queryFn: async () => {
      const { data } = await supabase.from('warehouses').select('id,name').order('name');
      return (data || []) as { id: string; name: string }[];
    },
    staleTime: 60000,
  });

  const addMutation = useMutation({
    mutationFn: async (payload: Partial<Product>) => {
      // Generate a minimal sku from name for DB compatibility
      const sku = `P-${Date.now()}`;
      const { error } = await supabase.from('products').insert({ ...payload, sku, unit: '', barcode: '' });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); interact('success'); toast.success('تم إضافة المنتج'); setShowForm(false); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Product> }) => {
      const { error } = await supabase.from('products').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); interact('success'); toast.success('تم تحديث المنتج'); setShowForm(false); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); interact('delete'); toast.success('تم حذف المنتج'); },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const addQtyMutation = useMutation({
    mutationFn: async ({ product_id, warehouse_id, quantity }: { product_id: string; warehouse_id: string; quantity: number }) => {
      const { data: existing } = await supabase.from('inventory').select('id,quantity').eq('product_id', product_id).eq('warehouse_id', warehouse_id).maybeSingle();
      if (existing) {
        const { error } = await supabase.from('inventory').update({ quantity: existing.quantity + quantity, last_updated: new Date().toISOString() }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('inventory').insert({ product_id, warehouse_id, quantity });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products-inventory-totals'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      interact('success');
      toast.success('تم تحديث الكمية في المخزن');
      setQtyProduct(null);
      setQtyForm({ warehouse_id: '', quantity: 0 });
    },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const filtered = products.filter(p =>
    p.name.includes(search) || (p.category || '').includes(search)
  );
  const categories = [...new Set(products.map(p => p.category))];

  const handleSave = () => {
    if (!form.name) { interact('error'); toast.error('يرجى إدخال اسم المنتج'); return; }
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, payload: form });
    } else {
      addMutation.mutate(form);
    }
  };

  // Import from Excel/CSV
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').slice(1).filter(Boolean);
      let count = 0;
      for (const line of lines) {
        const cols = line.split(',');
        if (!cols[0]) continue;
        const name = cols[0]?.trim();
        if (!name) continue;
        const payload = {
          name,
          sku: `P-${Date.now()}-${count}`,
          barcode: '',
          unit: '',
          category: cols[1]?.trim() || 'عام',
          min_stock: parseInt(cols[2]) || 50,
          purchase_price: parseFloat(cols[3]) || 0,
          price: parseFloat(cols[4]) || 0,
          min_sale_price: parseFloat(cols[5]) || 0,
          max_sale_price: parseFloat(cols[6]) || 0,
        };
        const { error } = await supabase.from('products').insert(payload);
        if (!error) count++;
      }
      qc.invalidateQueries({ queryKey: ['products'] });
      interact('success');
      toast.success(`تم استيراد ${count} منتج`);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  if (isLoading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 gradient-blue rounded-xl animate-pulse" /></div>;

  return (
    <div className="space-y-5">
      <input ref={fileInputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleImportExcel} />

      {/* ─── KPIs ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي المنتجات',    val: products.length,  color: 'text-blue-600',    border: 'border-blue-200 bg-blue-50/60' },
          { label: 'الفئات',              val: categories.length, color: 'text-emerald-600', border: 'border-emerald-200 bg-emerald-50/60' },
          { label: 'متوسط سعر البيع',    val: products.length ? EGP(Math.round(products.reduce((s, p) => s + p.price, 0) / products.length)) : '0 ج.م', color: 'text-amber-600', border: 'border-amber-200 bg-amber-50/60' },
          { label: 'متوسط سعر الشراء',   val: products.length ? EGP(Math.round(products.reduce((s, p) => s + (p.purchase_price || 0), 0) / products.length)) : '0 ج.م', color: 'text-violet-600', border: 'border-violet-200 bg-violet-50/60' },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl p-4 border stat-shine cursor-pointer ${s.border}`} onClick={() => interact('click')}>
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-xl font-bold break-all ${s.color}`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* ─── Toolbar ─── */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="البحث بالاسم أو الفئة..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-white border border-border rounded-xl py-2.5 pr-10 pl-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
        </div>
        <button className="icon-btn gap-2 px-3 py-2.5 bg-white text-cyan-600 border border-cyan-300 rounded-xl text-sm hover:bg-cyan-50"
          onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-4 h-4" /><span className="hidden sm:inline">استيراد Excel</span>
        </button>
        <button className="icon-btn gradient-blue text-white px-4 py-2.5 gap-2 rounded-xl text-sm font-semibold"
          onClick={() => { interact('add'); setEditItem(null); setForm(emptyForm); setShowForm(true); }}>
          <Plus className="w-4 h-4" /><span>إضافة منتج</span>
        </button>
      </div>

      {/* ─── Products Grid ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((product, i) => {
          const totalQty = inventoryTotals[product.id] || 0;
          return (
            <div key={product.id} className="bg-white rounded-2xl p-4 border border-border glass-hover shadow-sm animate-fade-up" style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}>
              <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center mb-3', categoryColors[product.category] || 'gradient-blue')}>
                <Package className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-sm text-foreground mb-2 truncate">{product.name}</h3>

              <div className="space-y-1.5 mb-3">
                {product.category && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Tag className="w-3 h-3" /><span>{product.category}</span>
                  </div>
                )}

                {/* Quantity */}
                <div className={cn(
                  'flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-lg w-fit',
                  totalQty === 0
                    ? 'bg-red-50 text-red-600 border border-red-200'
                    : totalQty <= (product.min_stock || 0)
                      ? 'bg-amber-50 text-amber-600 border border-amber-200'
                      : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                )}>
                  <Package className="w-3 h-3" />
                  <span>الكمية: {totalQty.toLocaleString('ar-EG')}</span>
                </div>

                {product.purchase_price ? (
                  <div className="flex items-center gap-1.5">
                    <TrendingDown className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">شراء: <span className="text-foreground font-medium">{EGP(product.purchase_price)}</span></span>
                  </div>
                ) : null}
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-3 h-3 text-amber-500" />
                  <span className="text-sm font-bold text-amber-600">بيع: {EGP(product.price)}</span>
                </div>
                {(product.min_sale_price || product.max_sale_price) ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <TrendingUp className="w-3 h-3" />
                    <span>{EGP(product.min_sale_price || 0)} — {EGP(product.max_sale_price || 0)}</span>
                  </div>
                ) : null}
              </div>

              <div className="flex gap-1.5">
                <button className="flex-1 icon-btn gap-1 py-1.5 bg-muted/60 hover:bg-blue-50 text-muted-foreground hover:text-blue-600 text-xs rounded-xl border border-border"
                  onClick={() => {
                    interact('click'); setEditItem(product);
                    setForm({ name: product.name, category: product.category, min_stock: product.min_stock, price: product.price, purchase_price: product.purchase_price || 0, min_sale_price: product.min_sale_price || 0, max_sale_price: product.max_sale_price || 0 });
                    setShowForm(true);
                  }}>
                  <Edit2 className="w-3 h-3" /><span>تعديل</span>
                </button>
                <button className="flex-1 icon-btn gap-1 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs rounded-xl border border-emerald-200"
                  onClick={() => { interact('click'); setQtyProduct(product); setQtyForm({ warehouse_id: '', quantity: 0 }); }}>
                  <ShoppingBag className="w-3 h-3" /><span>كمية</span>
                </button>
                {canDelete && (
                  <button className="icon-btn w-8 h-8 bg-muted/60 hover:bg-red-50 text-muted-foreground hover:text-red-500 rounded-xl border border-border"
                    onClick={() => { if (confirm('هل تريد حذف هذا المنتج؟')) deleteMutation.mutate(product.id); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-14 text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">لا توجد منتجات</p>
          </div>
        )}
      </div>

      {/* ─── Form Modal ─── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl border border-border shadow-xl p-6 animate-fade-up my-4">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 gradient-blue rounded-xl flex items-center justify-center">
                <Package className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-lg font-bold text-foreground">{editItem ? 'تعديل المنتج' : 'إضافة منتج جديد'}</h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">اسم المنتج *</label>
                <input type="text" value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="أدخل اسم المنتج"
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">الفئة</label>
                <input type="text" value={form.category}
                  onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                  placeholder="مثال: حبوب، زيوت..."
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">حد التنبيه (المخزون)</label>
                <input type="number" value={form.min_stock || ''}
                  onChange={e => setForm(p => ({ ...p, min_stock: Number(e.target.value) }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">سعر الشراء (ج.م)</label>
                <input type="number" value={form.purchase_price || ''}
                  onChange={e => setForm(p => ({ ...p, purchase_price: Number(e.target.value) }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">سعر البيع (ج.م)</label>
                <input type="number" value={form.price || ''}
                  onChange={e => setForm(p => ({ ...p, price: Number(e.target.value) }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">أدنى سعر بيع (ج.م)</label>
                <input type="number" value={form.min_sale_price || ''}
                  onChange={e => setForm(p => ({ ...p, min_sale_price: Number(e.target.value) }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">أقصى سعر بيع (ج.م)</label>
                <input type="number" value={form.max_sale_price || ''}
                  onChange={e => setForm(p => ({ ...p, max_sale_price: Number(e.target.value) }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button className="flex-1 gradient-blue text-white rounded-xl py-2.5 font-semibold"
                onClick={handleSave}
                disabled={addMutation.isPending || updateMutation.isPending}>
                {editItem ? 'حفظ التعديلات' : 'إضافة المنتج'}
              </button>
              <button className="flex-1 bg-muted text-muted-foreground rounded-xl py-2.5"
                onClick={() => { interact('click'); setShowForm(false); }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ─── Qty Modal ─── */}
      {qtyProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl border border-border shadow-xl p-6 animate-fade-up">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <ShoppingBag className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-foreground">إضافة كمية للمخزون</h2>
                <p className="text-xs text-muted-foreground">{qtyProduct.name}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">المخزن *</label>
                <select value={qtyForm.warehouse_id} onChange={e => setQtyForm(p => ({ ...p, warehouse_id: e.target.value }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50">
                  <option value="">اختر المخزن</option>
                  {warehousesList.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">الكمية المضافة *</label>
                <input type="number" min={1} value={qtyForm.quantity || ''}
                  onChange={e => setQtyForm(p => ({ ...p, quantity: Number(e.target.value) }))}
                  className="bg-white border border-border rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
              </div>
              <p className="text-xs text-muted-foreground bg-muted/40 px-3 py-2 rounded-xl">
                الكمية الحالية في كل المخازن: <span className="font-bold text-foreground">{inventoryTotals[qtyProduct.id] || 0}</span>
              </p>
            </div>
            <div className="flex gap-3 mt-5">
              <button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 font-semibold"
                onClick={() => {
                  if (!qtyForm.warehouse_id || !qtyForm.quantity) { interact('error'); toast.error('يرجى تحديد المخزن والكمية'); return; }
                  addQtyMutation.mutate({ product_id: qtyProduct.id, warehouse_id: qtyForm.warehouse_id, quantity: qtyForm.quantity });
                }}
                disabled={addQtyMutation.isPending}>
                {addQtyMutation.isPending ? 'جاري الإضافة...' : 'إضافة الكمية'}
              </button>
              <button className="flex-1 bg-muted text-muted-foreground rounded-xl py-2.5"
                onClick={() => { interact('click'); setQtyProduct(null); }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;
