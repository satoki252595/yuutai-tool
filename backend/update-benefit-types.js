import { Database } from './database.js';

// 優待品ジャンルを新しい分類に更新するスクリプト
async function updateBenefitTypes() {
  const db = new Database();
  
  console.log('=== 優待品ジャンルの更新開始 ===');
  
  try {
    // 改善されたジャンル分類ロジック（scraperと同じ）
    function detectBenefitType(description) {
      const desc = description.toLowerCase();
      
      // 食事券・グルメ券
      if (desc.includes('食事券') || desc.includes('グルメ券') || desc.includes('飲食') || 
          desc.includes('レストラン') || desc.includes('食べ物') || desc.includes('弁当') ||
          desc.includes('お米') || desc.includes('肉') || desc.includes('魚') || desc.includes('野菜')) {
        return '食事券・グルメ券';
      }
      
      // QUOカード・図書カード
      if (desc.includes('クオカード') || desc.includes('quo') || desc.includes('図書カード') || 
          desc.includes('図書券') || desc.includes('ブックカード')) {
        return 'QUOカード・図書カード';
      }
      
      // 商品券・ギフトカード
      if (desc.includes('商品券') || desc.includes('ギフトカード') || desc.includes('ギフト券') ||
          desc.includes('百貨店') || desc.includes('デパート') || desc.includes('ショッピング')) {
        return '商品券・ギフトカード';
      }
      
      // ポイント・電子マネー
      if (desc.includes('ポイント') || desc.includes('電子マネー') || desc.includes('nanaco') || 
          desc.includes('waon') || desc.includes('suica') || desc.includes('pasmo') ||
          desc.includes('キャッシュバック') || desc.includes('tポイント')) {
        return 'ポイント・電子マネー';
      }
      
      // 宿泊・レジャー
      if (desc.includes('宿泊') || desc.includes('ホテル') || desc.includes('温泉') || 
          desc.includes('旅行') || desc.includes('レジャー') || desc.includes('遊園地') ||
          desc.includes('映画') || desc.includes('観光') || desc.includes('入場券')) {
        return '宿泊・レジャー';
      }
      
      // 交通・乗車券
      if (desc.includes('乗車券') || desc.includes('電車') || desc.includes('バス') || 
          desc.includes('航空券') || desc.includes('交通') || desc.includes('タクシー') ||
          desc.includes('鉄道') || desc.includes('運賃')) {
        return '交通・乗車券';
      }
      
      // 自社製品・商品
      if (desc.includes('自社製品') || desc.includes('自社商品') || desc.includes('商品詰め合わせ') ||
          desc.includes('化粧品') || desc.includes('衣料品') || desc.includes('雑貨')) {
        return '自社製品・商品';
      }
      
      // カタログギフト
      if (desc.includes('カタログ') || desc.includes('選択制')) {
        return 'カタログギフト';
      }
      
      // 寄付選択制
      if (desc.includes('寄付') || desc.includes('寄贈') || desc.includes('社会貢献')) {
        return '寄付選択制';
      }
      
      // 金券・現金
      if (desc.includes('現金') || desc.includes('金券') || desc.includes('500円券') ||
          desc.includes('1000円券') || desc.includes('お買い物券')) {
        return '金券・現金';
      }
      
      // 割引券・優待券
      if (desc.includes('優待券') || desc.includes('割引券') || desc.includes('割引') || 
          desc.includes('優待カード') || desc.includes('%off') || desc.includes('％off')) {
        return '割引券・優待券';
      }
      
      return 'その他';
    }
    
    // 全ての優待情報を取得
    const benefits = await new Promise((resolve, reject) => {
      db.db.all('SELECT id, description, benefit_type FROM shareholder_benefits', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`${benefits.length}件の優待情報を更新中...`);
    
    let updatedCount = 0;
    
    // バッチ更新
    for (const benefit of benefits) {
      const newType = detectBenefitType(benefit.description);
      
      if (newType !== benefit.benefit_type) {
        await new Promise((resolve, reject) => {
          db.db.run(
            'UPDATE shareholder_benefits SET benefit_type = ? WHERE id = ?',
            [newType, benefit.id],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
        
        updatedCount++;
        console.log(`更新: ${benefit.benefit_type} → ${newType} (${benefit.description.substring(0, 50)}...)`);
      }
    }
    
    console.log(`\n=== 更新完了 ===`);
    console.log(`総件数: ${benefits.length}`);
    console.log(`更新件数: ${updatedCount}`);
    
    // 更新後のジャンル分布を確認
    const distribution = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT benefit_type, COUNT(*) as count 
        FROM shareholder_benefits 
        GROUP BY benefit_type 
        ORDER BY count DESC
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('\n優待ジャンル分布:');
    distribution.forEach(row => {
      console.log(`  ${row.benefit_type}: ${row.count}件`);
    });
    
  } catch (error) {
    console.error('更新エラー:', error);
  } finally {
    db.close();
  }
}

// 実行
updateBenefitTypes().catch(console.error);