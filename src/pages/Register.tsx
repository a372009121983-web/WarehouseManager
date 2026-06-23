import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Warehouse, Phone, Lock, Eye, EyeOff, User, Building2, CheckCircle2, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const phoneToEmail = (phone: string) => {
  const clean = phone.replace(/\D/g, '');
  return `${clean}@wms.local`;
};

const STEPS = ['بياناتك', 'الشركة', 'كلمة المرور'];

const Register = () => {
  const { interact } = useInteraction();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    companyName: '',
    password: '',
    confirmPassword: '',
  });

  const email = phoneToEmail(form.phone);

  const validateStep = () => {
    if (step === 0) {
      if (!form.fullName.trim()) { toast.error('يرجى إدخال الاسم الكامل'); return false; }
      if (!form.phone || form.phone.replace(/\D/g, '').length < 8) { toast.error('يرجى إدخال رقم هاتف صحيح'); return false; }
    }
    if (step === 1) {
      if (!form.companyName.trim()) { toast.error('يرجى إدخال اسم الشركة/المخزن'); return false; }
    }
    if (step === 2) {
      if (!form.password || form.password.length < 6) { toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return false; }
      if (form.password !== form.confirmPassword) { toast.error('كلمتا المرور غير متطابقتين'); return false; }
    }
    return true;
  };

  const next = () => {
    interact('click');
    if (!validateStep()) return;
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else handleRegister();
  };

  const handleRegister = async () => {
    setLoading(true);

    // Try to sign in first (account might already exist)
    const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password: form.password });
    if (!loginErr) {
      interact('success');
      navigate('/');
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password: form.password,
      options: {
        data: {
          full_name: form.fullName.trim(),
          phone: form.phone.replace(/\D/g, ''),
          role: 'admin',
          company_name: form.companyName.trim(),
        },
      },
    });

    if (error) {
      interact('error');
      if (error.message.includes('already registered') || error.message.includes('already been registered')) {
        toast.error('رقم الهاتف مسجل مسبقاً. يرجى تسجيل الدخول.');
      } else {
        toast.error(error.message);
      }
      setLoading(false);
      return;
    }

    if (data.user) {
      // Update profile with company info
      await supabase.from('user_profiles').update({
        full_name: form.fullName.trim(),
        phone: form.phone.replace(/\D/g, ''),
        role: 'admin',
      }).eq('id', data.user.id);
    }

    interact('success');

    if (data.session) {
      navigate('/');
    } else {
      const { error: loginErr2 } = await supabase.auth.signInWithPassword({ email, password: form.password });
      if (!loginErr2) {
        navigate('/');
      } else {
        toast.success('تم إنشاء الحساب! يمكنك الدخول الآن.');
        navigate('/login');
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
      {/* Background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-blue-500/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-emerald-500/6 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-up">
          <div className="w-16 h-16 gradient-blue glow-blue rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Warehouse className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">إنشاء حساب جديد</h1>
          <p className="text-sm text-muted-foreground mt-1">نظام إدارة المخازن الموزعة</p>
        </div>

        {/* Steps Indicator */}
        <div className="flex items-center justify-center gap-2 mb-6 animate-fade-up" style={{ animationDelay: '50ms' }}>
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                i < step ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                i === step ? 'gradient-blue text-white shadow-sm' :
                'bg-muted text-muted-foreground border border-border'
              )}>
                {i < step ? <CheckCircle2 className="w-3 h-3" /> : <span>{i + 1}</span>}
                <span>{s}</span>
              </div>
              {i < STEPS.length - 1 && <div className={cn('w-5 h-px', i < step ? 'bg-emerald-500/50' : 'bg-border')} />}
            </div>
          ))}
        </div>

        <div className="glass rounded-2xl border border-border p-6 animate-fade-up" style={{ animationDelay: '100ms' }}>
          {/* Step 0: Personal Info */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 gradient-blue rounded-xl flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">بياناتك الشخصية</p>
                  <p className="text-xs text-muted-foreground">أدخل اسمك ورقم هاتفك</p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">الاسم الكامل</label>
                <div className="relative">
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" value={form.fullName}
                    onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))}
                    placeholder="محمد أحمد"
                    className="w-full bg-card border border-border rounded-xl py-2.5 pr-10 pl-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                    onKeyDown={e => e.key === 'Enter' && next()} />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">رقم الهاتف (سيُستخدم للدخول)</label>
                <div className="relative">
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="tel" value={form.phone}
                    onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    placeholder="01XXXXXXXXX"
                    className="w-full bg-card border border-border rounded-xl py-2.5 pr-10 pl-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                    onKeyDown={e => e.key === 'Enter' && next()} />
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Company */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-emerald-600 rounded-xl flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">بيانات الشركة</p>
                  <p className="text-xs text-muted-foreground">سيتم عزل بياناتك بشكل كامل</p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">اسم الشركة / المخزن</label>
                <div className="relative">
                  <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" value={form.companyName}
                    onChange={e => setForm(p => ({ ...p, companyName: e.target.value }))}
                    placeholder="شركة الأمل للتوزيع"
                    className="w-full bg-card border border-border rounded-xl py-2.5 pr-10 pl-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                    onKeyDown={e => e.key === 'Enter' && next()} />
                </div>
              </div>

              <div className="bg-blue-500/8 border border-blue-500/20 rounded-xl p-3">
                <p className="text-xs text-blue-400 font-medium mb-1">ما الذي ستحصل عليه؟</p>
                <ul className="space-y-1">
                  {['مخازن وبضائع منفصلة تماماً', 'إضافة موظفين ينتمون لحسابك فقط', 'تقارير ومبيعات خاصة بك', 'مساعد ذكي متخصص لبياناتك'].map(f => (
                    <li key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="w-3 h-3 text-blue-400 flex-shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Step 2: Password */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-violet-600 rounded-xl flex items-center justify-center">
                  <Lock className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">كلمة المرور</p>
                  <p className="text-xs text-muted-foreground">6 أحرف على الأقل</p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">كلمة المرور</label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type={showPassword ? 'text' : 'password'} value={form.password}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="••••••••"
                    className="w-full bg-card border border-border rounded-xl py-2.5 pr-10 pl-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                    onKeyDown={e => e.key === 'Enter' && next()} />
                  <button type="button"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(v => !v)}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">تأكيد كلمة المرور</label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="password" value={form.confirmPassword}
                    onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
                    placeholder="••••••••"
                    className={cn(
                      'w-full bg-card border rounded-xl py-2.5 pr-10 pl-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none',
                      form.confirmPassword && form.password !== form.confirmPassword
                        ? 'border-red-400 focus:border-red-400'
                        : form.confirmPassword && form.password === form.confirmPassword
                          ? 'border-emerald-400 focus:border-emerald-400'
                          : 'border-border focus:border-primary/50'
                    )}
                    onKeyDown={e => e.key === 'Enter' && next()} />
                </div>
              </div>

              {/* Summary */}
              <div className="bg-muted/40 rounded-xl p-3 space-y-1 border border-border">
                <p className="text-xs text-muted-foreground font-medium mb-2">ملخص الحساب:</p>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">الاسم:</span>
                  <span className="text-foreground font-medium">{form.fullName}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">الهاتف:</span>
                  <span className="text-foreground font-medium" dir="ltr">{form.phone}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">الشركة:</span>
                  <span className="text-foreground font-medium">{form.companyName}</span>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-5">
            {step > 0 && (
              <button
                className="flex items-center gap-1.5 px-4 py-2.5 bg-muted text-muted-foreground rounded-xl text-sm"
                onClick={() => { interact('click'); setStep(s => s - 1); }}>
                <ArrowRight className="w-4 h-4" />
                السابق
              </button>
            )}
            <button
              disabled={loading}
              className="flex-1 gradient-blue glow-blue text-white rounded-xl py-2.5 font-bold text-sm active:scale-95 disabled:opacity-60 transition-all"
              onClick={next}>
              {loading ? 'جاري الإنشاء...' : step === STEPS.length - 1 ? 'إنشاء الحساب' : 'التالي'}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4 animate-fade-up" style={{ animationDelay: '200ms' }}>
          لديك حساب بالفعل؟{' '}
          <Link to="/login" className="text-blue-400 hover:text-blue-300 font-medium">تسجيل الدخول</Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
