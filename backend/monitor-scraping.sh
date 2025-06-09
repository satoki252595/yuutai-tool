#!/bin/bash

echo "=== スクレイピング進捗モニター ==="
echo ""

# プロセス確認
if ps aux | grep -q "[n]ode simple-comprehensive-scraper.js"; then
    echo "✅ スクレイピングプロセス: 実行中"
else
    echo "❌ スクレイピングプロセス: 停止中"
fi

echo ""

# 進捗統計
if [ -f "simple-scraping-progress.json" ]; then
    COMPLETED=$(cat simple-scraping-progress.json | jq '.completed | length')
    BENEFIT=$(cat simple-scraping-progress.json | jq '.benefitStocks | length')
    FAILED=$(cat simple-scraping-progress.json | jq '.failed | length')
    
    echo "📊 進捗統計:"
    echo "  処理済み: $COMPLETED 件"
    echo "  優待銘柄: $BENEFIT 件"
    echo "  失敗: $FAILED 件"
    
    if [ $COMPLETED -gt 0 ]; then
        RATE=$(echo "scale=1; $BENEFIT * 100 / $COMPLETED" | bc)
        echo "  優待発見率: $RATE%"
    fi
    
    PROGRESS=$(echo "scale=1; $COMPLETED * 100 / 8700" | bc)
    echo "  全体進捗: $PROGRESS%"
fi

echo ""

# 最新ログ
echo "📝 最新のログ:"
tail -5 scraping.log | grep -E "✓|✗|○|-"

echo ""
echo "リアルタイムログ確認: tail -f scraping.log"