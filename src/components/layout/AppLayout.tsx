import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const pageTitles: Record<string, string> = {
  '/': 'لوحة التحكم — الإمري',
  '/my-account': 'حسابي',
  '/warehouses': 'إدارة المخازن',
  '/inventory': 'الجرد والمخزون',
  '/products': 'إدارة المنتجات',
  '/transfers': 'التحويلات',
  '/sales': 'المبيعات',
  '/purchases': 'المشتريات',
  '/returns': 'المرتجعات',
  '/daily': 'اليومية',
  '/customers': 'إدارة العملاء',
  '/suppliers': 'إدارة الموردين',
  '/damages': 'الهوالك والتالف',
  '/reports': 'التقارير',
  '/alerts': 'التنبيهات',
  '/expenses': 'المصروفات',
  '/workers': 'العمال',
  '/settings': 'الإعدادات',
};

const AppLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'النظام';

  useEffect(() => {
    const requestFS = () => {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      }
    };
    const handler = () => { requestFS(); document.removeEventListener('click', handler); };
    document.addEventListener('click', handler, { once: true });
    return () => document.removeEventListener('click', handler);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 lg:mr-64">
        <Header onMenuClick={() => setSidebarOpen(true)} title={title} />
        <main className="flex-1 p-4 md:p-6 overflow-auto scrollbar-thin">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
