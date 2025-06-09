import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';

// テスト用の簡易スクレイパー
async function testScrapeAndSave() {
  const db = new Database();
  const yahooFinance = new YahooFinanceService();
  
  console.log('=== スクレイピングテスト開始 ===');
  
  // テスト用の優待銘柄リスト（確実に優待がある銘柄）
  const testStocks = [
    { code: '3197', name: 'すかいらーくホールディングス' },
    { code: '7412', name: 'アトム' },
    { code: '8267', name: 'イオン' },
    { code: '2702', name: '日本マクドナルドホールディングス' },
    { code: '9861', name: '吉野家ホールディングス' }
  ];
  
  for (const stock of testStocks) {
    console.log(`\n処理中: ${stock.code} - ${stock.name}`);
    
    try {
      // 1. Yahoo Finance APIから株価情報を取得
      console.log('  株価情報を取得中...');
      const stockInfo = await yahooFinance.getStockPrice(stock.code);
      console.log(`  現在株価: ${stockInfo.price}円, 配当利回り: ${stockInfo.dividendYield}%`);
      
      // 2. 株式情報をDBに保存
      await db.upsertStock({
        code: stock.code,
        name: stockInfo.name || stock.name,
        market: stockInfo.market || '東証',
        sector: '小売業'
      });
      console.log('  ✓ 株式情報をDBに保存');
      
      // 3. 株価履歴を保存
      await db.insertPriceHistory(stockInfo);
      console.log('  ✓ 株価履歴をDBに保存');
      
      // 4. ダミーの優待情報を作成（実際のスクレイピングの代わり）
      const benefits = getBenefitsForStock(stock.code);
      
      // 5. 既存の優待情報を削除
      await db.deleteBenefitsByStockCode(stock.code);
      
      // 6. 新しい優待情報を保存
      for (const benefit of benefits) {
        await db.insertBenefit(benefit);
      }
      console.log(`  ✓ ${benefits.length}件の優待情報をDBに保存`);
      
    } catch (error) {
      console.error(`  ✗ エラー: ${error.message}`);
    }
  }
  
  // 7. DB内容を確認
  console.log('\n=== データベース内容確認 ===');
  
  const allStocks = await db.getAllStocks();
  console.log(`\n登録銘柄数: ${allStocks.length}件`);
  
  for (const stock of allStocks) {
    const benefits = await db.getBenefitsByStockCode(stock.code);
    const priceHistory = await new Promise((resolve, reject) => {
      db.db.get(
        'SELECT * FROM price_history WHERE stock_code = ? ORDER BY recorded_at DESC LIMIT 1',
        [stock.code],
        (err, row) => err ? reject(err) : resolve(row)
      );
    });
    
    console.log(`\n${stock.code}: ${stock.name}`);
    console.log(`  市場: ${stock.market}, セクター: ${stock.sector || 'N/A'}`);
    if (priceHistory) {
      console.log(`  株価: ${priceHistory.price}円, 配当利回り: ${priceHistory.dividend_yield}%`);
    }
    console.log(`  優待情報: ${benefits.length}件`);
    benefits.forEach(b => {
      console.log(`    - ${b.description} (${b.minShares}株, ${b.exRightsMonth}月)`);
    });
  }
  
  db.close();
  console.log('\n=== テスト完了 ===');
}

// テスト用の優待情報を返す関数
function getBenefitsForStock(code) {
  const benefitsData = {
    '3197': [
      {
        stockCode: '3197',
        benefitType: '優待券',
        description: '優待カード（飲食代金3%割引）',
        monetaryValue: 3000,
        minShares: 100,
        holderType: 'どちらでも',
        exRightsMonth: 6
      },
      {
        stockCode: '3197',
        benefitType: '優待券',
        description: '優待カード（飲食代金3%割引）',
        monetaryValue: 3000,
        minShares: 100,
        holderType: 'どちらでも',
        exRightsMonth: 12
      }
    ],
    '7412': [
      {
        stockCode: '7412',
        benefitType: '優待券',
        description: '優待ポイント（100株:2,000ポイント）',
        monetaryValue: 2000,
        minShares: 100,
        holderType: 'どちらでも',
        exRightsMonth: 3
      },
      {
        stockCode: '7412',
        benefitType: '優待券',
        description: '優待ポイント（100株:2,000ポイント）',
        monetaryValue: 2000,
        minShares: 100,
        holderType: 'どちらでも',
        exRightsMonth: 9
      }
    ],
    '8267': [
      {
        stockCode: '8267',
        benefitType: '優待券',
        description: 'オーナーズカード（キャッシュバック3%）',
        monetaryValue: 3000,
        minShares: 100,
        holderType: 'どちらでも',
        exRightsMonth: 2
      },
      {
        stockCode: '8267',
        benefitType: '優待券',
        description: 'オーナーズカード（キャッシュバック3%）',
        monetaryValue: 3000,
        minShares: 100,
        holderType: 'どちらでも',
        exRightsMonth: 8
      }
    ],
    '2702': [
      {
        stockCode: '2702',
        benefitType: '優待券',
        description: '優待食事券（6枚綴り）',
        monetaryValue: 3000,
        minShares: 100,
        holderType: 'どちらでも',
        exRightsMonth: 6
      },
      {
        stockCode: '2702',
        benefitType: '優待券',
        description: '優待食事券（6枚綴り）',
        monetaryValue: 3000,
        minShares: 100,
        holderType: 'どちらでも',
        exRightsMonth: 12
      }
    ],
    '9861': [
      {
        stockCode: '9861',
        benefitType: '優待券',
        description: '300円サービス券×10枚',
        monetaryValue: 3000,
        minShares: 100,
        holderType: 'どちらでも',
        exRightsMonth: 2
      },
      {
        stockCode: '9861',
        benefitType: '優待券',
        description: '300円サービス券×10枚',
        monetaryValue: 3000,
        minShares: 100,
        holderType: 'どちらでも',
        exRightsMonth: 8
      }
    ]
  };
  
  return benefitsData[code] || [];
}

// テスト実行
testScrapeAndSave().catch(console.error);