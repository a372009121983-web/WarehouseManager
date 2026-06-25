export interface PrintItem {
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
}

export interface PrintOptions {
  type: 'sale' | 'purchase';
  invoiceDate: string;
  invoiceNumber?: string;
  status: string;
  warehouseName: string;
  partyLabel: string;
  partyName: string;
  partyPhone?: string;
  partyLocation?: string;
  items: PrintItem[];
  totalAmount: number;
  paidAmount: number;
  discount?: number;
  notes?: string;
  previousBalance?: number;
}

export const COMPANY_INFO = {
  name:    'الإمري',
  subname: 'نظام إدارة المخازن المتكامل',
  brand:   'الإمري',
  phone:   '01000000000',
  address: 'القاهرة، مصر',
  thanks:  'شكرًا لثقتكم',
  footer:  'الاستبدال والاسترجاع خلال فترة الـ 14 يوم من تاريخ أستلام السلعة.',
};

const fmtEGP = (v: number) => v.toLocaleString('ar-EG', { minimumFractionDigits: 2 });

// ── Clean teal invoice HTML matching the reference design ───────────────────
const buildInvoiceHTML = (opts: PrintOptions): string => {
  const isSale = opts.type === 'sale';
  const remaining = opts.totalAmount - opts.paidAmount;
  const invNum = opts.invoiceNumber || Math.floor(Math.random() * 900000 + 100000).toString();
  const previousBalance = opts.previousBalance || 0;
  const currentBalance = previousBalance + remaining;

  const itemsHTML = opts.items.length
    ? opts.items.map((it, i) => `
      <tr>
        <td class="td-no">${i + 1}</td>
        <td class="td-name">${it.name || '—'}</td>
        <td class="td-center">${it.quantity.toLocaleString('ar-EG')}${it.unit ? ' ' + it.unit : ''}</td>
        <td class="td-center">${fmtEGP(it.unit_price)}</td>
        <td class="td-center td-total">${fmtEGP(it.total_price)}</td>
      </tr>`).join('')
    : `<tr><td colspan="5" class="td-empty">لا توجد أصناف</td></tr>`;

  const discountRow = (opts.discount && opts.discount > 0)
    ? `<tr class="sum-row"><td colspan="4" class="sum-label">الخصم</td><td class="sum-val" style="color:#dc2626">- ${fmtEGP(opts.discount)}</td></tr>`
    : '';

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8">
<title>${isSale ? 'فاتورة بيع' : 'أمر شراء'} رقم ${invNum}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Cairo',Arial,sans-serif;direction:rtl;background:#fff;color:#1a1a1a;font-size:13px}

/* ── Header ── */
.inv-header{background:#1d6b6b;color:#fff;padding:14px 20px;display:flex;align-items:center;justify-content:space-between}
.inv-header-brand{display:flex;align-items:center;gap:10px}
.inv-header-logo{width:40px;height:40px;background:rgba(255,255,255,0.2);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#fff}
.inv-header-name{font-size:18px;font-weight:900;line-height:1}
.inv-header-sub{font-size:10px;color:rgba(255,255,255,0.75);margin-top:2px}
.inv-header-info{text-align:left;font-size:11px;color:rgba(255,255,255,0.9);line-height:2}

/* ── Title band ── */
.inv-title-band{background:#f0fafa;border-bottom:2px solid #1d6b6b;padding:10px 20px;display:flex;align-items:center;justify-content:space-between}
.inv-title{font-size:20px;font-weight:900;color:#1d6b6b}
.inv-meta{font-size:11px;color:#555;text-align:left;line-height:1.9}
.inv-meta strong{color:#1d6b6b}

/* ── Party info ── */
.inv-party{padding:10px 20px 6px;display:flex;gap:6px;align-items:center;font-size:12.5px;color:#333;border-bottom:1px solid #e5e5e5}
.inv-party strong{color:#1d6b6b;margin-left:4px}

/* ── Table ── */
.tbl-wrap{padding:10px 20px}
table{width:100%;border-collapse:collapse;font-size:12.5px}
thead tr{background:#1d6b6b}
th{padding:9px 10px;font-weight:700;text-align:right;color:#fff;font-size:12px;white-space:nowrap}
th.tc{text-align:center}
.td-no{text-align:center;color:#aaa;font-size:11px;width:36px}
.td-name{font-weight:700;color:#1a1a1a;font-size:13px}
.td-center{text-align:center}
.td-total{font-weight:700;color:#1d6b6b}
.td-empty{text-align:center;padding:20px;color:#aaa}
td{padding:8px 10px;border-bottom:1px solid #f0f0f0;vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:nth-child(even) td{background:#fafafa}

/* ── Summary rows ── */
.sum-section{padding:4px 20px 14px}
.sum-table{width:100%;border-collapse:collapse;max-width:320px;margin-right:auto}
.sum-row td{padding:7px 12px;font-size:13px;border-bottom:1px solid #e8e8e8}
.sum-row:last-child td{border-bottom:none}
.sum-label{color:#555;font-weight:600}
.sum-val{text-align:left;font-weight:700;color:#1a1a1a;white-space:nowrap}
.sum-total .sum-label,.sum-total .sum-val{font-size:15px;font-weight:900;color:#1d6b6b;background:#f0fafa}
.sum-balance .sum-label,.sum-balance .sum-val{font-weight:700;color:#555}
.sum-remaining .sum-label,.sum-remaining .sum-val{color:#dc2626;font-weight:700}

/* ── Footer ── */
.inv-footer{background:#1d6b6b;color:#fff;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;margin-top:auto}
.inv-footer-date{font-size:11px;color:rgba(255,255,255,0.8)}
.inv-footer-sig{font-size:11px;color:rgba(255,255,255,0.8)}
.inv-footer-thanks{font-size:13px;font-weight:700}

/* ── Notes ── */
.inv-notes{margin:0 20px 10px;background:#fffbf0;border-right:3px solid #f59e0b;padding:8px 12px;border-radius:0 6px 6px 0;font-size:12px;color:#666}

@media print{
  body{min-height:0}
  @page{margin:0;size:A4 portrait}
  table{width:100% !important}
  tr{page-break-inside:avoid}
  thead{display:table-header-group}
}
</style></head><body>

<div class="inv-header">
  <div class="inv-header-brand">
    <div class="inv-header-logo">إ</div>
    <div>
      <div class="inv-header-name">${COMPANY_INFO.name}</div>
      <div class="inv-header-sub">${COMPANY_INFO.subname}</div>
    </div>
  </div>
  <div class="inv-header-info">
    📞 ${COMPANY_INFO.phone}<br>
    📍 ${COMPANY_INFO.address}
  </div>
</div>

<div class="inv-title-band">
  <div class="inv-title">${isSale ? 'فاتورة بيع' : 'أمر شراء'}</div>
  <div class="inv-meta">
    <strong>فاتورة رقم:</strong> ${invNum}<br>
    <strong>تاريخ الفاتورة:</strong> ${opts.invoiceDate}
  </div>
</div>

<div class="inv-party">
  <strong>${isSale ? 'العميل:' : 'المورد:'}</strong>${opts.partyName || '—'}
  ${opts.partyPhone ? `&nbsp;&nbsp;|&nbsp;&nbsp;<strong>الهاتف:</strong>${opts.partyPhone}` : ''}
  ${opts.warehouseName ? `&nbsp;&nbsp;|&nbsp;&nbsp;<strong>المخزن:</strong>${opts.warehouseName}` : ''}
</div>

<div class="tbl-wrap">
  <table>
    <thead>
      <tr>
        <th class="tc" style="width:36px">م</th>
        <th>اسم المنتج</th>
        <th class="tc" style="width:80px">الكمية</th>
        <th class="tc" style="width:90px">السعر</th>
        <th class="tc" style="width:100px">الإجمالي</th>
      </tr>
    </thead>
    <tbody>${itemsHTML}</tbody>
  </table>
</div>

<div class="sum-section">
  <table class="sum-table">
    <tbody>
      ${discountRow}
      <tr class="sum-total"><td class="sum-label">الإجمالي</td><td class="sum-val">${fmtEGP(opts.totalAmount)} ج.م</td></tr>
      <tr class="sum-balance"><td class="sum-label">الحساب السابق (عليكم)</td><td class="sum-val">${fmtEGP(previousBalance)} ج.م</td></tr>
      <tr class="sum-balance"><td class="sum-label">الحساب الحالي (عليكم)</td><td class="sum-val">${fmtEGP(currentBalance)} ج.م</td></tr>
    </tbody>
  </table>
</div>

${opts.notes ? `<div class="inv-notes">ملاحظات: ${opts.notes}</div>` : ''}

<div class="inv-footer">
  <div class="inv-footer-date">${opts.invoiceDate}</div>
  <div class="inv-footer-thanks">${COMPANY_INFO.thanks}</div>
  <div class="inv-footer-sig">أُضيف بواسطة: ${COMPANY_INFO.name}</div>
</div>
</body></html>`;
};

export const printInvoice = (opts: PrintOptions): void => {
  const win = window.open('', '_blank');
  if (!win) { alert('يرجى السماح بالنوافذ المنبثقة في المتصفح'); return; }
  win.document.write(buildInvoiceHTML(opts));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 700);
};

export const saveInvoiceAsPDF = async (opts: PrintOptions): Promise<void> => {
  printInvoice(opts);
};
