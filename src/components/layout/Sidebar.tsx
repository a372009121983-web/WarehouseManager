import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard,
  Warehouse,
  Package,
  BarChart3,
  ArrowLeftRight,
  Bell,
  Settings,
  ChevronLeft,
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
  { path: '/',           icon: LayoutDashboard, label: 'لوحة التحكم',       roles: ['admin','warehouse_manager','driver','boss'] },
  { path: '/warehouses', icon: Warehouse,        label: 'المخازن',           roles: ['admin','warehouse_manager','boss'] },
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

  // Filter nav items by role
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
        'fixed top-0 right-0 h-full w-64 z-50 flex flex-col transition-transform duration-300 ease-out',
        'bg-white border-l border-border/60 shadow-md',
        open ? 'translate-x-0' : 'translate-x-full',
        'lg:translate-x-0 lg:static lg:z-auto'
      )}>
        <div className="flex items-center justify-between px-5 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-blue flex items-center justify-center glow-blue">
              <Warehouse className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm text-foreground leading-tight">الإمري</p>
              <p className="text-xs text-muted-foreground">نظام إدارة المخازن</p>
            </div>
          </div>
          <button className="lg:hidden icon-btn w-8 h-8 text-muted-foreground hover:text-foreground" onClick={() => { interact('click'); onClose(); }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 overflow-y-auto scrollbar-thin">
          <p className="text-xs text-muted-foreground px-3 mb-3 font-medium">القائمة الرئيسية</p>
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
                        ? 'bg-primary/15 text-primary border border-primary/25 glow-blue'
                        : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                    )}>
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 relative', isActive ? 'gradient-blue' : 'bg-white/5')}>
                      <Icon className="w-4 h-4" />
                      {isAlerts && (unreadCount as number) > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] flex items-center justify-center font-bold">
                          {(unreadCount as number) > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </div>
                    <span className="flex-1">{item.label}</span>
                    {isActive && <ChevronLeft className="w-4 h-4 opacity-60" />}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="px-4 py-4 border-t border-border">
          <div className="glass rounded-xl p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full gradient-emerald flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">{(profile?.full_name || profile?.username || 'م').charAt(0)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{profile?.full_name || profile?.username || 'المستخدم'}</p>
                <p className="text-xs text-muted-foreground truncate">{roleLabel[role] || role}</p>
              </div>
              <button className="icon-btn w-7 h-7 text-muted-foreground hover:text-red-400 flex-shrink-0 glass rounded-lg"
                onClick={async () => { interact('click'); await signOut(); navigate('/login'); }} title="تسجيل الخروج">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
