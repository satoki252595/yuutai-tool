import { Database } from './database.js';

// 優待品分類改善スクリプト
class BenefitClassificationImprover {
  constructor() {
    this.db = new Database();
  }

  async close() {
    this.db.close();
  }

  // 改善された分類ロジック
  classifyBenefitFromDescription(description) {
    if (!description) return 'その他';
    
    const desc = description.toLowerCase();
    
    // より詳細な分類キーワード
    const classifications = {
      '食事券・グルメ券': [
        '食事券', '飲食券', 'グルメ券', '食事割引', '飲食割引', 'レストラン', '食べ物', 
        '料理', '弁当', 'ランチ', 'ディナー', 'お食事', '無料券', '飲食店', 'カフェ',
        '定食', 'バイキング', 'ビュッフェ', 'コース料理', 'お食事券', '食べ放題'
      ],
      
      '商品券・ギフトカード': [
        '商品券', 'ギフトカード', 'ギフト券', '百貨店', 'デパート', 'jcbギフト',
        'ucギフト', 'visa商品券', 'ギフトカタログ', '商品カード'
      ],
      
      'QUOカード・図書カード': [
        'quoカード', 'クオカード', '図書カード', '図書券', 'quo', 'ブックカード'
      ],
      
      '割引券・優待券': [
        '割引券', '優待券', '優待割引', '割引', 'クーポン', '％割引', '%割引', 
        '半額', '無料', 'サービス券', '特典券', '利用券', '招待券'
      ],
      
      '自社製品・商品': [
        '自社製品', '自社商品', '商品', '製品', 'オリジナル', '自社ブランド',
        'プライベートブランド', '限定商品', '新商品', '商品詰合せ'
      ],
      
      'カタログギフト': [
        'カタログギフト', 'カタログ', 'ギフトセット', 'セレクトギフト',
        'チョイスギフト', '選択ギフト', 'カタログから選択'
      ],
      
      'ポイント・電子マネー': [
        'ポイント', '電子マネー', 'edy', 'waon', 'nanaco', 'suica', 'icoca',
        'paypay', 'dポイント', 'tポイント', 'マイル', '楽天ポイント'
      ],
      
      '宿泊・レジャー': [
        '宿泊券', 'ホテル', '温泉', 'レジャー', '旅行', 'ゴルフ', 'スキー',
        '遊園地', 'テーマパーク', 'リゾート', '宿泊優待', '入場券', 'チケット'
      ],
      
      '交通・乗車券': [
        '乗車券', '航空券', '交通費', '電車', 'バス', '航空', 'タクシー',
        '回数券', '定期券', '乗車証', '運賃割引'
      ],
      
      '金券・現金': [
        '現金', '金券', 'お米券', '全国百貨店共通商品券', 'ビール券',
        '生ビール', 'アルコール', 'お酒'
      ],
      
      '寄付選択制': [
        '寄付', '社会貢献', '地域貢献', '慈善', 'npo', 'ユニセフ',
        '災害支援', '環境保護', '教育支援'
      ],
      
      '美容・健康': [
        'コスメ', '化粧品', 'スキンケア', '美容', 'エステ', 'マッサージ',
        '健康食品', 'サプリメント', 'ヘアケア'
      ],
      
      '本・雑誌・エンタメ': [
        '書籍', '雑誌', '本', 'dvd', 'cd', '音楽', '映画', 'ゲーム',
        'コンサート', '演劇', '舞台'
      ]
    };

    // 分類の実行
    for (const [category, keywords] of Object.entries(classifications)) {
      for (const keyword of keywords) {
        if (desc.includes(keyword)) {
          return category;
        }
      }
    }

    return 'その他';
  }

  // 「その他」分類の優待を再分析
  async analyzeOtherBenefits() {
    const otherBenefits = await new Promise((resolve, reject) => {
      this.db.db.all(`
        SELECT id, stock_code, description, benefit_type
        FROM shareholder_benefits 
        WHERE benefit_type = 'その他' OR benefit_type IS NULL
        ORDER BY stock_code
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log(`「その他」分類の優待: ${otherBenefits.length}件`);

    let reclassified = 0;
    const updates = [];

    for (const benefit of otherBenefits) {
      const newType = this.classifyBenefitFromDescription(benefit.description);
      if (newType !== 'その他') {
        updates.push({
          id: benefit.id,
          newType: newType,
          description: benefit.description.substring(0, 100)
        });
        reclassified++;
      }
    }

    console.log(`再分類可能な優待: ${reclassified}件`);
    
    // サンプル表示
    console.log('\n再分類例:');
    updates.slice(0, 10).forEach(update => {
      console.log(`  ${update.newType}: ${update.description}...`);
    });

    return updates;
  }

  // データベースの分類を更新
  async updateBenefitTypes(updates) {
    console.log('\n=== 分類更新開始 ===');
    
    let successCount = 0;
    for (const update of updates) {
      try {
        await new Promise((resolve, reject) => {
          this.db.db.run(`
            UPDATE shareholder_benefits 
            SET benefit_type = ?
            WHERE id = ?
          `, [update.newType, update.id], function(err) {
            if (err) reject(err);
            else resolve(this.changes);
          });
        });
        successCount++;
      } catch (error) {
        console.error(`更新エラー ID:${update.id}:`, error.message);
      }
    }

    console.log(`✓ ${successCount}件の分類を更新`);
  }

  // 更新後の統計
  async showUpdatedStats() {
    const stats = await new Promise((resolve, reject) => {
      this.db.db.all(`
        SELECT benefit_type, COUNT(*) as count 
        FROM shareholder_benefits 
        GROUP BY benefit_type 
        ORDER BY count DESC
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log('\n=== 更新後の分類統計 ===');
    stats.forEach(stat => {
      console.log(`  ${stat.benefit_type}: ${stat.count}件`);
    });

    return stats;
  }

  // メイン実行
  async execute() {
    try {
      console.log('=== 優待品分類改善開始 ===\n');

      // 1. 現在の「その他」を分析
      const updates = await this.analyzeOtherBenefits();

      // 2. 分類を更新
      if (updates.length > 0) {
        await this.updateBenefitTypes(updates);
      }

      // 3. 更新後の統計表示
      await this.showUpdatedStats();

      console.log('\n=== 分類改善完了 ===');

    } catch (error) {
      console.error('Error:', error);
    }
  }
}

// 実行
const improver = new BenefitClassificationImprover();
improver.execute()
  .then(() => improver.close())
  .catch(error => {
    console.error('Fatal error:', error);
    improver.close();
  });