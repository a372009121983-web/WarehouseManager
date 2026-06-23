import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, Loader2, RefreshCw, Database } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_QUESTIONS = [
  'ما هي حالة المخزون الآن؟',
  'ما هي النواقص والمنتجات المنخفضة؟',
  'ما أكثر المنتجات مبيعاً هذا الشهر؟',
  'كم إجمالي المبيعات والأرباح؟',
  'من أكبر العملاء مديونية؟',
];

const AIChatbot = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [includeData, setIncludeData] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: 'مرحباً! أنا مساعدك الذكي لإدارة المخازن 🤖\n\nأستطيع تحليل بيانات مخزونك ومبيعاتك والإجابة على أسئلتك. يمكنك سؤالي عن:\n• حالة المخزون والنواقص\n• أكثر المنتجات مبيعاً\n• المديونيات والحسابات\n• تحليل الأرباح والمصروفات\n\nتفضل، كيف أساعدك؟'
      }]);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const sendMessage = async (text?: string) => {
    const content = (text || input).trim();
    if (!content || loading) return;

    const userMsg: Message = { role: 'user', content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    // Only send last 8 messages to save tokens
    const recentMessages = newMessages.slice(-8).map(m => ({ role: m.role, content: m.content }));
    // Include data only on first 2 user messages
    const userMsgCount = newMessages.filter(m => m.role === 'user').length;
    const shouldIncludeData = includeData && userMsgCount <= 2;

    let reply = 'عذراً، حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.';

    try {
      // Get current session token for auth in edge function
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: { messages: recentMessages, includeData: shouldIncludeData },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      if (error) {
        let errMsg = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const statusCode = error.context?.status ?? 500;
            const textContent = await error.context?.text();
            errMsg = `[${statusCode}] ${textContent || error.message}`;
          } catch { /* noop */ }
        }
        console.error('AI chat error:', errMsg);
        reply = 'عذراً، حدث خطأ في المساعد الذكي. حاول مرة أخرى.';
      } else if (data?.reply) {
        reply = data.reply;
      } else if (data?.error) {
        console.error('AI response error:', data.error);
        reply = 'عذراً، لم يتمكن المساعد من الإجابة.';
      }
    } catch (err) {
      console.error('Unexpected AI error:', err);
      reply = 'خطأ غير متوقع. يرجى المحاولة مرة أخرى.';
    }

    setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    setLoading(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([{
      role: 'assistant',
      content: 'تم مسح المحادثة. كيف أساعدك؟'
    }]);
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'fixed bottom-6 left-6 z-50 w-14 h-14 rounded-2xl shadow-2xl flex items-center justify-center transition-all duration-300',
          'bg-gradient-to-br from-blue-600 to-violet-600 text-white hover:scale-110',
          open && 'rotate-0'
        )}
        title="المساعد الذكي"
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        {!open && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white animate-pulse" />
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div className={cn(
          'fixed bottom-24 left-6 z-50 w-80 sm:w-96 rounded-2xl shadow-2xl border border-border flex flex-col',
          'bg-background overflow-hidden',
          'animate-fade-up'
        )} style={{ maxHeight: '520px' }}>
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-sm">المساعد الذكي</p>
                <p className="text-white/70 text-[10px]">خبير إدارة المخازن • Gemini 3</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIncludeData(d => !d)}
                className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all',
                  includeData ? 'bg-emerald-500/30 text-emerald-100 border border-emerald-400/30' : 'bg-white/10 text-white/60')}
                title={includeData ? 'البيانات مفعّلة' : 'البيانات معطّلة'}
              >
                <Database className="w-3 h-3" />
                <span>{includeData ? 'بيانات' : 'بدون'}</span>
              </button>
              <button onClick={clearChat} className="w-7 h-7 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center" title="مسح المحادثة">
                <RefreshCw className="w-3.5 h-3.5 text-white" />
              </button>
              <button onClick={() => setOpen(false)} className="w-7 h-7 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center">
                <X className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0" style={{ maxHeight: '340px' }}>
            {messages.map((msg, i) => (
              <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                <div className={cn(
                  'w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                  msg.role === 'assistant' ? 'bg-gradient-to-br from-blue-600 to-violet-600' : 'bg-emerald-500/20 border border-emerald-500/30'
                )}>
                  {msg.role === 'assistant'
                    ? <Bot className="w-3 h-3 text-white" />
                    : <User className="w-3 h-3 text-emerald-400" />}
                </div>
                <div className={cn(
                  'max-w-[78%] rounded-2xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap',
                  msg.role === 'assistant'
                    ? 'bg-white/5 border border-border text-foreground'
                    : 'bg-blue-600 text-white'
                )}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3 h-3 text-white" />
                </div>
                <div className="bg-white/5 border border-border rounded-2xl px-3 py-2 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                  <span className="text-xs text-muted-foreground">جاري التحليل...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick questions */}
          {messages.length <= 1 && (
            <div className="px-3 pb-2 flex flex-col gap-1 flex-shrink-0">
              <p className="text-[10px] text-muted-foreground px-1">أسئلة سريعة:</p>
              <div className="flex flex-wrap gap-1">
                {QUICK_QUESTIONS.slice(0, 3).map((q, i) => (
                  <button key={i} onClick={() => sendMessage(q)}
                    className="text-[10px] px-2 py-1 bg-white/5 border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-blue-500/40 transition-all">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="px-3 pb-3 flex-shrink-0">
            <div className="flex gap-2 items-center bg-white/5 border border-border rounded-xl p-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="اكتب سؤالك هنا..."
                disabled={loading}
                className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all',
                  input.trim() && !loading
                    ? 'bg-gradient-to-br from-blue-600 to-violet-600 text-white hover:scale-105'
                    : 'bg-white/5 text-muted-foreground cursor-not-allowed'
                )}
              >
                <Send className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AIChatbot;
