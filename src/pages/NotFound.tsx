import { Link } from 'react-router-dom';
import { Warehouse, ArrowRight } from 'lucide-react';

const NotFound = () => (
  <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
    <div className="text-center animate-fade-up">
      <div className="w-20 h-20 gradient-blue rounded-2xl flex items-center justify-center mx-auto mb-6">
        <Warehouse className="w-10 h-10 text-white" />
      </div>
      <h1 className="text-5xl font-bold text-foreground mb-2">404</h1>
      <p className="text-muted-foreground mb-6">الصفحة التي تبحث عنها غير موجودة</p>
      <Link to="/"
        className="inline-flex items-center gap-2 gradient-blue text-white px-6 py-3 rounded-xl font-semibold">
        <ArrowRight className="w-4 h-4" />
        العودة للرئيسية
      </Link>
    </div>
  </div>
);

export default NotFound;
