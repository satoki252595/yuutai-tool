import { PRODUCTION_CONFIG } from './production-optimizations.js';

// 強化版キャッシュサービス（メモリ効率・TTL管理改善）
class EnhancedCacheService {
  constructor() {
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    
    // 定期的なメモリクリーンアップ
    this.startCleanupInterval();
  }
  
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      this.misses++;
      return null;
    }
    
    // TTLチェック
    if (item.expiry && Date.now() > item.expiry) {
      this.cache.delete(key);
      this.evictions++;
      this.misses++;
      return null;
    }
    
    // LRU更新
    item.lastAccessed = Date.now();
    this.hits++;
    return item.data;
  }
  
  set(key, data, ttl) {
    const isProduction = process.env.NODE_ENV === 'production';
    const defaultTTL = isProduction ? 
      PRODUCTION_CONFIG.cache.stocksListTTL : 
      5 * 60 * 1000; // 5分
    
    // メモリサイズチェック（簡易版）
    if (this.cache.size >= PRODUCTION_CONFIG.cache.maxItems) {
      this.evictLRU();
    }
    
    this.cache.set(key, {
      data,
      expiry: ttl ? Date.now() + ttl : Date.now() + defaultTTL,
      lastAccessed: Date.now()
    });
  }
  
  evictLRU() {
    let oldestKey = null;
    let oldestTime = Date.now();
    
    for (const [key, item] of this.cache) {
      if (item.lastAccessed < oldestTime) {
        oldestTime = item.lastAccessed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.evictions++;
    }
  }
  
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.evictions += size;
  }
  
  deletePattern(pattern) {
    let deleted = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        deleted++;
      }
    }
    this.evictions += deleted;
    return deleted;
  }
  
  getStats() {
    const hitRate = this.hits + this.misses > 0 ? 
      (this.hits / (this.hits + this.misses) * 100).toFixed(2) : 0;
    
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: `${hitRate}%`,
      memoryUsage: this.estimateMemoryUsage()
    };
  }
  
  estimateMemoryUsage() {
    // 簡易的なメモリ使用量推定
    let totalSize = 0;
    for (const item of this.cache.values()) {
      totalSize += JSON.stringify(item.data).length;
    }
    return `~${(totalSize / 1024).toFixed(2)}KB`;
  }
  
  startCleanupInterval() {
    // 5分ごとに期限切れエントリをクリーンアップ
    setInterval(() => {
      const now = Date.now();
      for (const [key, item] of this.cache) {
        if (item.expiry && now > item.expiry) {
          this.cache.delete(key);
          this.evictions++;
        }
      }
    }, 5 * 60 * 1000);
  }
}

export const cacheService = new EnhancedCacheService();