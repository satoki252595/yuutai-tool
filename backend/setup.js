import { Database } from './database.js';
import { ShareholderBenefitScraper } from './scraper.js';
import { JPXDataFetcher } from './jpx-data-fetcher.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class Setup {
  constructor() {
    this.db = new Database();
    this.jpxFetcher = new JPXDataFetcher();
  }

  async run() {
    try {
      console.log('🔧 データベース初期化中...');
      await this.initDatabase();
      
      console.log('🔧 データベースマイグレーション確認中...');
      await this.runMigrations();
      
      console.log('📌 JPXから銘柄データ取得中...');
      const jpxData = await this.jpxFetcher.fetchAndCacheData();
      const stocks = jpxData.stocks;

      console.log(`\n📌 ${stocks.length}銘柄の処理を開始します`);
      console.log('⚡ 4並列でスクレイピング実行中...\n');

      const codes = stocks.map(s => s.code);
      
      // 環境変数またはコマンドライン引数から優待なしスキップオプションを取得
      const skipNoBenefits = process.env.SKIP_NO_BENEFITS === 'true' || process.argv.includes('--skip-no-benefits');
      
      if (skipNoBenefits) {
        console.log('📭 優待なし銘柄はDBに格納しません');
      }
      
      const scraper = new ShareholderBenefitScraper({ 
        concurrency: 4,
        skipNoBenefits: skipNoBenefits
      });
      await scraper.scrapeStocks(codes);

      // 統計情報表示
      const actualStockCount = await this.getActualStockCount();
      console.log(`\n📊 実際に取得できた銘柄数: ${actualStockCount}/${stocks.length}`);

      const rsiStats = await this.getRSIStats();
      console.log(`\n📌 RSI計算状況:`);
      console.log(`  RSI(14)計算済: ${rsiStats.rsi14Count}銘柄`);
      console.log(`  RSI(28)計算済: ${rsiStats.rsi28Count}銘柄`);
      console.log(`  価格履歴平均: ${rsiStats.avgPriceHistory}日分`);

      console.log('\n🔧 データベース最適化実行中...');
      await this.optimizeDatabase();

      console.log('\n✅ セットアップ完了');
      await this.showDetailedStats();

    } catch (error) {
      console.error('❌ エラー:', error);
      throw error;
    } finally {
      this.db.close();
    }
  }

  async initDatabase() {
    try {
      const initPath = path.join(__dirname, 'db', 'init.js');
      execSync(`node ${initPath}`, { stdio: 'pipe' });
      console.log('  ✓ データベース初期化完了');
    } catch (error) {
      if (error.stderr && error.stderr.toString().trim()) {
        console.error('データベース初期化エラー:', error.stderr.toString());
      }
    }
  }

  async runMigrations() {
    try {
      const migrationPath = path.join(__dirname, 'db', 'migrate-benefit-content.js');
      execSync(`node ${migrationPath}`, { stdio: 'pipe' });
      console.log('  ✓ マイグレーション完了');
    } catch (error) {
      // マイグレーションが既に適用済みの場合は無視
      if (error.stdout && !error.stdout.toString().includes('既に存在')) {
        console.error('マイグレーションエラー:', error.message);
      }
    }
  }

  async optimizeDatabase() {
    try {
      console.log('🚀 データベース最適化を開始...');
      
      // 最適化実行
      const optimizePath = path.join(__dirname, 'optimize-database.js');
      execSync(`node ${optimizePath}`, { stdio: 'pipe' });
      
      // パフォーマンステスト実行
      console.log('\n🧪 パフォーマンステスト実行中...');
      const perfTestPath = path.join(__dirname, 'performance-test.js');
      const perfResult = execSync(`node ${perfTestPath}`, { stdio: 'pipe', encoding: 'utf8' });
      
      // 重要な結果のみ表示
      const lines = perfResult.split('\n');
      const importantLines = lines.filter(line => 
        line.includes('複雑結合クエリ（最適化前）') || 
        line.includes('最適化済み結合クエリ') ||
        line.includes('データベースサイズ') ||
        line.includes('インデックス数確認')
      );
      
      console.log('📊 最適化結果:');
      importantLines.forEach(line => {
        if (line.trim()) {
          console.log(`  ${line.trim()}`);
        }
      });
      
      // 高速化率を計算
      const beforeMatch = perfResult.match(/複雑結合クエリ（最適化前）: \d+件 \((\d+\.?\d*)ms\)/);
      const afterMatch = perfResult.match(/最適化済み結合クエリ: \d+件 \((\d+\.?\d*)ms\)/);
      
      if (beforeMatch && afterMatch) {
        const beforeMs = parseFloat(beforeMatch[1]);
        const afterMs = parseFloat(afterMatch[1]);
        const speedup = (beforeMs / afterMs).toFixed(1);
        console.log(`  ⚡ パフォーマンス向上: ${speedup}倍高速化`);
      }
      
      console.log('✅ データベース最適化完了');
    } catch (error) {
      console.error('データベース最適化エラー:', error.message);
      // 最適化エラーは致命的ではないため処理を継続
    }
  }

  async getActualStockCount() {
    return new Promise((resolve, reject) => {
      this.db.db.get('SELECT COUNT(*) as count FROM stocks', (err, row) => {
        err ? reject(err) : resolve(row?.count || 0);
      });
    });
  }

  async getRSIStats() {
    return new Promise((resolve, reject) => {
      const stats = {};
      
      this.db.db.get('SELECT COUNT(*) as count FROM stocks WHERE rsi IS NOT NULL', (err, row) => {
        stats.rsi14Count = row?.count || 0;
        
        this.db.db.get('SELECT COUNT(*) as count FROM stocks WHERE rsi28 IS NOT NULL', (err, row) => {
          stats.rsi28Count = row?.count || 0;
          
          this.db.db.get(`
            SELECT AVG(price_count) as avg_count FROM (
              SELECT stock_code, COUNT(*) as price_count 
              FROM price_history 
              GROUP BY stock_code
            )
          `, (err, row) => {
            stats.avgPriceHistory = Math.round(row?.avg_count || 0);
            resolve(stats);
          });
        });
      });
    });
  }

  async showDetailedStats() {
    const stats = await this.getDetailedStats();
    console.log('\n📊 データベース統計:');
    console.log(`  銘柄数: ${stats.stocks}`);
    console.log(`  優待情報: ${stats.benefits}`);
    console.log(`  価格履歴: ${stats.priceHistory} (各銘柄${stats.avgPriceHistory}件平均)`);
    console.log(`  RSI計算済: ${stats.rsiCalculated}`);
    
    // サンプルデータ表示
    const samples = await this.getSampleData();
    if (samples.length > 0) {
      console.log('\n📌 サンプルデータ:');
      samples.forEach(sample => {
        const rsiStatus = sample.rsi ? `RSI: ${sample.rsi.toFixed(2)}` : 'RSI: 計算不可';
        console.log(`  ${sample.code}: ${sample.name} - ${rsiStatus}`);
      });
    }
  }

  async getDetailedStats() {
    return new Promise((resolve) => {
      const stats = {};
      
      this.db.db.get('SELECT COUNT(*) as count FROM stocks', (err, row) => {
        stats.stocks = row?.count || 0;
        
        this.db.db.get('SELECT COUNT(*) as count FROM shareholder_benefits', (err, row) => {
          stats.benefits = row?.count || 0;
          
          this.db.db.get('SELECT COUNT(*) as count FROM price_history', (err, row) => {
            stats.priceHistory = row?.count || 0;
            stats.avgPriceHistory = stats.stocks > 0 ? Math.round(stats.priceHistory / stats.stocks) : 0;
            
            this.db.db.get('SELECT COUNT(*) as count FROM stocks WHERE rsi IS NOT NULL', (err, row) => {
              stats.rsiCalculated = row?.count || 0;
              resolve(stats);
            });
          });
        });
      });
    });
  }

  getSampleData() {
    return new Promise((resolve, reject) => {
      this.db.db.all(
        `SELECT s.code, s.name, s.rsi 
         FROM stocks s 
         ORDER BY RANDOM() 
         LIMIT 5`,
        (err, rows) => {
          err ? reject(err) : resolve(rows || []);
        }
      );
    });
  }
}

// CLI実行
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new Setup();
  setup.run().catch(console.error);
}