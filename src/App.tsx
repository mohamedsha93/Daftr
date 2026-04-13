/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Search, 
  UserPlus, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Printer, 
  Share2, 
  Trash2, 
  ChevronRight,
  LogOut,
  LogIn,
  History,
  Phone,
  FileText,
  Wallet,
  RefreshCw
} from 'lucide-react';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  updateDoc, 
  deleteDoc, 
  Timestamp,
  serverTimestamp,
  getDocs,
  increment
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { db, auth } from './lib/firebase';
import { Customer, Transaction } from './types';
import { handleFirestoreError, OperationType } from './lib/firestore-errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useReactToPrint } from 'react-to-print';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const googleProvider = new GoogleAuthProvider();

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false);
  
  // Form states
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '' });
  const [newTransaction, setNewTransaction] = useState({ amount: '', type: 'debit' as 'credit' | 'debit', description: '' });

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !isAuthReady) return;

    const q = query(collection(db, 'customers'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customerData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Customer[];
      setCustomers(customerData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'customers');
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  useEffect(() => {
    if (!selectedCustomer || !user) {
      setTransactions([]);
      return;
    }

    const q = query(
      collection(db, `customers/${selectedCustomer.id}/transactions`),
      orderBy('date', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const transactionData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Transaction[];
      setTransactions(transactionData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `customers/${selectedCustomer.id}/transactions`);
    });

    return () => unsubscribe();
  }, [selectedCustomer, user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      toast.success('تم تسجيل الدخول بنجاح');
    } catch (error) {
      console.error(error);
      toast.error('فشل تسجيل الدخول');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setSelectedCustomer(null);
      toast.success('تم تسجيل الخروج');
    } catch (error) {
      console.error(error);
    }
  };

  const handleAddCustomer = async () => {
    if (!newCustomer.name) return;
    try {
      await addDoc(collection(db, 'customers'), {
        name: newCustomer.name,
        phone: newCustomer.phone,
        totalBalance: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setNewCustomer({ name: '', phone: '' });
      setIsAddCustomerOpen(false);
      toast.success('تم إضافة العميل بنجاح');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'customers');
    }
  };

  const handleAddTransaction = async () => {
    if (!selectedCustomer || !newTransaction.amount) return;
    const amount = parseFloat(newTransaction.amount);
    if (isNaN(amount)) return;

    try {
      // Add transaction
      await addDoc(collection(db, `customers/${selectedCustomer.id}/transactions`), {
        customerId: selectedCustomer.id,
        amount,
        type: newTransaction.type,
        description: newTransaction.description,
        date: serverTimestamp()
      });

      // Update customer balance atomically using increment
      const balanceChange = newTransaction.type === 'credit' ? amount : -amount;

      await updateDoc(doc(db, 'customers', selectedCustomer.id), {
        totalBalance: increment(balanceChange),
        updatedAt: serverTimestamp()
      });

      setNewTransaction({ amount: '', type: 'debit', description: '' });
      setIsAddTransactionOpen(false);
      toast.success('تم تسجيل المعاملة بنجاح');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'transactions');
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا العميل وجميع معاملاته؟')) return;
    try {
      // Note: In a real app, you'd delete subcollections too. 
      // Firestore doesn't delete subcollections automatically.
      await deleteDoc(doc(db, 'customers', id));
      if (selectedCustomer?.id === id) setSelectedCustomer(null);
      toast.success('تم حذف العميل');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `customers/${id}`);
    }
  };

  const recalculateBalance = async (customerId: string) => {
    try {
      const loadingToast = toast.loading('جاري إعادة حساب الرصيد...');
      const transactionsSnap = await getDocs(collection(db, `customers/${customerId}/transactions`));
      
      let total = 0;
      transactionsSnap.forEach((doc) => {
        const data = doc.data();
        const amount = data.amount || 0;
        if (data.type === 'credit') {
          total += amount;
        } else {
          total -= amount;
        }
      });

      await updateDoc(doc(db, 'customers', customerId), {
        totalBalance: total,
        updatedAt: serverTimestamp()
      });

      toast.dismiss(loadingToast);
      toast.success('تم إعادة حساب الرصيد بنجاح');
    } catch (error) {
      console.error('Recalculate error:', error);
      toast.error('حدث خطأ أثناء إعادة الحساب');
    }
  };

  const generatePDF = async (shouldDownload = true) => {
    if (!selectedCustomer || !printRef.current) return null;
    
    try {
      const loadingToast = toast.loading('جاري تجهيز كشف الحساب...');
      
      // Wait for any images or fonts to settle
      await new Promise(resolve => setTimeout(resolve, 300));

      const canvas = await html2canvas(printRef.current, {
        scale: 3, // Higher scale for better quality
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: 794, // Fixed A4 width at 96dpi
        onclone: (clonedDoc) => {
          // Ensure the cloned element is visible for capture
          const el = clonedDoc.getElementById('print-container');
          if (el) el.style.display = 'block';
        }
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      
      // A4 dimensions in px at 72dpi: 595 x 842
      // Our canvas is 794px wide (96dpi). 
      // We'll scale it to fit A4.
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      
      const fileName = `كشف_حساب_${selectedCustomer.name}_${new Date().toISOString().split('T')[0]}.pdf`;

      toast.dismiss(loadingToast);

      if (shouldDownload) {
        pdf.save(fileName);
        toast.success('تم تحميل كشف الحساب بنجاح');
      }

      return {
        blob: pdf.output('blob'),
        fileName
      };
    } catch (error) {
      console.error('PDF Error:', error);
      toast.dismiss();
      toast.error('حدث خطأ أثناء إنشاء كشف الحساب');
      return null;
    }
  };

  const shareToWhatsApp = async () => {
    if (!selectedCustomer) return;
    
    const pdfData = await generatePDF(false);
    
    const balanceText = selectedCustomer.totalBalance >= 0 
      ? `له: ${selectedCustomer.totalBalance}` 
      : `عليه: ${Math.abs(selectedCustomer.totalBalance)}`;
    
    let message = `*كشف حساب: ${selectedCustomer.name}*\n`;
    message += `*الرصيد الحالي: ${balanceText}*\n\n`;
    message += `يرجى الاطلاع على ملف PDF المرفق لتفاصيل الحساب.`;

    // Try Web Share API first (works on mobile for files)
    if (pdfData && navigator.share && navigator.canShare && navigator.canShare({ files: [new File([pdfData.blob], pdfData.fileName, { type: 'application/pdf' })] })) {
      try {
        const file = new File([pdfData.blob], pdfData.fileName, { type: 'application/pdf' });
        await navigator.share({
          files: [file],
          title: `كشف حساب ${selectedCustomer.name}`,
          text: message,
        });
        return;
      } catch (err) {
        console.log('Share failed, falling back to URL', err);
      }
    }

    // Fallback: Download PDF and open WhatsApp with text
    if (pdfData) {
      const url = URL.createObjectURL(pdfData.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = pdfData.fileName;
      link.click();
      URL.revokeObjectURL(url);
    }

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${selectedCustomer.phone?.replace(/\D/g, '')}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
    toast.info('تم تحميل الملف، يرجى إرفاقه يدوياً في واتساب');
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone?.includes(searchQuery)
  );

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4" dir="rtl">
        <Card className="w-full max-w-md shadow-xl border-none">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto bg-primary/10 w-20 h-20 rounded-full flex items-center justify-center">
              <Wallet className="w-10 h-10 text-primary" />
            </div>
            <div>
              <CardTitle className="text-3xl font-bold">دفتر الحسابات</CardTitle>
              <CardDescription className="text-lg mt-2">نظام إدارة حسابات العملاء دائن ومدين</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Button onClick={handleLogin} size="lg" className="w-full text-lg h-14 gap-3">
              <LogIn className="w-6 h-6" />
              تسجيل الدخول باستخدام جوجل
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              يجب تسجيل الدخول للوصول إلى بياناتك بأمان
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-50 font-sans" dir="rtl">
        <Toaster position="top-center" richColors />
        
        {/* Header */}
        <header className="bg-white border-b sticky top-0 z-10 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-8 h-8 text-primary" />
              <h1 className="text-xl font-bold hidden sm:block">دفتر الحسابات</h1>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full">
                <img src={user.photoURL || ''} alt="" className="w-6 h-6 rounded-full" />
                <span className="text-sm font-medium hidden md:block">{user.displayName}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} title="تسجيل الخروج">
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Sidebar: Customer List */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="بحث عن عميل..." 
                  className="pr-10 bg-white"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Dialog open={isAddCustomerOpen} onOpenChange={setIsAddCustomerOpen}>
                <DialogTrigger render={<Button size="icon" className="shrink-0 shadow-md" />}>
                  <UserPlus className="w-5 h-5" />
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>إضافة عميل جديد</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">اسم العميل</Label>
                      <Input 
                        id="name" 
                        value={newCustomer.name} 
                        onChange={(e) => setNewCustomer({...newCustomer, name: e.target.value})}
                        placeholder="أدخل اسم العميل"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">رقم الواتساب</Label>
                      <Input 
                        id="phone" 
                        value={newCustomer.phone} 
                        onChange={(e) => setNewCustomer({...newCustomer, phone: e.target.value})}
                        placeholder="مثال: 201234567890"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleAddCustomer} className="w-full">حفظ العميل</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Card className="border-none shadow-md overflow-hidden">
              <ScrollArea className="h-[calc(100vh-240px)]">
                <div className="divide-y">
                  {filteredCustomers.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      لا يوجد عملاء مضافين
                    </div>
                  ) : (
                    filteredCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        onClick={() => setSelectedCustomer(customer)}
                        className={`w-full p-4 text-right flex items-center justify-between transition-colors hover:bg-slate-50 ${selectedCustomer?.id === customer.id ? 'bg-primary/5 border-r-4 border-primary' : ''}`}
                      >
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold truncate">{customer.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            {customer.totalBalance >= 0 ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                له: {customer.totalBalance.toLocaleString()}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                عليه: {Math.abs(customer.totalBalance).toLocaleString()}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <ChevronRight className={`w-5 h-5 text-muted-foreground transition-transform ${selectedCustomer?.id === customer.id ? 'rotate-90' : ''}`} />
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </Card>
          </div>

          {/* Main Content: Transactions */}
          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              {selectedCustomer ? (
                <motion.div
                  key={selectedCustomer.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  {/* Customer Header Card */}
                  <Card className="border-none shadow-md bg-gradient-to-br from-white to-slate-50">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <div className="space-y-1">
                        <CardTitle className="text-2xl font-bold">{selectedCustomer.name}</CardTitle>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {selectedCustomer.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {selectedCustomer.phone}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <History className="w-3 h-3" />
                            آخر تحديث: {selectedCustomer.updatedAt?.toDate().toLocaleDateString('ar-EG')}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="icon" onClick={shareToWhatsApp} title="مشاركة عبر واتساب">
                          <Share2 className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => generatePDF(true)} title="تحميل كشف الحساب PDF">
                          <Printer className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => handleDeleteCustomer(selectedCustomer.id)} className="text-destructive hover:bg-destructive/10">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div className={`p-4 rounded-xl border-2 relative group ${selectedCustomer.totalBalance >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                          <div className="flex justify-between items-start mb-1">
                            <p className="text-sm font-medium text-muted-foreground">الرصيد الإجمالي</p>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => recalculateBalance(selectedCustomer.id)}
                              title="إعادة حساب الرصيد من السجل"
                            >
                              <RefreshCw className="w-3 h-3" />
                            </Button>
                          </div>
                          <p className={`text-3xl font-black ${selectedCustomer.totalBalance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {selectedCustomer.totalBalance.toLocaleString()}
                            <span className="text-sm font-normal mr-2">
                              {selectedCustomer.totalBalance >= 0 ? 'له' : 'عليه'}
                            </span>
                          </p>
                        </div>
                        <div className="flex flex-col justify-center gap-2">
                          <Dialog open={isAddTransactionOpen} onOpenChange={setIsAddTransactionOpen}>
                            <DialogTrigger render={<Button className="w-full gap-2 h-12 text-lg shadow-lg" />}>
                              <Plus className="w-5 h-5" />
                              إضافة معاملة
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>تسجيل معاملة جديدة</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                  <Label>نوع المعاملة</Label>
                                  <div className="grid grid-cols-2 gap-2">
                                    <Button 
                                      type="button"
                                      variant={newTransaction.type === 'debit' ? 'default' : 'outline'}
                                      onClick={() => setNewTransaction({...newTransaction, type: 'debit'})}
                                      className={newTransaction.type === 'debit' ? 'bg-red-600 hover:bg-red-700' : ''}
                                    >
                                      عليه (سحب)
                                    </Button>
                                    <Button 
                                      type="button"
                                      variant={newTransaction.type === 'credit' ? 'default' : 'outline'}
                                      onClick={() => setNewTransaction({...newTransaction, type: 'credit'})}
                                      className={newTransaction.type === 'credit' ? 'bg-green-600 hover:bg-green-700' : ''}
                                    >
                                      له (إيداع)
                                    </Button>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="amount">المبلغ</Label>
                                  <Input 
                                    id="amount" 
                                    type="number" 
                                    value={newTransaction.amount} 
                                    onChange={(e) => setNewTransaction({...newTransaction, amount: e.target.value})}
                                    placeholder="0.00"
                                    className="text-lg"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="desc">البيان / الوصف</Label>
                                  <Input 
                                    id="desc" 
                                    value={newTransaction.description} 
                                    onChange={(e) => setNewTransaction({...newTransaction, description: e.target.value})}
                                    placeholder="مثال: دفعة نقدية، فاتورة رقم..."
                                  />
                                </div>
                              </div>
                              <DialogFooter>
                                <Button onClick={handleAddTransaction} className="w-full h-12 text-lg">تأكيد المعاملة</Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Transactions Table */}
                  <Card className="border-none shadow-md">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="w-5 h-5 text-primary" />
                        سجل المعاملات
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader className="bg-slate-50">
                          <TableRow>
                            <TableHead className="text-right">التاريخ</TableHead>
                            <TableHead className="text-right">البيان</TableHead>
                            <TableHead className="text-center">له</TableHead>
                            <TableHead className="text-center">عليه</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transactions.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                لا توجد معاملات مسجلة لهذا العميل
                              </TableCell>
                            </TableRow>
                          ) : (
                            transactions.map((t) => (
                              <TableRow key={t.id}>
                                <TableCell className="font-medium">
                                  {t.date?.toDate().toLocaleDateString('ar-EG')}
                                </TableCell>
                                <TableCell className="text-muted-foreground">{t.description || '-'}</TableCell>
                                <TableCell className="text-center">
                                  {t.type === 'credit' ? (
                                    <span className="text-green-600 font-bold">{t.amount.toLocaleString()}</span>
                                  ) : '-'}
                                </TableCell>
                                <TableCell className="text-center">
                                  {t.type === 'debit' ? (
                                    <span className="text-red-600 font-bold">{t.amount.toLocaleString()}</span>
                                  ) : '-'}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  {/* Hidden Print Content - Optimized for A4 PDF */}
                  <div style={{ position: 'absolute', left: '-9999px', top: 0, zIndex: -100 }}>
                    <div 
                      ref={printRef} 
                      id="print-container"
                      className="bg-white w-[794px] min-h-[1123px] p-12 font-sans text-slate-900" 
                      dir="rtl"
                    >
                      {/* PDF Header */}
                      <div className="flex justify-between items-start border-b-4 border-primary pb-8 mb-10">
                        <div>
                          <h1 className="text-4xl font-black text-primary mb-2">كشف حساب مالي</h1>
                          <p className="text-slate-500 text-lg">نظام دفتر الحسابات الذكي</p>
                        </div>
                        <div className="text-left">
                          <div className="bg-primary text-white px-4 py-2 rounded-lg font-bold text-xl mb-2 inline-block">
                            رقم الكشف: {Math.floor(Math.random() * 10000)}
                          </div>
                          <p className="text-slate-500">تاريخ الإصدار: {new Date().toLocaleDateString('ar-EG')}</p>
                        </div>
                      </div>
                      
                      {/* Customer Info Section */}
                      <div className="grid grid-cols-2 gap-12 mb-12">
                        <div className="space-y-4">
                          <h2 className="text-xl font-bold border-r-4 border-primary pr-3">معلومات العميل</h2>
                          <div className="bg-slate-50 p-4 rounded-xl space-y-2">
                            <p><span className="text-slate-500 ml-2">الاسم:</span> <span className="font-bold text-lg">{selectedCustomer.name}</span></p>
                            {selectedCustomer.phone && (
                              <p><span className="text-slate-500 ml-2">الهاتف:</span> <span className="font-bold">{selectedCustomer.phone}</span></p>
                            )}
                          </div>
                        </div>
                        <div className="space-y-4">
                          <h2 className="text-xl font-bold border-r-4 border-primary pr-3">ملخص الحساب</h2>
                          <div className={`p-4 rounded-xl border-2 text-center ${selectedCustomer.totalBalance >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                            <p className="text-slate-600 mb-1">الرصيد الإجمالي</p>
                            <p className={`text-3xl font-black ${selectedCustomer.totalBalance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              {selectedCustomer.totalBalance.toLocaleString()}
                              <span className="text-lg font-normal mr-2">
                                {selectedCustomer.totalBalance >= 0 ? 'له' : 'عليه'}
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Transactions Table */}
                      <div className="mb-12">
                        <h2 className="text-xl font-bold mb-4 border-r-4 border-primary pr-3">تفاصيل المعاملات</h2>
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700">
                              <th className="border-2 border-slate-200 p-4 text-right">التاريخ</th>
                              <th className="border-2 border-slate-200 p-4 text-right">البيان / الوصف</th>
                              <th className="border-2 border-slate-200 p-4 text-center w-28">له (إيداع)</th>
                              <th className="border-2 border-slate-200 p-4 text-center w-28">عليه (سحب)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {transactions.map((t) => (
                              <tr key={t.id} className="hover:bg-slate-50">
                                <td className="border-2 border-slate-200 p-4">{t.date?.toDate().toLocaleDateString('ar-EG')}</td>
                                <td className="border-2 border-slate-200 p-4 text-slate-600">{t.description || '-'}</td>
                                <td className="border-2 border-slate-200 p-4 text-center text-green-700 font-bold">
                                  {t.type === 'credit' ? t.amount.toLocaleString() : '-'}
                                </td>
                                <td className="border-2 border-slate-200 p-4 text-center text-red-700 font-bold">
                                  {t.type === 'debit' ? t.amount.toLocaleString() : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Footer */}
                      <div className="mt-auto pt-12 border-t border-slate-200">
                        <div className="flex justify-between items-end">
                          <div className="space-y-2">
                            <p className="text-slate-400 text-sm">تم إنشاء هذا الكشف إلكترونياً ولا يحتاج إلى ختم.</p>
                            <p className="text-primary font-bold">شكراً لتعاملكم معنا</p>
                          </div>
                          <div className="text-center space-y-8">
                            <p className="font-bold text-slate-700">توقيع المسؤول</p>
                            <div className="w-48 h-px bg-slate-300"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                  <div className="bg-slate-50 p-6 rounded-full mb-6">
                    <UserPlus className="w-16 h-16 text-slate-300" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-400">اختر عميلاً لعرض تفاصيل حسابه</h2>
                  <p className="text-slate-400 mt-2 max-w-xs">يمكنك البحث عن عميل موجود أو إضافة عميل جديد من القائمة الجانبية</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </ErrorBoundary>
  );
}
