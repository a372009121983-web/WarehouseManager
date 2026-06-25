import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard,
  Package,
  BarChart3,
  ArrowLeftRight,
  Bell,
  Settings,
  X,
  Archive,
  ShoppingCart,
  ShoppingBag,
  RotateCcw,
  BookOpen,
  Users,
  Truck,
  ReceiptText,
  UserCheck,
  AlertTriangle,
  CreditCard,
  LogOut,
} from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const allNavItems = [
  { path: '/',           icon: LayoutDashboard, label: 'الرئيسية',           roles: ['admin','warehouse_manager','driver','boss'] },
  { path: '/inventory',  icon: Archive,          label: 'الجرد والمخزون',    roles: ['admin','warehouse_manager','boss'] },
  { path: '/products',   icon: Package,          label: 'المنتجات',          roles: ['admin','warehouse_manager','boss'] },
  { path: '/sales',      icon: ShoppingCart,     label: 'المبيعات',          roles: ['admin','warehouse_manager','worker','boss'] },
  { path: '/purchases',  icon: ShoppingBag,      label: 'المشتريات',         roles: ['admin','warehouse_manager','worker','boss'] },
  { path: '/returns',    icon: RotateCcw,        label: 'المرتجعات',         roles: ['admin','warehouse_manager','boss'] },
  { path: '/daily',      icon: BookOpen,         label: 'اليومية',           roles: ['admin','warehouse_manager','boss'] },
  { path: '/customers',  icon: Users,            label: 'العملاء',           roles: ['admin','warehouse_manager','boss'] },
  { path: '/suppliers',  icon: Truck,            label: 'الموردين',          roles: ['admin','warehouse_manager','boss'] },
  { path: '/transfers',  icon: ArrowLeftRight,   label: 'التحويلات',         roles: ['admin','warehouse_manager','driver','boss'] },
  { path: '/expenses',   icon: ReceiptText,      label: 'المصروفات',         roles: ['admin','warehouse_manager','worker','boss'] },
  { path: '/workers',    icon: UserCheck,        label: 'العمال',            roles: ['admin','warehouse_manager','boss'] },
  { path: '/my-account', icon: CreditCard,       label: 'حسابي',             roles: ['worker'] },
  { path: '/damages',    icon: AlertTriangle,    label: 'الهوالك والتالف',   roles: ['admin','warehouse_manager','boss'] },
  { path: '/reports',    icon: BarChart3,        label: 'التقارير',          roles: ['admin','warehouse_manager','boss'] },
  { path: '/alerts',     icon: Bell,             label: 'التنبيهات',         roles: ['admin','warehouse_manager','boss'] },
  { path: '/settings',   icon: Settings,         label: 'الإعدادات',         roles: ['admin','warehouse_manager'] },
];

const Sidebar = ({ open, onClose }: SidebarProps) => {
  const { interact } = useInteraction();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const role = profile?.role || 'worker';

  const roleLabel: Record<string, string> = {
    admin: 'مدير النظام',
    warehouse_manager: 'مدير مخزن',
    driver: 'سائق',
    worker: 'عامل',
    boss: 'الرئيس',
  };

  const navItems = allNavItems.filter(item => item.roles.includes(role));

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['alerts-unread'],
    queryFn: async () => {
      const { count } = await supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('read', false);
      return count ?? 0;
    },
    refetchInterval: 30000,
    enabled: role !== 'worker',
  });

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => { interact('click'); onClose(); }} />
      )}

      <aside className={cn(
        'fixed top-0 right-0 h-full w-60 z-50 flex flex-col transition-transform duration-300 ease-out',
        'bg-white border-l shadow-lg',
        'border-[#e0f0f0]',
        open ? 'translate-x-0' : 'translate-x-full',
        'lg:translate-x-0 lg:static lg:z-auto'
      )}>
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-[#e0f0f0]"
          style={{ background: 'linear-gradient(135deg, #1d6b6b 0%, #2a8f8f 100%)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-black text-sm text-white leading-tight">الإمري</p>
              <p className="text-[10px] text-white/70">نظام إدارة المخازن</p>
            </div>
          </div>
          <button className="lg:hidden w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center text-white" onClick={() => { interact('click'); onClose(); }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2.5 overflow-y-auto scrollbar-thin">
          <ul className="space-y-0.5">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              const isAlerts = item.path === '/alerts';
              return (
                <li key={item.path}>
                  <NavLink to={item.path} onClick={() => { interact('click'); onClose(); }}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'text-white shadow-sm'
                        : 'text-slate-600 hover:text-[#1d6b6b] hover:bg-[#e6f4f4]'
                    )}
                    style={isActive ? { background: 'linear-gradient(135deg, #1d6b6b 0%, #2a8f8f 100%)' } : {}}>
                    <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 relative',
                      isActive ? 'bg-white/20' : 'bg-transparent')}>
                      <Icon className={cn('w-4 h-4', isActive ? 'text-white' : 'text-slate-500')} />
                      {isAlerts && (unreadCount as number) > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] flex items-center justify-center font-bold">
                          {(unreadCount as number) > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </div>
                    <span className="flex-1 text-sm">{item.label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-[#e0f0f0]">
          <div className="flex items-center gap-2.5 bg-[#f0fafa] rounded-xl px-3 py-2.5 border border-[#c8e8e8]">
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-sm"
              style={{ background: 'linear-gradient(135deg, #1d6b6b 0%, #2a8f8f 100%)' }}>
              {(profile?.full_name || profile?.username || 'م').charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{profile?.full_name || profile?.username || 'المستخدم'}</p>
              <p className="text-xs text-slate-500 truncate">{roleLabel[role] || role}</p>
            </div>
            <button
              className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all border border-[#e0f0f0]"
              onClick={async () => { interact('click'); await signOut(); navigate('/login'); }} title="تسجيل الخروج">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
