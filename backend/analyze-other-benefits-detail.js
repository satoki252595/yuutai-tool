import { Database } from './database.js';

// 「その他」分類の詳細分析と改善
class OtherBenefitsDetailAnalyzer {
  constructor() {
    this.db = new Database();
  }

  async close() {
    this.db.close();
  }

  // より詳細な分類パターン
  getEnhancedClassifications() {
    return {
      '食事券・グルメ券': [
        '食事券', '飲食券', 'グルメ券', '食事割引', '飲食割引', 'レストラン', 
        '料理', '弁当', 'ランチ', 'ディナー', 'お食事', '無料券', '飲食店', 
        'カフェ', '定食', 'バイキング', 'ビュッフェ', 'コース料理', 'お食事券',
        '食べ放題', 'ラーメン', 'うどん', 'そば', '寿司', '焼肉', '中華',
        'イタリアン', 'フレンチ', 'ステーキ', 'ハンバーグ', 'パン', 'ケーキ'
      ],
      
      '食品・飲料': [
        'お米', '米', 'コメ', '酒', '日本酒', 'ワイン', 'ビール', '飲料',
        'ジュース', 'お茶', 'コーヒー', '紅茶', '水', 'ミネラルウォーター',
        '調味料', '醤油', '味噌', 'ソース', '油', 'オリーブオイル', '調理',
        'レトルト', '缶詰', '冷凍食品', 'インスタント', 'お菓子', 'スイーツ',
        'チョコレート', 'クッキー', 'せんべい', '和菓子', '洋菓子', '菓子',
        '食品', '食材', '野菜', '果物', 'フルーツ', '肉', '魚', '海産物'
      ],
      
      '日用品・生活用品': [
        'タオル', '洗剤', 'シャンプー', 'ボディソープ', '石鹸', 'ティッシュ',
        'トイレットペーパー', '生活用品', '日用品', '雑貨', 'キッチン用品',
        '掃除用品', '文房具', 'ノート', 'ペン', '家庭用品', '消耗品'
      ],
      
      '商品券・ギフトカード': [
        '商品券', 'ギフトカード', 'ギフト券', '百貨店', 'デパート', 
        'jcbギフト', 'ucギフト', 'visa商品券', 'ギフトカタログ', '商品カード',
        'プリペイドカード', 'ギフトコード'
      ],
      
      'QUOカード・図書カード': [
        'quoカード', 'クオカード', '図書カード', '図書券', 'quo', 'ブックカード',
        '図書', '書籍購入'
      ],
      
      '割引券・優待券': [
        '割引券', '優待券', '優待割引', '割引', 'クーポン', '％割引', '%割引', 
        '半額', '無料', 'サービス券', '特典券', '利用券', '招待券', '入場券',
        '施設利用', '優先', '特別価格', 'off', 'オフ', '値引', '特価'
      ],
      
      '株主優待カード': [
        '株主優待カード', '優待カード', '株主カード', 'メンバーカード',
        '会員カード', 'ゴールドカード', 'プレミアムカード'
      ],
      
      '自社製品・商品': [
        '自社製品', '自社商品', '商品', '製品', 'オリジナル', '自社ブランド',
        'プライベートブランド', '限定商品', '新商品', '商品詰合せ', '詰め合わせ',
        'セット', 'パック', '自社グループ', 'オリジナル商品'
      ],
      
      'カタログギフト': [
        'カタログギフト', 'カタログ', 'ギフトセット', 'セレクトギフト',
        'チョイスギフト', '選択ギフト', 'カタログから選択', 'ギフト選択',
        'カタログ掲載', '掲載商品', 'フリーチョイス'
      ],
      
      'ポイント・電子マネー': [
        'ポイント', '電子マネー', 'edy', 'waon', 'nanaco', 'suica', 'icoca',
        'paypay', 'dポイント', 'tポイント', 'マイル', '楽天ポイント',
        'ポイント付与', 'ポイント進呈', 'ポイントバック'
      ],
      
      '宿泊・レジャー': [
        '宿泊券', 'ホテル', '温泉', 'レジャー', '旅行', 'ゴルフ', 'スキー',
        '遊園地', 'テーマパーク', 'リゾート', '宿泊優待', '入場券', 'チケット',
        'アトラクション', '観光', 'ツアー', '旅館', '民宿', 'ペンション'
      ],
      
      'スポーツ・フィットネス': [
        'スポーツ', 'フィットネス', 'ジム', 'ヨガ', 'プール', 'テニス',
        'ボウリング', 'カラオケ', 'ゲーム', 'アミューズメント', 'スポーツクラブ',
        'フィットネスクラブ', 'トレーニング'
      ],
      
      '交通・乗車券': [
        '乗車券', '航空券', '交通費', '電車', 'バス', '航空', 'タクシー',
        '回数券', '定期券', '乗車証', '運賃割引', '交通', '乗り物'
      ],
      
      '金券・現金': [
        '現金', '金券', 'お米券', '全国百貨店共通商品券', 'ビール券',
        '生ビール', 'おこめ券', '米穀券'
      ],
      
      '寄付選択制': [
        '寄付', '社会貢献', '地域貢献', '慈善', 'npo', 'ユニセフ',
        '災害支援', '環境保護', '教育支援', 'ボランティア', '支援'
      ],
      
      '美容・健康': [
        'コスメ', '化粧品', 'スキンケア', '美容', 'エステ', 'マッサージ',
        '健康食品', 'サプリメント', 'ヘアケア', '美容院', 'ヘアサロン',
        'ネイル', 'まつげ', '脱毛', '健康', 'ヘルスケア', '医療'
      ],
      
      '本・雑誌・エンタメ': [
        '書籍', '雑誌', '本', 'dvd', 'cd', '音楽', '映画', 'ゲーム',
        'コンサート', '演劇', '舞台', 'ライブ', 'イベント', '展覧会',
        '美術館', '博物館', '動画', '配信', 'サブスクリプション'
      ],
      
      '通信販売・ECサイト': [
        '通販', 'オンラインショップ', 'ecサイト', 'ネットショップ',
        'ウェブショップ', 'オンライン', '通信販売', 'ショッピングサイト',
        'クーポンコード', 'プロモーションコード'
      ],
      
      '地域特産品': [
        '特産品', '名産品', '地域', '地元', 'ご当地', '産地直送',
        '地方', '郷土', '名物', '特産', '名産', '産直'
      ]
    };
  }

  // 優待内容から具体的な商品を抽出
  extractSpecificItems(description) {
    const items = [];
    
    // 金額パターン
    const amountMatches = description.match(/(\d{1,3}(?:,\d{3})*)\s*円/g);
    if (amountMatches) {
      items.push(...amountMatches);
    }
    
    // 数量パターン
    const quantityMatches = description.match(/(\d+)\s*[枚個本袋箱セット]/g);
    if (quantityMatches) {
      items.push(...quantityMatches);
    }
    
    // 商品名パターン（「」で囲まれたもの）
    const productMatches = description.match(/「([^」]+)」/g);
    if (productMatches) {
      items.push(...productMatches);
    }
    
    // 具体的な商品名（カタカナ・英数字の連続）
    const specificMatches = description.match(/[ァ-ヶー]{3,}|[A-Za-z]{3,}/g);
    if (specificMatches) {
      items.push(...specificMatches.filter(m => m.length <= 20));
    }
    
    return items;
  }

  // 優待内容をより理解しやすい形に整形
  formatBenefitDescription(benefit) {
    const { description, monetary_value, min_shares } = benefit;
    const items = this.extractSpecificItems(description);
    
    // 短い説明文の生成
    let shortDesc = description.substring(0, 50);
    
    // 金額が明確な場合
    if (monetary_value > 0) {
      shortDesc = `${monetary_value}円相当`;
      if (items.length > 0) {
        shortDesc += `（${items[0]}）`;
      }
    }
    
    // 枚数や個数が明確な場合
    const quantityMatch = description.match(/(\d+)\s*[枚個本]/);
    if (quantityMatch) {
      shortDesc = quantityMatch[0];
      const productMatch = description.match(/([^、。\s]{2,10})[をが]/);
      if (productMatch) {
        shortDesc = `${productMatch[1]} ${quantityMatch[0]}`;
      }
    }
    
    return {
      shortDescription: shortDesc,
      fullDescription: description,
      extractedItems: items,
      requiredShares: min_shares,
      value: monetary_value
    };
  }

  // 「その他」カテゴリの詳細分析
  async analyzeOtherCategory() {
    const otherBenefits = await new Promise((resolve, reject) => {
      this.db.db.all(`
        SELECT sb.*, s.name as company_name
        FROM shareholder_benefits sb
        JOIN stocks s ON sb.stock_code = s.code
        WHERE sb.benefit_type = 'その他'
        ORDER BY sb.stock_code
        LIMIT 100
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log(`\n=== 「その他」カテゴリ詳細分析（サンプル100件） ===\n`);

    const classifications = this.getEnhancedClassifications();
    const reclassified = {};
    const unclassified = [];

    for (const benefit of otherBenefits) {
      let classified = false;
      const desc = benefit.description.toLowerCase();
      
      for (const [category, keywords] of Object.entries(classifications)) {
        for (const keyword of keywords) {
          if (desc.includes(keyword.toLowerCase())) {
            if (!reclassified[category]) {
              reclassified[category] = [];
            }
            reclassified[category].push({
              company: benefit.company_name,
              formatted: this.formatBenefitDescription(benefit)
            });
            classified = true;
            break;
          }
        }
        if (classified) break;
      }
      
      if (!classified) {
        unclassified.push({
          company: benefit.company_name,
          description: benefit.description,
          formatted: this.formatBenefitDescription(benefit)
        });
      }
    }

    // 結果表示
    console.log('【再分類可能な優待】');
    for (const [category, items] of Object.entries(reclassified)) {
      console.log(`\n${category}（${items.length}件）:`);
      items.slice(0, 3).forEach(item => {
        console.log(`  - ${item.company}: ${item.formatted.shortDescription}`);
      });
    }

    console.log('\n【分類困難な優待（真の「その他」）】');
    unclassified.slice(0, 10).forEach(item => {
      console.log(`  - ${item.company}: ${item.formatted.shortDescription}`);
      console.log(`    詳細: ${item.description.substring(0, 100)}...`);
    });

    return { reclassified, unclassified };
  }

  // 全「その他」の一括更新
  async updateAllOtherBenefits() {
    console.log('\n=== 全「その他」カテゴリの更新開始 ===');
    
    const allOthers = await new Promise((resolve, reject) => {
      this.db.db.all(`
        SELECT id, description 
        FROM shareholder_benefits 
        WHERE benefit_type = 'その他'
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const classifications = this.getEnhancedClassifications();
    let updateCount = 0;

    for (const benefit of allOthers) {
      const desc = benefit.description.toLowerCase();
      
      for (const [category, keywords] of Object.entries(classifications)) {
        let matched = false;
        for (const keyword of keywords) {
          if (desc.includes(keyword.toLowerCase())) {
            await new Promise((resolve, reject) => {
              this.db.db.run(`
                UPDATE shareholder_benefits 
                SET benefit_type = ? 
                WHERE id = ?
              `, [category, benefit.id], (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
            updateCount++;
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
    }

    console.log(`✓ ${updateCount}件を再分類`);
    
    // 統計表示
    await this.showFinalStats();
  }

  // 最終統計
  async showFinalStats() {
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

    console.log('\n=== 最終分類統計 ===');
    stats.forEach(stat => {
      const percentage = (stat.count / stats.reduce((sum, s) => sum + s.count, 0) * 100).toFixed(1);
      console.log(`  ${stat.benefit_type}: ${stat.count}件 (${percentage}%)`);
    });
  }

  // メイン実行
  async execute() {
    try {
      console.log('=== 優待内容詳細分析開始 ===');

      // 1. サンプル分析
      const analysis = await this.analyzeOtherCategory();

      // 2. 全データ更新
      await this.updateAllOtherBenefits();

      console.log('\n=== 分析完了 ===');

    } catch (error) {
      console.error('Error:', error);
    }
  }
}

// 実行
const analyzer = new OtherBenefitsDetailAnalyzer();
analyzer.execute()
  .then(() => analyzer.close())
  .catch(error => {
    console.error('Fatal error:', error);
    analyzer.close();
  });