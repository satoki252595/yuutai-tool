import express from 'express';
import cors from 'cors';
import { Database } from './database.js';
import { YahooFinanceService } from './yahooFinance.js';

const app = express();
const db = new Database();
const yahooFinance = new YahooFinanceService();
const PORT = process.env.PORT || 5001;

// ミドルウェア
app.use(cors());
app.use(express.json());

// メモリキャッシュ（最適化版）
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分

const cacheMiddleware = (req, res, next) => {
  const key = req.originalUrl;
  const cached = cache.get(key);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.json(cached.data);
  }
  
  const originalJson = res.json;
  res.json = function(data) {
    cache.set(key, { data, timestamp: Date.now() });
    originalJson.call(this, data);
  };
  next();
};

// エラーハンドラー
const asyncHandler = fn => (req, res, next) => 
  Promise.resolve(fn(req, res, next)).catch(next);

// ルート定義（最適化版）
app.get('/api/stocks', cacheMiddleware, asyncHandler(async (req, res) => {
  const stocks = await db.searchStocks(req.query);
  res.json(stocks);
}));

app.get('/api/stocks/:code', cacheMiddleware, asyncHandler(async (req, res) => {
  const stock = await db.getStockWithBenefits(req.params.code);
  if (!stock) return res.status(404).json({ error: 'Stock not found' });
  res.json(stock);
}));

app.post('/api/stocks/:code/update-price', asyncHandler(async (req, res) => {
  const { code } = req.params;
  
  try {
    const priceData = await yahooFinance.getStockPrice(code);
    await db.updateStockPrice(code, priceData);
    
    // キャッシュクリア
    for (const [key] of cache) {
      if (key.includes(code)) cache.delete(key);
    }
    
    res.json({ success: true, price: priceData.price });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}));

app.get('/api/benefit-types', cacheMiddleware, asyncHandler(async (req, res) => {
  const types = await db.getBenefitTypes();
  res.json(types);
}));

app.get('/api/rights-months', cacheMiddleware, asyncHandler(async (req, res) => {
  const months = await db.getRightsMonths();
  res.json(months);
}));

app.post('/api/stocks/:code/benefits', asyncHandler(async (req, res) => {
  const benefit = {
    stock_code: req.params.code,
    ...req.body,
    created_at: new Date().toISOString()
  };
  
  await db.insertBenefit(benefit);
  res.json({ success: true });
}));

// 共通エラーハンドラー
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});