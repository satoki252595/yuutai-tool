import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class Database {
  constructor() {
    this.db = new sqlite3.Database(join(__dirname, 'db/yuutai.db'));
    
    // パフォーマンス最適化設定
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA cache_size = -64000;  -- 64MB
      PRAGMA temp_store = MEMORY;
      PRAGMA mmap_size = 134217728;  -- 128MB
    `);
  }

  // 株式情報の保存/更新
  upsertStock(stock) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO stocks (code, name, market, sector, japanese_name, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `;
      this.db.run(sql, [stock.code, stock.name, stock.market, stock.sector, stock.japanese_name], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // 優待情報の保存
  insertBenefit(benefit) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO shareholder_benefits 
        (stock_code, benefit_type, description, benefit_content, monetary_value, min_shares, holder_type, ex_rights_month, 
         has_long_term_holding, long_term_months, long_term_value, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      this.db.run(sql, [
        benefit.stock_code || benefit.stockCode,
        benefit.benefit_type || benefit.benefitType,
        benefit.description,
        benefit.benefit_content || benefit.benefitContent || benefit.description,
        benefit.monetary_value || benefit.monetaryValue,
        benefit.min_shares || benefit.minShares,
        benefit.holder_type || benefit.holderType,
        benefit.ex_rights_month || benefit.exRightsMonth,
        benefit.has_long_term_holding || benefit.hasLongTermHolding || 0,
        benefit.long_term_months || benefit.longTermMonths,
        benefit.long_term_value || benefit.longTermValue || 0,
        benefit.created_at || new Date().toISOString()
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // 株価履歴の保存
  insertPriceHistory(priceData) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO price_history (stock_code, price, dividend_yield, annual_dividend)
        VALUES (?, ?, ?, ?)
      `;
      this.db.run(sql, [priceData.code, priceData.price, priceData.dividendYield, priceData.annualDividend || 0], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // 優待情報の取得
  getBenefitsByStockCode(stockCode) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          id,
          stock_code,
          benefit_type,
          description,
          benefit_content,
          monetary_value,
          min_shares,
          holder_type,
          ex_rights_month,
          has_long_term_holding,
          long_term_months,
          long_term_value,
          created_at
        FROM shareholder_benefits 
        WHERE stock_code = ?
        ORDER BY ex_rights_month, min_shares
      `;
      this.db.all(sql, [stockCode], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // 複数銘柄の優待情報を一括取得（N+1問題解決）
  getBenefitsByStockCodes(stockCodes) {
    return new Promise((resolve, reject) => {
      if (!stockCodes || stockCodes.length === 0) {
        resolve({});
        return;
      }
      
      const placeholders = stockCodes.map(() => '?').join(',');
      const sql = `
        SELECT 
          id,
          stock_code,
          benefit_type,
          description,
          benefit_content,
          monetary_value,
          min_shares,
          holder_type,
          ex_rights_month,
          has_long_term_holding,
          long_term_months,
          long_term_value,
          created_at
        FROM shareholder_benefits 
        WHERE stock_code IN (${placeholders})
        ORDER BY stock_code, ex_rights_month, min_shares
      `;
      
      this.db.all(sql, stockCodes, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // 銘柄コード別にグループ化
          const benefitsByCode = {};
          rows.forEach(row => {
            if (!benefitsByCode[row.stock_code]) {
              benefitsByCode[row.stock_code] = [];
            }
            benefitsByCode[row.stock_code].push(row);
          });
          resolve(benefitsByCode);
        }
      });
    });
  }

  // 高速化されたページング対応株式一覧取得
  getStocksWithBenefitsPaginated(options = {}) {
    const {
      search = '',
      sortBy = 'totalYield',
      sortOrder = 'desc',
      page = 1,
      limit = 50
    } = options;

    return new Promise((resolve, reject) => {
      const offset = (page - 1) * limit;
      
      // まず総件数を取得
      let countSql = `
        SELECT COUNT(DISTINCT s.code) as total
        FROM stocks s
        LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
        LEFT JOIN latest_prices lp ON s.code = lp.stock_code
      `;
      
      const params = [];
      let whereClause = '';
      
      if (search) {
        whereClause = ` WHERE s.code LIKE ? OR s.name LIKE ? OR s.japanese_name LIKE ? OR sb.description LIKE ?`;
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam, searchParam);
      }

      countSql += whereClause;

      this.db.get(countSql, params, (err, countResult) => {
        if (err) {
          reject(err);
          return;
        }

        const total = countResult.total || 0;

        // メインクエリ：ページングを含む
        let sql = `
          SELECT 
            s.code,
            s.name,
            COALESCE(s.japanese_name, s.name) as display_name,
            s.market,
            s.sector,
            s.industry,
            s.rsi,
            s.rsi28,
            lp.price,
            lp.dividend_yield,
            lp.annual_dividend,
            lp.data_source,
            COUNT(DISTINCT sb.id) as benefit_count,
            SUM(sb.monetary_value) as total_benefit_value,
            GROUP_CONCAT(DISTINCT sb.benefit_type) as benefit_types,
            GROUP_CONCAT(DISTINCT sb.ex_rights_month) as rights_months,
            MAX(sb.has_long_term_holding) as has_long_term_holding,
            MIN(sb.min_shares) as min_shares
          FROM stocks s
          LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
          LEFT JOIN latest_prices lp ON s.code = lp.stock_code
        `;

        sql += whereClause;
        sql += ` GROUP BY s.code`;

        // ソート処理
        if (sortBy === 'totalYield') {
          sql += ` ORDER BY (COALESCE(lp.dividend_yield, 0) + COALESCE(total_benefit_value / (lp.price * 100), 0)) ${sortOrder}`;
        } else if (sortBy === 'code') {
          sql += ` ORDER BY s.code ${sortOrder}`;
        } else if (sortBy === 'name') {
          sql += ` ORDER BY s.name ${sortOrder}`;
        } else {
          sql += ` ORDER BY total_benefit_value ${sortOrder}`;
        }

        sql += ` LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        this.db.all(sql, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve({
              stocks: rows || [],
              pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                totalPages: Math.ceil(total / limit)
              }
            });
          }
        });
      });
    });
  }

  // 総合情報の取得（最適化済み - latest_pricesテーブル使用）
  getStocksWithBenefits(search = '') {
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT 
          s.code,
          s.name,
          COALESCE(s.japanese_name, s.name) as display_name,
          s.market,
          s.sector,
          s.industry,
          s.rsi,
          s.rsi28,
          lp.price,
          lp.dividend_yield,
          lp.annual_dividend,
          lp.data_source,
          COUNT(DISTINCT sb.id) as benefit_count,
          SUM(sb.monetary_value) as total_benefit_value
        FROM stocks s
        LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
        LEFT JOIN latest_prices lp ON s.code = lp.stock_code
      `;

      const params = [];
      if (search) {
        sql += ` WHERE s.code LIKE ? OR s.name LIKE ? OR s.japanese_name LIKE ? OR sb.description LIKE ?`;
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam, searchParam);
      }

      sql += ` GROUP BY s.code ORDER BY total_benefit_value DESC`;

      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // 優待情報の削除（更新前に既存データを削除）
  deleteBenefitsByStockCode(stockCode) {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM shareholder_benefits WHERE stock_code = ?`;
      this.db.run(sql, [stockCode], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // 全銘柄コードの取得
  getAllStockCodes() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT DISTINCT code FROM stocks ORDER BY code`;
      this.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => row.code));
      });
    });
  }

  // 全銘柄情報の取得（コード、名前を含む）
  getAllStocks() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT code, name, japanese_name FROM stocks ORDER BY code`;
      this.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // 一括株価履歴の保存
  async insertBulkPriceHistory(stockCode, priceHistory) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO price_history (stock_code, price, recorded_at)
        VALUES (?, ?, ?)
      `);
      
      let insertedCount = 0;
      
      priceHistory.forEach(data => {
        stmt.run([stockCode, data.price, data.date.toISOString()], (err) => {
          if (!err) insertedCount++;
        });
      });
      
      stmt.finalize((err) => {
        if (err) {
          reject(err);
        } else {
          resolve(insertedCount);
        }
      });
    });
  }

  // 銘柄の優待情報削除（再スクレイピング用）
  deleteStockBenefits(stockCode) {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM shareholder_benefits WHERE stock_code = ?`;
      this.db.run(sql, [stockCode], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  // 株式情報の更新
  updateStockInfo(stockCode, name) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE stocks 
        SET name = ?, updated_at = datetime('now')
        WHERE code = ?
      `;
      this.db.run(sql, [name, stockCode], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  close() {
    this.db.close();
  }
}