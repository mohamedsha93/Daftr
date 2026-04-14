import express from 'express';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Database Connection Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'accounting_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// Middleware to verify JWT
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    req.user = user;
    next();
  });
};

// --- Auth Routes ---

app.post('/api/auth/register', async (req, res) => {
  const { username, password, fullName } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result]: any = await pool.execute(
      'INSERT INTO users (username, password, full_name) VALUES (?, ?, ?)',
      [username, hashedPassword, fullName]
    );
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: 'Server error' });
    }
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows]: any = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows[0];

    if (user && await bcrypt.compare(password, user.password)) {
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ token, user: { id: user.id, username: user.username, fullName: user.full_name } });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Customer Routes ---

app.get('/api/customers', authenticateToken, async (req: any, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM customers WHERE user_id = ? ORDER BY name ASC', [req.user.id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/customers', authenticateToken, async (req: any, res) => {
  const { name, phone } = req.body;
  try {
    const [result]: any = await pool.execute(
      'INSERT INTO customers (user_id, name, phone) VALUES (?, ?, ?)',
      [req.user.id, name, phone]
    );
    res.status(201).json({ id: result.insertId, name, phone, total_balance: 0 });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/customers/:id', authenticateToken, async (req: any, res) => {
  try {
    await pool.execute('DELETE FROM customers WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ message: 'Customer deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Transaction Routes ---

app.get('/api/customers/:id/transactions', authenticateToken, async (req: any, res) => {
  try {
    // Verify customer belongs to user
    const [customers]: any = await pool.execute('SELECT id FROM customers WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (customers.length === 0) return res.status(404).json({ error: 'Customer not found' });

    const [rows] = await pool.execute(
      'SELECT * FROM transactions WHERE customer_id = ? ORDER BY date DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/transactions', authenticateToken, async (req: any, res) => {
  const { customerId, amount, type, description } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Verify customer belongs to user
    const [customers]: any = await connection.execute('SELECT id, total_balance FROM customers WHERE id = ? AND user_id = ?', [customerId, req.user.id]);
    if (customers.length === 0) throw new Error('Customer not found');

    // Add transaction
    await connection.execute(
      'INSERT INTO transactions (customer_id, amount, type, description) VALUES (?, ?, ?, ?)',
      [customerId, amount, type, description]
    );

    // Update balance
    const balanceChange = type === 'credit' ? amount : -amount;
    await connection.execute(
      'UPDATE customers SET total_balance = total_balance + ? WHERE id = ?',
      [balanceChange, customerId]
    );

    await connection.commit();
    res.status(201).json({ message: 'Transaction added' });
  } catch (error: any) {
    await connection.rollback();
    res.status(500).json({ error: error.message || 'Server error' });
  } finally {
    connection.release();
  }
});

app.post('/api/customers/:id/recalculate', authenticateToken, async (req: any, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [transactions]: any = await connection.execute('SELECT amount, type FROM transactions WHERE customer_id = ?', [req.params.id]);
    
    let total = 0;
    transactions.forEach((t: any) => {
      if (t.type === 'credit') total += parseFloat(t.amount);
      else total -= parseFloat(t.amount);
    });

    await connection.execute('UPDATE customers SET total_balance = ? WHERE id = ? AND user_id = ?', [total, req.params.id, req.user.id]);

    await connection.commit();
    res.json({ totalBalance: total });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
});

// --- Vite Middleware ---

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
