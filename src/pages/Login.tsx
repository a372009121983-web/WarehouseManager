import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Warehouse, Phone, Lock, Eye, EyeOff, Users, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const phoneToEmail = (phone: string) => {
  const clean = phone.replace(/\D/g, '');
  return `${clean}@wms.local`;
};

const Login = () => {
  const { interact } = useInteraction();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!phone || !password) {
      interact('error');
      toast.error('يرجى إدخال رقم الهاتف وكلمة المرور');
      return;
    }
    setLoading(true);
    const email = phoneToEmail(phone);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      interact('error');
      toast.error('رقم الهاتف أو كلمة المرور غير صحيحة');
      setLoading(false);
      return;
    }
    interact('success');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-blue-500/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-violet-500/6 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-up">
          <div className="w-16 h-16 gradient-blue glow-blue rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Warehouse className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">نظام إدارة المخازن</h1>
          <p className="text-sm text-muted-foreground mt-1">الموزعة للأسواق والمنافذ التجارية</p>
        </div>

        {/* Login Type Selector */}
        <div className="grid grid-cols-2 gap-3 mb-4 animate-fade-up" style={{ animationDelay: '50ms' }}>
          <Link to="/login"
            className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-primary bg-primary/8 text-center transition-all">
            <div className="w-10 h-10 gradient-blue rounded-xl flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">صاحب العمل</p>
              <p className="text-[11px] text-muted-foreground">مدير / مالك</p>
            </div>
          </Link>
          <Link to="/employee-login"
            className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-border bg-card text-center transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">موظف</p>
              <p className="text-[11px] text-muted-foreground">عامل / سائق</p>
            </div>
          </Link>
        </div>

        <div className="glass rounded-2xl border border-border p-6 animate-fade-up" style={{ animationDelay: '100ms' }}>
          <div className="mb-5">
            <p className="text-sm font-semibold text-foreground">تسجيل دخول صاحب العمل</p>
            <p className="text-xs text-muted-foreground mt-1">أدخل رقم هاتفك وكلمة المرور</p>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">رقم الهاتف</label>
              <div className="relative">
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="tel" value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="w-full bg-card border border-border rounded-xl py-2.5 pr-10 pl-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                  onKeyDown={e => e.key === 'Enter' && handleLogin()} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">كلمة المرور</label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-card border border-border rounded-xl py-2.5 pr-10 pl-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                  onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                <button type="button"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(v => !v)}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button disabled={loading}
              className="w-full gradient-blue glow-blue text-white rounded-xl py-3 font-bold text-sm active:scale-95 disabled:opacity-60 transition-all"
              onClick={handleLogin}>
              {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
            </button>
          </div>
        </div>

        {/* Register link */}
        <p className="text-center text-xs text-muted-foreground mt-4 animate-fade-up" style={{ animationDelay: '200ms' }}>
          ليس لديك حساب؟{' '}
          <Link to="/register" className="text-blue-400 hover:text-blue-300 font-medium">إنشاء حساب جديد</Link>
        </p>

        <p className="text-center text-xs text-muted-foreground mt-2">
          نظام إدارة المخازن الموزعة © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
};

export default Login;
