import yahooFinance from 'yahoo-finance2';

export class YahooFinanceService {
  constructor() {
    // Yahoo Finance APIの設定
    yahooFinance.setGlobalConfig({
      queue: {
        concurrency: 2,
        timeout: 10000
      },
      validation: {
        logErrors: false  // バリデーションエラーのログを抑制
      }
    });
  }

  async getStockPrice(code) {
    try {
      // 日本株は.Tサフィックスを付ける
      const symbol = `${code}.T`;
      const quote = await yahooFinance.quote(symbol);
      
      // バリデーションエラーのある不正なデータをチェック
      if (quote.fiftyTwoWeekHigh && quote.fiftyTwoWeekHigh > 1000000000) {
        console.warn(`異常なデータを検出 (${code}): fiftyTwoWeekHigh=${quote.fiftyTwoWeekHigh}`);
        // 異常値を修正
        quote.fiftyTwoWeekHigh = quote.regularMarketPrice || 0;
      }
      
      return {
        code: code,
        name: quote.longName || quote.shortName || '',
        price: quote.regularMarketPrice || 0,
        previousClose: quote.regularMarketPreviousClose || 0,
        change: quote.regularMarketChange || 0,
        changePercent: quote.regularMarketChangePercent || 0,
        dividendYield: (quote.trailingAnnualDividendYield || 0) * 100, // パーセント表記に変換
        annualDividend: quote.trailingAnnualDividendRate || 0, // 年間配当金
        market: quote.market || 'TYO',
        lastUpdated: new Date()
      };
    } catch (error) {
      // バリデーションエラーの場合は簡潔なメッセージにする
      if (error.message && error.message.includes('Schema validation')) {
        console.error(`Yahoo Finance validation error for ${code} - データ形式が不正です`);
      } else {
        console.error(`Error fetching stock price for ${code}:`, error.message);
      }
      throw error;
    }
  }

  async getMultipleStocks(codes) {
    const results = [];
    const batchSize = 10; // 一度に10銘柄ずつ処理

    for (let i = 0; i < codes.length; i += batchSize) {
      const batch = codes.slice(i, i + batchSize);
      const promises = batch.map(code => 
        this.getStockPrice(code).catch(err => {
          console.error(`Failed to fetch ${code}:`, err.message);
          return null;
        })
      );
      
      const batchResults = await Promise.all(promises);
      results.push(...batchResults.filter(r => r !== null));
      
      // レート制限対策
      if (i + batchSize < codes.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  async searchStock(query) {
    try {
      const results = await yahooFinance.search(query, {
        quotesCount: 20,
        newsCount: 0
      });

      // 日本株のみフィルタリング
      return results.quotes
        .filter(quote => quote.symbol.endsWith('.T'))
        .map(quote => ({
          code: quote.symbol.replace('.T', ''),
          name: quote.longname || quote.shortname || '',
          exchange: quote.exchange || 'TYO'
        }));
    } catch (error) {
      console.error('Search error:', error.message);
      return [];
    }
  }

  async getStockPriceHistory(code, days = 30) {
    try {
      // 日本株は.Tサフィックスを付ける
      const symbol = `${code}.T`;
      
      // 期間を計算
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const history = await yahooFinance.historical(symbol, {
        period1: startDate,
        period2: endDate,
        interval: '1d'
      });
      
      // 価格履歴を整形
      return history.map(data => ({
        date: data.date,
        price: data.close,
        high: data.high,
        low: data.low,
        open: data.open,
        volume: data.volume
      }));
    } catch (error) {
      console.error(`Error fetching price history for ${code}:`, error.message);
      throw error;
    }
  }
}