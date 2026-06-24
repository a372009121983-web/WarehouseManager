import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { context } = await req.json();

    const apiKey = Deno.env.get('ONSPACE_AI_API_KEY');
    const baseUrl = Deno.env.get('ONSPACE_AI_BASE_URL');

    if (!apiKey || !baseUrl) {
      throw new Error('AI configuration missing');
    }

    const prompt = `أنت مستشار أعمال خبير في إدارة المخازن والتجارة. بناءً على بيانات المخزن التالية:

${context}

أعطني بالضبط 3 نصائح عملية ومحددة وقابلة للتطبيق الفوري لزيادة الأرباح وتحسين الأداء.

القواعد:
- بالضبط 3 نصائح
- كل نصيحة في سطر منفصل تبدأ بـ "•"
- ركز على المشاكل أو الفرص في البيانات الفعلية
- إذا المبيعات صفر أو منخفضة، اقترح طرق لزيادتها
- إذا الديون عالية، اقترح طرق للتحصيل
- إذا الأرباح سلبية، اقترح طرق لخفض التكاليف
- إذا تنبيهات المخزون عالية، ركز على إدارة المخزون
- كل نصيحة لا تتجاوز سطرين
- اللغة العربية الواضحة والمباشرة`;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const text: string = data.choices?.[0]?.message?.content ?? '';

    console.log('AI tips response:', text);

    // Parse bullet lines
    let tips: string[] = text
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.startsWith('•'))
      .map((l: string) => l.replace(/^•\s*/, '').trim())
      .filter((t: string) => t.length > 10)
      .slice(0, 3);

    // Fallback: split by newlines if no bullets found
    if (tips.length < 1) {
      tips = text
        .split('\n')
        .map((l: string) => l.trim().replace(/^\d+[\.\-\)]\s*/, ''))
        .filter((l: string) => l.length > 20)
        .slice(0, 3);
    }

    return new Response(JSON.stringify({ tips }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('generate-tips error:', error);
    return new Response(
      JSON.stringify({ error: String(error), tips: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
