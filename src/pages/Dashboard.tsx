
import { useState, useEffect, useRef, type ElementType } from 'react';
import {
  TrendingUp, ShoppingCart, Wallet, DollarSign,
  Users, Package, Lightbulb, RefreshCw, Loader2, Sparkles,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const EGP = (v: number) =>
  v === 0 ? '٠ ج.م' : v.toLocaleString('ar-EG', { minimumFractionDigits: 0 }) + ' ج.م';

const todayStr = () => new Date().toISOString().split('T')[0];

// ── Fallback static tips ──────────────────────────────────────────────────────
const FALLBACK_TIPS = [
  { icon: '💡', text: 'راجع المنتجات الأقل مبيعاً وفكر في تخفيضها أو استبدالها بمنتجات أكثر طلباً — الحركة البطيئة تحتجز رأس المال.' },
  { icon: '📊', text: 'تتبع هامش الربح لكل منتج وركز جهودك على المنتجات ذات الهامش الأعلى لتحقيق أقصى دخل ممكن.' },
  { icon: '🛒', text: 'قدم عروض وخصومات للعملاء الدائمين — الاحتفاظ بعميل قديم أسهل وأقل تكلفة من استقطاب عميل جديد.' },
  { icon: '📦', text: 'راجع مستويات المخزون يومياً، النقص المفاجئ في المنتجات الرائجة يعني خسارة مبيعات مباشرة.' },
  { icon: '💰', text: 'حصّل المديونيات بانتظام — الدين المتراكم يضعف التدفق النقدي ويحد من قدرتك على الشراء والتوسع.' },
  { icon: '🎯', text: 'ركز على 20% من المنتجات التي تحقق 80% من أرباحك — هؤلاء هم النجوم الحقيقيون في مخزنك.' },
];

interface TipItem { icon: string; text: string }

interface DashCard {
  label: string;
  value: string;
  sub: string;
  icon: ElementType;
  from: string;
  to: string;
  glow: string;
}

const Dashboard = () => {
  const [tipIndex, setTipIndex] = useState(0);
  const [tipVisible, setTipVisible] = useState(true);
  const [aiTips, setAiTips] = useState<TipItem[]>([]);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsError, setTipsError] = useState(false);
  const hasFetchedRef = useRef(false);
  const today = todayStr();

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: daySales = [] } = useQuery({
    queryKey: ['dash-v3-sales', today],
    queryFn: async () => {
      const { data } = await supabase.from('sales').select('total_amount,paid_amount').eq('sale_date', today);
      return data || [];
    },
    staleTime: 30000,
  });

  const { data: dayPurchases = [] } = useQuery({
    queryKey: ['dash-v3-pur', today],
    queryFn: async () => {
      const { data } = await supabase.from('purchases').select('total_amount').eq('purchase_date', today);
      return data || [];
    },
    staleTime: 30000,
  });

  const { data: dayExpenses = [] } = useQuery({
    queryKey: ['dash-v3-exp', today],
    queryFn: async () => {
      const { data } = await supabase.from('expenses').select('amount').eq('expense_date', today);
      return data || [];
    },
    staleTime: 30000,
  });

  const { data: customerDebt = 0 } = useQuery({
    queryKey: ['dash-v3-cdebt'],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('balance');
      return (data || []).reduce((s: number, c: any) => s + (c.balance > 0 ? c.balance : 0), 0);
    },
    staleTime: 60000,
  });

  const { data: invValue = 0 } = useQuery({
    queryKey: ['dash-v3-inv'],
    queryFn: async () => {
      const { data } = await supabase.from('inventory').select('quantity, products(purchase_price)');
      return (data || []).reduce((s: number, r: any) => s + (r.quantity * (r.products?.purchase_price || 0)), 0);
    },
    staleTime: 60000,
  });

  const { data: alertsCount = 0 } = useQuery({
    queryKey: ['dash-v3-alerts'],
    queryFn: async () => {
      const { count } = await supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('read', false);
      return count ?? 0;
    },
    staleTime: 30000,
  });

  const { data: shortagesCount = 0 } = useQuery({
    queryKey: ['dash-v3-shortages'],
    queryFn: async () => {
      const { data } = await supabase.from('inventory').select('quantity, products(min_stock)');
      return (data || []).filter((r: any) => r.quantity < (r.products?.min_stock || 0)).length;
    },
    staleTime: 60000,
  });

  // ── Computed ─────────────────────────────────────────────────────────────
  const totalSales     = (daySales as any[]).reduce((s, x) => s + Number(x.total_amount), 0);
  const totalPurchases = (dayPurchases as any[]).reduce((s, x) => s + Number(x.total_amount), 0);
  const totalExpenses  = (dayExpenses as any[]).reduce((s, x) => s + Number(x.amount), 0);
  const netProfit      = totalSales - totalPurchases - totalExpenses;
  const profitable     = netProfit >= 0;

  // ── AI Tips ───────────────────────────────────────────────────────────────
  const fetchAiTips = async () => {
    setTipsLoading(true);
    setTipsError(false);

    const contextStr = [
      `مبيعات اليوم: ${EGP(totalSales)} (${(daySales as any[]).length} فاتورة)`,
      `مشتريات اليوم: ${EGP(totalPurchases)} (${(dayPurchases as any[]).length} أمر)`,
      `مصروفات اليوم: ${EGP(totalExpenses)}`,
      `صافي الربح: ${EGP(netProfit)} (${profitable ? 'ربح' : 'خسارة'})`,
      `ديون العملاء المستحقة: ${EGP(customerDebt as number)}`,
      `قيمة المخزون بسعر الشراء: ${EGP(invValue as number)}`,
      `تنبيهات المخزون غير المقروءة: ${alertsCount}`,
      `منتجات أقل من حد التنبيه: ${shortagesCount}`,
    ].join('\n');

    try {
      const { data, error } = await supabase.functions.invoke('generate-tips', {
        body: { context: contextStr },
      });

      if (error || !data?.tips?.length) throw new Error('empty');

      const icons = ['💡', '📈', '🎯'];
      const newTips: TipItem[] = (data.tips as string[]).map((text, i) => ({
        icon: icons[i % icons.length],
        text,
      }));
      setAiTips(newTips);
      setTipIndex(0);
      setTipVisible(true);
    } catch {
      setTipsError(true);
      // Random fallback tips
      const shuffled = [...FALLBACK_TIPS].sort(() => Math.random() - 0.5).slice(0, 3);
      setAiTips(shuffled);
      setTipIndex(0);
      setTipVisible(true);
    } finally {
      setTipsLoading(false);
    }
  };

  // Auto-fetch on mount (after 1.5s to allow queries to settle)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasFetchedRef.current) {
        hasFetchedRef.current = true;
        fetchAiTips();
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [
    alertsCount,
    customerDebt,
    dayExpenses.length,
    dayPurchases.length,
    daySales.length,
    fetchAiTips, // Added `fetchAiTips` to dependency array
    invValue,
    netProfit,
    profitable,
    shortagesCount,
    totalExpenses,
    totalPurchases,
    totalSales,
  ]); 

  // Auto-rotate tips
  useEffect(() => {
    if (aiTips.length === 0 || tipsLoading) return;
    const iv = setInterval(() => {
      setTipVisible(false);
      setTimeout(() => { setTipIndex(p => (p + 1) % aiTips.length); setTipVisible(true); }, 400);
    }, 7000);
    return () => clearInterval(iv);
  }, [aiTips.length, tipsLoading]);

  const jumpTip = (i: number) => {
    setTipVisible(false);
    setTimeout(() => { setTipIndex(i); setTipVisible(true); }, 300);
  };

  // ── Cards ─────────────────────────────────────────────────────────────────
  const cards: DashCard[] = [
    {
      label: 'مبيعات اليوم',
      value: EGP(totalSales),
      sub: `${(daySales as any[]).length} فاتورة حتى الآن`,
      icon: TrendingUp,
      from: '#10b981', to: '#047857',
      glow: 'rgba(16,185,129,0.45)',
    },
    {
      label: 'مشتريات اليوم',
      value: EGP(totalPurchases),
      sub: `${(dayPurchases as any[]).length} أمر شراء`,
      icon: ShoppingCart,
      from: '#1d6b6b', to: '#2a8f8f',
      glow: 'rgba(29,107,107,0.45)',
    },
    {
      label: 'مصروفات اليوم',
      value: EGP(totalExpenses),
      sub: (dayExpenses as any[]).length + ' بند مصروف',
      icon: Wallet,
      from: '#f43f5e', to: '#be123c',
      glow: 'rgba(244,63,94,0.45)',
    },
    {
      label: 'صافي ربح اليوم',
      value: EGP(netProfit),
      sub: profitable ? '🎉 يوم مربح!' : '⚠️ راجع المصاريف',
      icon: DollarSign,
      from: profitable ? '#f59e0b' : '#64748b',
      to:   profitable ? '#b45309' : '#334155',
      glow: profitable ? 'rgba(245,158,11,0.45)' : 'rgba(100,116,139,0.3)',
    },
    {
      label: 'ديون العملاء',
      value: EGP(customerDebt as number),
      sub: 'إجمالي المستحق',
      icon: Users,
      from: '#a855f7', to: '#7e22ce',
      glow: 'rgba(168,85,247,0.45)',
    },
    {
      label: 'قيمة المخزون',
      value: EGP(invValue as number),
      sub: (alertsCount as number) > 0 ? `⚠️ ${alertsCount} تنبيه غير مقروء` : 'بسعر الشراء',
      icon: Package,
      from: '#1d6b6b', to: '#155555',
      glow: 'rgba(29,107,107,0.45)',
    },
  ];

  const dateStr = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const currentTip = aiTips[tipIndex];

  return (
    <div className="space-y-6 pb-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="animate-fade-up">
        <p className="text-sm text-slate-400">{dateStr}</p>
        <h1 className="text-2xl font-black text-slate-800 mt-0.5 tracking-tight">
          كيف يومي اليوم؟ 📊
        </h1>
      </div>

      {/* ── Glowing KPI Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card, i) => {
          const Icon: ElementType = card.icon;
          return (
            <div
              key={i}
              className="relative rounded-2xl p-5 text-white overflow-hidden hover:scale-[1.03] active:scale-[0.98] transition-all duration-200 animate-fade-up select-none"
              style={{
                background: `linear-gradient(135deg, ${card.from} 0%, ${card.to} 100%)`,
                boxShadow: `0 8px 32px ${card.glow}, 0 2px 8px rgba(0,0,0,0.15)`,
                animationDelay: `${i * 70}ms`,
              }}>
              {/* Decorative circles */}
              <div className="absolute -right-5 -top-5 w-24 h-24 rounded-full pointer-events-none"
                style={{ background: 'rgba(255,255,255,0.12)' }} />
              <div className="absolute -left-3 -bottom-4 w-16 h-16 rounded-full pointer-events-none"
                style={{ background: 'rgba(255,255,255,0.08)' }} />

              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    {card.label}
                  </p>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(4px)' }}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                </div>
                <p className="text-2xl font-black leading-none tracking-tight break-all">
                  {card.value}
                </p>
                <p className="text-xs mt-2 font-medium" style={{ color: 'rgba(255,255,255,0.72)' }}>
                  {card.sub}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── AI-Powered Tips ─────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border overflow-hidden animate-fade-up"
        style={{
          borderColor: '#fde68a',
          boxShadow: '0 4px 24px rgba(245,158,11,0.18)',
          animationDelay: '480ms',
        }}>

        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3 border-b border-amber-200"
          style={{ background: 'linear-gradient(135deg, #fffbeb 0%, #fef9c3 100%)' }}>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: '#f59e0b', boxShadow: '0 4px 14px rgba(245,158,11,0.45)' }}>
            <Lightbulb className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-amber-800">نصائح ذكية بناءً على بيانات مخزنك</p>
              {!tipsError && !tipsLoading && aiTips.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 border border-amber-300">
                  <Sparkles className="w-2.5 h-2.5" />ذكاء اصطناعي
                </span>
              )}
              {tipsError && (
                <span className="text-[10px] text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                  نصائح عامة
                </span>
              )}
            </div>
            <p className="text-xs text-amber-600">
              {tipsLoading
                ? 'جاري تحليل بياناتك...'
                : aiTips.length > 0
                  ? `نصيحة ${tipIndex + 1} من ${aiTips.length} — تتجدد كل 7 ثوانٍ`
                  : 'سيتم توليد نصائح مخصصة لبياناتك'}
            </p>
          </div>
          <button
            onClick={fetchAiTips}
            disabled={tipsLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
            {tipsLoading
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <RefreshCw className="w-3 h-3" />}
            {tipsLoading ? 'جاري التوليد...' : 'نصائح جديدة'}
          </button>
        </div>

        {/* Body */}
        <div className="bg-white px-5 py-5 min-h-[130px] flex flex-col justify-center">
          {tipsLoading ? (
            /* Loading state */
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #b45309)', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                </div>
                <p className="text-sm font-semibold text-slate-600">
                  جاري تحليل بيانات مخزنك وتوليد نصائح مخصصة...
                </p>
              </div>
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{
                      background: '#f59e0b',
                      animationDelay: `${i * 150}ms`,
                      opacity: 0.7,
                    }} />
                ))}
              </div>
            </div>
          ) : currentTip ? (
            /* Tip display */
            <div
              className="flex items-start gap-4 transition-all duration-300"
              style={{
                opacity: tipVisible ? 1 : 0,
                transform: tipVisible ? 'translateY(0px)' : 'translateY(10px)',
              }}>
              <span className="text-4xl leading-none flex-shrink-0 mt-0.5 select-none">
                {currentTip.icon}
              </span>
              <div className="flex-1">
                <p className="text-base font-semibold text-slate-700 leading-relaxed">
                  {currentTip.text}
                </p>
                {/* Dot indicators */}
                <div className="flex items-center gap-1 mt-4">
                  {aiTips.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => jumpTip(i)}
                      className="rounded-full transition-all duration-300 hover:opacity-80"
                      style={{
                        width:      i === tipIndex ? '20px' : '8px',
                        height:     '8px',
                        background: i === tipIndex ? '#f59e0b' : '#e2e8f0',
                      }} />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Empty state */
            <div className="flex items-center gap-3 text-slate-400">
              <Lightbulb className="w-6 h-6 opacity-30" />
              <p className="text-sm">اضغط "نصائح جديدة" للحصول على توصيات مخصصة</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {aiTips.length > 0 && !tipsLoading && (
          <div className="px-5 py-2.5 border-t border-amber-100 bg-amber-50/60 flex items-center justify-between">
            <p className="text-xs text-amber-600">
              النصيحة {tipIndex + 1} من {aiTips.length}
            </p>
            <p className="text-[10px] text-amber-400">
              {tipsError ? 'نصائح عامة للمخازن' : 'مولّدة بالذكاء الاصطناعي بناءً على بياناتك اليوم'}
            </p>
          </div>
        )}
      </div>

    </div>
  );
};

export default Dashboard;
