# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

優待投資ツール - 日本株の株主優待と配当による総合利回りを計算するWebアプリケーション

## Commands

- `npm install` - 依存関係のインストール
- `npm run dev` - Svelteフロントエンド開発サーバー
- `npm run build` - プロダクションビルド
- `npm run server` - バックエンドAPIサーバー起動
- `npm run scrape` - 全銘柄の優待情報スクレイピング（旧版）
- `npm run scrape:fast-resume` - 高速並行スクレイピング（再開可能）
- `npm run reset:all` - DB完全リセット＋JPX公式データから50銘柄サンプル実行
- `npm run market:test` - **推奨** JPX公式データからテスト実行（食品業界20銘柄、6ブラウザ）
- `npm run market:partial` - JPX公式データから部分実行（主要6業界、6ブラウザ並行）
- `npm run market:full` - **JPX公式データから全市場実行（3,711銘柄、6ブラウザ並行）**
- `npm run db:init` - SQLiteデータベース初期化

## 銘柄データソース

- **JPX（日本取引所グループ）公式データ**: 3,711上場企業の正確な銘柄コード・企業名・市場区分・業界分類
- **自動キャッシュ機能**: 初回はJPXから最新Excelをダウンロード、以降はキャッシュから高速読み込み
- **フォールバック対応**: JPX取得失敗時は手動生成コードで代替実行

## Architecture

- **フロントエンド**: Svelte + Vite
  - `/src/lib/` - コンポーネントとAPI通信
  - `/src/App.svelte` - メインアプリケーション
- **バックエンド**: Node.js + Express (ES Modules)
  - `/backend/server.js` - APIサーバー
  - `/backend/database.js` - SQLite操作
  - `/backend/yahooFinance.js` - Yahoo Finance API統合
  - `/backend/scraper.js` - Puppeteerによる優待情報スクレイピング
- **データベース**: SQLite3
  - stocks - 銘柄情報
  - shareholder_benefits - 優待情報
  - price_history - 株価履歴

## Key Features

- Yahoo Finance APIによるリアルタイム株価取得
- 全銘柄対応のスクレイピング機能
- 総合利回り自動計算（配当＋優待）
- SQLiteによる高速なローカルDB
- Svelteによる軽量で高速なUI