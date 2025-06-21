#!/usr/bin/env node

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5001/api';

async function measureApiCall(endpoint, description) {
  const start = process.hrtime.bigint();
  
  try {
    const response = await fetch(`${API_BASE}${endpoint}`);
    const data = await response.json();
    
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // ナノ秒→ミリ秒
    
    console.log(`${description}: ${duration.toFixed(2)}ms - ${data.stocks?.length || 0}件`);
    return { duration, count: data.stocks?.length || 0 };
  } catch (error) {
    console.error(`${description}: エラー - ${error.message}`);
    return { duration: -1, count: 0 };
  }
}

async function runBenchmark() {
  console.log('🚀 APIパフォーマンステスト開始\n');
  
  const tests = [
    { endpoint: '/stocks?page=1&limit=50', desc: 'ページ1（50件）' },
    { endpoint: '/stocks?page=2&limit=50', desc: 'ページ2（50件）' },
    { endpoint: '/stocks?page=1&limit=100', desc: 'ページ1（100件）' },
    { endpoint: '/stocks?search=銀行', desc: '検索：銀行' },
    { endpoint: '/stocks?sortBy=code&sortOrder=asc', desc: 'コード順ソート' },
    { endpoint: '/stocks?benefitType=QUOカード・図書カード', desc: 'QUOカードフィルタ' },
    { endpoint: '/stocks?rightsMonth=3', desc: '3月権利フィルタ' },
    { endpoint: '/stocks?rsiFilter=oversold', desc: 'RSI売られすぎフィルタ' }
  ];
  
  const results = [];
  
  for (const test of tests) {
    const result = await measureApiCall(test.endpoint, test.desc);
    results.push({ ...test, ...result });
    
    // 連続リクエストを避けるため少し待機
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n📊 結果サマリー:');
  const avgDuration = results.filter(r => r.duration > 0).reduce((sum, r) => sum + r.duration, 0) / results.length;
  const totalRequests = results.length;
  const successRequests = results.filter(r => r.duration > 0).length;
  
  console.log(`  平均レスポンス時間: ${avgDuration.toFixed(2)}ms`);
  console.log(`  成功リクエスト: ${successRequests}/${totalRequests}`);
  console.log(`  最速: ${Math.min(...results.filter(r => r.duration > 0).map(r => r.duration)).toFixed(2)}ms`);
  console.log(`  最遅: ${Math.max(...results.filter(r => r.duration > 0).map(r => r.duration)).toFixed(2)}ms`);
  
  console.log('\n✅ ベンチマーク完了');
}

runBenchmark().catch(console.error);