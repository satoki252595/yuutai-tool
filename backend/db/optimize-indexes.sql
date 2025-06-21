-- データベースパフォーマンス最適化のためのインデックス追加

-- 1. 検索用の複合インデックス（全文検索の代替）
CREATE INDEX IF NOT EXISTS idx_stocks_search ON stocks(code, name, japanese_name);

-- 2. 価格履歴の複合インデックス（最新価格取得の高速化）
CREATE INDEX IF NOT EXISTS idx_price_history_composite ON price_history(stock_code, recorded_at DESC);

-- 3. 優待情報の権利月インデックス
CREATE INDEX IF NOT EXISTS idx_benefits_rights_month ON shareholder_benefits(ex_rights_month);

-- 4. 優待情報の種別インデックス
CREATE INDEX IF NOT EXISTS idx_benefits_type ON shareholder_benefits(benefit_type);

-- 5. 長期保有特典のインデックス
CREATE INDEX IF NOT EXISTS idx_benefits_long_term ON shareholder_benefits(has_long_term_holding);

-- 6. 最小株数のインデックス（投資額計算の高速化）
CREATE INDEX IF NOT EXISTS idx_benefits_min_shares ON shareholder_benefits(min_shares);

-- 7. RSI用のインデックス
CREATE INDEX IF NOT EXISTS idx_stocks_rsi ON stocks(rsi);
CREATE INDEX IF NOT EXISTS idx_stocks_rsi28 ON stocks(rsi28);

-- 8. 統計情報の更新
ANALYZE;

-- 9. データベースの最適化
VACUUM;