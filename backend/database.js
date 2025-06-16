import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class Database {
  constructor() {
    this.db = new sqlite3.Database(join(__dirname, 'db/yuutai.db'));
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

  // 総合情報の取得
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
          ph.price,
          ph.dividend_yield,
          ph.annual_dividend,
          ph.data_source,
          COUNT(DISTINCT sb.id) as benefit_count,
          SUM(sb.monetary_value) as total_benefit_value
        FROM stocks s
        LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
        LEFT JOIN (
          SELECT stock_code, price, dividend_yield, annual_dividend, data_source
          FROM price_history
          WHERE (stock_code, recorded_at) IN (
            SELECT stock_code, MAX(recorded_at)
            FROM price_history
            GROUP BY stock_code
          )
        ) ph ON s.code = ph.stock_code
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