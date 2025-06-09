import { Database } from './database.js';

// 「その他」分類を10%未満にする包括的再分類
class ComprehensiveBenefitReclassifier {
  constructor() {
    this.db = new Database();
  }

  async close() {
    this.db.close();
  }

  // さらに詳細な分類ルール
  getDetailedClassifications() {
    return {
      '食事券・グルメ券': [
        // レストラン・ファストフード
        '食事券', '飲食券', 'グルメ券', 'お食事券', '食事割引', '飲食割引', 
        'レストラン', 'カフェ', '喫茶', 'ファミレス', 'ファストフード',
        '焼肉', '寿司', 'ラーメン', 'うどん', 'そば', '中華', 'イタリアン',
        'フレンチ', 'ステーキ', 'ハンバーグ', 'カレー', 'パン', 'ケーキ',
        'スイーツ', 'デザート', 'バイキング', 'ビュッフェ', '食べ放題',
        'ランチ', 'ディナー', 'モーニング', '朝食', '昼食', '夕食',
        'テイクアウト', 'デリバリー', '宅配', '出前', 'ドリンク', '飲み物'
      ],
      
      '食品・飲料': [
        // 食品・飲料製品
        'お米', '米', 'コメ', '新潟産', 'コシヒカリ', 'ひとめぼれ', 'あきたこまち',
        '酒', '日本酒', 'ワイン', 'ビール', '焼酎', 'ウイスキー', '梅酒',
        '飲料', 'ジュース', 'お茶', 'コーヒー', '紅茶', '水', 'ミネラルウォーター',
        '調味料', '醤油', '味噌', 'ソース', '油', 'マヨネーズ', 'ドレッシング',
        'レトルト', '缶詰', '冷凍食品', 'インスタント', 'カップ麺', '即席',
        'お菓子', '菓子', 'スナック', 'チョコレート', 'クッキー', 'せんべい',
        '和菓子', '洋菓子', 'アイス', 'プリン', 'ゼリー', 'ヨーグルト',
        '食品', '食材', '野菜', '果物', 'フルーツ', '肉', '魚', '海産物',
        'ハム', 'ソーセージ', 'チーズ', '乳製品', '卵', 'たまご',
        '健康食品', 'サプリメント', '栄養', 'ビタミン', 'プロテイン'
      ],
      
      '商品券・ギフトカード': [
        // 汎用商品券
        '商品券', 'ギフトカード', 'ギフト券', '金券', 'プリペイドカード',
        '百貨店', 'デパート', '共通商品券', '全国共通', 'jcb', 'ucギフト',
        'visa', 'ビザ', 'マスターカード', 'アメリカンエキスプレス',
        'ギフトコード', 'デジタルギフト', '電子ギフト', 'eギフト'
      ],
      
      'QUOカード・図書カード': [
        'quoカード', 'クオカード', 'quo', 'ｑｕｏ', 'ＱＵＯ',
        '図書カード', '図書券', '書籍購入', 'ブックカード', '本の購入'
      ],
      
      '割引券・優待券': [
        // 割引・優待全般
        '割引券', '優待券', '優待割引', '割引', '値引', 'クーポン',
        '％割引', '%割引', '％off', '%off', '％オフ', '%オフ',
        '半額', '無料券', 'サービス券', '特典券', '利用券', '招待券',
        '入場券', '入園券', 'チケット', '施設利用', '優先', '特別価格',
        '優待価格', '会員価格', 'メンバー価格', '株主価格', '特価'
      ],
      
      '買物券・店舗利用券': [
        // 特定店舗の利用券
        '買物券', '買い物券', 'お買物券', 'お買い物券', 'ショッピング',
        '店舗利用', '店頭', '売店', '売場', '購入券', '引換券',
        'お買上', '買上券', '利用券', '店舗', '店内'
      ],
      
      '株主優待カード': [
        // 継続利用型カード
        '株主優待カード', '優待カード', '株主カード', 'メンバーカード',
        '会員カード', 'ゴールドカード', 'プレミアムカード', 'vipカード',
        '優待パスポート', '株主パスポート', '継続割引'
      ],
      
      '自社製品・商品': [
        // 自社関連商品
        '自社製品', '自社商品', 'オリジナル商品', '自社ブランド',
        'プライベートブランド', 'pb商品', '限定商品', '新商品',
        '商品詰合せ', '詰め合わせ', 'セット', 'パック', '自社グループ',
        'オリジナル', '特製', '自社', '当社', 'グループ商品'
      ],
      
      'カタログギフト': [
        // カタログ選択型
        'カタログギフト', 'カタログ', 'ギフトカタログ', 'セレクトギフト',
        'チョイスギフト', '選択ギフト', 'カタログから選択', 'ギフト選択',
        'カタログ掲載', '掲載商品', 'フリーチョイス', 'セレクション',
        'チョイス', '選べる', '選択式', 'から選択', 'より選択'
      ],
      
      'ポイント・電子マネー': [
        // デジタル決済・ポイント
        'ポイント', '電子マネー', 'ポイント付与', 'ポイント進呈',
        'edy', 'waon', 'nanaco', 'suica', 'icoca', 'pasmo',
        'paypay', 'ペイペイ', 'linepay', 'メルペイ', 'd払い',
        'dポイント', 'tポイント', '楽天ポイント', 'pontaポイント',
        'マイル', 'マイレージ', 'ポイントバック', 'キャッシュバック'
      ],
      
      '宿泊・レジャー': [
        // 宿泊・観光・娯楽
        '宿泊券', 'ホテル', '旅館', '温泉', 'リゾート', '宿泊優待',
        'レジャー', '観光', 'ツアー', '旅行', 'トラベル', '民宿',
        'ペンション', 'コテージ', 'グランピング', 'キャンプ',
        'ゴルフ', 'スキー', 'スノボ', 'テーマパーク', '遊園地',
        'アトラクション', '入場', '入園', 'パスポート'
      ],
      
      'スポーツ・フィットネス': [
        // スポーツ・健康施設
        'スポーツ', 'フィットネス', 'ジム', 'トレーニング', 'ヨガ',
        'プール', 'スイミング', 'テニス', 'ゴルフ', 'ボウリング',
        'カラオケ', 'ゲーム', 'アミューズメント', 'スポーツクラブ',
        'フィットネスクラブ', 'エクササイズ', '運動', '体育'
      ],
      
      '交通・乗車券': [
        // 交通機関
        '乗車券', '航空券', '搭乗', 'フライト', '交通', '電車',
        'バス', 'タクシー', '新幹線', '特急', '回数券', '定期券',
        '乗車証', '運賃', '交通費', '乗り物', '鉄道', 'jr'
      ],
      
      '金券・現金相当': [
        // 現金同等物
        '現金', '金券', 'お米券', '米穀券', 'ビール券', 'おこめ券',
        '全国百貨店共通商品券', '百貨店商品券', '商品券', '共通券'
      ],
      
      '寄付・社会貢献': [
        // 寄付・CSR
        '寄付', '社会貢献', '地域貢献', '慈善', 'npo', 'ユニセフ',
        '災害支援', '環境保護', '教育支援', 'ボランティア', '支援',
        'チャリティ', '募金', '福祉', 'csr', '社会活動'
      ],
      
      '美容・健康・医療': [
        // 美容・健康関連
        'コスメ', '化粧品', 'スキンケア', '美容', 'エステ', 'マッサージ',
        'ヘアケア', '美容院', 'ヘアサロン', 'ネイル', 'まつげ', '脱毛',
        '健康', 'ヘルスケア', '医療', '薬', 'ドラッグストア', '調剤'
      ],
      
      '本・雑誌・エンタメ': [
        // 書籍・エンターテインメント
        '書籍', '雑誌', '本', '読書', 'dvd', 'cd', '音楽', '映画',
        'ゲーム', 'コンサート', '演劇', '舞台', 'ライブ', 'イベント',
        '展覧会', '美術館', '博物館', '動画', '配信', 'サブスク'
      ],
      
      '通信販売・ECサイト': [
        // オンラインショッピング
        '通販', 'オンラインショップ', 'ecサイト', 'ネットショップ',
        'ウェブショップ', 'オンライン', '通信販売', 'ショッピングサイト',
        'クーポンコード', 'プロモーションコード', 'ネット限定'
      ],
      
      '地域特産品・名産品': [
        // 地域商品
        '特産品', '名産品', '地域', '地元', 'ご当地', '産地直送',
        '地方', '郷土', '名物', '特産', '名産', '産直', '地場産'
      ],
      
      '日用品・生活用品': [
        // 日常生活用品
        'タオル', '洗剤', 'シャンプー', 'ボディソープ', '石鹸',
        'ティッシュ', 'トイレットペーパー', '生活用品', '日用品',
        '雑貨', 'キッチン用品', '掃除用品', '文房具', '消耗品'
      ],
      
      '家電・家具・インテリア': [
        // 家電・家具
        '家電', '電化製品', '家具', 'インテリア', 'ソファ', 'ベッド',
        'テーブル', '椅子', '照明', 'カーテン', 'ラグ', 'マット'
      ],
      
      '入場券・チケット': [
        // イベント・施設入場
        '入場券', 'チケット', 'パスポート', '入園', '入館', 'ディズニー',
        'usj', 'ユニバーサル', '水族館', '動物園', '植物園', '科学館'
      ],
      
      '金融・保険サービス': [
        // 金融関連
        '金融', '銀行', '証券', '保険', '手数料', 'atm', '振込',
        'ローン', '金利', '優遇', '投資', '資産運用', 'nisa'
      ]
    };
  }

  // 優待内容を詳細に分析して分類
  classifyBenefit(description, stockCode = null) {
    if (!description) return 'その他';
    
    const desc = description.toLowerCase();
    const classifications = this.getDetailedClassifications();
    
    // 特殊パターンの優先処理
    // 1. 長期保有条件付きの金額表記
    if (/【\d+[年カ月]以上保有株主】/.test(description) || /\d+[年カ月]以上保有[:：]/.test(description)) {
      // 内容を抽出
      const contentMatch = description.match(/】(.+)$/) || description.match(/[:：]\s*(.+)$/);
      if (contentMatch) {
        const content = contentMatch[1].toLowerCase();
        if (/^\d{1,5}円相当?$/.test(content.trim()) || /\d{1,5}円相当/.test(content)) {
          return '商品券・ギフトカード';
        }
        // 再帰的に内容部分を分類
        return this.classifyBenefit(contentMatch[1], stockCode);
      }
    }
    
    // 2. 単純な金額表記（X円相当）
    if (/^\d{1,5}円相当?$/.test(desc.trim()) || /^\d{1,3},\d{3}円相当?$/.test(desc.trim())) {
      return '商品券・ギフトカード';
    }
    
    // 3. 枚数のみの記載
    if (/^\d+枚$/.test(desc.trim())) {
      return '割引券・優待券';
    }
    
    // 4. 利用券パターン
    if (/利用券\d+枚/.test(desc) || /\d+枚.*利用券/.test(desc)) {
      return '買物券・店舗利用券';
    }
    
    // 5. 優待券パターン
    if (/優待券\d+枚/.test(desc) || /\d+枚.*優待券/.test(desc)) {
      return '割引券・優待券';
    }
    
    // スコアリングシステム（複数キーワードマッチでより正確に）
    let bestCategory = 'その他';
    let bestScore = 0;
    
    for (const [category, keywords] of Object.entries(classifications)) {
      let score = 0;
      for (const keyword of keywords) {
        if (desc.includes(keyword.toLowerCase())) {
          score += keyword.length; // 長いキーワードほど重要
        }
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }
    
    // 最終的なフォールバック
    if (bestScore === 0) {
      // 金額が含まれている場合
      if (/\d{1,5}円/.test(desc)) {
        return '商品券・ギフトカード';
      }
      // 割引率が含まれている場合
      if (/\d+[%％]/.test(desc)) {
        return '割引券・優待券';
      }
    }
    
    return bestCategory;
  }

  // 全「その他」の再分類実行
  async reclassifyAllOthers() {
    console.log('=== 「その他」分類の包括的再分類開始 ===\n');
    
    const otherBenefits = await new Promise((resolve, reject) => {
      this.db.db.all(`
        SELECT id, stock_code, description, monetary_value
        FROM shareholder_benefits
        WHERE benefit_type = 'その他'
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`対象: ${otherBenefits.length}件`);
    
    const updates = {};
    
    for (const benefit of otherBenefits) {
      const newType = this.classifyBenefit(benefit.description, benefit.stock_code);
      
      if (!updates[newType]) {
        updates[newType] = [];
      }
      updates[newType].push(benefit);
    }
    
    // 分類結果のプレビュー
    console.log('\n分類結果プレビュー:');
    for (const [type, benefits] of Object.entries(updates)) {
      console.log(`\n${type}: ${benefits.length}件`);
      // サンプル表示
      benefits.slice(0, 2).forEach(b => {
        console.log(`  - ${b.description.substring(0, 60)}...`);
      });
    }
    
    // データベース更新
    console.log('\n=== データベース更新開始 ===');
    let updateCount = 0;
    
    for (const [type, benefits] of Object.entries(updates)) {
      if (type !== 'その他') {
        for (const benefit of benefits) {
          await new Promise((resolve, reject) => {
            this.db.db.run(`
              UPDATE shareholder_benefits
              SET benefit_type = ?
              WHERE id = ?
            `, [type, benefit.id], (err) => {
              if (err) reject(err);
              else {
                updateCount++;
                resolve();
              }
            });
          });
        }
      }
    }
    
    console.log(`✓ ${updateCount}件を再分類`);
    
    // 最終統計
    await this.showFinalStats();
  }

  // 最終統計表示
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
    
    const total = stats.reduce((sum, s) => sum + s.count, 0);
    const otherCount = stats.find(s => s.benefit_type === 'その他')?.count || 0;
    const otherPercentage = (otherCount / total * 100).toFixed(1);
    
    console.log('\n=== 最終分類統計 ===');
    console.log(`総優待数: ${total}件`);
    console.log('-'.repeat(60));
    
    stats.forEach(stat => {
      const percentage = (stat.count / total * 100).toFixed(1);
      const bar = '■'.repeat(Math.floor(percentage / 2));
      console.log(`${stat.benefit_type.padEnd(25)} ${stat.count.toString().padStart(4)}件 (${percentage.padStart(5)}%) ${bar}`);
    });
    
    console.log('-'.repeat(60));
    console.log(`\n「その他」分類: ${otherCount}件 (${otherPercentage}%)`);
    
    if (otherPercentage < 10) {
      console.log('✅ 目標達成！「その他」分類が10%未満になりました。');
    } else {
      console.log(`❌ 目標未達成。あと${(otherCount - Math.floor(total * 0.1))}件の再分類が必要です。`);
    }
  }

  // メイン実行
  async execute() {
    try {
      await this.reclassifyAllOthers();
      console.log('\n=== 再分類完了 ===');
    } catch (error) {
      console.error('Error:', error);
    }
  }
}

// 実行
const reclassifier = new ComprehensiveBenefitReclassifier();
reclassifier.execute()
  .then(() => reclassifier.close())
  .catch(error => {
    console.error('Fatal error:', error);
    reclassifier.close();
  });