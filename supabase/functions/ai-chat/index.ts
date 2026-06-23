import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('ONSPACE_AI_API_KEY');
    const baseUrl = Deno.env.get('ONSPACE_AI_BASE_URL');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!apiKey || !baseUrl) {
      console.error('Missing AI env vars: apiKey=', !!apiKey, 'baseUrl=', !!baseUrl);
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { messages, includeData } = body;

    console.log('ai-chat called, includeData=', includeData, 'messages count=', messages?.length);

    // Get caller's identity + owner_id for data isolation
    const authHeader = req.headers.get('Authorization');
    let ownerFilter: string | null = null;
    let callerRole: string | null = null;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: rpc } = await supabase.rpc('get_owner_id' as never, { uid: user.id });
        ownerFilter = rpc as string | null;

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role, full_name, username')
          .eq('id', user.id)
          .single();
        if (profile) callerRole = profile.role;
      }
    }

    // ── App Context (structure, pages, capabilities) ──────────────────────
    const appContext = `
=== نظام المخازن "الإمري" — هيكل التطبيق الكامل ===

**وصف النظام:**
نظام إدارة مخازن ومبيعات متكامل مبني بـ React + TypeScript + Supabase. يدعم multi-tenancy ونظام صلاحيات متعدد المستويات.

**الصفحات والوظائف:**
1. /  — لوحة التحكم: KPIs (مبيعات اليوم، صافي الربح، المخزون)، مخطط منحنى 14 يوم للمبيعات والمشتريات، ملخص الشهر، حالة المخازن، آخر الفواتير
2. /sales — المبيعات: إنشاء فواتير، متابعة الديون (آجل/جزئي)، طباعة فواتير، تسجيل دفعات
3. /purchases — المشتريات: شراء من موردين، تسجيل مدفوعات، ربط بالمخازن
4. /products — المنتجات: إضافة/تعديل منتجات، سعر شراء وبيع ونطاق، استيراد CSV، إضافة كمية للمخزون
5. /inventory — المخزون: جرد كل مخزن، تتبع الكميات والحد الأدنى
6. /warehouses — المخازن: إنشاء وإدارة المخازن، نسبة الإشغال
7. /transfers — التحويلات: نقل بضاعة بين المخازن، تتبع حالة التحويل، تعيين سائق
8. /customers — العملاء: إدارة العملاء، متابعة المديونيات، تسجيل دفعات وسلف، استيراد CSV
9. /suppliers — الموردين: إدارة الموردين، متابعة الديون
10. /expenses — المصروفات: تسجيل مصروفات بفئات مختلفة
11. /damages — التالف: تسجيل البضاعة التالفة أو المفقودة
12. /returns — المرتجعات: مرتجع مبيعات وشراء
13. /workers — الموظفين: إدارة الموظفين، الرواتب، السلف
14. /reports — التقارير: تقارير مالية، مخزون، مبيعات
15. /alerts — التنبيهات: تنبيهات المخزون المنخفض
16. /daily — اليومية: سجل العمليات اليومية
17. /settings — الإعدادات: إعدادات الحساب والنظام

**أدوار المستخدمين:**
- admin: صلاحيات كاملة
- warehouse_manager: إدارة المخازن والمنتجات
- driver: تحديث حالة التحويلات فقط
- worker: المبيعات والمشتريات فقط
- boss: عرض كل شيء بدون تعديل

**التقنيات:**
- Frontend: React 18 + TypeScript + Tailwind CSS + shadcn/ui
- Backend: Supabase (PostgreSQL + RLS + Edge Functions)
- State: React Query (server state) + useState (local state)
- Charts: Recharts (AreaChart)
- Auth: Supabase Auth + OTP

**نقاط القوة الحالية:**
- نظام multi-tenant كامل مع owner_id isolation
- طباعة فواتير PDF داخل المتصفح
- استيراد CSV مع progress bar وmعالجة أخطاء السطور
- واجهة عربية بالكامل + دعم RTL
- تصميم Minimalist نظيف مع مخطط منحني ناعم
- Global Error Boundary يمنع الشاشة البيضاء

**اقتراحات تطوير محتملة:**
- إضافة باركود scanner لعمليات البيع والاستلام
- تقارير PDF/Excel قابلة للتصدير
- إشعارات push للموبايل عند نقص المخزون
- لوحة تحكم بوس منفصلة بـ read-only views
- دعم الفواتير بالعملات الأجنبية
- نظام خصومات مرن على المنتجات
- ربط مع تطبيقات المحاسبة (Quickbooks, Odoo)
- تحسين تجربة الموبايل مع PWA offline support
`;

    // ── Live Data Context ─────────────────────────────────────────────────
    let contextData = '';

    if (includeData) {
      try {
        let invQuery = supabase
          .from('inventory')
          .select('quantity, products(name, sku, unit, min_stock, purchase_price, price), warehouses(name, owner_id)')
          .limit(100);

        const { data: inventory, error: invErr } = await invQuery;
        if (invErr) console.error('inventory fetch error:', invErr.message);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

        let salesQ = supabase.from('sales').select('total_amount, paid_amount, status, sale_date, sale_items(product_name, quantity, unit_price)').gte('sale_date', dateStr).limit(50);
        if (ownerFilter) salesQ = salesQ.eq('owner_id', ownerFilter);

        let purchQ = supabase.from('purchases').select('total_amount, paid_amount, status, purchase_date').gte('purchase_date', dateStr).limit(30);
        if (ownerFilter) purchQ = purchQ.eq('owner_id', ownerFilter);

        let custQ = supabase.from('customers').select('name, balance').gt('balance', 0).order('balance', { ascending: false }).limit(20);
        if (ownerFilter) custQ = custQ.eq('owner_id', ownerFilter);

        let suppQ = supabase.from('suppliers').select('name, balance').gt('balance', 0).order('balance', { ascending: false }).limit(20);
        if (ownerFilter) suppQ = suppQ.eq('owner_id', ownerFilter);

        let expQ = supabase.from('expenses').select('description, amount, category').gte('expense_date', dateStr).limit(30);
        if (ownerFilter) expQ = expQ.eq('owner_id', ownerFilter);

        const [
          { data: sales },
          { data: purchases },
          { data: customers },
          { data: suppliers },
          { data: expenses },
        ] = await Promise.all([salesQ, purchQ, custQ, suppQ, expQ]);

        const filteredInventory = ownerFilter
          ? (inventory || []).filter((i: any) => !i.warehouses || i.warehouses.owner_id === ownerFilter)
          : (inventory || []);

        const invLines = filteredInventory.map((i: any) => {
          const p = i.products;
          const w = i.warehouses;
          if (!p) return null;
          const status = i.quantity === 0 ? 'نافد' : i.quantity < (p.min_stock || 0) ? 'منخفض' : 'وفير';
          return `- ${p.name} | مخزن: ${w?.name || '؟'} | كمية: ${i.quantity} ${p.unit || ''} | ${status} | شراء: ${p.purchase_price || 0} | بيع: ${p.price || 0}`;
        }).filter(Boolean).join('\n');

        const salesTotal = (sales || []).reduce((s: number, x: any) => s + Number(x.total_amount || 0), 0);
        const salesPaid = (sales || []).reduce((s: number, x: any) => s + Number(x.paid_amount || 0), 0);

        const shortages = filteredInventory.filter((i: any) => i.quantity < (i.products?.min_stock || 0));
        const shortageLines = shortages.map((i: any) => `- ${i.products?.name}: متبقي ${i.quantity}، الحد ${i.products?.min_stock}`).join('\n');

        const productSales = new Map<string, number>();
        (sales || []).forEach((s: any) => {
          (s.sale_items || []).forEach((it: any) => {
            productSales.set(it.product_name, (productSales.get(it.product_name) || 0) + it.quantity);
          });
        });
        const topProducts = Array.from(productSales.entries())
          .sort((a, b) => b[1] - a[1]).slice(0, 10)
          .map(([name, qty]) => `- ${name}: ${qty} وحدة`).join('\n');

        const purchasesTotal = (purchases || []).reduce((s: number, x: any) => s + Number(x.total_amount || 0), 0);
        const expensesTotal = (expenses || []).reduce((s: number, x: any) => s + Number(x.amount || 0), 0);
        const netProfit = salesTotal - purchasesTotal - expensesTotal;

        contextData = `
=== بيانات النظام الحية (آخر 30 يوم) ===

📦 المخزون (${filteredInventory.length} صنف):
${invLines || 'لا توجد بيانات'}

⚠️ النواقص (${shortages.length} صنف):
${shortageLines || 'لا توجد نواقص - ممتاز!'}

🏆 أكثر المنتجات مبيعاً:
${topProducts || 'لا توجد بيانات'}

💰 الأداء المالي (30 يوم):
- المبيعات: ${salesTotal.toLocaleString()} ج.م (محصّل: ${salesPaid.toLocaleString()}، آجل: ${(salesTotal - salesPaid).toLocaleString()})
- المشتريات: ${purchasesTotal.toLocaleString()} ج.م
- المصروفات: ${expensesTotal.toLocaleString()} ج.م
- صافي الربح: ${netProfit.toLocaleString()} ج.م

👥 مديونيات العملاء:
${(customers || []).map((c: any) => `- ${c.name}: ${Number(c.balance).toLocaleString()} ج.م`).join('\n') || 'لا توجد مديونيات'}

🏭 مديونيات الموردين:
${(suppliers || []).map((s: any) => `- ${s.name}: ${Number(s.balance).toLocaleString()} ج.م`).join('\n') || 'لا توجد مديونيات'}
`;
      } catch (dataErr) {
        console.error('Error fetching live data:', dataErr);
      }
    }

    // ── System Prompt ──────────────────────────────────────────────────────
    const systemPrompt = `أنت مساعد ذكي متخصص في نظام إدارة المخازن "الإمري". بتتكلم بالعامية المصرية الصح وبشكل طبيعي ودافئ. 

**شخصيتك:**
- بتتكلم زي المصريين: أيوه، تمام، جميل، معلش، يعني، طب، ماشي، والله، عندك حق، خد بالك
- ردودك مختصرة وواضحة ومفيدة، مش رسمية ومش متكلفة
- لو سألوك على أي حاجة بتجاوب بشكل ودود — نكت، معلومات عامة، نصيحة، أي حاجة

**خبرتك:**
- عارف كل تفاصيل التطبيق ده وصفحاته وإمكانياته
- تقدر تديهم نصايح عملية لتطوير الشكل والإمكانيات
- لو عندك بيانات حية، حللها وقدم رؤى مفيدة

**دور المستخدم الحالي:** ${callerRole || 'غير معروف'}

${appContext}${contextData ? '\n' + contextData : ''}

تذكر: ردودك بالعامية المصرية دايماً، مختصرة ومفيدة.`;

    const requestBody = {
      model: 'google/gemini-3-flash-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        ...(messages || []),
      ],
      max_tokens: 1024,
    };

    console.log('Calling AI API at:', baseUrl, 'model:', requestBody.model);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log('AI API status:', response.status);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `AI API error [${response.status}]: ${responseText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON from AI API' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const reply = data.choices?.[0]?.message?.content ?? 'عذراً، لم أتمكن من الإجابة.';

    return new Response(
      JSON.stringify({ reply }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('ai-chat unexpected error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
