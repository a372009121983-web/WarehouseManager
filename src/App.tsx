import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Warehouses from "@/pages/Warehouses";
import Inventory from "@/pages/Inventory";
import Products from "@/pages/Products";
import Transfers from "@/pages/Transfers";
import Reports from "@/pages/Reports";
import Alerts from "@/pages/Alerts";
import Settings from "@/pages/Settings";
import Sales from "@/pages/Sales";
import Purchases from "@/pages/Purchases";
import Returns from "@/pages/Returns";
import Daily from "@/pages/Daily";
import Customers from "@/pages/Customers";
import Suppliers from "@/pages/Suppliers";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import EmployeeLogin from "@/pages/EmployeeLogin";
import Expenses from "@/pages/Expenses";
import Workers from "@/pages/Workers";
import Damages from "@/pages/Damages";
import WorkerSelf from "@/pages/WorkerSelf";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60000,
      refetchOnWindowFocus: false,
    },
  },
});

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 gradient-blue rounded-xl animate-pulse glow-blue" />
          <p className="text-muted-foreground text-sm">جاري التحميل...</p>
        </div>
      </div>
    );
  }
  return user ? <>{children}</> : <Navigate to="/login" replace />;
};

// Guard: redirects workers away from restricted pages
const WorkerGuard = ({ children }: { children: React.ReactNode }) => {
  const { profile } = useAuth();
  if (profile?.role === 'worker') return <Navigate to="/sales" replace />;
  return <>{children}</>;
};

// Guard: boss can view everything but cannot access settings
const BossGuard = ({ children }: { children: React.ReactNode }) => {
  const { profile } = useAuth();
  if (profile?.role === 'boss') return <Navigate to="/" replace />;
  return <>{children}</>;
};

// Dashboard redirect for workers (boss sees dashboard)
const WorkerDashboardGuard = () => {
  const { profile } = useAuth();
  if (profile?.role === 'worker') return <Navigate to="/sales" replace />;
  return <Dashboard />;
};

const AppRoutes = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 gradient-blue rounded-xl animate-pulse glow-blue" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
      <Route path="/employee-login" element={user ? <Navigate to="/" replace /> : <EmployeeLogin />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<WorkerDashboardGuard />} />
        <Route path="/warehouses" element={<WorkerGuard><Warehouses /></WorkerGuard>} />
        <Route path="/inventory" element={<WorkerGuard><Inventory /></WorkerGuard>} />
        <Route path="/products" element={<WorkerGuard><Products /></WorkerGuard>} />
        <Route path="/transfers" element={<WorkerGuard><Transfers /></WorkerGuard>} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/purchases" element={<Purchases />} />
        <Route path="/returns" element={<WorkerGuard><Returns /></WorkerGuard>} />
        <Route path="/daily" element={<WorkerGuard><Daily /></WorkerGuard>} />
        <Route path="/customers" element={<WorkerGuard><Customers /></WorkerGuard>} />
        <Route path="/suppliers" element={<WorkerGuard><Suppliers /></WorkerGuard>} />
        <Route path="/reports" element={<WorkerGuard><Reports /></WorkerGuard>} />
        <Route path="/alerts" element={<WorkerGuard><Alerts /></WorkerGuard>} />
        <Route path="/settings" element={<WorkerGuard><BossGuard><Settings /></BossGuard></WorkerGuard>} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/workers" element={<WorkerGuard><Workers /></WorkerGuard>} />
        <Route path="/damages" element={<WorkerGuard><Damages /></WorkerGuard>} />
        <Route path="/my-account" element={<WorkerSelf />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
