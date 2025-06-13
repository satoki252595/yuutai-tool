import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class DatabaseReset {
  constructor() {
    this.dbPath = join(__dirname, 'db/yuutai.db');
  }

  async reset() {
    console.log('=== データベース完全リセット開始 ===');

    try {
      // 既存のデータベースファイルを削除
      if (fs.existsSync(this.dbPath)) {
        fs.unlinkSync(this.dbPath);
        console.log('✓ 既存のデータベースファイルを削除');
      }

      // WALファイルとSHMファイルも削除
      const walFile = this.dbPath + '-wal';
      const shmFile = this.dbPath + '-shm';
      
      if (fs.existsSync(walFile)) {
        fs.unlinkSync(walFile);
        console.log('✓ WALファイルを削除');
      }
      
      if (fs.existsSync(shmFile)) {
        fs.unlinkSync(shmFile);
        console.log('✓ SHMファイルを削除');
      }

      // 新しいデータベースを作成
      await this.createFreshDatabase();
      
      console.log('✅ データベースリセット完了');
    } catch (error) {
      console.error('❌ エラー:', error);
      process.exit(1);
    }
  }

  createFreshDatabase() {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath);

      db.serialize(() => {
        // 株式情報テーブル
        db.run(`
          CREATE TABLE stocks (
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
          CREATE TABLE shareholder_benefits (
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
          CREATE TABLE price_history (
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
        db.run(`CREATE INDEX idx_benefits_stock_code ON shareholder_benefits(stock_code)`);
        db.run(`CREATE INDEX idx_price_history_stock_code ON price_history(stock_code)`);
        db.run(`CREATE INDEX idx_price_history_recorded_at ON price_history(recorded_at)`);

        console.log('✓ 新しいデータベーステーブルを作成');
      });

      db.close((err) => {
        if (err) reject(err);
        else {
          console.log('✓ データベース接続を閉じました');
          resolve();
        }
      });
    });
  }

  async showStatus() {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath);
      
      db.serialize(() => {
        db.get('SELECT COUNT(*) as count FROM stocks', (err, row) => {
          if (err) {
            console.log('🔍 stocks テーブル: アクセスエラー');
          } else {
            console.log(`🔍 stocks テーブル: ${row.count}件`);
          }
        });

        db.get('SELECT COUNT(*) as count FROM shareholder_benefits', (err, row) => {
          if (err) {
            console.log('🔍 shareholder_benefits テーブル: アクセスエラー');
          } else {
            console.log(`🔍 shareholder_benefits テーブル: ${row.count}件`);
          }
        });

        db.get('SELECT COUNT(*) as count FROM price_history', (err, row) => {
          if (err) {
            console.log('🔍 price_history テーブル: アクセスエラー');
          } else {
            console.log(`🔍 price_history テーブル: ${row.count}件`);
          }
          
          db.close();
          resolve();
        });
      });
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dbReset = new DatabaseReset();
  
  if (process.argv.includes('--status')) {
    dbReset.showStatus().catch(console.error);
  } else {
    dbReset.reset().then(() => {
      return dbReset.showStatus();
    }).catch(console.error);
  }
}