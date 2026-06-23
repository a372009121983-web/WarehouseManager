import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageCircle, X, Send, Bot, User, Loader2, RefreshCw,
  Mic, MicOff, Volume2, VolumeX, Sparkles, StopCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// ── Speech Recognition types ──────────────────────────────────────────────
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const AIChatbot = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Voice input (STT)
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Voice output (TTS)
  const [speaking, setSpeaking] = useState(false);
  const [speakingMsgIdx, setSpeakingMsgIdx] = useState<number | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Init welcome message ─────────────────────────────────────────────────
  useEffect(() => {
    if (open && messages.length === 0) {
      const welcome = 'أهلاً بيك! 👋 أنا مساعدك الذكي، قولي محتاج إيه وأنا هساعدك في أي حاجة!';
      setMessages([{ role: 'assistant', content: welcome }]);
      speakText(welcome, 0);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  // Stop speech on close
  useEffect(() => {
    if (!open) stopSpeaking();
  }, [open]);

  // ── Text-to-Speech ────────────────────────────────────────────────────────
  const speakText = useCallback((text: string, msgIdx: number) => {
    if (!window.speechSynthesis) return;

    stopSpeaking();

    // Clean markdown and emojis a bit for better TTS
    const clean = text
      .replace(/[*_`#>]/g, '')
      .replace(/\[.*?\]\(.*?\)/g, '')
      .replace(/\n{2,}/g, '، ')
      .replace(/\n/g, ' ')
      .trim();

    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = 'ar-EG';
    utter.rate = 0.92;   // سرعة معتدلة
    utter.pitch = 1.05;
    utter.volume = 1;

    // Try to pick an Arabic voice
    const voices = window.speechSynthesis.getVoices();
    const arVoice =
      voices.find(v => v.lang === 'ar-EG') ||
      voices.find(v => v.lang.startsWith('ar')) ||
      null;
    if (arVoice) utter.voice = arVoice;

    utter.onstart = () => { setSpeaking(true); setSpeakingMsgIdx(msgIdx); };
    utter.onend = () => { setSpeaking(false); setSpeakingMsgIdx(null); };
    utter.onerror = () => { setSpeaking(false); setSpeakingMsgIdx(null); };

    utteranceRef.current = utter;
    window.speechSynthesis.speak(utter);
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setSpeakingMsgIdx(null);
  }, []);

  const toggleSpeak = useCallback((text: string, idx: number) => {
    if (speaking && speakingMsgIdx === idx) {
      stopSpeaking();
    } else {
      speakText(text, idx);
    }
  }, [speaking, speakingMsgIdx, speakText, stopSpeaking]);

  // Ensure voices loaded (Chrome lazy-loads)
  useEffect(() => {
    if (window.speechSynthesis && window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => {};
    }
  }, []);

  // ── Speech Recognition (STT) ─────────────────────────────────────────────
  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('متصفحك مش بيدعم التعرف على الصوت. جرب Chrome.');
      return;
    }
    const rec = new SR();
    rec.lang = 'ar-EG';
    rec.continuous = false;
    rec.interimResults = false;

    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInput(prev => prev + transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);

    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const sendMessage = async (text?: string, withData?: boolean) => {
    const content = (text || input).trim();
    if (!content || loading) return;

    const userMsg: Message = { role: 'user', content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    stopSpeaking();

    const recentMessages = newMessages.slice(-10).map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Detect if message is about app data to auto-include live data
    const dataKeywords = ['مخزون', 'مبيعات', 'مشتريات', 'ديون', 'مديون', 'منتج', 'عميل', 'مورد', 'ربح', 'خسارة', 'تحليل', 'تقرير', 'نواقص', 'أكثر', 'أقل', 'إجمالي'];
    const autoIncludeData = withData ?? dataKeywords.some(kw => content.includes(kw));

    let reply = '';

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: { messages: recentMessages, includeData: autoIncludeData, colloquial: true },
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
        console.error('AI error:', errMsg);
        reply = `⚠️ خطأ في الاتصال: ${errMsg}`;
      } else if (data?.reply) {
        reply = data.reply;
      } else {
        reply = 'الرد جه فاضي من السيرفر، حاول تاني.';
      }
    } catch (err) {
      console.error('Unexpected AI error:', err);
      reply = `⚠️ خطأ غير متوقع: ${String(err)}`;
    }

    const newIdx = newMessages.length;
    setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    setLoading(false);

    setTimeout(() => speakText(reply, newIdx), 100);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearChat = () => {
    stopSpeaking();
    setMessages([{ role: 'assistant', content: 'تم مسح الكلام. قولي عايز إيه! 😊' }]);
  };

  // ── Quick prompts ─────────────────────────────────────────────────────────
  const QUICK = [
    { label: 'حالة المخزون', msg: 'احكيلي عن حالة المخزون والنواقص دلوقتي', withData: true },
    { label: 'تحليل مالي', msg: 'عملي تحليل للأداء المالي للشهر ده', withData: true },
    { label: 'نصائح تطوير', msg: 'ايه نصايحك لتطوير التطبيق ده؟', withData: false },
    { label: 'المنتجات الأكثر مبيعاً', msg: 'ايه أكثر المنتجات مبيعاً عندنا؟', withData: true },
  ];

  return (
    <>
      {/* ── Floating button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'fixed bottom-6 left-6 z-50 w-14 h-14 rounded-2xl shadow-2xl flex items-center justify-center transition-all duration-300',
          'bg-gradient-to-br from-violet-600 to-blue-600 text-white',
          'hover:scale-110 hover:shadow-violet-500/40',
          open ? 'scale-95' : 'scale-100'
        )}
        title="المساعد الذكي"
      >
        {open ? <X className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
        {!open && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-white animate-pulse" />
        )}
      </button>

      {/* ── Chat window ── */}
      {open && (
        <div
          className={cn(
            'fixed bottom-24 left-6 z-50 w-80 sm:w-96 rounded-2xl shadow-2xl border border-violet-200/40 flex flex-col',
            'bg-white overflow-hidden animate-fade-up'
          )}
          style={{ maxHeight: '540px' }}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-sm">مساعدك الذكي</p>
                <p className="text-white/70 text-[10px] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse inline-block" />
                  يتكلم بالعامية • بيسمع وبيتكلم
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {speaking && (
                <button onClick={stopSpeaking}
                  className="flex items-center gap-1 px-2 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-[10px] text-white transition-all">
                  <StopCircle className="w-3 h-3" />
                  <span>وقف</span>
                </button>
              )}
              <button onClick={clearChat}
                className="w-7 h-7 bg-white/15 hover:bg-white/25 rounded-lg flex items-center justify-center"
                title="مسح المحادثة">
                <RefreshCw className="w-3.5 h-3.5 text-white" />
              </button>
              <button onClick={() => setOpen(false)}
                className="w-7 h-7 bg-white/15 hover:bg-white/25 rounded-lg flex items-center justify-center">
                <X className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0 bg-gray-50/50" style={{ maxHeight: '360px' }}>
            {messages.map((msg, i) => (
              <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                {/* Avatar */}
                <div className={cn(
                  'w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5',
                  msg.role === 'assistant'
                    ? 'bg-gradient-to-br from-violet-600 to-blue-600'
                    : 'bg-emerald-500'
                )}>
                  {msg.role === 'assistant'
                    ? <Bot className="w-3.5 h-3.5 text-white" />
                    : <User className="w-3.5 h-3.5 text-white" />}
                </div>

                {/* Bubble */}
                <div className={cn(
                  'max-w-[76%] rounded-2xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap group relative',
                  msg.role === 'assistant'
                    ? 'bg-white border border-gray-200 text-gray-800 shadow-sm'
                    : 'bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow-sm'
                )}>
                  {msg.content}

                  {/* Speak button for assistant messages */}
                  {msg.role === 'assistant' && (
                    <button
                      onClick={() => toggleSpeak(msg.content, i)}
                      className={cn(
                        'absolute -bottom-2 -left-2 w-6 h-6 rounded-full flex items-center justify-center transition-all',
                        'border border-gray-200 bg-white shadow-sm',
                        speakingMsgIdx === i ? 'text-violet-600 bg-violet-50' : 'text-gray-400 hover:text-violet-600',
                      )}
                      title={speakingMsgIdx === i ? 'وقف الكلام' : 'استمع'}
                    >
                      {speakingMsgIdx === i
                        ? <VolumeX className="w-3 h-3" />
                        : <Volume2 className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Loading */}
            {loading && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl px-3 py-2 flex items-center gap-2 shadow-sm">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-gray-400">بفكر...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts */}
          {messages.length <= 1 && (
            <div className="px-3 pt-2 pb-1 flex flex-wrap gap-1.5 border-t border-gray-100 flex-shrink-0 bg-white">
              {QUICK.map((q, i) => (
                <button key={i} onClick={() => sendMessage(q.msg, q.withData)}
                  className="text-[11px] px-2.5 py-1 bg-violet-50 border border-violet-200 text-violet-700 rounded-xl hover:bg-violet-100 transition-all font-medium">
                  {q.label}
                </button>
              ))}
            </div>
          )}

          {/* Input bar */}
          <div className="px-3 pb-3 pt-2 flex-shrink-0 bg-white border-t border-gray-100">
            <div className="flex gap-2 items-center bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:border-violet-400 transition-colors">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={listening ? '🎤 بسمعك...' : 'اكتب أو اتكلم...'}
                disabled={loading}
                className="flex-1 bg-transparent text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none"
              />

              {/* Mic button */}
              <button
                type="button"
                onClick={listening ? stopListening : startListening}
                disabled={loading}
                className={cn(
                  'w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 transition-all',
                  listening
                    ? 'bg-red-500 text-white animate-pulse'
                    : 'bg-gray-200 text-gray-500 hover:bg-violet-100 hover:text-violet-600'
                )}
                title={listening ? 'وقف التسجيل' : 'تكلم'}
              >
                {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              </button>

              {/* Send button */}
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className={cn(
                  'w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 transition-all',
                  input.trim() && !loading
                    ? 'bg-gradient-to-br from-violet-600 to-blue-600 text-white hover:scale-105 shadow-sm'
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                )}
              >
                {loading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>

            <p className="text-center text-[10px] text-gray-300 mt-1.5">
              {speaking ? '🔊 بيتكلم...' : '🤖 مدعوم بـ Gemini 3 Flash'}
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default AIChatbot;
