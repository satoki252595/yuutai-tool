import { Database } from '../database.js';

class MultiMonthMigration {
  constructor() {
    this.db = new Database();
  }

  async migrate() {
    console.log('🔄 複数月優待対応のためのデータベース移行開始...');

    try {
      // 1. 新しいテーブル作成
      await this.createNewTables();
      
      // 2. インデックスの作成
      await this.createIndexes();
      
      // 3. 既存データの分析と移行
      await this.analyzeAndMigrateData();
      
      console.log('✅ 移行完了！');
      
    } catch (error) {
      console.error('❌ 移行エラー:', error);
      throw error;
    }
  }

  async createNewTables() {
    console.log('📊 新しいテーブル構造を作成中...');
    
    return new Promise((resolve, reject) => {
      const sql = `
        -- 権利月テーブル（複数月対応）
        CREATE TABLE IF NOT EXISTS rights_months (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stock_code TEXT NOT NULL,
          month INTEGER NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (stock_code) REFERENCES stocks (code),
          UNIQUE(stock_code, month)
        );

        -- 優待情報テーブル（改良版）
        CREATE TABLE IF NOT EXISTS shareholder_benefits_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stock_code TEXT NOT NULL,
          benefit_type TEXT,
          description TEXT,
          monetary_value INTEGER DEFAULT 0,
          min_shares INTEGER DEFAULT 100,
          holder_type TEXT DEFAULT '一般',
          has_long_term_holding INTEGER DEFAULT 0,
          long_term_months INTEGER,
          long_term_value INTEGER DEFAULT 0,
          rights_month_pattern TEXT, -- "3,6,9,12" のような形式
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (stock_code) REFERENCES stocks (code)
        );
      `;
      
      this.db.db.exec(sql, (err) => {
        if (err) reject(err);
        else {
          console.log('✅ テーブル作成完了');
          resolve();
        }
      });
    });
  }

  async createIndexes() {
    console.log('🔍 インデックスを作成中...');
    
    const indexes = [
      // 権利月テーブル用
      'CREATE INDEX IF NOT EXISTS idx_rights_months_stock_code ON rights_months(stock_code)',
      'CREATE INDEX IF NOT EXISTS idx_rights_months_month ON rights_months(month)',
      
      // 優待テーブル用
      'CREATE INDEX IF NOT EXISTS idx_benefits_v2_stock_code ON shareholder_benefits_v2(stock_code)',
      'CREATE INDEX IF NOT EXISTS idx_benefits_v2_min_shares ON shareholder_benefits_v2(min_shares)',
      'CREATE INDEX IF NOT EXISTS idx_benefits_v2_monetary_value ON shareholder_benefits_v2(monetary_value)',
      
      // 既存テーブルの最適化
      'CREATE INDEX IF NOT EXISTS idx_stocks_code ON stocks(code)',
      'CREATE INDEX IF NOT EXISTS idx_price_history_stock_code ON price_history(stock_code)',
      'CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at ON price_history(recorded_at)'
    ];

    for (const indexSql of indexes) {
      await new Promise((resolve, reject) => {
        this.db.db.run(indexSql, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    
    console.log('✅ インデックス作成完了');
  }

  async analyzeAndMigrateData() {
    console.log('📊 既存データを分析中...');
    
    // 複数月の権利がある銘柄を特定
    const multiMonthStocks = await this.findMultiMonthStocks();
    console.log(`📅 ${multiMonthStocks.length}銘柄で複数月の権利を検出`);
    
    // 権利月データを抽出して移行
    for (const stock of multiMonthStocks) {
      await this.migrateStockRightsMonths(stock);
    }
    
    console.log('✅ データ移行完了');
  }

  async findMultiMonthStocks() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT stock_code, description 
        FROM shareholder_benefits 
        WHERE description LIKE '%月%' 
        GROUP BY stock_code
      `;
      
      this.db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else {
          const results = rows.map(row => {
            const months = this.extractMonthsFromDescription(row.description);
            return {
              stock_code: row.stock_code,
              months: months
            };
          }).filter(item => item.months.length > 0);
          
          resolve(results);
        }
      });
    });
  }

  extractMonthsFromDescription(description) {
    const months = new Set();
    
    // パターン1: "3月末日及び9月末日"
    const pattern1 = /(\d+)月末日/g;
    let match;
    while ((match = pattern1.exec(description)) !== null) {
      months.add(parseInt(match[1]));
    }
    
    // パターン2: "3月・9月"
    const pattern2 = /(\d+)月[・、](\d+)月/g;
    while ((match = pattern2.exec(description)) !== null) {
      months.add(parseInt(match[1]));
      months.add(parseInt(match[2]));
    }
    
    // パターン3: "決算月：3月、9月"
    const pattern3 = /決算月[：:]\s*(\d+)月[、,]\s*(\d+)月/g;
    while ((match = pattern3.exec(description)) !== null) {
      months.add(parseInt(match[1]));
      months.add(parseInt(match[2]));
    }
    
    return Array.from(months).sort((a, b) => a - b);
  }

  async migrateStockRightsMonths(stock) {
    // 権利月テーブルに挿入
    for (const month of stock.months) {
      await new Promise((resolve, reject) => {
        const sql = `
          INSERT OR IGNORE INTO rights_months (stock_code, month) 
          VALUES (?, ?)
        `;
        this.db.db.run(sql, [stock.stock_code, month], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  // VACUUM実行で最適化
  async optimizeDatabase() {
    console.log('🚀 データベースを最適化中...');
    
    return new Promise((resolve, reject) => {
      this.db.db.run('VACUUM', (err) => {
        if (err) reject(err);
        else {
          console.log('✅ データベース最適化完了');
          resolve();
        }
      });
    });
  }
}

// 実行
const migration = new MultiMonthMigration();
migration.migrate()
  .then(() => migration.optimizeDatabase())
  .then(() => {
    console.log('🎉 すべての処理が完了しました');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ エラー:', err);
    process.exit(1);
  });