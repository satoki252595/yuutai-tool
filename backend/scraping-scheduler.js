import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class ScrapingScheduler {
  constructor() {
    this.interval = parseInt(process.env.SCRAPING_INTERVAL) || 86400000; // デフォルト24時間
    this.isRunning = false;
  }

  async runScraping() {
    if (this.isRunning) {
      console.log('⏭️  スクレイピングが既に実行中です。スキップします。');
      return;
    }

    this.isRunning = true;
    const startTime = new Date();
    console.log(`🚀 定期スクレイピング開始: ${startTime.toISOString()}`);

    try {
      // 堅牢な並行スクレイピングを実行
      const { stdout, stderr } = await execAsync('node backend/robust-parallel-scraper.js');
      
      if (stdout) console.log(stdout);
      if (stderr) console.error('スクレイピングエラー:', stderr);

      const endTime = new Date();
      const duration = (endTime - startTime) / 1000 / 60; // 分単位
      console.log(`✅ 定期スクレイピング完了: ${endTime.toISOString()}`);
      console.log(`⏱️  所要時間: ${duration.toFixed(2)}分`);

    } catch (error) {
      console.error('❌ スクレイピングエラー:', error.message);
    } finally {
      this.isRunning = false;
    }
  }

  async start() {
    console.log('📅 スクレイピングスケジューラーを開始します');
    console.log(`⏰ 実行間隔: ${this.interval / 1000 / 60 / 60}時間`);

    // 初回実行
    await this.runScraping();

    // 定期実行の設定
    setInterval(() => {
      this.runScraping();
    }, this.interval);

    // プロセス終了時のクリーンアップ
    process.on('SIGTERM', () => {
      console.log('👋 スケジューラーを終了します');
      process.exit(0);
    });

    process.on('SIGINT', () => {
      console.log('👋 スケジューラーを終了します');
      process.exit(0);
    });
  }
}

// メイン実行
const scheduler = new ScrapingScheduler();
scheduler.start();