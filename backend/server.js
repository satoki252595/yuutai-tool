import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';
import { RSICalculator } from './rsiCalculator.js';
import { cacheService } from './cache-service-enhanced.js';
import { PRODUCTION_CONFIG } from './production-optimizations.js';

const app = express();
const PORT = process.env.PORT || 5001;
const isProduction = process.env.NODE_ENV === 'production';

// CORS設定
app.use(cors({
  origin: isProduction ? [
    'https://34.170.150.67',
    'http://34.170.150.67', 
    'https://yuutai-tool.com',
    'http://yuutai-tool.com'
  ] : true,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// 本番環境向け圧縮設定
const compressionConfig = isProduction ? {
  level: PRODUCTION_CONFIG.api.compressionLevel,
  threshold: PRODUCTION_CONFIG.api.compressionThreshold,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
} : {
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
};

app.use(compression(compressionConfig));

// リクエストタイムアウト設定
app.use((req, res, next) => {
  const timeout = isProduction ? 
    PRODUCTION_CONFIG.api.timeoutMs : 
    120000; // 開発環境は2分
    
  res.setTimeout(timeout, () => {
    res.status(504).json({ 
      error: 'Request timeout',
      message: `Request took longer than ${timeout}ms`
    });
  });
  next();
});

const db = new Database();
const yahooFinance = new YahooFinanceService();
const rsiCalculator = new RSICalculator();

// キャッシュミドルウェア（強化版）
const cacheMiddleware = (ttl) => (req, res, next) => {
  const cached = cacheService.get(req.originalUrl);
  if (cached) return res.json(cached);
  
  const originalJson = res.json;
  res.json = function(data) {
    cacheService.set(req.originalUrl, data, ttl);
    originalJson.call(this, data);
  };
  next();
};

// 利回り計算ヘルパー関数群
const findMinSharesBenefit = benefits => 
  benefits.reduce((min, b) => (b.min_shares || 100) < (min.min_shares || 100) ? b : min);

const groupBenefitsByShares = benefits => {
  const groups = {};
  for (const benefit of benefits) {
    const shares = benefit.min_shares || 100;
    (groups[shares] ||= []).push(benefit);
  }
  return groups;
};

const calculateAnnualBenefitValue = benefits => {
  const monthlyBenefits = new Map();
  for (const benefit of benefits) {
    const month = benefit.ex_rights_month || 3;
    monthlyBenefits.set(month, benefit);
  }
  let total = 0;
  for (const benefit of monthlyBenefits.values()) {
    total += benefit.monetary_value || 0;
  }
  return total;
};

const roundYield = value => Math.round(value * 100) / 100;

// 優待利回り・総合利回り計算（最適化版）
function calculateYields(stock, benefits) {
  if (!stock.price) return { dividendYield: 0, benefitYield: 0, totalYield: 0 };
  
  const dividendYield = stock.dividend_yield || 0;
  let benefitYield = 0;
  
  if (benefits.length > 0) {
    const minSharesBenefit = findMinSharesBenefit(benefits);
    const requiredShares = minSharesBenefit.min_shares || 100;
    const investmentAmount = stock.price * requiredShares;
    
    const shareGroups = groupBenefitsByShares(benefits);
    const minSharesGroup = shareGroups[requiredShares] || [];
    
    if (minSharesGroup.length > 0) {
      const annualValue = calculateAnnualBenefitValue(minSharesGroup);
      benefitYield = (annualValue / investmentAmount) * 100;
    }
  }
  
  return {
    dividendYield: roundYield(dividendYield),
    benefitYield: roundYield(benefitYield),
    totalYield: roundYield(dividendYield + benefitYield)
  };
}

// フィルター関数群
const applyFilters = {
  benefitType: (stocks, type) => type && type !== 'all' 
    ? stocks.filter(s => s.benefitGenres.includes(type)) : stocks,
  
  rightsMonth: (stocks, month) => month && month !== 'all'
    ? stocks.filter(s => s.rightsMonths.includes(parseInt(month))) : stocks,
  
  rsiFilter: (stocks, filter) => {
    if (!filter || filter === 'all') return stocks;
    return stocks.filter(s => {
      const rsi = s.rsi14;
      if (rsi == null) return false;
      return filter === 'oversold' ? rsi < 30 : 
             filter === 'overbought' ? rsi > 70 : 
             rsi >= 30 && rsi <= 70;
    });
  },
  
  longTermHolding: (stocks, holding) => {
    if (!holding || holding === 'all') return stocks;
    return stocks.filter(s => holding === 'yes' ? s.hasLongTermHolding : !s.hasLongTermHolding);
  }
};

// 株式データ変換関数
const transformStockData = (stock, benefits, yields) => ({
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
  benefitGenres: stock.benefit_types ? 
    [...new Set(stock.benefit_types.split(',').filter(Boolean))] : [],
  rightsMonths: stock.rights_months ? 
    [...new Set(stock.rights_months.split(',').map(Number).filter(Boolean))] : [],
  hasLongTermHolding: stock.has_long_term_holding === 1,
  minShares: stock.min_shares || 100,
  shareholderBenefits: benefits,
  annualDividend: stock.annual_dividend || 0,
  dataSource: stock.data_source || 'unknown',
  rsi14: stock.rsi,
  rsi28: stock.rsi28,
  rsi14Stats: { status: 'unknown', level: null },
  rsi28Stats: { status: 'unknown', level: null }
});

// 株式一覧取得API（最適化版）
app.get('/api/stocks', cacheMiddleware(60000), async (req, res) => {
  try {
    const startTime = process.hrtime.bigint();
    const { search, sortBy = 'totalYield', sortOrder = 'desc', 
            benefitType, rightsMonth, rsiFilter, longTermHolding,
            page = 1, limit = 50 } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit) || 20, 20);
    
    console.log(`📊 Fetching page ${pageNum} with limit ${limitNum}...`);
    
    // DBクエリ実行
    const result = await db.getStocksWithBenefitsPaginatedLite({
      search, sortBy, sortOrder, page: pageNum, limit: limitNum
    });
    
    const dbTime = Number(process.hrtime.bigint() - startTime) / 1000000;
    console.log(`📊 DB query completed in ${dbTime.toFixed(2)}ms`);
    
    // 優待情報一括取得
    const stockCodes = result.stocks.map(s => s.code);
    const benefitsByCode = await db.getBenefitsByStockCodes(stockCodes);
    
    // データ変換
    let stocksWithDetails = result.stocks.map(stock => {
      const benefits = benefitsByCode[stock.code] || [];
      const yields = calculateYields(stock, benefits);
      return transformStockData(stock, benefits, yields);
    });
    
    // フィルター適用
    stocksWithDetails = applyFilters.benefitType(stocksWithDetails, benefitType);
    stocksWithDetails = applyFilters.rightsMonth(stocksWithDetails, rightsMonth);
    stocksWithDetails = applyFilters.rsiFilter(stocksWithDetails, rsiFilter);
    stocksWithDetails = applyFilters.longTermHolding(stocksWithDetails, longTermHolding);
    
    const totalTime = Number(process.hrtime.bigint() - startTime) / 1000000;
    console.log(`📊 Total time: ${totalTime.toFixed(2)}ms`);
    
    res.json({ stocks: stocksWithDetails, pagination: result.pagination });
  } catch (error) {
    console.error('Error fetching stocks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// エラーハンドラーミドルウェア
const asyncHandler = fn => (req, res, next) => 
  Promise.resolve(fn(req, res, next)).catch(next);

// 統一エラーハンドラー
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  const status = err.status || 500;
  const message = isProduction ? 'Internal server error' : err.message;
  res.status(status).json({ error: message });
};

// 個別銘柄詳細取得（最適化版）
app.get('/api/stocks/:code', asyncHandler(async (req, res) => {
  const { code } = req.params;
  const stocks = await db.getStocksWithBenefits(code);
  
  if (stocks.length === 0) {
    return res.status(404).json({ error: 'Stock not found' });
  }
  
  const stock = stocks[0];
  const benefits = await db.getBenefitsByStockCode(code);
  
  // 最新株価取得（エラーハンドリング付き）
  try {
    const latestPrice = await yahooFinance.getStockPrice(code);
    await db.insertPriceHistory(latestPrice);
    stock.price = latestPrice.price;
    stock.dividend_yield = latestPrice.dividendYield;
  } catch (error) {
    console.error('Price update failed:', error);
  }
  
  const yields = calculateYields(stock, benefits);
  
  res.json({
    ...stock,
    ...yields,
    shareholderBenefits: benefits
  });
}));

// 株価更新（最適化版）
app.post('/api/stocks/:code/update-price', asyncHandler(async (req, res) => {
  const { code } = req.params;
  const stockPrice = await yahooFinance.getStockPrice(code);
  await db.insertPriceHistory(stockPrice);
  res.json(stockPrice);
}));

// 優待情報の追加/更新（最適化版）
app.post('/api/stocks/:code/benefits', asyncHandler(async (req, res) => {
  const { code } = req.params;
  await db.insertBenefit({ stockCode: code, ...req.body });
  res.json({ success: true });
}));

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

// 本番環境対応ヘルスチェックエンドポイント
app.get('/api/health', (req, res) => {
  const startTime = process.hrtime.bigint();
  
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: isProduction ? 'production' : 'development',
    version: '2.3.0',
    cache: cacheService.getStats()
  };
  
  // 本番環境では詳細情報を制限
  if (!isProduction) {
    healthStatus.memory = process.memoryUsage();
  }
  
  // データベース接続確認（タイムアウト付き）
  const timeout = setTimeout(() => {
    healthStatus.database = 'timeout';
    healthStatus.status = 'unhealthy';
    res.status(503).json(healthStatus);
  }, 5000);
  
  db.db.get('SELECT COUNT(*) as count FROM stocks LIMIT 1', [], (err, row) => {
    clearTimeout(timeout);
    
    const endTime = process.hrtime.bigint();
    const responseTime = Number(endTime - startTime) / 1000000;
    
    if (err) {
      healthStatus.database = 'error';
      healthStatus.status = 'unhealthy';
      healthStatus.error = isProduction ? 'Database connection failed' : err.message;
      res.status(503).json(healthStatus);
    } else {
      healthStatus.database = 'connected';
      healthStatus.responseTime = `${responseTime.toFixed(2)}ms`;
      healthStatus.stockCount = row.count;
      res.json(healthStatus);
    }
  });
});

// キャッシュクリアエンドポイント（本番環境では制限）
app.post('/api/cache/clear', (req, res) => {
  if (isProduction) {
    // 本番環境では特定のパターンのみクリア
    const pattern = req.body.pattern || 'stocks';
    const deleted = cacheService.deletePattern(pattern);
    res.json({ message: `Cleared ${deleted} cache entries matching: ${pattern}` });
  } else {
    cacheService.clear();
    res.json({ message: 'All cache cleared' });
  }
});

// エラーハンドラーを最後に追加
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});