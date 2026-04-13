import { Timestamp } from 'firebase/firestore';

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  totalBalance: number; // positive = credit (له), negative = debit (عليه)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Transaction {
  id: string;
  customerId: string;
  amount: number;
  type: 'credit' | 'debit';
  description?: string;
  date: Timestamp;
}
