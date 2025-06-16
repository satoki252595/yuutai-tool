-- 1株未満のデータを100株に修正
UPDATE shareholder_benefits
SET min_shares = 100
WHERE min_shares < 100;

-- 修正件数を確認
SELECT 'Updated ' || changes() || ' records with min_shares < 100 to 100';

-- 修正後の確認
SELECT stock_code, COUNT(*) as benefit_count, MIN(min_shares) as min_shares
FROM shareholder_benefits
WHERE stock_code IN (
  SELECT DISTINCT stock_code 
  FROM shareholder_benefits 
  WHERE min_shares = 100
)
GROUP BY stock_code
ORDER BY stock_code
LIMIT 20;