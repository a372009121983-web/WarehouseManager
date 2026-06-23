export interface Warehouse {
  id: string;
  name: string;
  code: string;
  type: 'رئيسي' | 'فرعي' | 'تبريد' | 'مواد خطرة' | 'بضائع جافة';
  location: string;
  city: string;
  manager: string;
  capacity: number;
  used: number;
  status: 'نشط' | 'مغلق' | 'صيانة';
  phone: string;
  created_at?: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  unit: string;
  min_stock: number;
  price: number;
  purchase_price?: number;
  min_sale_price?: number;
  max_sale_price?: number;
  created_at?: string;
}

export interface InventoryItem {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
  min_stock: number;
  unit: string;
  last_updated: string;
  status: 'وفير' | 'منخفض' | 'نافد';
}

export interface Transfer {
  id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  from_warehouse_name: string;
  to_warehouse_name: string;
  items: TransferItem[];
  status: 'قيد التنفيذ' | 'مكتمل' | 'ملغي' | 'معلق';
  driver_id?: string;
  driver_name: string;
  notes?: string;
  total_items: number;
  created_at: string;
}

export interface TransferItem {
  id?: string;
  transfer_id?: string;
  product_id?: string;
  product_name: string;
  quantity: number;
  unit: string;
}

export interface Alert {
  id: string;
  type: 'تحذير' | 'خطأ' | 'معلومة' | 'نجاح';
  message: string;
  warehouse_name?: string;
  read: boolean;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  location?: string;
  notes?: string;
  balance: number;
  created_at?: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  location?: string;
  notes?: string;
  balance: number;
  created_at?: string;
}

export interface SaleItem {
  id?: string;
  sale_id?: string;
  product_id?: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  unit?: string;
}

export interface Sale {
  id: string;
  customer_id?: string;
  customer_name?: string;
  warehouse_id?: string;
  warehouse_name?: string;
  total_amount: number;
  paid_amount: number;
  discount: number;
  status: string;
  notes?: string;
  sale_date: string;
  created_at: string;
  sale_items?: SaleItem[];
}

export interface PurchaseItem {
  id?: string;
  purchase_id?: string;
  product_id?: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  unit?: string;
}

export interface Purchase {
  id: string;
  supplier_id?: string;
  supplier_name?: string;
  warehouse_id?: string;
  warehouse_name?: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  notes?: string;
  purchase_date: string;
  created_at: string;
  purchase_items?: PurchaseItem[];
}

export interface ReturnItem {
  id?: string;
  return_id?: string;
  product_id?: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  unit?: string;
}

export interface Return {
  id: string;
  type: 'مبيعات' | 'مشتريات';
  reference_id?: string;
  customer_id?: string;
  supplier_id?: string;
  customer_name?: string;
  supplier_name?: string;
  total_amount: number;
  reason?: string;
  status: string;
  return_date: string;
  created_at: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  expense_date: string;
  created_at: string;
}

export interface CustomerPayment {
  id: string;
  customer_id: string;
  customer_name?: string;
  amount: number;
  type: string;
  notes?: string;
  payment_date: string;
  created_at: string;
}

export interface SupplierPayment {
  id: string;
  supplier_id: string;
  supplier_name?: string;
  amount: number;
  notes?: string;
  payment_date: string;
  created_at: string;
}
