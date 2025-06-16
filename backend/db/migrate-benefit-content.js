import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new sqlite3.Database(join(__dirname, 'yuutai.db'));

console.log('benefit_contentカラムのマイグレーション開始...');

// まず現在のカラムを確認
db.all("PRAGMA table_info(shareholder_benefits)", (err, rows) => {
  if (err) {
    console.error('テーブル情報の取得エラー:', err);
    db.close();
    process.exit(1);
  }
  
  const hasColumn = rows.some(row => row.name === 'benefit_content');
  
  if (hasColumn) {
    console.log('✓ benefit_content カラムは既に存在します');
    db.close();
    process.exit(0);
  }
  
  // benefit_contentカラムを追加
  console.log('benefit_content カラムを追加中...');
  db.run(`
    ALTER TABLE shareholder_benefits 
    ADD COLUMN benefit_content TEXT
  `, (err) => {
    if (err) {
      console.error('✗ カラム追加エラー:', err);
      db.close();
      process.exit(1);
    }
    
    console.log('✓ benefit_content カラムを追加しました');
    
    // 既存のdescriptionからbenefit_contentを初期化
    db.run(`
      UPDATE shareholder_benefits 
      SET benefit_content = description 
      WHERE benefit_content IS NULL
    `, (err) => {
      if (err) {
        console.error('✗ 初期化エラー:', err);
        db.close();
        process.exit(1);
      }
      
      console.log('✓ 既存データのbenefit_contentを初期化しました');
      console.log('マイグレーション完了！');
      db.close();
    });
  });
});