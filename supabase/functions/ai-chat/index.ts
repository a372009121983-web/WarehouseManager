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

    // Get caller's owner_id for data isolation
    const authHeader = req.headers.get('Authorization');
    let ownerFilter: string | null = null;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: rpc } = await supabase.rpc('get_owner_id' as never, { uid: user.id });
        ownerFilter = rpc as string | null;
      }
    }

    // Gather warehouse data context if requested
    let contextData = '';
    if (includeData) {
      // Build inventory query filtered by owner
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
      const { data: sales } = await salesQ;

      let purchQ = supabase.from('purchases').select('total_amount, paid_amount, status, purchase_date').gte('purchase_date', dateStr).limit(30);
      if (ownerFilter) purchQ = purchQ.eq('owner_id', ownerFilter);
      const { data: purchases } = await purchQ;

      let custQ = supabase.from('customers').select('name, balance').gt('balance', 0).order('balance', { ascending: false }).limit(20);
      if (ownerFilter) custQ = custQ.eq('owner_id', ownerFilter);
      const { data: customers } = await custQ;

      let suppQ = supabase.from('suppliers').select('name, balance').gt('balance', 0).order('balance', { ascending: false }).limit(20);
      if (ownerFilter) suppQ = suppQ.eq('owner_id', ownerFilter);
      const { data: suppliers } = await suppQ;

      let expQ = supabase.from('expenses').select('description, amount, category').gte('expense_date', dateStr).limit(30);
      if (ownerFilter) expQ = expQ.eq('owner_id', ownerFilter);
      const { data: expenses } = await expQ;

      // Filter inventory by owner
      const filteredInventory = ownerFilter
        ? (inventory || []).filter((i: any) => !i.warehouses || i.warehouses.owner_id === ownerFilter)
        : (inventory || []);

      const invLines = filteredInventory.map((i: any) => {
        const p = i.products;
        const w = i.warehouses;
        if (!p) return null;
        const status = i.quantity === 0 ? 'نافد' : i.quantity < (p.min_stock || 0) ? 'منخفض' : 'وفير';
        return `- ${p.name} | مخزن: ${w?.name || '؟'} | كمية: ${i.quantity} ${p.unit || ''} | الحالة: ${status} | سعر شراء: ${p.purchase_price || 0} | سعر بيع: ${p.price || 0}`;
      }).filter(Boolean).join('\n');

      const salesTotal = (sales || []).reduce((s: number, x: any) => s + Number(x.total_amount || 0), 0);
      const salesPaid = (sales || []).reduce((s: number, x: any) => s + Number(x.paid_amount || 0), 0);

      const shortages = filteredInventory.filter((i: any) => i.quantity < (i.products?.min_stock || 0));
      const shortageLines = shortages.map((i: any) => `- ${i.products?.name}: متبقي ${i.quantity}، الحد الأدنى ${i.products?.min_stock}`).join('\n');

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
      const customerDebtLines = (customers || []).map((c: any) => `- ${c.name}: ${Number(c.balance).toLocaleString()} ج.م`).join('\n');
      const supplierDebtLines = (suppliers || []).map((s: any) => `- ${s.name}: ${Number(s.balance).toLocaleString()} ج.م`).join('\n');

      contextData = `
=== بيانات نظام المخازن (آخر 30 يوم) ===

📦 المخزون (${filteredInventory.length} صنف):
${invLines || 'لا توجد بيانات'}

⚠️ النواقص والمنخفض (${shortages.length} صنف):
${shortageLines || 'لا توجد نواقص'}

🏆 أكثر المنتجات مبيعاً:
${topProducts || 'لا توجد بيانات'}

💰 المبيعات (30 يوم):
- إجمالي: ${salesTotal.toLocaleString()} ج.م
- محصّل: ${salesPaid.toLocaleString()} ج.م
- آجل: ${(salesTotal - salesPaid).toLocaleString()} ج.م

🛒 المشتريات (30 يوم):
- إجمالي: ${purchasesTotal.toLocaleString()} ج.م

💸 المصروفات (30 يوم):
- إجمالي: ${expensesTotal.toLocaleString()} ج.م

👥 مديونيات العملاء:
${customerDebtLines || 'لا توجد مديونيات'}

🏭 مديونيات الموردين:
${supplierDebtLines || 'لا توجد مديونيات'}
`;
    }

    const systemPrompt = `أنت مساعد ذكي بتتكلم بالعامية المصرية الصح وبشكل طبيعي. بتساعد في أي حاجة يسألك عنها المستخدم سواء كانت أسئلة عامة، نكت، معلومات، أي موضوع، أو أسئلة عن نظام المخازن. ردودك تكون طبيعية وودودة وبتعبر زي ما بيتكلم المصريين، مش فصحى ومش متكلف. استخدم كلمات زي: أيوه، تمام، جميل، معلش، يعني، طب، ماشي، ازيك، والله، عندك حق، وغيرها. كن مختصر وواضح في ردودك.${contextData ? '\n\n' + contextData : ''}`;

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
    console.log('AI API status:', response.status, 'response:', responseText.substring(0, 300));

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
