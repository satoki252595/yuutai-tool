import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';
import { RSICalculator } from './rsiCalculator.js';
import { cacheService } from './cache-service.js';

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// gzip圧縮の追加
app.use(compression({
  level: 6, // 圧縮レベル（1-9、デフォルト6）
  threshold: 1024, // 1KB以上のレスポンスを圧縮
  filter: (req, res) => {
    // 圧縮するMIMEタイプを指定
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

const db = new Database();
const yahooFinance = new YahooFinanceService();
const rsiCalculator = new RSICalculator();

// 改良されたキャッシュミドルウェア
const cacheMiddleware = (req, res, next) => {
  const key = req.originalUrl;
  const cached = cacheService.get(key);
  
  if (cached) {
    return res.json(cached);
  }
  
  // オリジナルのjson関数を保存
  const originalJson = res.json;
  res.json = function(data) {
    cacheService.set(key, data);
    originalJson.call(this, data);
  };
  
  next();
};

// 優待利回り・総合利回り計算
function calculateYields(stock, benefits) {
  if (!stock.price || stock.price === 0) {
    return { dividendYield: 0, benefitYield: 0, totalYield: 0 };
  }
  
  const dividendYield = stock.dividend_yield || 0;
  
  // 優待利回り計算: 優待金銭価値 ÷ (優待必要株式数 × 株価) × 100
  let benefitYield = 0;
  if (benefits.length > 0) {
    // 最小株式数での優待を基準に計算
    const minSharesBenefit = benefits.reduce((min, benefit) => {
      return (benefit.min_shares || 100) < (min.min_shares || 100) ? benefit : min;
    });
    
    const requiredShares = minSharesBenefit.min_shares || 100;
    const investmentAmount = stock.price * requiredShares;
    
    // 年間の優待価値を計算
    // 同じ株式数要件の優待をグループ化
    const shareGroups = {};
    benefits.forEach(benefit => {
      const shares = benefit.min_shares || 100;
      if (!shareGroups[shares]) {
        shareGroups[shares] = [];
      }
      shareGroups[shares].push(benefit);
    });
    
    // 最小株式数グループの優待価値を計算
    const minSharesGroup = shareGroups[requiredShares] || [];
    let annualBenefitValue = 0;
    
    if (minSharesGroup.length > 0) {
      // 権利月ごとにグループ化
      const monthlyBenefits = {};
      minSharesGroup.forEach(benefit => {
        const month = benefit.ex_rights_month || 3;
        monthlyBenefits[month] = benefit;
      });
      
      // 各権利月の価値を合計
      annualBenefitValue = Object.values(monthlyBenefits).reduce((sum, benefit) => {
        return sum + (benefit.monetary_value || 0);
      }, 0);
    }
    
    benefitYield = (annualBenefitValue / investmentAmount) * 100;
  }
  
  const totalYield = dividendYield + benefitYield;
  
  return {
    dividendYield: Math.round(dividendYield * 100) / 100,
    benefitYield: Math.round(benefitYield * 100) / 100,
    totalYield: Math.round(totalYield * 100) / 100
  };
}

// 株式一覧取得（高速化 + キャッシュ機能付き）
app.get('/api/stocks', cacheMiddleware, async (req, res) => {
  try {
    const { 
      search, 
      sortBy = 'totalYield', 
      sortOrder = 'desc',
      benefitType,
      rightsMonth,
      rsiFilter,
      longTermHolding,
      page = 1,
      limit = 50
    } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100); // 最大100件まで
    
    console.log(`📊 Fetching page ${pageNum} with limit ${limitNum}...`);
    const startTime = process.hrtime.bigint();
    
    // 高速化されたページング対応クエリを使用
    const result = await db.getStocksWithBenefitsPaginated({
      search,
      sortBy,
      sortOrder,
      page: pageNum,
      limit: limitNum
    });
    
    const stocks = result.stocks;
    const pagination = result.pagination;
    
    const dbTime = Number(process.hrtime.bigint() - startTime) / 1000000;
    console.log(`📊 DB query completed in ${dbTime.toFixed(2)}ms for ${stocks.length} stocks`);
    
    // 必要なデータのみで優待情報を一括取得（N+1問題解決）
    const stockCodes = stocks.map(s => s.code);
    const benefitsByCode = await db.getBenefitsByStockCodes(stockCodes);
    
    const benefitTime = Number(process.hrtime.bigint() - startTime) / 1000000 - dbTime;
    console.log(`📊 Benefits query completed in ${benefitTime.toFixed(2)}ms`);
    
    // 詳細情報を構築（RSI計算なし、データベースから取得済み）
    let stocksWithDetails = stocks.map(stock => {
      const benefits = benefitsByCode[stock.code] || [];
      const yields = calculateYields(stock, benefits);
      
      // GROUP_CONCATから配列に変換
      const benefitGenres = stock.benefit_types ? 
        [...new Set(stock.benefit_types.split(',').filter(Boolean))] : [];
      
      const rightsMonths = stock.rights_months ? 
        [...new Set(stock.rights_months.split(',').map(m => parseInt(m)).filter(Boolean))] : [];
      
      return {
        code: stock.code,
        name: stock.display_name || stock.name,
        originalName: stock.name,
        japaneseName: stock.japanese_name,
        market: stock.market,
        industry: stock.industry,
        price: stock.price || 0,
        dividendYield: yields.dividendYield,
        benefitYield: yields.benefitYield,
        totalYield: yields.totalYield,
        benefitCount: stock.benefit_count || 0,
        benefitGenres,
        rightsMonths,
        hasLongTermHolding: stock.has_long_term_holding === 1,
        minShares: stock.min_shares || 100,
        shareholderBenefits: benefits,
        annualDividend: stock.annual_dividend || 0,
        dataSource: stock.data_source || 'unknown',
        rsi14: stock.rsi,
        rsi28: stock.rsi28,
        rsi14Stats: { status: 'unknown', level: null },
        rsi28Stats: { status: 'unknown', level: null }
      };
    });
    
    // フィルター処理（データベースレベルで既に処理済みのため最小限）
    if (benefitType && benefitType !== 'all') {
      stocksWithDetails = stocksWithDetails.filter(stock => 
        stock.benefitGenres.includes(benefitType)
      );
    }
    
    if (rightsMonth && rightsMonth !== 'all') {
      const month = parseInt(rightsMonth);
      stocksWithDetails = stocksWithDetails.filter(stock => 
        stock.rightsMonths.includes(month)
      );
    }
    
    // RSIフィルター
    if (rsiFilter && rsiFilter !== 'all') {
      stocksWithDetails = stocksWithDetails.filter(stock => {
        const rsi14 = stock.rsi14;
        if (rsi14 === null || rsi14 === undefined) return false;
        
        switch (rsiFilter) {
          case 'oversold': return rsi14 < 30;
          case 'overbought': return rsi14 > 70;
          case 'neutral': return rsi14 >= 30 && rsi14 <= 70;
          default: return true;
        }
      });
    }
    
    // 長期保有制度フィルター
    if (longTermHolding && longTermHolding !== 'all') {
      if (longTermHolding === 'yes') {
        stocksWithDetails = stocksWithDetails.filter(stock => stock.hasLongTermHolding);
      } else if (longTermHolding === 'no') {
        stocksWithDetails = stocksWithDetails.filter(stock => !stock.hasLongTermHolding);
      }
    }
    
    const totalTime = Number(process.hrtime.bigint() - startTime) / 1000000;
    console.log(`📊 Total processing time: ${totalTime.toFixed(2)}ms`);
    
    // レスポンス（ページングは既にDBレベルで処理済み）
    res.json({
      stocks: stocksWithDetails,
      pagination
    });
  } catch (error) {
    console.error('Error fetching stocks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 個別銘柄詳細取得
app.get('/api/stocks/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const stocks = await db.getStocksWithBenefits(code);
    
    if (stocks.length === 0) {
      return res.status(404).json({ error: 'Stock not found' });
    }
    
    const stock = stocks[0];
    const benefits = await db.getBenefitsByStockCode(code);
    
    // 最新の株価を取得
    try {
      const latestPrice = await yahooFinance.getStockPrice(code);
      await db.insertPriceHistory(latestPrice);
      stock.price = latestPrice.price;
      stock.dividend_yield = latestPrice.dividendYield;
    } catch (error) {
      console.error('Error updating price:', error);
    }
    
    const yields = calculateYields(stock, benefits);
    
    res.json({
      ...stock,
      dividendYield: yields.dividendYield,
      benefitYield: yields.benefitYield,
      totalYield: yields.totalYield,
      shareholderBenefits: benefits
    });
  } catch (error) {
    console.error('Error fetching stock details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 株価更新
app.post('/api/stocks/:code/update-price', async (req, res) => {
  try {
    const { code } = req.params;
    const stockPrice = await yahooFinance.getStockPrice(code);
    await db.insertPriceHistory(stockPrice);
    res.json(stockPrice);
  } catch (error) {
    console.error('Error updating price:', error);
    res.status(500).json({ error: 'Failed to update price' });
  }
});

// 優待情報の追加/更新
app.post('/api/stocks/:code/benefits', async (req, res) => {
  try {
    const { code } = req.params;
    const benefit = {
      stockCode: code,
      ...req.body
    };
    
    await db.insertBenefit(benefit);
    res.json({ success: true });
  } catch (error) {
    console.error('Error adding benefit:', error);
    res.status(500).json({ error: 'Failed to add benefit' });
  }
});

// 優待ジャンル一覧取得（改善版）
app.get('/api/benefit-types', async (req, res) => {
  try {
    // データベースから実際の分類を取得
    const actualTypes = await new Promise((resolve, reject) => {
      db.db.all(`
        SELECT benefit_type, COUNT(*) as count 
        FROM shareholder_benefits 
        WHERE benefit_type IS NOT NULL 
        GROUP BY benefit_type 
        ORDER BY count DESC
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => row.benefit_type));
      });
    });
    
    res.json(actualTypes);
  } catch (error) {
    console.error('Error fetching benefit types:', error);
    // フォールバック
    const fallbackTypes = [
      '食事券・グルメ券', '商品券・ギフトカード', 'QUOカード・図書カード',
      '割引券・優待券', '自社製品・商品', 'カタログギフト', 'ポイント・電子マネー',
      '宿泊・レジャー', '交通・乗車券', '金券・現金', '寄付選択制', '美容・健康',
      '本・雑誌・エンタメ', 'その他'
    ];
    res.json(fallbackTypes);
  }
});

// 権利月一覧取得（1-12月固定）
app.get('/api/rights-months', async (req, res) => {
  try {
    // 1-12月の固定リストを返す
    const rightsMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    res.json(rightsMonths);
  } catch (error) {
    console.error('Error fetching rights months:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ヘルスチェック
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// キャッシュクリアエンドポイント
app.post('/api/cache/clear', (req, res) => {
  stockCache.clear();
  console.log('🧽 キャッシュをクリアしました');
  res.json({ message: 'キャッシュをクリアしました' });
});

// ヘルスチェックエンドポイント
app.get('/api/health', (req, res) => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: 'connected',
    version: '2.2.0'
  };
  
  // データベース接続確認
  db.db.get('SELECT COUNT(*) as count FROM stocks', [], (err) => {
    if (err) {
      healthStatus.database = 'error';
      healthStatus.status = 'unhealthy';
      res.status(503).json(healthStatus);
    } else {
      res.json(healthStatus);
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});