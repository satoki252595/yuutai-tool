import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new sqlite3.Database(join(__dirname, 'yuutai.db'));

console.log('Starting database schema migration...');

db.serialize(() => {
  // stocks テーブルに新しいカラムを追加
  db.run(`
    ALTER TABLE stocks ADD COLUMN japanese_name TEXT;
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding japanese_name column:', err.message);
    } else {
      console.log('✓ Added japanese_name column to stocks table');
    }
  });

  db.run(`
    ALTER TABLE stocks ADD COLUMN industry TEXT;
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding industry column:', err.message);
    } else {
      console.log('✓ Added industry column to stocks table');
    }
  });

  // price_history テーブルに新しいカラムを追加
  db.run(`
    ALTER TABLE price_history ADD COLUMN annual_dividend REAL DEFAULT 0;
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding annual_dividend column:', err.message);
    } else {
      console.log('✓ Added annual_dividend column to price_history table');
    }
  });

  db.run(`
    ALTER TABLE price_history ADD COLUMN data_source TEXT DEFAULT 'yahoo_finance';
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding data_source column:', err.message);
    } else {
      console.log('✓ Added data_source column to price_history table');
    }
  });

  // shareholder_benefits テーブルに新しいカラムを追加
  db.run(`
    ALTER TABLE shareholder_benefits ADD COLUMN has_long_term_holding INTEGER DEFAULT 0;
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding has_long_term_holding column:', err.message);
    } else {
      console.log('✓ Added has_long_term_holding column to shareholder_benefits table');
    }
  });

  db.run(`
    ALTER TABLE shareholder_benefits ADD COLUMN long_term_months INTEGER;
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding long_term_months column:', err.message);
    } else {
      console.log('✓ Added long_term_months column to shareholder_benefits table');
    }
  });

  db.run(`
    ALTER TABLE shareholder_benefits ADD COLUMN long_term_value INTEGER DEFAULT 0;
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding long_term_value column:', err.message);
    } else {
      console.log('✓ Added long_term_value column to shareholder_benefits table');
    }
  });

  // 新しいテーブル: 配当履歴テーブル
  db.run(`
    CREATE TABLE IF NOT EXISTS dividend_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code TEXT NOT NULL,
      dividend_date DATE NOT NULL,
      dividend_amount REAL NOT NULL,
      dividend_type TEXT DEFAULT 'regular',
      record_date DATE,
      payment_date DATE,
      data_source TEXT DEFAULT 'manual',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (stock_code) REFERENCES stocks(code)
    )
  `, (err) => {
    if (err) {
      console.error('Error creating dividend_history table:', err.message);
    } else {
      console.log('✓ Created dividend_history table');
    }
  });

  // インデックスの追加
  db.run(`CREATE INDEX IF NOT EXISTS idx_dividend_history_stock_code ON dividend_history(stock_code)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_dividend_history_date ON dividend_history(dividend_date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_stocks_japanese_name ON stocks(japanese_name)`);

  console.log('Database schema migration completed');
});

db.close();