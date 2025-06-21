// 軽量インメモリキャッシュサービス（Redis代替）
import { LRUCache } from 'lru-cache';

class CacheService {
  constructor() {
    // LRUキャッシュの設定
    this.cache = new LRUCache({
      max: 500, // 最大500アイテム
      ttl: 5 * 60 * 1000, // 5分間のTTL
      maxSize: 50 * 1024 * 1024, // 最大50MBまで
      sizeCalculation: (value) => {
        // オブジェクトのサイズを推定
        return JSON.stringify(value).length;
      },
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });
    
    // ヒット率の統計
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0
    };
  }
  
  // キャッシュから取得
  get(key) {
    const value = this.cache.get(key);
    if (value) {
      this.stats.hits++;
      console.log(`🎯 Cache hit: ${key} (Hit rate: ${this.getHitRate()}%)`);
    } else {
      this.stats.misses++;
    }
    return value;
  }
  
  // キャッシュに保存
  set(key, value, ttl = null) {
    const options = ttl ? { ttl } : {};
    this.cache.set(key, value, options);
    this.stats.sets++;
    console.log(`💾 Cached: ${key}`);
  }
  
  // キャッシュを削除
  delete(key) {
    return this.cache.delete(key);
  }
  
  // キャッシュをクリア
  clear() {
    this.cache.clear();
    console.log('🧹 Cache cleared');
  }
  
  // パターンマッチングで削除
  deletePattern(pattern) {
    let deleted = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        deleted++;
      }
    }
    console.log(`🗑️ Deleted ${deleted} keys matching pattern: ${pattern}`);
    return deleted;
  }
  
  // ヒット率を計算
  getHitRate() {
    const total = this.stats.hits + this.stats.misses;
    if (total === 0) return 0;
    return Math.round((this.stats.hits / total) * 100);
  }
  
  // 統計情報を取得
  getStats() {
    return {
      ...this.stats,
      hitRate: this.getHitRate(),
      size: this.cache.size,
      calculatedSize: this.cache.calculatedSize
    };
  }
}

// シングルトンインスタンス
export const cacheService = new CacheService();