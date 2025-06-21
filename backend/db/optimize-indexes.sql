-- インデックス最適化スクリプト
-- 既存インデックスの削除と再作成で最適化

-- 検索性能向上のための複合インデックス
CREATE INDEX IF NOT EXISTS idx_stocks_search 
ON stocks(code, name, japanese_name);

-- 優待情報検索の高速化
CREATE INDEX IF NOT EXISTS idx_benefits_composite 
ON shareholder_benefits(stock_code, ex_rights_month, benefit_type, monetary_value);

-- 価格情報の高速アクセス
CREATE INDEX IF NOT EXISTS idx_latest_prices_composite 
ON latest_prices(stock_code, dividend_yield, price);

-- RSIフィルタリング用
CREATE INDEX IF NOT EXISTS idx_stocks_rsi 
ON stocks(rsi, rsi28);

-- ソート処理の高速化
CREATE INDEX IF NOT EXISTS idx_stocks_yield_sort 
ON stocks(code, sector, industry);

-- 分析クエリ最適化
ANALYZE;