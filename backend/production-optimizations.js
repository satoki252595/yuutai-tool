// 本番環境向け高速化設定

export const PRODUCTION_CONFIG = {
  // データベース最適化
  database: {
    // WALモードでの並行性向上
    pragmas: [
      'PRAGMA journal_mode = WAL',
      'PRAGMA synchronous = NORMAL',
      'PRAGMA cache_size = -128000',  // 128MB (GCE free tierに最適化)
      'PRAGMA temp_store = MEMORY',
      'PRAGMA mmap_size = 268435456', // 256MB
      'PRAGMA threads = 4',           // マルチスレッド処理
      'PRAGMA optimize'               // 自動最適化
    ]
  },
  
  // キャッシュ設定
  cache: {
    // より長いTTL (本番環境用)
    stocksListTTL: 10 * 60 * 1000,      // 10分
    benefitTypesTTL: 30 * 60 * 1000,    // 30分
    rightsMonthsTTL: 30 * 60 * 1000,    // 30分
    individualStockTTL: 5 * 60 * 1000,  // 5分
    
    // LRU設定
    maxItems: 1000,
    maxSize: 100 * 1024 * 1024  // 100MB
  },
  
  // API設定
  api: {
    // デフォルト制限値
    defaultLimit: 20,    // より少ない件数
    maxLimit: 50,        // 最大50件に制限
    
    // タイムアウト設定
    timeoutMs: 45000,    // 45秒タイムアウト
    
    // 圧縮レベル
    compressionLevel: 9, // 最高圧縮
    compressionThreshold: 512 // 512B以上で圧縮
  },
  
  // データベース接続プール
  connectionPool: {
    max: 5,              // 最大5接続
    min: 1,              // 最小1接続
    idle: 10000,         // アイドル時間10秒
    acquire: 30000,      // 取得タイムアウト30秒
    evict: 1000          // エビクション間隔1秒
  }
};