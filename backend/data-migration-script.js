import { execSync } from 'child_process';
import { Database } from './database.js';

class DataMigrationScript {
  constructor() {
    this.db = new Database();
  }

  /**
   * 全体的なデータ移行処理
   */
  async runFullMigration() {
    console.log('🚀 データ移行プロセスを開始します...\n');

    try {
      // Step 1: データベーススキーマの更新
      console.log('📊 Step 1: データベーススキーマを更新中...');
      await this.runSchemaUpdates();
      console.log('✅ スキーマ更新完了\n');

      // Step 2: 銘柄名の日本語化
      console.log('🇯🇵 Step 2: 銘柄名を日本語に更新中...');
      await this.runJapaneseNameUpdates();
      console.log('✅ 銘柄名日本語化完了\n');

      // Step 3: 配当データの強化（サンプルのみ）
      console.log('💰 Step 3: 配当データをサンプル更新中...');
      await this.runSampleDividendUpdates();
      console.log('✅ サンプル配当データ更新完了\n');

      // Step 4: データの検証
      console.log('🔍 Step 4: データを検証中...');
      await this.verifyData();
      console.log('✅ データ検証完了\n');

      console.log('🎉 データ移行プロセスが正常に完了しました!');

    } catch (error) {
      console.error('❌ データ移行中にエラーが発生:', error);
      throw error;
    }
  }

  /**
   * データベーススキーマの更新
   */
  async runSchemaUpdates() {
    try {
      execSync('node backend/db/migrate-schema.js', { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
    } catch (error) {
      console.error('スキーマ更新エラー:', error.message);
      throw error;
    }
  }

  /**
   * 銘柄名の日本語化
   */
  async runJapaneseNameUpdates() {
    try {
      execSync('node backend/update-japanese-names.js', { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
    } catch (error) {
      console.error('銘柄名更新エラー:', error.message);
      throw error;
    }
  }

  /**
   * サンプル配当データの更新（最初の10銘柄のみ）
   */
  async runSampleDividendUpdates() {
    try {
      // 最初の10銘柄のコードを取得
      const sampleCodes = await this.getSampleStockCodes(10);
      
      if (sampleCodes.length > 0) {
        console.log(`サンプル銘柄 [${sampleCodes.join(', ')}] の配当データを更新中...`);
        
        const command = `node backend/enhanced-data-collector.js ${sampleCodes.join(' ')}`;
        execSync(command, { 
          stdio: 'inherit',
          cwd: process.cwd(),
          timeout: 300000 // 5分のタイムアウト
        });
      } else {
        console.log('サンプル銘柄が見つかりませんでした');
      }
    } catch (error) {
      console.error('配当データ更新エラー:', error.message);
      // 配当データ更新のエラーは致命的ではないので継続
      console.log('⚠️ 配当データ更新をスキップして続行します');
    }
  }

  /**
   * サンプル銘柄コードを取得
   */
  async getSampleStockCodes(limit = 10) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT code FROM stocks ORDER BY code LIMIT ?`;
      this.db.db.all(sql, [limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => row.code));
      });
    });
  }

  /**
   * データの検証
   */
  async verifyData() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_stocks,
          COUNT(japanese_name) as japanese_names,
          COUNT(industry) as industries,
          (SELECT COUNT(*) FROM price_history WHERE annual_dividend > 0) as dividend_data,
          (SELECT COUNT(*) FROM shareholder_benefits) as benefits
        FROM stocks
      `;
      
      this.db.db.get(sql, [], (err, row) => {
        if (err) {
          reject(err);
        } else {
          console.log('📈 データ検証結果:');
          console.log(`   総銘柄数: ${row.total_stocks}`);
          console.log(`   日本語名: ${row.japanese_names} (${Math.round(row.japanese_names/row.total_stocks*100)}%)`);
          console.log(`   業界情報: ${row.industries} (${Math.round(row.industries/row.total_stocks*100)}%)`);
          console.log(`   配当データ: ${row.dividend_data} 件`);
          console.log(`   優待情報: ${row.benefits} 件`);
          resolve(row);
        }
      });
    });
  }

  /**
   * 手動でのデータクリーンアップ
   */
  async cleanupData() {
    return new Promise((resolve, reject) => {
      // 重複する price_history レコードを削除
      const sql = `
        DELETE FROM price_history 
        WHERE id NOT IN (
          SELECT MIN(id) 
          FROM price_history 
          GROUP BY stock_code, date(recorded_at)
        )
      `;
      
      this.db.db.run(sql, [], function(err) {
        if (err) {
          reject(err);
        } else {
          console.log(`🧹 重複する価格履歴 ${this.changes} 件を削除しました`);
          resolve(this.changes);
        }
      });
    });
  }

  close() {
    this.db.close();
  }
}

// 実行
if (import.meta.url === `file://${process.argv[1]}`) {
  const migrator = new DataMigrationScript();
  
  try {
    const command = process.argv[2];
    
    switch (command) {
      case 'full':
        await migrator.runFullMigration();
        break;
      case 'schema':
        await migrator.runSchemaUpdates();
        break;
      case 'names':
        await migrator.runJapaneseNameUpdates();
        break;
      case 'dividends':
        await migrator.runSampleDividendUpdates();
        break;
      case 'verify':
        await migrator.verifyData();
        break;
      case 'cleanup':
        await migrator.cleanupData();
        break;
      default:
        console.log('使用方法:');
        console.log('  node data-migration-script.js full     - 全ての移行処理を実行');
        console.log('  node data-migration-script.js schema   - スキーマ更新のみ');
        console.log('  node data-migration-script.js names    - 銘柄名日本語化のみ');
        console.log('  node data-migration-script.js dividends - サンプル配当データ更新');
        console.log('  node data-migration-script.js verify   - データ検証');
        console.log('  node data-migration-script.js cleanup  - データクリーンアップ');
    }
  } catch (error) {
    console.error('処理中にエラーが発生:', error);
    process.exit(1);
  } finally {
    migrator.close();
  }
}