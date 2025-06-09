import { Database } from './database.js';

// 全配当利回りの妥当性検証スクリプト
class DividendYieldValidator {
  constructor() {
    this.db = new Database();
  }

  async close() {
    this.db.close();
  }

  // 配当利回りが5%以上の銘柄を詳細チェック
  async validateHighYieldStocks() {
    const highYieldStocks = await new Promise((resolve, reject) => {
      this.db.db.all(`
        SELECT s.code, s.name, ph.price, ph.dividend_yield,
               ph.recorded_at
        FROM stocks s 
        JOIN price_history ph ON s.code = ph.stock_code 
        WHERE ph.dividend_yield >= 5.0
        AND (ph.stock_code, ph.recorded_at) IN (
          SELECT stock_code, MAX(recorded_at)
          FROM price_history
          GROUP BY stock_code
        )
        ORDER BY ph.dividend_yield DESC
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log('=== 配当利回り5%以上の銘柄 ===');
    console.log(`対象銘柄数: ${highYieldStocks.length}件\n`);

    // 業種別・価格帯別分析
    const analysis = {
      byRange: {
        '5-6%': [],
        '6-7%': [],
        '7-8%': [],
        '8%以上': []
      },
      byPriceRange: {
        '1000円未満': [],
        '1000-3000円': [],
        '3000-5000円': [],
        '5000円以上': []
      }
    };

    highYieldStocks.forEach(stock => {
      // 利回り別分類
      if (stock.dividend_yield < 6) {
        analysis.byRange['5-6%'].push(stock);
      } else if (stock.dividend_yield < 7) {
        analysis.byRange['6-7%'].push(stock);
      } else if (stock.dividend_yield < 8) {
        analysis.byRange['7-8%'].push(stock);
      } else {
        analysis.byRange['8%以上'].push(stock);
      }

      // 価格帯別分類
      if (stock.price < 1000) {
        analysis.byPriceRange['1000円未満'].push(stock);
      } else if (stock.price < 3000) {
        analysis.byPriceRange['1000-3000円'].push(stock);
      } else if (stock.price < 5000) {
        analysis.byPriceRange['3000-5000円'].push(stock);
      } else {
        analysis.byPriceRange['5000円以上'].push(stock);
      }
    });

    // 利回り別表示
    console.log('【利回り別分析】');
    Object.entries(analysis.byRange).forEach(([range, stocks]) => {
      console.log(`\n${range}: ${stocks.length}件`);
      stocks.slice(0, 5).forEach(stock => {
        console.log(`  ${stock.code}: ${stock.name} - ${stock.dividend_yield.toFixed(2)}% (¥${stock.price})`);
      });
      if (stocks.length > 5) {
        console.log(`  ... 他${stocks.length - 5}件`);
      }
    });

    // 価格帯別表示
    console.log('\n【価格帯別分析】');
    Object.entries(analysis.byPriceRange).forEach(([range, stocks]) => {
      if (stocks.length > 0) {
        const avgYield = stocks.reduce((sum, s) => sum + s.dividend_yield, 0) / stocks.length;
        console.log(`${range}: ${stocks.length}件 (平均利回り: ${avgYield.toFixed(2)}%)`);
      }
    });

    return highYieldStocks;
  }

  // 異常値検出（統計的手法）
  async detectAnomalies() {
    const allYields = await new Promise((resolve, reject) => {
      this.db.db.all(`
        SELECT dividend_yield
        FROM price_history
        WHERE dividend_yield > 0
        AND (stock_code, recorded_at) IN (
          SELECT stock_code, MAX(recorded_at)
          FROM price_history
          GROUP BY stock_code
        )
        ORDER BY dividend_yield
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(r => r.dividend_yield));
      });
    });

    // 基本統計
    const mean = allYields.reduce((a, b) => a + b, 0) / allYields.length;
    const variance = allYields.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / allYields.length;
    const stdDev = Math.sqrt(variance);
    
    // 四分位数
    const q1 = allYields[Math.floor(allYields.length * 0.25)];
    const q3 = allYields[Math.floor(allYields.length * 0.75)];
    const iqr = q3 - q1;
    const upperFence = q3 + (1.5 * iqr);

    console.log('\n=== 統計的異常値検出 ===');
    console.log(`平均: ${mean.toFixed(2)}%`);
    console.log(`標準偏差: ${stdDev.toFixed(2)}%`);
    console.log(`Q1: ${q1.toFixed(2)}%, Q3: ${q3.toFixed(2)}%`);
    console.log(`IQR: ${iqr.toFixed(2)}%`);
    console.log(`上限閾値（Q3 + 1.5×IQR）: ${upperFence.toFixed(2)}%`);

    // 異常値の銘柄を取得
    const anomalies = await new Promise((resolve, reject) => {
      this.db.db.all(`
        SELECT s.code, s.name, ph.dividend_yield
        FROM stocks s 
        JOIN price_history ph ON s.code = ph.stock_code 
        WHERE ph.dividend_yield > ?
        AND (ph.stock_code, ph.recorded_at) IN (
          SELECT stock_code, MAX(recorded_at)
          FROM price_history
          GROUP BY stock_code
        )
        ORDER BY ph.dividend_yield DESC
      `, [upperFence], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log(`\n統計的異常値（>${upperFence.toFixed(2)}%）: ${anomalies.length}件`);
    anomalies.forEach(stock => {
      console.log(`  ${stock.code}: ${stock.name} - ${stock.dividend_yield.toFixed(2)}%`);
    });

    return anomalies;
  }

  // ゼロ配当の銘柄もチェック
  async checkZeroDividends() {
    const zeroDiv = await new Promise((resolve, reject) => {
      this.db.db.get(`
        SELECT COUNT(*) as count
        FROM price_history
        WHERE dividend_yield = 0
        AND (stock_code, recorded_at) IN (
          SELECT stock_code, MAX(recorded_at)
          FROM price_history
          GROUP BY stock_code
        )
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    console.log(`\n無配当銘柄: ${zeroDiv.count}件`);
  }

  async execute() {
    console.log('=== 全配当利回り妥当性検証 ===\n');

    try {
      // 1. 高配当銘柄の詳細分析
      await this.validateHighYieldStocks();

      // 2. 統計的異常値検出
      await this.detectAnomalies();

      // 3. ゼロ配当チェック
      await this.checkZeroDividends();

      console.log('\n=== 検証完了 ===');

    } catch (error) {
      console.error('Error:', error);
    }
  }
}

// 実行
const validator = new DividendYieldValidator();
validator.execute()
  .then(() => validator.close())
  .catch(error => {
    console.error('Fatal error:', error);
    validator.close();
  });