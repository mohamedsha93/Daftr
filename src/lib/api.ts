const API_URL = '/api';

const getHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export const api = {
  auth: {
    login: async (username: string, password: string) => {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) throw new Error('Login failed');
      return res.json();
    },
    register: async (username: string, password: string, fullName: string) => {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, fullName })
      });
      if (!res.ok) throw new Error('Registration failed');
      return res.json();
    }
  },
  customers: {
    getAll: async () => {
      const res = await fetch(`${API_URL}/customers`, { headers: getHeaders() });
      if (!res.ok) throw new Error('Failed to fetch customers');
      return res.json();
    },
    create: async (name: string, phone: string) => {
      const res = await fetch(`${API_URL}/customers`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name, phone })
      });
      if (!res.ok) throw new Error('Failed to create customer');
      return res.json();
    },
    delete: async (id: string) => {
      const res = await fetch(`${API_URL}/customers/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (!res.ok) throw new Error('Failed to delete customer');
      return res.json();
    },
    recalculate: async (id: string) => {
      const res = await fetch(`${API_URL}/customers/${id}/recalculate`, {
        method: 'POST',
        headers: getHeaders()
      });
      if (!res.ok) throw new Error('Failed to recalculate balance');
      return res.json();
    }
  },
  transactions: {
    getByCustomer: async (customerId: string) => {
      const res = await fetch(`${API_URL}/customers/${customerId}/transactions`, { headers: getHeaders() });
      if (!res.ok) throw new Error('Failed to fetch transactions');
      return res.json();
    },
    create: async (customerId: string, amount: number, type: 'credit' | 'debit', description: string) => {
      const res = await fetch(`${API_URL}/transactions`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ customerId, amount, type, description })
      });
      if (!res.ok) throw new Error('Failed to create transaction');
      return res.json();
    }
  }
};
