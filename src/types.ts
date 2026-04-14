export interface Customer {
  id: string;
  name: string;
  phone?: string;
  total_balance: any; // MySQL returns as string/decimal
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  customer_id: string;
  amount: any;
  type: 'credit' | 'debit';
  description?: string;
  date: string;
}
