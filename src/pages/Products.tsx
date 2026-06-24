import { useState, useRef } from 'react';
import { Package, Plus, Edit2, Trash2, Search, Upload, CheckCircle, XCircle, X, Tag, DollarSign, BarChart2, Hash, Layers } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Product } from '@/types';

const EGP = (v: number) => v.toLocaleString('ar-EG', { minimumFractionDigits: 2 }) + ' ج.م';
const INPUT = 'w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all';
const BTN_PRIMARY = 'flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95';
const BTN_SECONDARY = 'flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-sm font-medium transition-all duration-200';

interface InventoryTotals { [productId: string]: number }

const MAIN_WH_NAME = 'المخزن الرئيسي';

const Products = () => {
  const { interact } = useInteraction();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const canDelete = profile?.role === 'admin' || profile?.role === 'warehouse_manager';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; errors: string[] } | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Product | null>(null);

  // Form includes quantity field for Main Warehouse
  const emptyForm = {
    name: '', category: '', unit: '', barcode: '',
    min_stock: 50, price: 0, purchase_price: 0,
    min_sale_price: 0, max_sale_price: 0,
    quantity: 0,
  };
  const [form, setForm] = useState(emptyForm);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').order('name');
      if (error) throw error;
      return data as Product[];
    },
    staleTime: 60000,
  });

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

  // Main warehouse inventory per product (for detail form)
  const { data: mainWhInventory = {} } = useQuery<{ [productId: string]: { id: string; quantity: number } }>({
    queryKey: ['products-main-wh-inventory'],
    queryFn: async () => {
      // First get the main warehouse id
      const { data: wh } = await supabase.from('warehouses').select('id').eq('name', MAIN_WH_NAME).maybeSingle();
      if (!wh) return {};
      const { data } = await supabase.from('inventory').select('id, product_id, quantity').eq('warehouse_id', wh.id);
      const map: { [productId: string]: { id: string; quantity: number } } = {};
      (data || []).forEach((r: any) => { map[r.product_id] = { id: r.id, quantity: r.quantity }; });
      return map;
    },
    staleTime: 30000,
  });

  // Get or create main warehouse id
  const getMainWarehouseId = async (): Promise<string | null> => {
    const { data } = await supabase.from('warehouses').select('id').eq('name', MAIN_WH_NAME).maybeSingle();
    if (data) return data.id;
    // Create it if not exists
    const { data: created } = await supabase.from('warehouses').insert({
      name: MAIN_WH_NAME, code: 'WH-MAIN', type: 'رئيسي', status: 'نشط', capacity: 0, used: 0,
    }).select('id').single();
    return created?.id || null;
  };

  // ── Mutations ────────────────────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: async (payload: typeof emptyForm) => {
      const sku = `P-${Date.now()}`;
      const { data: prod, error } = await supabase.from('products').insert({
        name: payload.name, category: payload.category, unit: payload.unit,
        barcode: payload.barcode, min_stock: payload.min_stock, price: payload.price,
        purchase_price: payload.purchase_price, min_sale_price: payload.min_sale_price,
        max_sale_price: payload.max_sale_price, sku,
      }).select('id').single();
      if (error) throw error;

      // Add to main warehouse
      if (payload.quantity > 0) {
        const whId = await getMainWarehouseId();
        if (whId) {
          const { data: existing } = await supabase.from('inventory')
            .select('id,quantity').eq('product_id', prod.id).eq('warehouse_id', whId).maybeSingle();
          if (existing) {
            await supabase.from('inventory').update({ quantity: existing.quantity + payload.quantity, last_updated: new Date().toISOString() }).eq('id', existing.id);
          } else {
            await supabase.from('inventory').insert({ product_id: prod.id, warehouse_id: whId, quantity: payload.quantity });
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products-inventory-totals'] });
      qc.invalidateQueries({ queryKey: ['products-main-wh-inventory'] });
      interact('success'); toast.success('تم إضافة المنتج في المخزن الرئيسي');
      setShowForm(false);
    },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: typeof emptyForm }) => {
      const { error } = await supabase.from('products').update({
        name: payload.name, category: payload.category, unit: payload.unit,
        barcode: payload.barcode, min_stock: payload.min_stock, price: payload.price,
        purchase_price: payload.purchase_price, min_sale_price: payload.min_sale_price,
        max_sale_price: payload.max_sale_price,
      }).eq('id', id);
      if (error) throw error;

      // Update quantity in main warehouse
      const whId = await getMainWarehouseId();
      if (whId) {
        const existing = mainWhInventory[id];
        if (existing) {
          await supabase.from('inventory').update({ quantity: payload.quantity, last_updated: new Date().toISOString() }).eq('id', existing.id);
        } else if (payload.quantity > 0) {
          await supabase.from('inventory').insert({ product_id: id, warehouse_id: whId, quantity: payload.quantity });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products-inventory-totals'] });
      qc.invalidateQueries({ queryKey: ['products-main-wh-inventory'] });
      interact('success'); toast.success('تم تحديث المنتج');
      setShowForm(false);
    },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products-inventory-totals'] });
      interact('delete'); toast.success('تم حذف المنتج');
    },
    onError: (e: Error) => { interact('error'); toast.error(e.message); },
  });

  // ── Excel Import ─────────────────────────────────────────────────────────────
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const rawLines = text.split('\n').slice(1).filter(l => l.trim());
      const total = rawLines.length;
      if (total === 0) { toast.error('الملف فارغ'); return; }
      setImportProgress({ current: 0, total, errors: [] });
      let count = 0;
      const errors: string[] = [];
      for (let idx = 0; idx < rawLines.length; idx++) {
        const line = rawLines[idx];
        try {
          const cols = line.split(',');
          const name = cols[0]?.trim();
          if (!name) { errors.push(`سطر ${idx + 2}: اسم المنتج فارغ`); setImportProgress({ current: idx + 1, total, errors: [...errors] }); continue; }
          const payload = {
            name, sku: `P-${Date.now()}-${idx}`, barcode: '', unit: cols[7]?.trim() || '',
            category: cols[1]?.trim() || 'عام', min_stock: parseInt(cols[2]) || 50,
            purchase_price: parseFloat(cols[3]) || 0, price: parseFloat(cols[4]) || 0,
            min_sale_price: parseFloat(cols[5]) || 0, max_sale_price: parseFloat(cols[6]) || 0,
          };
          const { error } = await supabase.from('products').insert(payload);
          if (error) errors.push(`سطر ${idx + 2} (${name}): ${error.message}`);
          else count++;
        } catch { errors.push(`سطر ${idx + 2}: خطأ غير متوقع`); }
        setImportProgress({ current: idx + 1, total, errors: [...errors] });
      }
      qc.invalidateQueries({ queryKey: ['products'] });
      interact('success');
      if (errors.length === 0) { toast.success(`تم استيراد ${count} منتج بنجاح`); setTimeout(() => setImportProgress(null), 2000); }
      else toast.warning(`تم استيراد ${count} منتج — ${errors.length} سطر به خطأ`);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const openAdd = () => {
    interact('add');
    setEditItem(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (product: Product) => {
    interact('click');
    setEditItem(product);
    const mainQty = mainWhInventory[product.id]?.quantity || 0;
    setForm({
      name: product.name, category: product.category || '', unit: (product as any).unit || '',
      barcode: (product as any).barcode || '', min_stock: product.min_stock || 50,
      price: product.price, purchase_price: product.purchase_price || 0,
      min_sale_price: product.min_sale_price || 0, max_sale_price: product.max_sale_price || 0,
      quantity: mainQty,
    });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.name) { interact('error'); toast.error('يرجى إدخال اسم المنتج'); return; }
    if (editItem) updateMutation.mutate({ id: editItem.id, payload: form });
    else addMutation.mutate(form);
  };

  const filtered = products.filter(p => p.name.includes(search) || (p.category || '').includes(search));
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

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
      <input ref={fileInputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleImportExcel} />

      {/* Import Progress */}
      {importProgress && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl p-6 w-full max-w-md animate-fade-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center flex-shrink-0">
                <Upload className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-slate-800">استيراد المنتجات</p>
                <p className="text-xs text-slate-500">
                  {importProgress.current < importProgress.total
                    ? `جاري رفع ${importProgress.current} من ${importProgress.total}...`
                    : 'اكتمل'}
                </p>
              </div>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
              <div className="h-full bg-slate-800 rounded-full transition-all duration-300"
                style={{ width: `${Math.round((importProgress.current / importProgress.total) * 100)}%` }} />
            </div>
            <p className="text-xs text-slate-400 text-center mb-3">
              {Math.round((importProgress.current / importProgress.total) * 100)}% مكتمل
            </p>
            {importProgress.errors.length > 0 && (
              <div className="max-h-32 overflow-y-auto space-y-1">
                {importProgress.errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                    <XCircle className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />
                    <span className="text-red-700">{err}</span>
                  </div>
                ))}
              </div>
            )}
            {importProgress.current >= importProgress.total && importProgress.errors.length === 0 && (
              <div className="flex items-center gap-2 text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-700 font-semibold">تم الاستيراد بنجاح!</span>
              </div>
            )}
            {importProgress.current >= importProgress.total && (
              <button className="mt-3 w-full bg-slate-800 text-white rounded-xl py-2.5 text-sm font-semibold"
                onClick={() => setImportProgress(null)}>إغلاق</button>
            )}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي المنتجات', val: products.length, border: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-700' },
          { label: 'الفئات', val: categories.length, border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-700' },
          { label: 'متوسط سعر البيع', val: products.length ? EGP(Math.round(products.reduce((s, p) => s + p.price, 0) / products.length)) : '0 ج.م', border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700' },
          { label: 'متوسط سعر الشراء', val: products.length ? EGP(Math.round(products.reduce((s, p) => s + (p.purchase_price || 0), 0) / products.length)) : '0 ج.م', border: 'border-slate-200', bg: 'bg-slate-50', text: 'text-slate-700' },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl p-4 border ${s.border} ${s.bg}`}>
            <p className="text-xs text-slate-500 mb-1">{s.label}</p>
            <p className={`text-xl font-bold ${s.text} break-all`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="البحث بالاسم أو الفئة..." value={search}
            onChange={e => setSearch(e.target.value)} className={cn(INPUT, 'pr-10')} />
        </div>
        <button className={BTN_SECONDARY} onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-4 h-4" /><span className="hidden sm:inline">استيراد Excel</span>
        </button>
        <button className={BTN_PRIMARY} onClick={openAdd}>
          <Plus className="w-4 h-4" /><span>إضافة منتج</span>
        </button>
      </div>

      {/* Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs text-blue-700">
        <Layers className="w-3.5 h-3.5 flex-shrink-0" />
        <span>المنتجات تُضاف تلقائياً إلى <strong>المخزن الرئيسي</strong> — لنقلها إلى مخازن أخرى استخدم صفحة <strong>التحويلات</strong></span>
      </div>

      {/* Product Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((product, i) => {
          const totalQty = inventoryTotals[product.id] || 0;
          const mainQty = mainWhInventory[product.id]?.quantity || 0;
          const qtyStatus = totalQty === 0 ? 'نافد' : totalQty <= (product.min_stock || 0) ? 'منخفض' : 'وفير';
          const qtyColor = qtyStatus === 'نافد' ? 'text-red-600 bg-red-50 border-red-200' : qtyStatus === 'منخفض' ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200';

          return (
            <div key={product.id}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 animate-fade-up flex flex-col"
              style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>

              {/* Card Header */}
              <div className="p-4 border-b border-slate-50">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Package className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-slate-800 leading-tight truncate">{product.name}</p>
                      {product.category && (
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md border border-slate-200 mt-0.5 inline-block">
                          {product.category}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={cn('text-xs px-2 py-1 rounded-lg border font-semibold flex-shrink-0', qtyColor)}>
                    {totalQty.toLocaleString('ar-EG')}
                  </span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 flex-1 space-y-2.5">
                {/* Prices Row */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                    <p className="text-[10px] text-slate-400 mb-0.5 flex items-center gap-1">
                      <DollarSign className="w-2.5 h-2.5" />سعر الشراء
                    </p>
                    <p className="text-xs font-bold text-slate-600">
                      {product.purchase_price ? EGP(product.purchase_price) : '—'}
                    </p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-100">
                    <p className="text-[10px] text-amber-500 mb-0.5 flex items-center gap-1">
                      <Tag className="w-2.5 h-2.5" />سعر البيع
                    </p>
                    <p className="text-xs font-bold text-amber-600">{EGP(product.price)}</p>
                  </div>
                </div>

                {/* Min/Max Sale */}
                {(product.min_sale_price || product.max_sale_price) ? (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                    <p className="text-[10px] text-blue-400 mb-0.5">نطاق البيع</p>
                    <p className="text-xs font-semibold text-blue-600">
                      {EGP(product.min_sale_price || 0)} — {EGP(product.max_sale_price || 0)}
                    </p>
                  </div>
                ) : null}

                {/* Stats Row */}
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  {(product as any).unit && (
                    <span className="flex items-center gap-1">
                      <Hash className="w-2.5 h-2.5" />وحدة: {(product as any).unit}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <BarChart2 className="w-2.5 h-2.5" />حد: {product.min_stock || 0}
                  </span>
                  {mainQty !== totalQty && (
                    <span className="mr-auto text-blue-500">رئيسي: {mainQty}</span>
                  )}
                </div>
              </div>

              {/* Card Footer */}
              <div className="px-4 pb-4 flex gap-2">
                <button
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 hover:border-blue-200 rounded-xl text-xs font-semibold transition-all"
                  onClick={() => openEdit(product)}>
                  <Edit2 className="w-3 h-3" />تعديل
                </button>
                {canDelete && (
                  <button
                    className="flex items-center justify-center w-9 h-9 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 border border-slate-200 rounded-xl transition-all"
                    onClick={() => { if (confirm('هل تريد حذف هذا المنتج؟')) deleteMutation.mutate(product.id); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-slate-400">
            <Package className="w-12 h-12 mb-3 opacity-25" />
            <p className="text-sm font-medium mb-1">لا توجد منتجات</p>
            <p className="text-xs opacity-70">اضغط "إضافة منتج" للبدء</p>
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ─────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 animate-fade-up my-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center">
                  <Package className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">
                    {editItem ? 'تعديل المنتج' : 'إضافة منتج جديد'}
                  </h2>
                  <p className="text-xs text-slate-400">يُضاف تلقائياً في {MAIN_WH_NAME}</p>
                </div>
              </div>
              <button className="flex items-center justify-center w-8 h-8 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl"
                onClick={() => { interact('click'); setShowForm(false); }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-2 gap-3">
              {/* Name */}
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">اسم المنتج *</label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="أدخل اسم المنتج" className={INPUT} />
              </div>

              {/* Category & Unit */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">الفئة</label>
                <input type="text" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                  placeholder="مثال: حبوب، زيوت..." className={INPUT} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">وحدة القياس</label>
                <input type="text" value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}
                  placeholder="مثال: كيلو، لتر، علبة" className={INPUT} />
              </div>

              {/* Barcode & min_stock */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">الباركود</label>
                <input type="text" value={form.barcode} onChange={e => setForm(p => ({ ...p, barcode: e.target.value }))}
                  placeholder="كود الباركود" className={INPUT} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">حد التنبيه</label>
                <input type="number" value={form.min_stock || ''} onChange={e => setForm(p => ({ ...p, min_stock: Number(e.target.value) }))}
                  className={INPUT} />
              </div>

              {/* Prices */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">سعر الشراء (ج.م)</label>
                <input type="number" value={form.purchase_price || ''} onChange={e => setForm(p => ({ ...p, purchase_price: Number(e.target.value) }))}
                  className={INPUT} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">سعر البيع (ج.م)</label>
                <input type="number" value={form.price || ''} onChange={e => setForm(p => ({ ...p, price: Number(e.target.value) }))}
                  className={INPUT} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">أدنى سعر بيع (ج.م)</label>
                <input type="number" value={form.min_sale_price || ''} onChange={e => setForm(p => ({ ...p, min_sale_price: Number(e.target.value) }))}
                  className={INPUT} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">أقصى سعر بيع (ج.م)</label>
                <input type="number" value={form.max_sale_price || ''} onChange={e => setForm(p => ({ ...p, max_sale_price: Number(e.target.value) }))}
                  className={INPUT} />
              </div>

              {/* Quantity - Main Warehouse */}
              <div className="col-span-2 flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-500" />
                  الكمية في المخزن الرئيسي
                </label>
                <input type="number" value={form.quantity || ''} min={0}
                  onChange={e => setForm(p => ({ ...p, quantity: Number(e.target.value) }))}
                  placeholder="0" className={INPUT} />
                <p className="text-[10px] text-slate-400">
                  {editItem
                    ? 'سيتم تحديث الكمية في المخزن الرئيسي مباشرة'
                    : 'الكمية الابتدائية للمنتج في المخزن الرئيسي — لنقلها لاحقاً استخدم التحويلات'}
                </p>
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button className={cn(BTN_PRIMARY, 'flex-1')} onClick={handleSave}
                disabled={addMutation.isPending || updateMutation.isPending}>
                {(addMutation.isPending || updateMutation.isPending)
                  ? 'جاري الحفظ...'
                  : editItem ? 'حفظ التعديلات' : 'إضافة المنتج'}
              </button>
              <button className={cn(BTN_SECONDARY, 'flex-1')} onClick={() => { interact('click'); setShowForm(false); }}>
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
