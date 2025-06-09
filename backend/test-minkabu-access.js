import puppeteer from 'puppeteer';
import { Database } from './database.js';

/**
 * みんかぶアクセステスト
 * 様々な設定でアクセスをテストし、最適な設定を見つける
 */
class MinkabuAccessTest {
  constructor() {
    this.db = new Database();
  }

  /**
   * 基本的なアクセステスト
   */
  async testBasicAccess() {
    console.log('🔍 基本的なアクセステスト開始');
    
    const testCodes = ['9983', '7203', '6758', '8306']; // ファーストリテイリング、トヨタ、ソニー、三菱UFJ
    
    for (const testConfig of this.getTestConfigurations()) {
      console.log(`\n📝 テスト設定: ${testConfig.name}`);
      
      const results = await this.testWithConfig(testConfig, testCodes);
      this.logResults(testConfig.name, results);
      
      // 成功率が高い設定を見つけた場合は詳細テスト
      if (results.successRate > 0.5) {
        console.log(`✅ ${testConfig.name} が有望です！詳細テストを実行...`);
        await this.detailedTest(testConfig);
      }
      
      // テスト間の間隔
      await this.sleep(5000);
    }
  }

  /**
   * テスト設定一覧
   */
  getTestConfigurations() {
    return [
      {
        name: '標準設定',
        options: {
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        },
        timeout: 30000,
        delay: 2000
      },
      {
        name: 'ヘッドフル(GUI)モード',
        options: {
          headless: false,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        },
        timeout: 30000,
        delay: 3000
      },
      {
        name: 'ユーザーエージェント偽装',
        options: {
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          ]
        },
        timeout: 30000,
        delay: 2000
      },
      {
        name: 'ステルスモード',
        options: {
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=VizDisplayCompositor',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--no-default-browser-check'
          ]
        },
        timeout: 45000,
        delay: 3000,
        stealth: true
      },
      {
        name: '低速アクセス',
        options: {
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        },
        timeout: 60000,
        delay: 8000,
        slowMo: 1000
      },
      {
        name: 'プロキシ経由（ローカル）',
        options: {
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--proxy-server=socks5://127.0.0.1:9050'  // Torプロキシ（利用可能な場合）
          ]
        },
        timeout: 60000,
        delay: 5000
      }
    ];
  }

  /**
   * 指定された設定でテスト実行
   */
  async testWithConfig(config, testCodes) {
    let browser = null;
    const results = {
      successful: 0,
      failed: 0,
      errors: [],
      successRate: 0
    };

    try {
      browser = await puppeteer.launch(config.options);
      const page = await browser.newPage();
      
      // ステルスモード設定
      if (config.stealth) {
        await this.setupStealthMode(page);
      }
      
      // スローモーション設定
      if (config.slowMo) {
        page._client.send('Emulation.setCPUThrottlingRate', { rate: 2 });
      }
      
      await page.setDefaultNavigationTimeout(config.timeout);
      await page.setDefaultTimeout(config.timeout);
      
      for (const stockCode of testCodes) {
        try {
          console.log(`  テスト中: ${stockCode}`);
          
          const url = `https://minkabu.jp/stock/${stockCode}/yutai`;
          await page.goto(url, { 
            waitUntil: 'networkidle2',
            timeout: config.timeout 
          });
          
          // ページの内容を確認
          const hasContent = await page.evaluate(() => {
            return document.querySelector('.md_box') !== null || 
                   document.querySelector('.ly_content_wrapper') !== null ||
                   document.body.textContent.includes('優待');
          });
          
          if (hasContent) {
            results.successful++;
            console.log(`    ✅ ${stockCode}: 成功`);
          } else {
            results.failed++;
            console.log(`    ❌ ${stockCode}: コンテンツが見つからない`);
          }
          
          // 遅延
          await this.sleep(config.delay);
          
        } catch (error) {
          results.failed++;
          results.errors.push(`${stockCode}: ${error.message}`);
          console.log(`    ❌ ${stockCode}: ${error.message}`);
        }
      }
      
    } catch (error) {
      console.log(`  🚫 ブラウザ起動エラー: ${error.message}`);
      results.failed = testCodes.length;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
    
    results.successRate = results.successful / testCodes.length;
    return results;
  }

  /**
   * ステルスモード設定
   */
  async setupStealthMode(page) {
    // WebDriverの痕跡を隠す
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });
    
    // ユーザーエージェントとビューポート設定
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });
    
    // 追加のヘッダー設定
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });
  }

  /**
   * 詳細テスト
   */
  async detailedTest(config) {
    console.log(`\n🔬 ${config.name} で詳細テスト実行`);
    
    const browser = await puppeteer.launch(config.options);
    const page = await browser.newPage();
    
    if (config.stealth) {
      await this.setupStealthMode(page);
    }
    
    try {
      // 実際の優待データを取得してみる
      const url = 'https://minkabu.jp/stock/9983/yutai'; // ファーストリテイリング
      console.log(`詳細テスト対象: ${url}`);
      
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: config.timeout 
      });
      
      // ページの詳細情報を取得
      const pageInfo = await page.evaluate(() => {
        const mdBoxes = document.querySelectorAll('.md_box');
        const benefits = [];
        
        mdBoxes.forEach(box => {
          const head = box.querySelector('.md_head');
          const body = box.querySelector('.md_body');
          
          if (head && body) {
            benefits.push({
              title: head.textContent.trim(),
              content: body.textContent.trim().slice(0, 100) + '...'
            });
          }
        });
        
        return {
          title: document.title,
          benefitCount: benefits.length,
          benefits: benefits,
          hasContent: mdBoxes.length > 0
        };
      });
      
      console.log('📄 取得された情報:');
      console.log(`  タイトル: ${pageInfo.title}`);
      console.log(`  優待情報数: ${pageInfo.benefitCount}`);
      
      if (pageInfo.benefits.length > 0) {
        console.log('  優待内容:');
        pageInfo.benefits.forEach((benefit, index) => {
          console.log(`    ${index + 1}. ${benefit.title}: ${benefit.content}`);
        });
      }
      
    } catch (error) {
      console.log(`❌ 詳細テストエラー: ${error.message}`);
    } finally {
      await browser.close();
    }
  }

  /**
   * 結果の表示
   */
  logResults(configName, results) {
    console.log(`  結果 - 成功: ${results.successful}, 失敗: ${results.failed}, 成功率: ${(results.successRate * 100).toFixed(1)}%`);
    
    if (results.errors.length > 0) {
      console.log(`  エラー詳細:`);
      results.errors.forEach(error => console.log(`    - ${error}`));
    }
  }

  /**
   * スリープ
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 直接実行時の処理
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new MinkabuAccessTest();
  test.testBasicAccess().catch(console.error);
}