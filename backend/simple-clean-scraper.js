import { Database } from './database.js';

/**
 * シンプルなクリーンアップスクリプト
 * 既存の動作するスクレイパーを使用し、取得後にデータをクリーンアップ
 */
class SimpleCleanScraper {
  constructor() {
    this.db = new Database();
  }

  /**
   * 既存優待データをクリーンアップ
   */
  async cleanExistingBenefits() {
    console.log('🧹 既存優待データのクリーンアップ中...');
    
    const benefits = await new Promise((resolve, reject) => {
      const sql = `SELECT id, description FROM shareholder_benefits WHERE description IS NOT NULL`;
      this.db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log(`${benefits.length} 件の優待データをクリーンアップ中...`);
    
    let cleanedCount = 0;
    let deletedCount = 0;

    for (const benefit of benefits) {
      const cleaned = this.cleanDescription(benefit.description);
      
      if (cleaned && cleaned.length >= 5 && cleaned !== benefit.description) {
        // クリーニング済みのデータで更新
        await this.updateBenefitDescription(benefit.id, cleaned);
        cleanedCount++;
      } else if (!cleaned || cleaned.length < 5) {
        // 無効なデータは削除
        await this.deleteBenefit(benefit.id);
        deletedCount++;
      }

      if ((cleanedCount + deletedCount) % 100 === 0) {
        console.log(`進捗: ${cleanedCount} 件クリーンアップ, ${deletedCount} 件削除`);
      }
    }

    console.log(`✅ 完了: ${cleanedCount} 件クリーンアップ, ${deletedCount} 件削除`);
  }

  /**
   * 説明文のクリーニング
   */
  cleanDescription(description) {
    if (!description) return '';

    let cleaned = description
      // 基本的なクリーニング
      .replace(/[\r\n\t]+/g, ' ')     // 改行・タブをスペースに
      .replace(/\s+/g, ' ')           // 連続スペースを単一に
      .replace(/^[○●・\s]+/, '')       // 先頭の記号を削除
      .replace(/[○●・\s]+$/, '')       // 末尾の記号を削除
      .trim();

    // 無効なパターンをチェック
    if (cleaned.length < 5) return '';
    if (/^[\d\s,]+$/.test(cleaned)) return ''; // 数字のみ
    if (/^[○●・\s]+$/.test(cleaned)) return ''; // 記号のみ
    if (/^(株主優待|優待内容|権利確定|必要株数|なし|無し)$/i.test(cleaned)) return ''; // ヘッダー等

    // HTMLエンティティのデコード
    cleaned = cleaned
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"');

    // 謎の数値を削除
    cleaned = cleaned.replace(/^\d+\.\d+\s*/, '').replace(/\s*\d+\.\d+$/, '');

    return cleaned.trim();
  }

  /**
   * 優待説明の更新
   */
  async updateBenefitDescription(id, description) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE shareholder_benefits SET description = ? WHERE id = ?`;
      this.db.db.run(sql, [description, id], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  /**
   * 優待データの削除
   */
  async deleteBenefit(id) {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM shareholder_benefits WHERE id = ?`;
      this.db.db.run(sql, [id], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  /**
   * 重複データの統合
   */
  async mergeDuplicates() {
    console.log('🔄 重複データを統合中...');
    
    const duplicates = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          stock_code,
          description,
          COUNT(*) as count,
          GROUP_CONCAT(id) as ids
        FROM shareholder_benefits
        GROUP BY stock_code, TRIM(description)
        HAVING COUNT(*) > 1
      `;
      
      this.db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    let mergedCount = 0;
    
    for (const dup of duplicates) {
      const ids = dup.ids.split(',').map(id => parseInt(id));
      const keepId = ids[0]; // 最初のIDを残す
      const deleteIds = ids.slice(1);
      
      // 重複を削除
      for (const deleteId of deleteIds) {
        await this.deleteBenefit(deleteId);
        mergedCount++;
      }
    }

    console.log(`✅ ${mergedCount} 件の重複を統合`);
  }

  /**
   * 統計情報の表示
   */
  async showStats() {
    const stats = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_benefits,
          COUNT(DISTINCT stock_code) as unique_stocks,
          AVG(monetary_value) as avg_value
        FROM shareholder_benefits
      `;
      
      this.db.db.get(sql, [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    console.log('\n📊 最終統計:');
    console.log(`総優待数: ${stats.total_benefits} 件`);
    console.log(`優待銘柄数: ${stats.unique_stocks} 銘柄`);
    console.log(`平均金銭価値: ${Math.round(stats.avg_value)} 円`);
  }

  close() {
    this.db.close();
  }
}

// 実行
if (import.meta.url === `file://${process.argv[1]}`) {
  const scraper = new SimpleCleanScraper();
  
  try {
    console.log('🚀 シンプルクリーンアップ開始...\n');
    
    await scraper.cleanExistingBenefits();
    await scraper.mergeDuplicates();
    await scraper.showStats();
    
    console.log('\n✅ シンプルクリーンアップ完了！');
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    scraper.close();
  }
}

export { SimpleCleanScraper };