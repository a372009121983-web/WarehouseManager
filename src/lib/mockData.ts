import type { Warehouse, Product, InventoryItem, Transfer, Alert } from '@/types';

export const warehouses: Warehouse[] = [
  {
    id: 'w1',
    name: 'المخزن المركزي - الرياض',
    code: 'RYD-001',
    type: 'رئيسي',
    location: 'المنطقة الصناعية، الرياض',
    city: 'الرياض',
    manager: 'أحمد محمد العمري',
    capacity: 5000,
    used: 3850,
    status: 'نشط',
    phone: '0112345678',
    createdAt: '2022-01-15',
  },
  {
    id: 'w2',
    name: 'مخزن جدة التبريد',
    code: 'JED-002',
    type: 'تبريد',
    location: 'ميناء جدة الإسلامي',
    city: 'جدة',
    manager: 'فيصل ناصر القحطاني',
    capacity: 2000,
    used: 1200,
    status: 'نشط',
    phone: '0122345678',
    createdAt: '2022-03-10',
  },
  {
    id: 'w3',
    name: 'مخزن الدمام الفرعي',
    code: 'DAM-003',
    type: 'فرعي',
    location: 'الحي الصناعي، الدمام',
    city: 'الدمام',
    manager: 'خالد سعد الشهري',
    capacity: 1500,
    used: 980,
    status: 'نشط',
    phone: '0132345678',
    createdAt: '2022-05-20',
  },
  {
    id: 'w4',
    name: 'مخزن المدينة - بضائع جافة',
    code: 'MED-004',
    type: 'بضائع جافة',
    location: 'المنطقة التجارية، المدينة المنورة',
    city: 'المدينة المنورة',
    manager: 'عمر عبدالله البلوي',
    capacity: 1200,
    used: 240,
    status: 'نشط',
    phone: '0142345678',
    createdAt: '2022-07-01',
  },
  {
    id: 'w5',
    name: 'مخزن أبها الجبلي',
    code: 'ABH-005',
    type: 'فرعي',
    location: 'المنطقة الحرفية، أبها',
    city: 'أبها',
    manager: 'سلطان راشد الغامدي',
    capacity: 800,
    used: 600,
    status: 'صيانة',
    phone: '0172345678',
    createdAt: '2023-01-11',
  },
  {
    id: 'w6',
    name: 'مخزن تبوك الشمالي',
    code: 'TAB-006',
    type: 'مواد خطرة',
    location: 'المنطقة الصناعية، تبوك',
    city: 'تبوك',
    manager: 'وليد محمد الحربي',
    capacity: 600,
    used: 0,
    status: 'مغلق',
    phone: '0144567890',
    createdAt: '2023-03-22',
  },
];

export const products: Product[] = [
  { id: 'p1', name: 'أرز بسمتي ممتاز', sku: 'RIC-001', category: 'حبوب', unit: 'كيس 25كغ', minStock: 100, price: 85 },
  { id: 'p2', name: 'زيت نخيل صافي', sku: 'OIL-002', category: 'زيوت', unit: 'كرتون 12 لتر', minStock: 50, price: 120 },
  { id: 'p3', name: 'سكر أبيض ناعم', sku: 'SUG-003', category: 'مواد أساسية', unit: 'كيس 50كغ', minStock: 80, price: 65 },
  { id: 'p4', name: 'دقيق أبيض مرتبة أولى', sku: 'FLR-004', category: 'حبوب', unit: 'كيس 25كغ', minStock: 120, price: 45 },
  { id: 'p5', name: 'حليب مبستر كامل الدسم', sku: 'MLK-005', category: 'منتجات ألبان', unit: 'كرتون 12 لتر', minStock: 200, price: 95 },
  { id: 'p6', name: 'مياه معدنية طبيعية', sku: 'WTR-006', category: 'مشروبات', unit: 'كرتون 24 زجاجة', minStock: 300, price: 30 },
  { id: 'p7', name: 'معجون طماطم مركز', sku: 'TOM-007', category: 'معلبات', unit: 'كرتون 24 علبة', minStock: 60, price: 55 },
  { id: 'p8', name: 'صابون تنظيف يدين', sku: 'SOP-008', category: 'مواد تنظيف', unit: 'كرتون 24 قطعة', minStock: 150, price: 40 },
];

export const inventoryItems: InventoryItem[] = [
  { id: 'i1', productId: 'p1', productName: 'أرز بسمتي ممتاز', sku: 'RIC-001', warehouseId: 'w1', warehouseName: 'المخزن المركزي - الرياض', quantity: 450, minStock: 100, unit: 'كيس', lastUpdated: '2026-06-20', status: 'وفير' },
  { id: 'i2', productId: 'p2', productName: 'زيت نخيل صافي', sku: 'OIL-002', warehouseId: 'w1', warehouseName: 'المخزن المركزي - الرياض', quantity: 35, minStock: 50, unit: 'كرتون', lastUpdated: '2026-06-19', status: 'منخفض' },
  { id: 'i3', productId: 'p5', productName: 'حليب مبستر كامل الدسم', sku: 'MLK-005', warehouseId: 'w2', warehouseName: 'مخزن جدة التبريد', quantity: 580, minStock: 200, unit: 'كرتون', lastUpdated: '2026-06-20', status: 'وفير' },
  { id: 'i4', productId: 'p3', productName: 'سكر أبيض ناعم', sku: 'SUG-003', warehouseId: 'w3', warehouseName: 'مخزن الدمام الفرعي', quantity: 12, minStock: 80, unit: 'كيس', lastUpdated: '2026-06-18', status: 'نافد' },
  { id: 'i5', productId: 'p6', productName: 'مياه معدنية طبيعية', sku: 'WTR-006', warehouseId: 'w1', warehouseName: 'المخزن المركزي - الرياض', quantity: 1200, minStock: 300, unit: 'كرتون', lastUpdated: '2026-06-20', status: 'وفير' },
  { id: 'i6', productId: 'p4', productName: 'دقيق أبيض مرتبة أولى', sku: 'FLR-004', warehouseId: 'w4', warehouseName: 'مخزن المدينة - بضائع جافة', quantity: 95, minStock: 120, unit: 'كيس', lastUpdated: '2026-06-17', status: 'منخفض' },
  { id: 'i7', productId: 'p7', productName: 'معجون طماطم مركز', sku: 'TOM-007', warehouseId: 'w3', warehouseName: 'مخزن الدمام الفرعي', quantity: 0, minStock: 60, unit: 'كرتون', lastUpdated: '2026-06-15', status: 'نافد' },
  { id: 'i8', productId: 'p8', productName: 'صابون تنظيف يدين', sku: 'SOP-008', warehouseId: 'w2', warehouseName: 'مخزن جدة التبريد', quantity: 320, minStock: 150, unit: 'كرتون', lastUpdated: '2026-06-20', status: 'وفير' },
];

export const transfers: Transfer[] = [
  {
    id: 't1',
    fromWarehouse: 'المخزن المركزي - الرياض',
    toWarehouse: 'مخزن الدمام الفرعي',
    products: [
      { name: 'سكر أبيض ناعم', quantity: 200, unit: 'كيس' },
      { name: 'أرز بسمتي ممتاز', quantity: 50, unit: 'كيس' },
    ],
    status: 'قيد التنفيذ',
    date: '2026-06-20',
    driver: 'محمد العتيبي',
    totalItems: 250,
  },
  {
    id: 't2',
    fromWarehouse: 'مخزن جدة التبريد',
    toWarehouse: 'مخزن المدينة - بضائع جافة',
    products: [
      { name: 'حليب مبستر كامل الدسم', quantity: 100, unit: 'كرتون' },
    ],
    status: 'مكتمل',
    date: '2026-06-19',
    driver: 'سلطان المالكي',
    totalItems: 100,
  },
  {
    id: 't3',
    fromWarehouse: 'المخزن المركزي - الرياض',
    toWarehouse: 'مخزن أبها الجبلي',
    products: [
      { name: 'زيت نخيل صافي', quantity: 80, unit: 'كرتون' },
      { name: 'مياه معدنية طبيعية', quantity: 300, unit: 'كرتون' },
    ],
    status: 'معلق',
    date: '2026-06-21',
    driver: 'عبدالله القرني',
    totalItems: 380,
  },
  {
    id: 't4',
    fromWarehouse: 'مخزن الدمام الفرعي',
    toWarehouse: 'المخزن المركزي - الرياض',
    products: [
      { name: 'معجون طماطم مركز', quantity: 20, unit: 'كرتون' },
    ],
    status: 'ملغي',
    date: '2026-06-18',
    driver: 'نواف السهلي',
    notes: 'إلغاء بسبب نقص المخزون',
    totalItems: 20,
  },
];

export const alerts: Alert[] = [
  { id: 'a1', type: 'خطأ', message: 'المخزون نافد: سكر أبيض ناعم في مخزن الدمام', warehouseName: 'مخزن الدمام الفرعي', time: 'منذ ساعة', read: false },
  { id: 'a2', type: 'تحذير', message: 'مستوى منخفض: زيت نخيل صافي - 35 كرتون متبقي', warehouseName: 'المخزن المركزي', time: 'منذ 3 ساعات', read: false },
  { id: 'a3', type: 'تحذير', message: 'مستوى منخفض: دقيق أبيض مرتبة أولى في مخزن المدينة', warehouseName: 'مخزن المدينة', time: 'منذ 5 ساعات', read: false },
  { id: 'a4', type: 'معلومة', message: 'تم إتمام نقل الحليب المبستر إلى مخزن المدينة بنجاح', time: 'منذ يوم', read: true },
  { id: 'a5', type: 'نجاح', message: 'تم استلام شحنة مياه معدنية 1200 كرتون في المخزن المركزي', time: 'منذ يومين', read: true },
];

export const monthlySalesData = [
  { month: 'يناير', مبيعات: 420, مشتريات: 380 },
  { month: 'فبراير', مبيعات: 580, مشتريات: 420 },
  { month: 'مارس', مبيعات: 490, مشتريات: 510 },
  { month: 'أبريل', مبيعات: 620, مشتريات: 450 },
  { month: 'مايو', مبيعات: 750, مشتريات: 580 },
  { month: 'يونيو', مبيعات: 680, مشتريات: 490 },
];

export const warehouseCapacityData = warehouses.map(w => ({
  name: w.code,
  الطاقة: w.capacity,
  المستخدم: w.used,
  label: w.name,
}));

export const categoryData = [
  { name: 'حبوب', value: 35, color: '#3b82f6' },
  { name: 'مشروبات', value: 25, color: '#06b6d4' },
  { name: 'منتجات ألبان', value: 18, color: '#10b981' },
  { name: 'مواد أساسية', value: 12, color: '#f59e0b' },
  { name: 'معلبات', value: 6, color: '#8b5cf6' },
  { name: 'أخرى', value: 4, color: '#6b7280' },
];
