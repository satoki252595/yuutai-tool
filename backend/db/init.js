import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new sqlite3.Database(join(__dirname, 'yuutai.db'));

db.serialize(() => {
  // 株式情報テーブル
  db.run(`
    CREATE TABLE IF NOT EXISTS stocks (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      japanese_name TEXT,
      market TEXT,
      sector TEXT,
      industry TEXT,
      rsi REAL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 優待情報テーブル
  db.run(`
    CREATE TABLE IF NOT EXISTS shareholder_benefits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code TEXT NOT NULL,
      benefit_type TEXT NOT NULL,
      description TEXT NOT NULL,
      monetary_value INTEGER DEFAULT 0,
      min_shares INTEGER NOT NULL,
      holder_type TEXT DEFAULT 'どちらでも',
      ex_rights_month INTEGER NOT NULL,
      has_long_term_holding INTEGER DEFAULT 0,
      long_term_months INTEGER,
      long_term_value INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (stock_code) REFERENCES stocks(code)
    )
  `);

  // 株価履歴テーブル
  db.run(`
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code TEXT NOT NULL,
      price REAL NOT NULL,
      dividend_yield REAL DEFAULT 0,
      annual_dividend REAL DEFAULT 0,
      data_source TEXT,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (stock_code) REFERENCES stocks(code)
    )
  `);

  // インデックスの作成
  db.run(`CREATE INDEX IF NOT EXISTS idx_benefits_stock_code ON shareholder_benefits(stock_code)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_price_history_stock_code ON price_history(stock_code)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at ON price_history(recorded_at)`);

  console.log('Database initialized successfully');
});

db.close();