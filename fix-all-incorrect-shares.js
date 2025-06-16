import { Database } from './backend/database.js';
import { ShareholderBenefitScraper } from './backend/scraper.js';

console.log('=== 誤った株数データの修正開始 ===\n');

const db = new Database();

// 前回一律100株に修正されたデータの中から、実際は違う株数のものを特定
const problematicCodes = [
  '9980', // MRKホールディングス
  '8200', // リンガーハット（段階的な株数）
  '9409', // テレビ朝日（1株優待あり）
  '7203', // トヨタ（段階的な株数）
  '3469'  // デュアルタップ
];

console.log('前回一律修正された可能性のある銘柄を再スクレイピングします...\n');

const scraper = new ShareholderBenefitScraper();

try {
  // 対象銘柄の優待データを削除
  for (const code of problematicCodes) {
    await db.deleteBenefitsByStockCode(code);
    console.log(`✓ ${code}: 既存優待データを削除`);
  }
  
  // 修正されたロジックで再スクレイピング
  console.log('\n修正されたロジックで再スクレイピング中...');
  await scraper.scrapeStocks(problematicCodes);
  
  console.log('\n=== 修正結果確認 ===');
  
  // 結果を確認
  for (const code of problematicCodes) {
    const benefits = await db.getBenefitsByStockCode(code);
    if (benefits.length > 0) {
      console.log(`\n${code}: ${benefits.length}件の優待情報`);
      
      // 株数ごとにグループ化
      const shareGroups = {};
      benefits.forEach(benefit => {
        const shares = benefit.min_shares;
        if (!shareGroups[shares]) {
          shareGroups[shares] = [];
        }
        shareGroups[shares].push(benefit);
      });
      
      Object.keys(shareGroups).sort((a, b) => parseInt(a) - parseInt(b)).forEach(shares => {
        const count = shareGroups[shares].length;
        const content = shareGroups[shares][0].benefit_content?.substring(0, 50) || '内容なし';
        console.log(`  ${shares}株以上: ${count}件 (例: ${content}...)`);
      });
    } else {
      console.log(`${code}: 優待情報なし`);
    }
  }
  
} catch (error) {
  console.error('エラー:', error);
} finally {
  db.close();
}

console.log('\n=== 修正完了 ===');