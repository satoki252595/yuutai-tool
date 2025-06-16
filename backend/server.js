import express from 'express';
import cors from 'cors';
import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';
import { RSICalculator } from './rsiCalculator.js';

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

const db = new Database();
const yahooFinance = new YahooFinanceService();
const rsiCalculator = new RSICalculator();

// メモリキャッシュの実装
const stockCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分間のキャッシュ

// キャッシュミドルウェア
const cacheMiddleware = (req, res, next) => {
  const key = req.originalUrl;
  const cached = stockCache.get(key);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`📦 キャッシュヒット: ${key}`);
    return res.json(cached.data);
  }
  
  // オリジナルのjson関数を保存
  const originalJson = res.json;
  res.json = function(data) {
    stockCache.set(key, {
      data,
      timestamp: Date.now()
    });
    console.log(`💾 キャッシュ保存: ${key}`);
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

// 株式一覧取得（キャッシュ機能付き）
app.get('/api/stocks', cacheMiddleware, async (req, res) => {
  try {
    const { 
      search, 
      sortBy = 'totalYield', 
      sortOrder = 'desc',
      benefitType,
      rightsMonth,
      rsiFilter,
      longTermHolding
    } = req.query;
    
    const stocks = await db.getStocksWithBenefits(search);
    
    // 各銘柄の詳細情報を取得
    const stockCodes = stocks.map(s => s.code);
    console.log(`Calculating RSI for ${stockCodes.length} stocks...`);
    const rsiData = await rsiCalculator.calculateMultipleRSI(stockCodes);
    console.log(`RSI calculation complete. Sample:`, Object.keys(rsiData).slice(0, 3).map(code => ({ code, rsi14: rsiData[code]?.rsi14 })));
    
    let stocksWithDetails = await Promise.all(stocks.map(async (stock) => {
      const benefits = await db.getBenefitsByStockCode(stock.code);
      const yields = calculateYields(stock, benefits);
      
      // 優待ジャンルを分類
      const benefitGenres = [...new Set(benefits.map(b => b.benefit_type).filter(Boolean))];
      
      // 権利月を取得
      const rightsMonths = [...new Set(benefits.map(b => b.ex_rights_month).filter(Boolean))];
      
      // 長期保有制度の有無
      const hasLongTermHolding = benefits.some(b => b.has_long_term_holding === 1);
      
      // RSIデータ
      const rsi = rsiData[stock.code] || { rsi14: null, rsi28: null, stats14: null, stats28: null };
      
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
        benefitCount: benefits.length,
        benefitGenres,
        rightsMonths,
        hasLongTermHolding,
        minShares: benefits.length > 0 ? Math.min(...benefits.map(b => b.min_shares || 100)) : 100,
        shareholderBenefits: benefits,
        annualDividend: stock.annual_dividend || 0,
        dataSource: stock.data_source || 'unknown',
        rsi14: stock.rsi || rsi.rsi14,
        rsi28: stock.rsi28 || rsi.rsi28,
        rsi14Stats: rsi.stats14,
        rsi28Stats: rsi.stats28
      };
    }));
    
    // フィルター処理
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
          case 'oversold': // 売られすぎ（RSI < 30）
            return rsi14 < 30;
          case 'overbought': // 買われすぎ（RSI > 70）
            return rsi14 > 70;
          case 'neutral': // 適正（30 <= RSI <= 70）
            return rsi14 >= 30 && rsi14 <= 70;
          default:
            return true;
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
    
    // ソート処理
    stocksWithDetails.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case 'dividendYield':
          aValue = a.dividendYield;
          bValue = b.dividendYield;
          break;
        case 'benefitYield':
          aValue = a.benefitYield;
          bValue = b.benefitYield;
          break;
        case 'totalYield':
          aValue = a.totalYield;
          bValue = b.totalYield;
          break;
        case 'price':
          aValue = a.price;
          bValue = b.price;
          break;
        case 'name':
          aValue = a.name;
          bValue = b.name;
          break;
        case 'code':
          aValue = a.code;
          bValue = b.code;
          break;
        case 'rsi14':
          aValue = a.rsi14 !== null ? a.rsi14 : (sortOrder === 'asc' ? 100 : -1);
          bValue = b.rsi14 !== null ? b.rsi14 : (sortOrder === 'asc' ? 100 : -1);
          break;
        case 'rsi28':
          aValue = a.rsi28 !== null ? a.rsi28 : (sortOrder === 'asc' ? 100 : -1);
          bValue = b.rsi28 !== null ? b.rsi28 : (sortOrder === 'asc' ? 100 : -1);
          break;
        default:
          aValue = a.totalYield;
          bValue = b.totalYield;
      }
      
      if (typeof aValue === 'string') {
        return sortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      } else {
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      }
    });
    
    res.json(stocksWithDetails);
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