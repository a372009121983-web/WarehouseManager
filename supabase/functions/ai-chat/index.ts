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

    console.log('env check: apiKey present=', !!apiKey, 'baseUrl=', baseUrl);

    if (!apiKey || !baseUrl) {
      return new Response(
        JSON.stringify({ error: 'AI service not configured — missing env vars' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const { messages, includeData } = body;

    console.log('ai-chat called, includeData=', includeData, 'msgs=', messages?.length);

    // ── Caller identity ────────────────────────────────────────────────────
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
          .select('role, full_name')
          .eq('id', user.id)
          .single();
        if (profile) callerRole = profile.role;
      }
    }

    // ── App Context ────────────────────────────────────────────────────────
    const appContext = `
=== نظام المخازن "الإمري" — هيكل التطبيق الكامل ===

**الصفحات:**
1. / — لوحة التحكم: KPIs، مخطط 14 يوم، ملخص الشهر، حالة المخازن
2. /sales — المبيعات: فواتير، ديون آجل/جزئي، طباعة، دفعات
3. /purchases — المشتريات: شراء من موردين، مدفوعات
4. /products — المنتجات: CRUD، أسعار، استيراد CSV، كميات
5. /inventory — المخزون: جرد، كميات، حد أدنى
6. /warehouses — المخازن: إنشاء وإدارة، نسبة إشغال
7. /transfers — التحويلات: نقل بضاعة بين مخازن، سائق
8. /customers — العملاء: مديونيات، دفعات، استيراد CSV
9. /suppliers — الموردين: ديون، مدفوعات
10. /expenses — المصروفات: فئات
11. /damages — التالف: تسجيل التلف
12. /returns — المرتجعات: مبيعات وشراء
13. /workers — الموظفين: رواتب، سلف
14. /reports — التقارير: مالية ومخزون
15. /alerts — التنبيهات: مخزون منخفض
16. /daily — اليومية
17. /settings — الإعدادات

**الأدوار:** admin (كامل) | warehouse_manager (مخازن ومنتجات) | driver (تحويلات) | worker (مبيعات ومشتريات) | boss (عرض فقط)

**التقنيات:** React 18 + TypeScript + Tailwind + Supabase + Recharts

**نقاط القوة:** multi-tenant، طباعة فواتير، استيراد CSV مع progress bar، عربي RTL كامل، Error Boundary

**اقتراحات تطوير:** باركود scanner، تصدير PDF/Excel، إشعارات push، لوحة boss منفصلة، خصومات مرنة، ربط محاسبة
`;

    // ── Live Data ──────────────────────────────────────────────────────────
    let contextData = '';
    if (includeData) {
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

        let salesQ = supabase.from('sales')
          .select('total_amount, paid_amount, status, sale_date, sale_items(product_name, quantity, unit_price)')
          .gte('sale_date', dateStr).limit(50);
        if (ownerFilter) salesQ = salesQ.eq('owner_id', ownerFilter);

        let purchQ = supabase.from('purchases')
          .select('total_amount, paid_amount, purchase_date')
          .gte('purchase_date', dateStr).limit(30);
        if (ownerFilter) purchQ = purchQ.eq('owner_id', ownerFilter);

        let custQ = supabase.from('customers')
          .select('name, balance').gt('balance', 0)
          .order('balance', { ascending: false }).limit(15);
        if (ownerFilter) custQ = custQ.eq('owner_id', ownerFilter);

        let suppQ = supabase.from('suppliers')
          .select('name, balance').gt('balance', 0)
          .order('balance', { ascending: false }).limit(15);
        if (ownerFilter) suppQ = suppQ.eq('owner_id', ownerFilter);

        let expQ = supabase.from('expenses')
          .select('description, amount, category')
          .gte('expense_date', dateStr).limit(30);
        if (ownerFilter) expQ = expQ.eq('owner_id', ownerFilter);

        let invQ = supabase.from('inventory')
          .select('quantity, products(name, min_stock, purchase_price, price), warehouses(name)')
          .limit(80);

        const [
          { data: sales },
          { data: purchases },
          { data: customers },
          { data: suppliers },
          { data: expenses },
          { data: inventory },
        ] = await Promise.all([salesQ, purchQ, custQ, suppQ, expQ, invQ]);

        const salesTotal = (sales || []).reduce((s: number, x: any) => s + Number(x.total_amount || 0), 0);
        const salesPaid  = (sales || []).reduce((s: number, x: any) => s + Number(x.paid_amount || 0), 0);
        const purchTotal = (purchases || []).reduce((s: number, x: any) => s + Number(x.total_amount || 0), 0);
        const expTotal   = (expenses || []).reduce((s: number, x: any) => s + Number(x.amount || 0), 0);
        const netProfit  = salesTotal - purchTotal - expTotal;

        const shortages = (inventory || []).filter((i: any) => i.quantity < (i.products?.min_stock || 0));
        const outOfStock = (inventory || []).filter((i: any) => i.quantity === 0);

        const productSales = new Map<string, number>();
        (sales || []).forEach((s: any) => {
          (s.sale_items || []).forEach((it: any) => {
            productSales.set(it.product_name, (productSales.get(it.product_name) || 0) + it.quantity);
          });
        });
        const topProducts = Array.from(productSales.entries())
          .sort((a, b) => b[1] - a[1]).slice(0, 8)
          .map(([name, qty]) => `- ${name}: ${qty} وحدة`).join('\n');

        contextData = `
=== بيانات حية (آخر 30 يوم) ===

💰 الأداء المالي:
- المبيعات: ${salesTotal.toLocaleString()} ج.م | محصّل: ${salesPaid.toLocaleString()} | آجل: ${(salesTotal - salesPaid).toLocaleString()}
- المشتريات: ${purchTotal.toLocaleString()} ج.م
- المصروفات: ${expTotal.toLocaleString()} ج.م
- صافي الربح: ${netProfit.toLocaleString()} ج.م

📦 المخزون: ${(inventory || []).length} صنف | نواقص: ${shortages.length} | نافد: ${outOfStock.length}
${shortages.slice(0, 5).map((i: any) => `- ${i.products?.name}: ${i.quantity} (حد: ${i.products?.min_stock})`).join('\n')}

🏆 أكثر مبيعاً:
${topProducts || 'لا بيانات'}

👥 مديونيات عملاء:
${(customers || []).map((c: any) => `- ${c.name}: ${Number(c.balance).toLocaleString()} ج.م`).join('\n') || 'لا مديونيات'}

🏭 مديونيات موردين:
${(suppliers || []).map((s: any) => `- ${s.name}: ${Number(s.balance).toLocaleString()} ج.م`).join('\n') || 'لا مديونيات'}
`;
      } catch (e) {
        console.error('live data error:', e);
      }
    }

    // ── System Prompt ──────────────────────────────────────────────────────
    const systemPrompt = `أنت مساعد ذكي متخصص في نظام إدارة المخازن "الإمري". بتتكلم بالعامية المصرية الطبيعية.

شخصيتك: ودود، واضح، مفيد. بتستخدم كلمات زي: أيوه، تمام، ماشي، يعني، طب، والله.
ردودك: مختصرة ومفيدة، مش متكلفة. تجاوب على أي سؤال — عام أو خاص بالتطبيق.

دور المستخدم الحالي: ${callerRole || 'غير معروف'}

${appContext}${contextData ? '\n' + contextData : ''}

دايماً بالعامية المصرية.`;

    // ── Call OnSpace AI ────────────────────────────────────────────────────
    const aiBody = {
      model: 'google/gemini-3-flash-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        ...(messages || []).slice(-10),
      ],
      max_tokens: 1024,
    };

    console.log('Calling:', `${baseUrl}/chat/completions`, 'model:', aiBody.model);

    const aiResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(aiBody),
    });

    const responseText = await aiResponse.text();
    console.log('AI status:', aiResponse.status, '| response excerpt:', responseText.slice(0, 200));

    if (!aiResponse.ok) {
      console.error('AI API error:', aiResponse.status, responseText);
      return new Response(
        JSON.stringify({ error: `AI API error [${aiResponse.status}]: ${responseText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('JSON parse failed:', responseText.slice(0, 300));
      return new Response(
        JSON.stringify({ error: 'Invalid response from AI service' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const reply = data.choices?.[0]?.message?.content ?? 'عذراً، لم أتمكن من الإجابة.';
    console.log('Reply generated, length=', reply.length);

    return new Response(
      JSON.stringify({ reply }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('ai-chat fatal error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
