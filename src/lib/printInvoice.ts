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
}

// ─── Company Info ─────────────────────────────────────────────────────────────
export const COMPANY_INFO = {
  name:    'الإمري',
  subname: 'نظام إدارة المخازن المتكامل',
  brand:   'الإمري',
  phone:   '01000000000',
  address: 'القاهرة، مصر',
  thanks:  'شكرًا لثقتكم',
  footer:  'الاستبدال والاسترجاع خلال فترة الـ 14 يوم من تاريخ أستلام السلعة .',
};

const fmtEGP = (v: number) => v.toLocaleString('ar-EG', { minimumFractionDigits: 2 });

// ── Shared print/PDF HTML builder ──────────────────────────────────────────────
const buildInvoiceHTML = (opts: PrintOptions): string => {
  const isSale = opts.type === 'sale';
  const remaining = opts.totalAmount - opts.paidAmount;
  const invNum = opts.invoiceNumber || Math.floor(Math.random() * 900000 + 100000).toString();

  const discountRow = (opts.discount && opts.discount > 0)
    ? `<div class="tot-row"><div class="tot-label">الخصم</div><div class="tot-value" style="color:#d32f2f">- ${fmtEGP(opts.discount)}</div></div>`
    : '';

  const itemsHTML = opts.items.length
    ? opts.items.map((it, i) => `
      <tr>
        <td class="td-no">${i + 1}</td>
        <td class="td-name">${it.name || '—'}</td>
        <td class="td-center">${fmtEGP(it.unit_price)}</td>
        <td class="td-center">${it.quantity.toLocaleString('ar-EG')}${it.unit ? ' ' + it.unit : ''}</td>
        <td class="td-total">${fmtEGP(it.total_price)}</td>
      </tr>`).join('')
    : `<tr><td colspan="5" style="text-align:center;color:#aaa;padding:20px">لا توجد أصناف</td></tr>`;

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8">
<title>${isSale ? 'فاتورة مبيعات' : 'أمر شراء'} #${invNum} — الإمري</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Cairo',Arial,sans-serif;direction:rtl;background:#fff;color:#1a1a1a;font-size:14px;min-height:100vh;display:flex;flex-direction:column}

.hdr{background:#2d3d36;color:#fff;padding:20px 32px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.hdr-left{display:flex;flex-direction:column;gap:8px}
.hdr-contact{display:flex;align-items:center;gap:10px;font-size:13.5px;line-height:1}
.hdr-icon{width:30px;height:30px;border:2px solid rgba(255,255,255,0.35);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
.hdr-right{text-align:left;min-width:200px}
.inv-label{font-size:14px;font-weight:700;letter-spacing:.5px;margin-bottom:8px}
.inv-detail{font-size:13px;line-height:2.2;color:rgba(255,255,255,0.9)}

.billto-wrap{padding:24px 32px 12px;display:flex;align-items:flex-start;justify-content:space-between;gap:20px}
.big-title{font-size:64px;font-weight:900;color:#2d3d36;letter-spacing:-2px;line-height:1;padding-left:18px;border-left:5px solid #2d3d36;flex-shrink:0}
.billto-box{min-width:240px;flex:1;text-align:left}
.billto-title{font-size:14px;font-weight:700;color:#1a1a1a;margin-bottom:10px;padding-bottom:5px;border-bottom:1px solid #ddd}
.billto-row{display:flex;gap:6px;font-size:13px;line-height:2.1;color:#333}
.billto-row span{font-weight:700;color:#1a1a1a;min-width:80px;flex-shrink:0}

.tbl-wrap{padding:18px 32px 22px}
table{width:100%;border-collapse:collapse;font-size:13.5px}
thead tr{background:#2d3d36}
th{padding:12px 14px;font-weight:700;text-align:right;color:#fff;white-space:nowrap;font-size:13px}
th.th-no{width:44px;text-align:center}
th.th-center{width:110px;text-align:center}

td{padding:11px 14px;border-bottom:1px solid #e8e8e8;vertical-align:middle}
td.td-no{text-align:center;color:#999;font-size:12px}
td.td-name{font-size:14.5px;font-weight:700;color:#1a1a1a}
td.td-center{text-align:center;font-size:13.5px}
td.td-total{text-align:center;font-weight:700;font-size:14px;color:#1a1a1a}
tr:nth-child(even) td{background:#f9fafb}
tr:last-child td{border-bottom:none}

.totals-wrap{padding:4px 32px 24px}
.totals-box{min-width:240px;margin-right:auto}
.tot-row{display:flex;border:1.5px solid #2d3d36;margin-bottom:-1px}
.tot-label{background:#2d3d36;color:#fff;padding:10px 16px;font-size:14px;font-weight:700;min-width:120px;text-align:center;flex-shrink:0}
.tot-value{padding:10px 16px;font-size:14.5px;font-weight:700;flex:1;text-align:center;background:#fff}

.notes-wrap{padding:0 32px 22px}
.notes-box{background:#f5f5f5;border-right:4px solid #2d3d36;padding:12px 16px;border-radius:0 6px 6px 0}
.notes-box p{font-size:13px;color:#555;line-height:1.8}

.footer{background:#2d3d36;color:#fff;padding:28px 32px;text-align:center;margin-top:auto}
.footer-thanks{font-size:40px;font-weight:900;letter-spacing:-1px;margin-bottom:8px}
.footer-policy{font-size:13.5px;color:rgba(255,255,255,0.85);line-height:1.7}
.footer-info{font-size:11.5px;color:rgba(255,255,255,0.5);margin-top:10px}

@media print{
  body{min-height:0;font-size:14px}
  @page{margin:0;size:A4 portrait}
  table{width:100% !important;page-break-inside:auto}
  tr{page-break-inside:avoid}
  thead{display:table-header-group}
  th,td{padding:11px 14px !important;font-size:13px !important}
  .tbl-wrap,.totals-wrap,.billto-wrap,.notes-wrap,.hdr,.footer{padding-left:20mm !important;padding-right:20mm !important}
}
</style></head><body>

<div class="hdr">
  <div class="hdr-left">
    <div class="hdr-contact"><div class="hdr-icon">📞</div><span>${COMPANY_INFO.phone}</span></div>
    <div class="hdr-contact"><div class="hdr-icon">📍</div><span>${COMPANY_INFO.address}</span></div>
  </div>
  <div class="hdr-right">
    <div class="inv-label">${isSale ? 'الفـاتـورة:' : 'أمر الشراء:'}</div>
    <div class="inv-detail">رقم الفاتورة: #${invNum}<br>التـاريخ: ${opts.invoiceDate}</div>
  </div>
</div>

<div class="billto-wrap">
  <div class="big-title">${isSale ? 'فـاتـورة' : 'شـراء'}</div>
  <div class="billto-box">
    <div class="billto-title">${isSale ? 'فاتورة إلى:' : 'صادر إلى:'}</div>
    <div class="billto-row"><span>الاسـم:</span>${opts.partyName || '—'}</div>
    ${opts.partyLocation ? `<div class="billto-row"><span>العنـوان:</span>${opts.partyLocation}</div>` : ''}
    ${opts.partyPhone ? `<div class="billto-row"><span>رقم الهاتف:</span>${opts.partyPhone}</div>` : ''}
    <div class="billto-row"><span>المخزن:</span>${opts.warehouseName || '—'}</div>
  </div>
</div>

<div class="tbl-wrap">
  <table>
    <thead>
      <tr>
        <th class="th-no">NO</th>
        <th>اسم الصنف</th>
        <th class="th-center">سعر القطعة</th>
        <th class="th-center">العدد</th>
        <th class="th-center">المجموع</th>
      </tr>
    </thead>
    <tbody>${itemsHTML}</tbody>
  </table>
</div>

<div class="totals-wrap">
  <div class="totals-box">
    ${discountRow}
    <div class="tot-row"><div class="tot-label">الإجمالي</div><div class="tot-value">${fmtEGP(opts.totalAmount)}</div></div>
    <div class="tot-row"><div class="tot-label">المدفوع</div><div class="tot-value" style="color:#1b5e20">${fmtEGP(opts.paidAmount)}</div></div>
    <div class="tot-row"><div class="tot-label">المتبقي</div><div class="tot-value" style="color:#c62828">${fmtEGP(remaining)}</div></div>
  </div>
</div>

${opts.notes ? `<div class="notes-wrap"><div class="notes-box"><p>ملاحظات: ${opts.notes}</p></div></div>` : ''}

<div class="footer">
  <div class="footer-thanks">${COMPANY_INFO.thanks}</div>
  <div class="footer-policy">${COMPANY_INFO.footer}</div>
  <div class="footer-info">الإمري · ${COMPANY_INFO.subname} © ${new Date().getFullYear()}</div>
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
  const html2pdf = (await import('html2pdf.js')).default;
  const container = document.createElement('div');
  container.innerHTML = buildInvoiceHTML(opts);
  // Extract just the body content for PDF
  const bodyContent = container.querySelector('body');
  const el = document.createElement('div');
  el.style.direction = 'rtl';
  el.style.fontFamily = 'Cairo, Arial, sans-serif';
  el.innerHTML = bodyContent ? bodyContent.innerHTML : container.innerHTML;
  document.body.appendChild(el);

  const invNum = opts.invoiceNumber || 'invoice';
  await html2pdf().set({
    margin: 0,
    filename: `${opts.type === 'sale' ? 'فاتورة' : 'أمر-شراء'}-${opts.invoiceDate}-${invNum}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false, letterRendering: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  }).from(el).save();

  document.body.removeChild(el);
};
