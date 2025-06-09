import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new sqlite3.Database(path.join(__dirname, 'db', 'yuutai.db'));
const dbGet = promisify(db.get.bind(db));
const dbAll = promisify(db.all.bind(db));

async function investigate() {
  console.log('=== 優待データベース調査レポート ===\n');

  // 1. データベースの基本統計
  console.log('1. データベース基本統計:');
  const totalStocks = (await dbGet('SELECT COUNT(*) as count FROM stocks')).count;
  const stocksWithBenefits = (await dbGet('SELECT COUNT(DISTINCT stock_code) as count FROM shareholder_benefits')).count;
  const totalBenefits = (await dbGet('SELECT COUNT(*) as count FROM shareholder_benefits')).count;

console.log(`  - 全銘柄数: ${totalStocks}`);
console.log(`  - 優待がある銘柄数: ${stocksWithBenefits}`);
console.log(`  - 優待総数: ${totalBenefits}`);
console.log(`  - 優待カバー率: ${(stocksWithBenefits / totalStocks * 100).toFixed(2)}%\n`);

  // 2. 証券コード範囲の分析
  console.log('2. 証券コード範囲の分析:');
  const codeRanges = await dbGet(`
    SELECT 
      MIN(code) as min_code,
      MAX(code) as max_code,
      COUNT(*) as count
    FROM stocks
  `);

console.log(`  - 最小コード: ${codeRanges.min_code}`);
console.log(`  - 最大コード: ${codeRanges.max_code}`);
console.log(`  - 登録銘柄数: ${codeRanges.count}\n`);

  // 3. 千の位ごとの分布
  console.log('3. 証券コード千の位ごとの分布:');
  const distribution = await dbAll(`
    SELECT 
      SUBSTR(s.code, 1, 1) as thousand,
      COUNT(DISTINCT s.code) as total_stocks,
      COUNT(DISTINCT sb.stock_code) as stocks_with_benefits
    FROM stocks s
    LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
    GROUP BY thousand
    ORDER BY thousand
  `);

distribution.forEach(row => {
  const coverageRate = row.total_stocks > 0 ? (row.stocks_with_benefits / row.total_stocks * 100).toFixed(1) : '0.0';
  console.log(`  - ${row.thousand}000番台: 全${row.total_stocks}銘柄, 優待${row.stocks_with_benefits}銘柄 (カバー率: ${coverageRate}%)`);
});

  // 4. Oriental Land (4661) の検索
  console.log('\n4. Oriental Land (4661) の検索:');
  const orientalLand = await dbGet(`
    SELECT s.*, sb.id as benefit_id
    FROM stocks s
    LEFT JOIN shareholder_benefits sb ON s.code = sb.stock_code
    WHERE s.code = '4661'
  `);

if (orientalLand) {
  console.log(`  - 銘柄名: ${orientalLand.name}`);
  console.log(`  - 証券コード: ${orientalLand.code}`);
  console.log(`  - 優待情報: ${orientalLand.benefit_id ? 'あり' : 'なし'}`);
} else {
  console.log('  - Oriental Land (4661) は登録されていません');
}

  // 5. 4000番台の詳細調査
  console.log('\n5. 4000番台の詳細調査:');
  const range4000 = await dbGet(`
    SELECT 
      MIN(CAST(code AS INTEGER)) as min_code,
      MAX(CAST(code AS INTEGER)) as max_code,
      COUNT(*) as count
    FROM stocks
    WHERE code BETWEEN '4000' AND '4999'
  `);

console.log(`  - 4000番台の範囲: ${range4000.min_code} ～ ${range4000.max_code}`);
console.log(`  - 登録数: ${range4000.count}`);

  // 4600番台の詳細
  const range4600 = await dbAll(`
    SELECT code, name
    FROM stocks
    WHERE code BETWEEN '4600' AND '4699'
    ORDER BY code
  `);

console.log('\n  4600番台の銘柄一覧:');
range4600.forEach(stock => {
  console.log(`    - ${stock.code}: ${stock.name}`);
});

  // 6. スクレイピング範囲の推定
  console.log('\n6. スクレイピング範囲の推定:');
  const gaps = [];
  for (let i = 1000; i < 10000; i += 100) {
    const rangeCount = await dbGet(
      `SELECT COUNT(*) as count FROM stocks WHERE code BETWEEN ? AND ?`,
      [i.toString(), (i + 99).toString()]
    );
    
    if (rangeCount.count === 0) {
      gaps.push(`${i}-${i + 99}`);
    }
  }

if (gaps.length > 0) {
  console.log('  欠落している範囲:');
  gaps.forEach(gap => console.log(`    - ${gap}`));
} else {
  console.log('  欠落している範囲はありません');
}

  // 7. 優待情報の最終更新日
  console.log('\n7. 優待情報の更新状況:');
  const updateInfo = await dbGet(`
    SELECT 
      MIN(created_at) as oldest,
      MAX(created_at) as newest,
      COUNT(DISTINCT DATE(created_at)) as update_days
    FROM shareholder_benefits
  `);

console.log(`  - 最古の登録: ${updateInfo.oldest || 'なし'}`);
console.log(`  - 最新の登録: ${updateInfo.newest || 'なし'}`);
console.log(`  - 更新日数: ${updateInfo.update_days}`);

// 8. 推奨事項
console.log('\n8. 推奨事項:');
console.log('  1. 4600番台の銘柄が欠落している可能性が高い');
console.log('  2. 全銘柄を確実にカバーするため、1000-9999の全範囲をスクレイピングすべき');
console.log('  3. 定期的な更新メカニズムの実装が必要');
console.log('  4. スクレイピング時のエラーハンドリングとログの強化が必要');

// 9. 具体的な解決策
console.log('\n9. 具体的な解決策:');
console.log('  - scraper.jsを修正して全範囲（1000-9999）をカバー');
console.log('  - 各範囲のスクレイピング状況をログに記録');
console.log('  - エラー時のリトライ機能を実装');
console.log('  - 進捗状況をリアルタイムで表示');

  db.close();
}

investigate().catch(console.error);