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

export const printInvoice = (opts: PrintOptions): void => {
  const win = window.open('', '_blank');
  if (!win) { alert('يرجى السماح بالنوافذ المنبثقة في المتصفح'); return; }

  const isSale = opts.type === 'sale';
  const remaining = opts.totalAmount - opts.paidAmount;
  const invNum    = opts.invoiceNumber || Math.floor(Math.random() * 900000 + 100000).toString();

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

  win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="UTF-8">
<title>${isSale ? 'فاتورة مبيعات' : 'أمر شراء'} #${invNum} — الإمري</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Cairo',Arial,sans-serif;direction:rtl;background:#fff;color:#1a1a1a;font-size:13px;min-height:100vh;display:flex;flex-direction:column}

/* ─── HEADER ─── */
.hdr{background:#2d3d36;color:#fff;padding:18px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.hdr-left{display:flex;flex-direction:column;gap:8px}
.hdr-contact{display:flex;align-items:center;gap:10px;font-size:13px;line-height:1}
.hdr-icon{width:30px;height:30px;border:2px solid rgba(255,255,255,0.35);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
.hdr-right{text-align:left;min-width:200px}
.inv-label{font-size:13px;font-weight:700;letter-spacing:.5px;margin-bottom:6px}
.inv-detail{font-size:12.5px;line-height:2;color:rgba(255,255,255,0.9)}

/* ─── BILL-TO ─── */
.billto-wrap{padding:22px 28px 10px;display:flex;align-items:flex-start;justify-content:space-between;gap:20px}
.big-title{font-size:62px;font-weight:900;color:#2d3d36;letter-spacing:-2px;line-height:1;padding-left:18px;border-left:5px solid #2d3d36;flex-shrink:0}
.billto-box{min-width:230px;flex:1;text-align:left}
.billto-title{font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #ddd}
.billto-row{display:flex;gap:6px;font-size:12.5px;line-height:2;color:#333}
.billto-row span{font-weight:700;color:#1a1a1a;min-width:72px;flex-shrink:0}

/* ─── TABLE ─── */
.tbl-wrap{padding:16px 28px 20px}
table{width:100%;border-collapse:collapse;font-size:13px}
thead tr{background:#2d3d36}
th{padding:10px 12px;font-weight:700;text-align:right;color:#fff;white-space:nowrap}
th.th-no{width:44px;text-align:center}
th.th-center{width:100px;text-align:center}
th.th-name{text-align:right}

td{padding:10px 12px;border-bottom:1px solid #e8e8e8;vertical-align:middle}
td.td-no{text-align:center;color:#999;font-size:12px}
td.td-name{font-size:14px;font-weight:700;color:#1a1a1a}
td.td-center{text-align:center;font-size:13px}
td.td-total{text-align:center;font-weight:700;font-size:13.5px;color:#1a1a1a}
tr:nth-child(even) td{background:#f9fafb}
tr:last-child td{border-bottom:none}

/* ─── TOTALS ─── */
.totals-wrap{padding:4px 28px 22px}
.totals-box{min-width:220px;margin-right:auto}
.tot-row{display:flex;border:1.5px solid #2d3d36;margin-bottom:-1px}
.tot-label{background:#2d3d36;color:#fff;padding:9px 14px;font-size:13px;font-weight:700;min-width:110px;text-align:center;flex-shrink:0}
.tot-value{padding:9px 14px;font-size:13.5px;font-weight:700;flex:1;text-align:center;background:#fff}

/* ─── NOTES ─── */
.notes-wrap{padding:0 28px 20px}
.notes-box{background:#f5f5f5;border-right:4px solid #2d3d36;padding:10px 14px;border-radius:0 6px 6px 0}
.notes-box p{font-size:12px;color:#555;line-height:1.7}

/* ─── FOOTER ─── */
.footer{background:#2d3d36;color:#fff;padding:28px 32px;text-align:center;margin-top:auto}
.footer-thanks{font-size:40px;font-weight:900;letter-spacing:-1px;margin-bottom:8px}
.footer-policy{font-size:13px;color:rgba(255,255,255,0.85);line-height:1.7}
.footer-info{font-size:11px;color:rgba(255,255,255,0.5);margin-top:10px}

@media print{body{min-height:0}@page{margin:0;size:A4 portrait}}
</style></head><body>

<!-- ─── HEADER ─── -->
<div class="hdr">
  <div class="hdr-left">
    <div class="hdr-contact">
      <div class="hdr-icon">📞</div>
      <span>${COMPANY_INFO.phone}</span>
    </div>
    <div class="hdr-contact">
      <div class="hdr-icon">📍</div>
      <span>${COMPANY_INFO.address}</span>
    </div>
  </div>
  <div class="hdr-right">
    <div class="inv-label">${isSale ? 'الفـاتـورة:' : 'أمر الشراء:'}</div>
    <div class="inv-detail">
      رقم الفاتورة: #${invNum}<br>
      التـاريخ: ${opts.invoiceDate}
    </div>
  </div>
</div>

<!-- ─── BILL-TO ─── -->
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

<!-- ─── TABLE ─── -->
<div class="tbl-wrap">
  <table>
    <thead>
      <tr>
        <th class="th-no">NO</th>
        <th class="th-name">اسم الصنف</th>
        <th class="th-center">سعر القطعة</th>
        <th class="th-center">العدد</th>
        <th class="th-center">المجموع</th>
      </tr>
    </thead>
    <tbody>${itemsHTML}</tbody>
  </table>
</div>

<!-- ─── TOTALS ─── -->
<div class="totals-wrap">
  <div class="totals-box">
    ${discountRow}
    <div class="tot-row">
      <div class="tot-label">الإجمالي</div>
      <div class="tot-value">${fmtEGP(opts.totalAmount)}</div>
    </div>
    <div class="tot-row">
      <div class="tot-label">المدفوع</div>
      <div class="tot-value" style="color:#1b5e20">${fmtEGP(opts.paidAmount)}</div>
    </div>
    <div class="tot-row">
      <div class="tot-label">المتبقي</div>
      <div class="tot-value" style="color:#c62828">${fmtEGP(remaining)}</div>
    </div>
  </div>
</div>

${opts.notes ? `<div class="notes-wrap"><div class="notes-box"><p>ملاحظات: ${opts.notes}</p></div></div>` : ''}

<!-- ─── FOOTER ─── -->
<div class="footer">
  <div class="footer-thanks">${COMPANY_INFO.thanks}</div>
  <div class="footer-policy">${COMPANY_INFO.footer}</div>
  <div class="footer-info">الإمري · ${COMPANY_INFO.subname} © ${new Date().getFullYear()}</div>
</div>

</body></html>`);

  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 700);
};
