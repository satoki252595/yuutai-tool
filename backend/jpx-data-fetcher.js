import fetch from 'node-fetch';
import XLSX from 'xlsx';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class JPXDataFetcher {
  constructor() {
    this.cacheDir = path.join(__dirname, 'cache');
    this.jpxUrl = 'https://www.jpx.co.jp/markets/statistics-equities/misc/01.html';
  }

  /**
   * JPXのWebページから最新のExcelファイルURLを取得
   */
  async getLatestExcelUrl() {
    try {
      console.log('JPX統計情報ページにアクセス中...');
      const response = await fetch(this.jpxUrl);
      const html = await response.text();
      
      // xlsファイルのリンクを正規表現で抽出
      const xlsPattern = /<a href="([^"]+\.xls)"/g;
      const matches = [...html.matchAll(xlsPattern)];
      
      if (matches.length === 0) {
        throw new Error('JPXページからExcelファイルが見つかりません');
      }
      
      // 最初に見つかったExcelファイルのURLを使用
      let excelUrl = matches[0][1];
      
      // 相対URLの場合は絶対URLに変換
      if (excelUrl.startsWith('/')) {
        excelUrl = 'https://www.jpx.co.jp' + excelUrl;
      }
      
      console.log(`最新Excelファイル URL: ${excelUrl}`);
      return excelUrl;
      
    } catch (error) {
      console.error('JPXページの解析エラー:', error);
      throw error;
    }
  }

  /**
   * ExcelファイルをダウンロードしてJSONデータに変換
   */
  async downloadAndParseExcel(excelUrl) {
    try {
      console.log('Excelファイルをダウンロード中...');
      const response = await fetch(excelUrl);
      
      if (!response.ok) {
        throw new Error(`ダウンロードに失敗: ${response.status} ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      console.log('Excelファイルを解析中...');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
      
      console.log(`Excelから ${rawData.length} 行のデータを取得`);
      return this.parseStockData(rawData);
      
    } catch (error) {
      console.error('Excelファイルの処理エラー:', error);
      throw error;
    }
  }

  /**
   * 生データを構造化された株式データに変換
   */
  parseStockData(rawData) {
    if (rawData.length < 2) {
      throw new Error('Excelデータが不正です');
    }

    // ヘッダー行を取得（通常は1行目または2行目）
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(3, rawData.length); i++) {
      const row = rawData[i];
      if (row && Array.isArray(row) && row.length > 5) {
        // 証券コードらしきカラムがあるかチェック
        const hasCodeColumn = row.some(cell => 
          typeof cell === 'string' && 
          (cell.includes('コード') || cell.includes('銘柄') || cell.includes('code'))
        );
        if (hasCodeColumn) {
          headerRowIndex = i;
          break;
        }
      }
    }

    const headers = rawData[headerRowIndex];
    console.log('検出されたヘッダー:', headers);

    const stocks = [];
    const dataStartIndex = headerRowIndex + 1;

    for (let i = dataStartIndex; i < rawData.length; i++) {
      const row = rawData[i];
      
      if (!row || !Array.isArray(row) || row.length < 4) {
        continue; // 空行またはデータ不足をスキップ
      }

      try {
        // データの配置を推定（JPXの標準フォーマットに基づく）
        const [date, code, officeName, marketClass, industryDetailCode, industryDetail, industryCode, industry, scaleCode, scaleClass] = row;

        // 証券コードの検証
        if (!code || typeof code !== 'number' || code < 1000) {
          continue; // 無効な証券コードをスキップ
        }

        // 国内株式のみフィルタリング
        if (!marketClass || typeof marketClass !== 'string') {
          continue;
        }

        const isValidMarket = marketClass.includes('プライム') || 
                             marketClass.includes('スタンダード') || 
                             marketClass.includes('グロース');
        const isDomesticStock = marketClass.includes('内国株式');

        if (!isValidMarket || !isDomesticStock) {
          continue; // 国内株式以外をスキップ
        }

        const stockData = {
          date: date ? String(date) : '',
          code: String(code).padStart(4, '0'), // 4桁にパディング
          name: officeName ? String(officeName).trim() : '',
          marketClass: String(marketClass).trim(),
          industryDetailCode: industryDetailCode ? String(industryDetailCode) : '',
          industryDetail: industryDetail ? String(industryDetail).trim() : '',
          industryCode: industryCode ? String(industryCode) : '',
          industry: industry ? String(industry).trim() : '',
          scaleCode: scaleCode ? String(scaleCode) : '',
          scaleClass: scaleClass ? String(scaleClass).trim() : ''
        };

        stocks.push(stockData);

      } catch (error) {
        console.warn(`行 ${i} の処理をスキップ:`, error.message);
        continue;
      }
    }

    console.log(`${stocks.length} 銘柄のデータを正常に変換しました`);
    
    // 基本的な検証
    if (stocks.length === 0) {
      throw new Error('有効な株式データが見つかりませんでした');
    }

    return {
      fetchDate: new Date().toISOString(),
      totalCount: stocks.length,
      stocks: stocks
    };
  }

  /**
   * キャッシュディレクトリを作成
   */
  async ensureCacheDir() {
    try {
      await fs.access(this.cacheDir);
    } catch {
      await fs.mkdir(this.cacheDir, { recursive: true });
    }
  }

  /**
   * データをキャッシュファイルに保存
   */
  async saveToCache(data) {
    await this.ensureCacheDir();
    const cacheFile = path.join(this.cacheDir, 'jpx-stock-data.json');
    await fs.writeFile(cacheFile, JSON.stringify(data, null, 2), 'utf8');
    console.log(`キャッシュファイルに保存: ${cacheFile}`);
    return cacheFile;
  }

  /**
   * キャッシュからデータを読み込み
   */
  async loadFromCache() {
    try {
      const cacheFile = path.join(this.cacheDir, 'jpx-stock-data.json');
      const data = await fs.readFile(cacheFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.log('キャッシュファイルが見つかりません');
      return null;
    }
  }

  /**
   * 統計情報の表示
   */
  displayStatistics(data) {
    const marketStats = {};
    const industryStats = {};

    data.stocks.forEach(stock => {
      // 市場別統計
      const market = stock.marketClass;
      marketStats[market] = (marketStats[market] || 0) + 1;

      // 業界別統計
      const industry = stock.industry;
      if (industry) {
        industryStats[industry] = (industryStats[industry] || 0) + 1;
      }
    });

    console.log('\n📊 統計情報:');
    console.log(`総銘柄数: ${data.totalCount}`);
    console.log(`取得日時: ${data.fetchDate}`);
    
    console.log('\n🏛️ 市場別内訳:');
    Object.entries(marketStats)
      .sort(([,a], [,b]) => b - a)
      .forEach(([market, count]) => {
        console.log(`  ${market}: ${count} 銘柄`);
      });

    console.log('\n🏭 業界別上位10:');
    Object.entries(industryStats)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .forEach(([industry, count]) => {
        console.log(`  ${industry}: ${count} 銘柄`);
      });
  }

  /**
   * メイン実行: JPXから最新データを取得
   */
  async fetchLatestData(useCache = false) {
    try {
      // キャッシュ使用オプション
      if (useCache) {
        const cachedData = await this.loadFromCache();
        if (cachedData) {
          console.log('キャッシュからデータを読み込みました');
          this.displayStatistics(cachedData);
          return cachedData;
        }
      }

      // 最新データを取得
      const excelUrl = await this.getLatestExcelUrl();
      const stockData = await this.downloadAndParseExcel(excelUrl);
      
      // キャッシュに保存
      await this.saveToCache(stockData);
      
      // 統計情報を表示
      this.displayStatistics(stockData);
      
      return stockData;

    } catch (error) {
      console.error('JPXデータ取得エラー:', error);
      throw error;
    }
  }
}

// 実行部分
if (import.meta.url === `file://${process.argv[1]}`) {
  const fetcher = new JPXDataFetcher();
  
  const useCache = process.argv.includes('--cache');
  
  try {
    const data = await fetcher.fetchLatestData(useCache);
    console.log(`\n✅ JPXデータ取得完了: ${data.totalCount} 銘柄`);
  } catch (error) {
    console.error('❌ 処理に失敗しました:', error);
    process.exit(1);
  }
}