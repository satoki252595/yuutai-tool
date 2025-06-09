import { execSync } from 'child_process';
import { Database } from './database.js';
import { JPXDataFetcher } from './jpx-data-fetcher.js';
import { ComprehensiveStockUpdater } from './comprehensive-stock-updater.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class OneCommandSetup {
  constructor() {
    this.db = new Database();
    this.startTime = Date.now();
    this.logFile = path.join(__dirname, 'setup-log.txt');
  }

  /**
   * ログメッセージの出力とファイル保存
   */
  async log(message, type = 'info') {
    const timestamp = new Date().toLocaleString('ja-JP');
    const prefix = {
      'info': '📄',
      'success': '✅',
      'warning': '⚠️',
      'error': '❌',
      'progress': '🔄'
    }[type] || '📄';
    
    const logMessage = `${prefix} [${timestamp}] ${message}`;
    console.log(logMessage);
    
    // ログファイルに保存
    try {
      await fs.appendFile(this.logFile, `${logMessage}\n`, 'utf8');
    } catch (error) {
      // ログファイル書き込みエラーは無視
    }
  }

  /**
   * 実行時間の計算
   */
  getElapsedTime() {
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
  }

  /**
   * データベースの初期化チェック
   */
  async checkAndInitDatabase() {
    await this.log('データベースの状態を確認中...', 'progress');
    
    try {
      // データベースファイルの存在確認
      const dbPath = path.join(__dirname, 'db/yuutai.db');
      await fs.access(dbPath);
      
      // テーブルの存在確認
      const tableCount = await new Promise((resolve, reject) => {
        this.db.db.get(`
          SELECT COUNT(*) as count 
          FROM sqlite_master 
          WHERE type='table' AND name IN ('stocks', 'shareholder_benefits', 'price_history')
        `, (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });

      if (tableCount < 3) {
        await this.log('データベーステーブルが不完全です。初期化を実行します...', 'warning');
        execSync('node backend/db/init.js', { stdio: 'inherit', cwd: process.cwd() });
        await this.log('データベース初期化完了', 'success');
      } else {
        await this.log('データベースは正常です', 'success');
      }

    } catch (error) {
      await this.log('データベースが見つかりません。初期化を実行します...', 'warning');
      execSync('node backend/db/init.js', { stdio: 'inherit', cwd: process.cwd() });
      await this.log('データベース初期化完了', 'success');
    }
  }

  /**
   * スキーマのマイグレーション
   */
  async migrateSchema() {
    await this.log('データベーススキーマを更新中...', 'progress');
    
    try {
      execSync('node backend/db/migrate-schema.js', { stdio: 'inherit', cwd: process.cwd() });
      await this.log('スキーマ更新完了', 'success');
    } catch (error) {
      await this.log(`スキーマ更新エラー: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * JPXから全銘柄データを取得
   */
  async fetchAllStocks() {
    await this.log('JPXから全銘柄データを取得中...', 'progress');
    
    try {
      const jpxFetcher = new JPXDataFetcher();
      const jpxData = await jpxFetcher.fetchLatestData(false); // キャッシュを使わず最新データを取得
      
      await this.log(`JPXから ${jpxData.totalCount} 銘柄のデータを取得完了`, 'success');
      return jpxData;
    } catch (error) {
      await this.log(`JPXデータ取得エラー: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * 全銘柄の情報をデータベースに更新
   */
  async updateStockDatabase(jpxData) {
    await this.log('銘柄情報をデータベースに更新中...', 'progress');
    
    try {
      const updater = new ComprehensiveStockUpdater();
      const stats = await updater.updateStockDatabase(jpxData.stocks);
      updater.close();
      
      await this.log(`銘柄データベース更新完了: ${stats.inserted} 新規追加, ${stats.updated} 更新`, 'success');
      return stats;
    } catch (error) {
      await this.log(`銘柄データベース更新エラー: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * 優待情報のスクレイピング（並行処理版）
   */
  async scrapeYuutaiData() {
    await this.log('優待情報を並行スクレイピング中...（高速化版）', 'progress');
    
    try {
      // 並行スクレイパーを使用（CPUコア数に応じて自動調整）
      execSync('node backend/parallel-scraper.js', { 
        stdio: 'inherit', 
        cwd: process.cwd(),
        timeout: 1800000 // 30分のタイムアウト（従来の半分）
      });
      await this.log('並行スクレイピング完了', 'success');
    } catch (error) {
      await this.log(`並行スクレイピングエラー: ${error.message}`, 'warning');
      await this.log('フォールバックとして従来のスクレイパーを試行中...', 'progress');
      
      // フォールバック：従来のスクレイパー
      try {
        execSync('node backend/scraper.js', { 
          stdio: 'inherit', 
          cwd: process.cwd(),
          timeout: 3600000 // 60分のタイムアウト
        });
        await this.log('従来スクレイピング完了', 'success');
      } catch (fallbackError) {
        await this.log(`スクレイピング失敗: ${fallbackError.message}`, 'warning');
        // 優待スクレイピングは失敗しても続行
      }
    }
  }

  /**
   * 株価データの更新（サンプル）
   */
  async updateSamplePrices() {
    await this.log('株価データをサンプル更新中...', 'progress');
    
    try {
      // 最初の50銘柄の株価を更新
      const sampleCodes = await this.getSampleStockCodes(50);
      
      if (sampleCodes.length > 0) {
        const updater = new ComprehensiveStockUpdater();
        const stats = await updater.updateSpecificStocks(sampleCodes);
        updater.close();
        
        await this.log(`サンプル株価更新完了: ${stats.success} 成功, ${stats.failed} 失敗`, 'success');
      }
    } catch (error) {
      await this.log(`株価更新エラー: ${error.message}`, 'warning');
      // 株価更新エラーは警告として続行
    }
  }

  /**
   * サンプル銘柄コードを取得
   */
  async getSampleStockCodes(limit = 50) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT code FROM stocks ORDER BY code LIMIT ?`;
      this.db.db.all(sql, [limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => row.code));
      });
    });
  }

  /**
   * 最終統計の表示
   */
  async displayFinalStatistics() {
    await this.log('最終統計情報を集計中...', 'progress');
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_stocks,
          COUNT(japanese_name) as with_japanese_name,
          COUNT(industry) as with_industry,
          (SELECT COUNT(DISTINCT stock_code) FROM price_history) as with_price_data,
          (SELECT COUNT(*) FROM shareholder_benefits) as total_benefits,
          (SELECT COUNT(DISTINCT stock_code) FROM shareholder_benefits) as stocks_with_benefits
        FROM stocks
      `;
      
      this.db.db.get(sql, [], async (err, row) => {
        if (err) {
          reject(err);
        } else {
          await this.log('', 'info');
          await this.log('='.repeat(50), 'info');
          await this.log('📊 最終統計情報', 'info');
          await this.log('='.repeat(50), 'info');
          await this.log(`📈 総銘柄数: ${row.total_stocks}`, 'info');
          await this.log(`🇯🇵 日本語名: ${row.with_japanese_name} (${Math.round(row.with_japanese_name/row.total_stocks*100)}%)`, 'info');
          await this.log(`🏭 業界情報: ${row.with_industry} (${Math.round(row.with_industry/row.total_stocks*100)}%)`, 'info');
          await this.log(`💰 株価データ: ${row.with_price_data} (${Math.round(row.with_price_data/row.total_stocks*100)}%)`, 'info');
          await this.log(`🎁 優待情報: ${row.total_benefits} 件 (${row.stocks_with_benefits} 銘柄)`, 'info');
          await this.log(`⏱️ 総実行時間: ${this.getElapsedTime()}`, 'info');
          await this.log('='.repeat(50), 'info');
          resolve(row);
        }
      });
    });
  }

  /**
   * メイン実行フロー
   */
  async executeFullSetup() {
    await this.log('🚀 優待投資ツール 完全セットアップを開始します', 'info');
    await this.log(`開始時刻: ${new Date().toLocaleString('ja-JP')}`, 'info');
    await this.log('', 'info');

    try {
      // Step 1: データベース確認・初期化
      await this.checkAndInitDatabase();
      
      // Step 2: スキーママイグレーション
      await this.migrateSchema();
      
      // Step 3: JPXから全銘柄データ取得
      const jpxData = await this.fetchAllStocks();
      
      // Step 4: 銘柄データベース更新
      await this.updateStockDatabase(jpxData);
      
      // Step 5: 優待情報スクレイピング
      await this.scrapeYuutaiData();
      
      // Step 6: サンプル株価更新
      await this.updateSamplePrices();
      
      // Step 7: 最終統計表示
      await this.displayFinalStatistics();
      
      await this.log('', 'info');
      await this.log('🎉 セットアップが正常に完了しました！', 'success');
      await this.log('', 'info');
      await this.log('次のステップ:', 'info');
      await this.log('1. npm run server でAPIサーバーを起動', 'info');
      await this.log('2. npm run dev でフロントエンドを起動', 'info');
      await this.log('3. http://localhost:5173 でアプリケーションにアクセス', 'info');

    } catch (error) {
      await this.log('', 'error');
      await this.log(`❌ セットアップ中にエラーが発生しました: ${error.message}`, 'error');
      await this.log(`⏱️ 実行時間: ${this.getElapsedTime()}`, 'info');
      throw error;
    }
  }

  /**
   * クイックセットアップ（優待スクレイピングなし）
   */
  async executeQuickSetup() {
    await this.log('⚡ 優待投資ツール クイックセットアップを開始します', 'info');
    await this.log('（優待スクレイピングをスキップして高速化）', 'info');
    await this.log('', 'info');

    try {
      // Step 1: データベース確認・初期化
      await this.checkAndInitDatabase();
      
      // Step 2: スキーママイグレーション
      await this.migrateSchema();
      
      // Step 3: JPXから全銘柄データ取得
      const jpxData = await this.fetchAllStocks();
      
      // Step 4: 銘柄データベース更新
      await this.updateStockDatabase(jpxData);
      
      // Step 5: サンプル株価更新のみ
      await this.updateSamplePrices();
      
      // Step 6: 最終統計表示
      await this.displayFinalStatistics();
      
      await this.log('', 'info');
      await this.log('⚡ クイックセットアップが完了しました！', 'success');
      await this.log('', 'info');
      await this.log('優待情報を追加する場合は:', 'info');
      await this.log('npm run scrape を実行してください', 'info');

    } catch (error) {
      await this.log(`❌ クイックセットアップ中にエラーが発生: ${error.message}`, 'error');
      throw error;
    }
  }

  close() {
    this.db.close();
  }
}

// 実行部分
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new OneCommandSetup();
  
  try {
    const mode = process.argv[2];
    
    if (mode === 'quick') {
      await setup.executeQuickSetup();
    } else {
      await setup.executeFullSetup();
    }
    
  } catch (error) {
    console.error('セットアップに失敗しました:', error);
    process.exit(1);
  } finally {
    setup.close();
  }
}