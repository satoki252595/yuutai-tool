import { Database } from './database.js';

/**
 * 既存の優待データをクリーンアップ
 * - 改行コード・不要な空白を除去
 * - 無効なデータを削除
 * - 重複を統合
 */
class FixExistingBenefits {
  constructor() {
    this.db = new Database();
    this.stats = {
      total: 0,
      cleaned: 0,
      deleted: 0,
      merged: 0
    };
  }

  /**
   * 全優待データのクリーンアップ
   */
  async cleanAllBenefitData() {
    console.log('🧹 既存優待データのクリーンアップを開始...\n');

    try {
      // 1. 無効なデータを削除
      await this.deleteInvalidBenefits();
      
      // 2. 優待説明文をクリーニング
      await this.cleanBenefitDescriptions();
      
      // 3. 重複データを統合
      await this.mergeDuplicateBenefits();
      
      // 4. 異常な金銭価値を修正
      await this.fixAbnormalValues();
      
      // 5. 統計情報を表示
      await this.showStatistics();
      
      console.log('\n✅ クリーンアップ完了！');
      
    } catch (error) {
      console.error('クリーンアップエラー:', error);
    }
  }

  /**
   * 無効な優待データを削除
   */
  async deleteInvalidBenefits() {
    console.log('🗑️ 無効なデータを削除中...');

    const invalidPatterns = [
      // 短すぎる説明（5文字未満）
      `LENGTH(description) < 5`,
      
      // 数値のみ
      `description GLOB '[0-9]*' OR description GLOB '[0-9]*.[0-9]*'`,
      
      // 記号のみ
      `description IN ('○', '●', '・', '-', '－', '_')`,
      
      // エラー値
      `description LIKE '%undefined%' OR description LIKE '%null%' OR description LIKE '%NaN%'`,
      
      // HTMLタグが残っている
      `description LIKE '%<%>%' OR description LIKE '%&nbsp;%' OR description LIKE '%&amp;%'`,
      
      // 改行コードのみ
      `TRIM(description, char(10)||char(13)||char(9)||' ') = ''`,
      
      // テーブルヘッダー的なテキスト
      `description IN ('株主優待', '優待内容', '権利確定月', '必要株数', '株数', '内容', '月', '条件')`
    ];

    let totalDeleted = 0;
    
    for (const pattern of invalidPatterns) {
      const sql = `DELETE FROM shareholder_benefits WHERE ${pattern}`;
      
      await new Promise((resolve, reject) => {
        this.db.db.run(sql, [], function(err) {
          if (err) {
            console.warn(`  ⚠️ パターン削除エラー: ${err.message}`);
            resolve(0);
          } else {
            if (this.changes > 0) {
              console.log(`  ✓ ${this.changes} 件削除: ${pattern.substring(0, 50)}...`);
            }
            totalDeleted += this.changes;
            resolve(this.changes);
          }
        });
      });
    }

    this.stats.deleted = totalDeleted;
    console.log(`  合計 ${totalDeleted} 件の無効データを削除\n`);
  }

  /**
   * 優待説明文のクリーニング
   */
  async cleanBenefitDescriptions() {
    console.log('🧽 優待説明文をクリーニング中...');

    // クリーニングが必要なデータを取得
    const dirtyBenefits = await new Promise((resolve, reject) => {
      const sql = `
        SELECT id, stock_code, description
        FROM shareholder_benefits
        WHERE 
          description LIKE '%' || char(10) || '%' OR  -- 改行
          description LIKE '%' || char(13) || '%' OR  -- キャリッジリターン
          description LIKE '%' || char(9) || '%' OR   -- タブ
          description LIKE '%  %' OR                   -- 連続スペース
          description LIKE ' %' OR                     -- 先頭スペース
          description LIKE '% ' OR                     -- 末尾スペース
          description LIKE '%○%' OR                   -- 不要な記号
          description LIKE '%●%' OR
          description LIKE '%・%' OR
          description GLOB '*[0-9][0-9][0-9][0-9].[0-9]*'  -- 謎の数値
      `;
      
      this.db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log(`  ${dirtyBenefits.length} 件のデータをクリーニング`);

    let cleanedCount = 0;
    
    for (const benefit of dirtyBenefits) {
      const cleaned = this.cleanDescription(benefit.description);
      
      if (cleaned !== benefit.description && cleaned.length >= 5) {
        await this.updateBenefitDescription(benefit.id, cleaned);
        cleanedCount++;
        
        if (cleanedCount % 100 === 0) {
          console.log(`  進捗: ${cleanedCount}/${dirtyBenefits.length}`);
        }
      } else if (cleaned.length < 5) {
        // クリーニング後も無効な場合は削除
        await this.deleteBenefit(benefit.id);
        this.stats.deleted++;
      }
    }

    this.stats.cleaned = cleanedCount;
    console.log(`  ✓ ${cleanedCount} 件の説明文をクリーニング\n`);
  }

  /**
   * 説明文のクリーニング処理
   */
  cleanDescription(text) {
    if (!text) return '';

    let cleaned = text
      // 改行・タブを半角スペースに変換
      .replace(/[\r\n\t]+/g, ' ')
      
      // 連続する空白を単一スペースに
      .replace(/\s+/g, ' ')
      
      // 不要な記号を削除
      .replace(/^[○●・\-－_\s]+/, '')
      .replace(/[○●・\-－_\s]+$/, '')
      
      // HTMLエンティティをデコード
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      
      // 謎の数値パターンを削除
      .replace(/^\d+\.\d+\s*/, '')
      .replace(/\s*\d+\.\d+$/, '')
      
      // 前後の空白を削除
      .trim();

    // 括弧内の空白を正規化
    cleaned = cleaned
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/（\s+/g, '（')
      .replace(/\s+）/g, '）');

    // 数値と単位の間の空白を削除
    cleaned = cleaned
      .replace(/(\d)\s+(円|枚|個|株|月|年|日)/g, '$1$2')
      .replace(/(\d),\s*(\d)/g, '$1,$2');

    return cleaned;
  }

  /**
   * 重複優待データの統合
   */
  async mergeDuplicateBenefits() {
    console.log('🔄 重複データを統合中...');

    // 同一銘柄・同一内容の重複を検出
    const duplicates = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          stock_code,
          description,
          min_shares,
          ex_rights_month,
          COUNT(*) as count,
          GROUP_CONCAT(id) as ids,
          MAX(monetary_value) as max_value
        FROM shareholder_benefits
        GROUP BY stock_code, description, min_shares, ex_rights_month
        HAVING COUNT(*) > 1
      `;
      
      this.db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log(`  ${duplicates.length} グループの重複を検出`);

    let mergedCount = 0;
    
    for (const dup of duplicates) {
      const ids = dup.ids.split(',').map(id => parseInt(id));
      const keepId = ids[0]; // 最初のIDを残す
      const deleteIds = ids.slice(1);
      
      // 最大の金銭価値を保持
      if (dup.max_value > 0) {
        await this.updateBenefitValue(keepId, dup.max_value);
      }
      
      // 重複を削除
      for (const deleteId of deleteIds) {
        await this.deleteBenefit(deleteId);
        mergedCount++;
      }
    }

    this.stats.merged = mergedCount;
    console.log(`  ✓ ${mergedCount} 件の重複を統合\n`);
  }

  /**
   * 異常な金銭価値を修正
   */
  async fixAbnormalValues() {
    console.log('💰 異常な金銭価値を修正中...');

    // 異常に高い金銭価値を検出（10万円以上）
    const abnormalBenefits = await new Promise((resolve, reject) => {
      const sql = `
        SELECT id, stock_code, description, monetary_value
        FROM shareholder_benefits
        WHERE monetary_value > 100000
      `;
      
      this.db.db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log(`  ${abnormalBenefits.length} 件の異常値を検出`);

    for (const benefit of abnormalBenefits) {
      // 説明文から妥当な金額を再抽出
      const valueMatch = benefit.description.match(/(\d{1,5})\s*円/);
      if (valueMatch) {
        const newValue = parseInt(valueMatch[1]);
        if (newValue < 100000) {
          await this.updateBenefitValue(benefit.id, newValue);
          console.log(`  ✓ ${benefit.stock_code}: ${benefit.monetary_value}円 → ${newValue}円`);
        }
      } else {
        // 金額が見つからない場合は0に
        await this.updateBenefitValue(benefit.id, 0);
      }
    }

    console.log('');
  }

  /**
   * 統計情報の表示
   */
  async showStatistics() {
    const stats = await new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_benefits,
          COUNT(DISTINCT stock_code) as unique_stocks,
          AVG(monetary_value) as avg_value,
          MAX(monetary_value) as max_value,
          COUNT(CASE WHEN monetary_value = 0 THEN 1 END) as zero_value_count
        FROM shareholder_benefits
      `;
      
      this.db.db.get(sql, [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    console.log('📊 クリーンアップ結果:');
    console.log('========================');
    console.log(`削除されたデータ: ${this.stats.deleted} 件`);
    console.log(`クリーニング済み: ${this.stats.cleaned} 件`);
    console.log(`統合された重複: ${this.stats.merged} 件`);
    console.log('');
    console.log('📈 最終統計:');
    console.log(`総優待数: ${stats.total_benefits} 件`);
    console.log(`優待銘柄数: ${stats.unique_stocks} 銘柄`);
    console.log(`平均金銭価値: ${Math.round(stats.avg_value)} 円`);
    console.log(`最大金銭価値: ${stats.max_value} 円`);
    console.log(`金銭価値未設定: ${stats.zero_value_count} 件`);
  }

  // ヘルパーメソッド
  async updateBenefitDescription(id, description) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE shareholder_benefits SET description = ? WHERE id = ?`;
      this.db.db.run(sql, [description, id], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  async updateBenefitValue(id, value) {
    return new Promise((resolve, reject) => {
      const sql = `UPDATE shareholder_benefits SET monetary_value = ? WHERE id = ?`;
      this.db.db.run(sql, [value, id], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  async deleteBenefit(id) {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM shareholder_benefits WHERE id = ?`;
      this.db.db.run(sql, [id], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  close() {
    this.db.close();
  }
}

// 実行
if (import.meta.url === `file://${process.argv[1]}`) {
  const fixer = new FixExistingBenefits();
  
  try {
    await fixer.cleanAllBenefitData();
  } catch (error) {
    console.error('処理エラー:', error);
  } finally {
    fixer.close();
  }
}

export { FixExistingBenefits };