-- 最新価格テーブルの作成（マテリアライズドビューの代替）
DROP TABLE IF EXISTS latest_prices;
CREATE TABLE latest_prices (
  stock_code TEXT PRIMARY KEY,
  price REAL,
  dividend_yield REAL,
  annual_dividend REAL,
  data_source TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (stock_code) REFERENCES stocks(code)
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_latest_prices_updated ON latest_prices(updated_at);

-- 既存データから最新価格を挿入
INSERT OR REPLACE INTO latest_prices (stock_code, price, dividend_yield, annual_dividend, data_source, updated_at)
SELECT 
  ph.stock_code,
  ph.price,
  ph.dividend_yield,
  ph.annual_dividend,
  ph.data_source,
  ph.recorded_at
FROM price_history ph
INNER JOIN (
  SELECT stock_code, MAX(recorded_at) as max_recorded_at
  FROM price_history
  GROUP BY stock_code
) latest ON ph.stock_code = latest.stock_code AND ph.recorded_at = latest.max_recorded_at;