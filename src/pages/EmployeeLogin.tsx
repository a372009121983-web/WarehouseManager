import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Warehouse, Phone, Lock, Eye, EyeOff, Users, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useInteraction } from '@/hooks/useInteraction';
import { toast } from 'sonner';

const phoneToEmail = (phone: string) => {
  const clean = phone.replace(/\D/g, '');
  return `${clean}@wms.local`;
};

const EmployeeLogin = () => {
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
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/6 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-8 animate-fade-up">
          <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
            <Users className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">دخول الموظفين</h1>
          <p className="text-sm text-muted-foreground mt-1">أدخل بياناتك التي أعطاها لك المدير</p>
        </div>

        <div className="glass rounded-2xl border border-border p-6 animate-fade-up" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center gap-3 p-3 mb-5 bg-emerald-500/8 border border-emerald-500/20 rounded-xl">
            <div className="w-8 h-8 bg-emerald-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-emerald-400">بوابة الموظفين</p>
              <p className="text-[11px] text-muted-foreground">استخدم رقم الهاتف وكلمة المرور المؤقتة</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">رقم الهاتف</label>
              <div className="relative">
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="tel" value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="w-full bg-card border border-border rounded-xl py-2.5 pr-10 pl-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-emerald-500/50"
                  onKeyDown={e => e.key === 'Enter' && handleLogin()} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">كلمة المرور</label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="كلمة المرور المؤقتة من المدير"
                  className="w-full bg-card border border-border rounded-xl py-2.5 pr-10 pl-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-emerald-500/50"
                  onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                <button type="button"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(v => !v)}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 font-bold text-sm active:scale-95 disabled:opacity-60 transition-all shadow-md shadow-emerald-500/20"
              onClick={handleLogin}>
              {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
            </button>
          </div>
        </div>

        {/* Back to owner login */}
        <div className="mt-4 text-center animate-fade-up" style={{ animationDelay: '200ms' }}>
          <Link to="/login"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            دخول أصحاب الأعمال
          </Link>
        </div>
      </div>
    </div>
  );
};

export default EmployeeLogin;
