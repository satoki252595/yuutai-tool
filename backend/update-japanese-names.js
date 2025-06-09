import { Database } from './database.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class JapaneseNameUpdater {
  constructor() {
    this.db = new Database();
  }

  /**
   * JPXキャッシュファイルから日本語銘柄名を読み込み
   */
  async loadJPXData() {
    try {
      const jpxCachePath = path.join(__dirname, 'jpx-stock-list-cache.json');
      const jpxData = JSON.parse(await fs.readFile(jpxCachePath, 'utf8'));
      
      console.log(`JPXキャッシュから ${jpxData.count} 件の銘柄情報を読み込みました`);
      
      // 銘柄コードをキーとしたマップを作成
      const stockMap = new Map();
      jpxData.stocks.forEach(stock => {
        // 4桁にパディング
        const paddedCode = stock.code.padStart(4, '0');
        stockMap.set(paddedCode, {
          name: stock.name,
          market: stock.market,
          industry: stock.industry
        });
      });
      
      return stockMap;
    } catch (error) {
      console.error('JPXデータの読み込みに失敗:', error);
      return new Map();
    }
  }

  /**
   * データベースの銘柄名を日本語に更新
   */
  async updateJapaneseNames() {
    const jpxStockMap = await this.loadJPXData();
    
    if (jpxStockMap.size === 0) {
      console.log('JPXデータが利用できません。処理を終了します。');
      return;
    }

    try {
      // 全ての銘柄を取得
      const stocks = await this.getAllStocks();
      console.log(`データベースから ${stocks.length} 件の銘柄を取得しました`);

      let updatedCount = 0;
      let notFoundCount = 0;

      for (const stock of stocks) {
        const jpxInfo = jpxStockMap.get(stock.code);
        
        if (jpxInfo) {
          // 日本語名と業界情報を更新
          await this.updateStockInfo(stock.code, {
            japanese_name: jpxInfo.name,
            market: jpxInfo.market,
            industry: jpxInfo.industry
          });
          
          console.log(`✓ ${stock.code}: ${stock.name} → ${jpxInfo.name}`);
          updatedCount++;
        } else {
          console.log(`⚠ ${stock.code}: JPXデータに見つかりません`);
          notFoundCount++;
        }
      }

      console.log(`\n更新完了:`);
      console.log(`- 更新された銘柄: ${updatedCount} 件`);
      console.log(`- 見つからなかった銘柄: ${notFoundCount} 件`);

    } catch (error) {
      console.error('銘柄名更新中にエラーが発生:', error);
    }
  }

  /**
   * 全ての銘柄を取得
   */
  async getAllStocks() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT code, name FROM stocks ORDER BY code`;
      this.db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  /**
   * 銘柄情報を更新
   */
  async updateStockInfo(code, info) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE stocks 
        SET japanese_name = ?, market = ?, industry = ?, updated_at = datetime('now')
        WHERE code = ?
      `;
      this.db.db.run(sql, [info.japanese_name, info.market, info.industry, code], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  /**
   * 更新結果の確認
   */
  async verifyUpdates() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total,
          COUNT(japanese_name) as with_japanese_name,
          COUNT(industry) as with_industry
        FROM stocks
      `;
      this.db.db.get(sql, [], (err, row) => {
        if (err) reject(err);
        else {
          console.log(`\n更新結果の確認:`);
          console.log(`- 総銘柄数: ${row.total}`);
          console.log(`- 日本語名あり: ${row.with_japanese_name}`);
          console.log(`- 業界情報あり: ${row.with_industry}`);
          resolve(row);
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
  const updater = new JapaneseNameUpdater();
  
  try {
    await updater.updateJapaneseNames();
    await updater.verifyUpdates();
  } catch (error) {
    console.error('処理中にエラーが発生:', error);
  } finally {
    updater.close();
  }
}