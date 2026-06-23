import { Bell, Menu, Search, RefreshCw, LogOut, User } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface HeaderProps {
  onMenuClick: () => void;
  title: string;
}

const roleLabel: Record<string, string> = {
  admin: 'مدير النظام',
  warehouse_manager: 'مدير مخزن',
  driver: 'سائق',
};

const Header = ({ onMenuClick, title }: HeaderProps) => {
  const { interact } = useInteraction();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['alerts-unread'],
    queryFn: async () => {
      const { count } = await supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('read', false);
      return count ?? 0;
    },
    refetchInterval: 30000,
  });

  const handleRefresh = () => {
    interact('success');
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleSignOut = async () => {
    interact('click');
    await signOut();
    navigate('/login');
  };

  return (
    <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-border bg-white/95 backdrop-blur-sm sticky top-0 z-30 shadow-sm">
      <div className="flex items-center gap-3">
        <button
          className="icon-btn lg:hidden w-9 h-9 bg-muted text-muted-foreground hover:text-foreground rounded-xl"
          onClick={() => { interact('click'); onMenuClick(); }}
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base font-bold text-foreground">{title}</h1>
          <p className="text-xs text-muted-foreground hidden sm:block">نظام إدارة المخازن الموزعة</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="icon-btn w-9 h-9 bg-muted text-muted-foreground hover:text-primary rounded-xl" onClick={() => interact('click')}>
          <Search className="w-4 h-4" />
        </button>

        <button
          className={cn('icon-btn w-9 h-9 bg-muted text-muted-foreground hover:text-primary rounded-xl', refreshing && 'text-primary')}
          onClick={handleRefresh}
        >
          <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
        </button>

        <button
          className="icon-btn w-9 h-9 bg-muted text-muted-foreground hover:text-amber-500 relative rounded-xl"
          onClick={() => { interact('warning'); navigate('/alerts'); }}
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -left-0.5 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
              {unreadCount}
            </span>
          )}
        </button>

        <div className="relative">
          <button
            className="flex items-center gap-2 bg-muted/70 rounded-xl px-3 py-2 border border-border hover:border-primary/40 transition-all"
            onClick={() => { interact('click'); setShowProfile(!showProfile); }}
          >
            <div className="w-7 h-7 gradient-emerald rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">{(profile?.full_name || profile?.username || 'م')[0]}</span>
            </div>
            <div className="hidden sm:block text-right">
              <p className="text-xs font-medium text-foreground leading-tight">{profile?.full_name || profile?.username}</p>
              <p className="text-[10px] text-muted-foreground">{roleLabel[profile?.role || ''] || ''}</p>
            </div>
          </button>

          {showProfile && (
            <div className="absolute left-0 top-full mt-2 w-52 bg-white rounded-xl border border-border shadow-xl z-50 overflow-hidden animate-fade-up">
              <div className="p-3 border-b border-border">
                <p className="text-sm font-medium text-foreground">{profile?.full_name || profile?.username}</p>
                <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
                <span className="mt-1 inline-block text-xs px-2 py-0.5 rounded-md bg-blue-100 text-blue-600 border border-blue-200">
                  {roleLabel[profile?.role || ''] || profile?.role}
                </span>
              </div>
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                onClick={() => { setShowProfile(false); navigate('/settings'); interact('nav'); }}
              >
                <User className="w-4 h-4" />
                <span>الإعدادات</span>
              </button>
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-all"
                onClick={handleSignOut}
              >
                <LogOut className="w-4 h-4" />
                <span>تسجيل الخروج</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
