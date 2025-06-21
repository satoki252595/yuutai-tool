import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';
import { RSICalculator } from './rsiCalculator.js';
import { cacheService } from './cache-service.js';
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
    // 開発・本番環境共に20件制限で統一
    const maxLimit = 20;
    const defaultLimit = 20;
    
    const limitNum = Math.min(
      parseInt(limit) || defaultLimit, 
      maxLimit
    );
    
    console.log(`📊 Fetching page ${pageNum} with limit ${limitNum}...`);
    const startTime = process.hrtime.bigint();
    
    // 開発・本番環境共に軽量版を使用（高速化）
    const queryMethod = 'getStocksWithBenefitsPaginatedLite';
    
    const result = await db[queryMethod]({
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
    
    // 超軽量版：優待情報の詳細取得をスキップ
    let stocksWithDetails = stocks.map(stock => {
      // 簡略化された利回り計算
      const dividendYield = stock.dividend_yield || 0;
      const benefitYield = 0; // 優待利回りは0に固定（高速化）
      const totalYield = dividendYield + benefitYield;
      
      return {
        code: stock.code,
        name: stock.display_name || stock.name,
        originalName: stock.name,
        japaneseName: stock.japanese_name,
        market: 'jp_market',
        industry: null,
        price: stock.price || 0,
        dividendYield: Math.round(dividendYield * 100) / 100,
        benefitYield: Math.round(benefitYield * 100) / 100,
        totalYield: Math.round(totalYield * 100) / 100,
        benefitCount: stock.benefit_count || 0,
        benefitGenres: [],
        rightsMonths: [],
        hasLongTermHolding: false,
        minShares: stock.min_shares || 100,
        shareholderBenefits: [], // 空配列で高速化
        annualDividend: stock.annual_dividend || 0,
        dataSource: 'lite_mode',
        rsi14: null,
        rsi28: null,
        rsi14Stats: { status: 'unknown', level: null },
        rsi28Stats: { status: 'unknown', level: null }
      };
    });
    
    // フィルター処理をスキップ（高速化優先）
    // 注意: 軽量モードではフィルター機能は制限されます
    
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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});