#!/bin/bash
cd /Users/satoki252595/work/0000_kabulab/0016_yuutai
echo "🍜 Testing RingerHut (8200) with comprehensive test..."
echo ""
export TEST_STOCK_CODE=8200
export HEADLESS=true
export QUICK_TEST=false
node backend/comprehensive-test.js 2>&1 | grep -E "(8200|リンガーハット|優待|Benefits|金額|枚|割引|食事券|Result|❌|✅|💰|📊|処理銘柄数|成功|失敗)" | head -100