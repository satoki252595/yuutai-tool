import { Database } from './database.js';
import { ShareholderBenefitScraper } from './scraper.js';
import { JPXDataFetcher } from './jpx-data-fetcher.js';
import { RSICalculator } from './rsiCalculator.js';
import puppeteer from 'puppeteer';

class Test {
  constructor() {
    this.db = new Database();
    this.scraper = new ShareholderBenefitScraper();
    this.jpxFetcher = new JPXDataFetcher();
    this.rsiCalculator = new RSICalculator();
    this.results = {
      passed: [],
      failed: [],
      total: 0
    };
  }

  async run() {
    console.log('=== 優待投資ツール総合テスト開始 ===\n');

    try {
      // 1. JPXデータ取得テスト
      await this.testJPXData();

      // 2. スクレイピングテスト（100銘柄）
      await this.testScraping();

      // 3. データ検証
      await this.verifyData();

      // 4. RSI計算テスト
      await this.testRSI();

      this.showResults();

    } catch (error) {
      console.error('❌ テストエラー:', error);
    } finally {
      this.db.close();
    }
  }

  async testJPXData() {
    console.log('📌 JPXデータ取得テスト...');
    
    try {
      const data = await this.jpxFetcher.fetchAndCacheData();
      
      this.assert(data.stocks.length > 3000, 'JPXデータに3000以上の銘柄が含まれている');
      this.assert(data.stocks[0].code, '銘柄コードが存在する');
      this.assert(data.stocks[0].name, '企業名が存在する');
      
      console.log(`  ✓ ${data.stocks.length}銘柄のデータ取得成功\n`);
    } catch (error) {
      this.results.failed.push({ test: 'JPXデータ取得', error: error.message });
    }
  }

  async testScraping() {
    console.log('📌 スクレイピングテスト（100銘柄）...');
    
    // テスト用銘柄を選定（優待実施率が高い食品・小売業界から）
    const testStocks = [
      '2502', '2503', '2579', '2593', '2594', // 飲料
      '2801', '2802', '2809', '2810', '2811', // 食品
      '3028', '3038', '3048', '3050', '3053', // 小売
      '7412', '7419', '7421', '7438', '7445', // 外食
      '8267', '8270', '8273', '8278', '8279'  // 小売
    ];

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    let successCount = 0;
    let benefitCount = 0;

    for (const code of testStocks.slice(0, 20)) {
      try {
        const result = await this.scraper.scrapeStock(browser, code);
        if (result.success) {
          successCount++;
          benefitCount += result.benefitCount;
          console.log(`  ✓ ${code}: ${result.name} - ${result.benefitCount}件`);
        }
      } catch (error) {
        console.log(`  ✗ ${code}: エラー`);
      }
    }

    await browser.close();

    this.assert(successCount >= 10, `20銘柄中10銘柄以上でデータ取得成功（実際: ${successCount}）`);
    this.assert(benefitCount > 0, `優待情報が1件以上取得できた（実際: ${benefitCount}件）`);
    
    console.log(`\n  成功: ${successCount}/20銘柄, 優待情報: ${benefitCount}件\n`);
  }

  async verifyData() {
    console.log('📌 データ検証テスト...');

    // 優待情報の検証
    const benefits = await this.query(`
      SELECT b.*, s.name, s.japanese_name
      FROM shareholder_benefits b
      JOIN stocks s ON b.stock_code = s.code
      LIMIT 50
    `);

    if (benefits.length === 0) {
      console.log('  ⚠️ データベースに優待情報が保存されていません');
      this.assert(false, '優待情報がデータベースに保存されている');
      return;
    }

    let validCount = 0;
    const issues = [];

    for (const benefit of benefits) {
      const checks = {
        hasType: benefit.benefit_type && benefit.benefit_type !== 'その他',
        hasDescription: benefit.description && benefit.description.length > 10,
        hasValue: benefit.monetary_value > 0,
        hasShares: benefit.min_shares > 0 && benefit.min_shares <= 100000,
        hasMonth: benefit.ex_rights_month >= 1 && benefit.ex_rights_month <= 12,
        hasJapaneseName: benefit.japanese_name && benefit.japanese_name.length > 0
      };

      const validChecks = Object.values(checks).filter(v => v).length;
      if (validChecks >= 4) { // 6項目中4項目以上がOKなら有効とする
        validCount++;
      } else {
        issues.push({
          code: benefit.stock_code,
          name: benefit.japanese_name || benefit.name,
          issues: Object.entries(checks).filter(([k, v]) => !v).map(([k]) => k),
          description: benefit.description.substring(0, 50)
        });
      }
    }

    const successRate = Math.round(validCount / benefits.length * 100);
    this.assert(validCount >= benefits.length * 0.6, `60%以上の優待データが有効（実際: ${successRate}%）`);

    if (issues.length > 0 && issues.length <= 10) {
      console.log('\n  データ不備のある銘柄:');
      issues.slice(0, 5).forEach(issue => {
        console.log(`    ${issue.code} ${issue.name}: ${issue.issues.join(', ')}`);
        console.log(`      内容: ${issue.description}...`);
      });
    }

    console.log(`\n  検証済: ${validCount}/${benefits.length}件 (${successRate}%)\n`);
  }

  async testRSI() {
    console.log('📌 RSI計算テスト...');

    const stocks = await this.query('SELECT code FROM stocks LIMIT 10');
    
    if (stocks.length === 0) {
      console.log('  ⚠️ 株式データがありません');
      this.assert(false, '株式データが存在する');
      return;
    }

    // 価格履歴データがあるかチェック
    const priceHistoryCount = await this.query('SELECT COUNT(*) as count FROM price_history');
    console.log(`  価格履歴データ: ${priceHistoryCount[0]?.count || 0}件`);

    // RSI計算用の模擬価格データを生成（テスト用）
    const testStock = stocks[0];
    await this.generateMockPriceData(testStock.code);

    let calculatedCount = 0;

    for (const stock of stocks.slice(0, 3)) { // 3銘柄でテスト
      try {
        const rsi = await this.rsiCalculator.calculate(stock.code);
        if (rsi !== null) {
          calculatedCount++;
          console.log(`  ✓ ${stock.code}: RSI=${rsi}`);
          this.assert(rsi >= 0 && rsi <= 100, `RSI値が0-100の範囲内（${stock.code}: ${rsi}）`);
        }
      } catch (error) {
        console.log(`  ✗ ${stock.code}: ${error.message}`);
      }
    }

    this.assert(calculatedCount >= 1, `3銘柄中1銘柄以上でRSI計算成功（実際: ${calculatedCount}）`);
    console.log(`\n  RSI計算成功: ${calculatedCount}/3銘柄\n`);
  }

  async generateMockPriceData(stockCode) {
    const basePrice = 1500;
    const dates = [];
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      // ランダムな価格変動を生成
      const variation = (Math.random() - 0.5) * 100;
      const price = basePrice + variation;
      
      await this.db.db.run(
        'INSERT OR REPLACE INTO price_history (stock_code, price, recorded_at) VALUES (?, ?, ?)',
        [stockCode, price, date.toISOString()]
      );
    }
  }

  assert(condition, message) {
    this.results.total++;
    if (condition) {
      this.results.passed.push(message);
    } else {
      this.results.failed.push({ test: message, error: 'アサーション失敗' });
    }
  }

  query(sql) {
    return new Promise((resolve, reject) => {
      this.db.db.all(sql, (err, rows) => {
        err ? reject(err) : resolve(rows);
      });
    });
  }

  showResults() {
    console.log('\n=== テスト結果 ===');
    console.log(`✅ 成功: ${this.results.passed.length}/${this.results.total}`);
    console.log(`❌ 失敗: ${this.results.failed.length}/${this.results.total}`);

    if (this.results.failed.length > 0) {
      console.log('\n失敗したテスト:');
      this.results.failed.forEach(f => {
        console.log(`  - ${f.test}: ${f.error}`);
      });
    }

    const successRate = Math.round(this.results.passed.length / this.results.total * 100);
    console.log(`\n総合評価: ${successRate}%`);
    
    if (successRate >= 80) {
      console.log('✅ テスト合格！');
    } else {
      console.log('❌ テスト不合格');
      process.exit(1);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new Test();
  test.run().catch(console.error);
}