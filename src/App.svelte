<script>
  import { onMount } from 'svelte';
  import StockCard from './lib/StockCard.svelte';
  import { searchStocks, updateStockPrice, getBenefitTypes, getRightsMonths } from './lib/api.js';
  import { INITIAL_FILTERS } from './lib/utils.js';

  // 状態管理
  let stocks = [];
  let loading = true;
  let error = null;
  let searchQuery = '';
  let filters = { ...INITIAL_FILTERS };
  let showRSI = true;
  
  // ページネーション
  let currentPage = 1;
  let totalPages = 1;
  let totalCount = 0;
  let pageSize = 50;
  
  // 選択肢リスト
  let benefitTypes = [];
  let rightsMonths = [];
  
  // 統計情報（算出値）
  $: displayedStocks = stocks.length;
  $: averageYield = displayedStocks > 0 
    ? Math.round(stocks.reduce((sum, s) => sum + (s.totalYield || 0), 0) / displayedStocks * 100) / 100
    : 0;

  async function loadStocks() {
    loading = true;
    error = null;
    
    try {
      const response = await searchStocks({ 
        search: searchQuery, 
        ...filters,
        page: currentPage,
        limit: pageSize
      });
      
      // ページネーション対応
      if (response.stocks) {
        stocks = response.stocks;
        totalCount = response.pagination.total;
        totalPages = response.pagination.totalPages;
        currentPage = response.pagination.page;
      } else {
        // 互換性のため（古いAPIレスポンス）
        stocks = response;
      }
    } catch (err) {
      error = '株式情報の取得に失敗しました。サーバーが起動していることを確認してください。';
      console.error('Error loading stocks:', err);
    } finally {
      loading = false;
    }
  }
  
  // ページ変更
  async function changePage(page) {
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    await loadStocks();
  }

  async function loadFilterOptions() {
    try {
      [benefitTypes, rightsMonths] = await Promise.all([
        getBenefitTypes(),
        getRightsMonths()
      ]);
    } catch (err) {
      console.error('Error loading filter options:', err);
    }
  }

  const handleSearch = (e) => {
    e.preventDefault();
    loadStocks();
  };

  const handleFilterChange = () => loadStocks();

  const resetFilters = () => {
    searchQuery = '';
    filters = { ...INITIAL_FILTERS };
    loadStocks();
  };

  const handleUpdatePrice = async ({ detail: { code } }) => {
    try {
      await updateStockPrice(code);
      await loadStocks();
    } catch (err) {
      console.error('Error updating price:', err);
    }
  };

  onMount(async () => {
    await Promise.all([loadFilterOptions(), loadStocks()]);
  });
</script>

<header class="header">
  <div class="container">
    <h1>🎁 優待投資ツール</h1>
    <p>日本株の優待＋配当による総合利回りを計算</p>
  </div>
</header>

<main class="container">
  <section class="search-section">
    <form class="search-form" on:submit={handleSearch}>
      <input
        type="text"
        class="search-input"
        placeholder="銘柄コード・銘柄名・優待内容で検索"
        bind:value={searchQuery}
      />
      <button type="submit" class="btn btn-primary">🔍 検索</button>
      <button type="button" class="btn btn-secondary" on:click={resetFilters}>🔄 リセット</button>
    </form>
  </section>

  <section class="filter-section">
    <div class="filter-row">
      <div class="filter-group">
        <label for="sort-by">並び順:</label>
        <select id="sort-by" bind:value={filters.sortBy} on:change={handleFilterChange}>
          <option value="totalYield">総合利回り</option>
          <option value="dividendYield">配当利回り</option>
          <option value="benefitYield">優待利回り</option>
          <option value="price">株価</option>
          <option value="name">銘柄名</option>
          <option value="code">証券コード</option>
          <option value="rsi14">RSI(14)</option>
          <option value="rsi28">RSI(28)</option>
        </select>
        <select bind:value={filters.sortOrder} on:change={handleFilterChange}>
          <option value="desc">高い順</option>
          <option value="asc">低い順</option>
        </select>
      </div>

      <div class="filter-group">
        <label for="benefit-type">優待ジャンル:</label>
        <select id="benefit-type" bind:value={filters.benefitType} on:change={handleFilterChange}>
          <option value="all">すべて</option>
          {#each benefitTypes as type}
            <option value={type}>{type}</option>
          {/each}
        </select>
      </div>

      <div class="filter-group">
        <label for="rights-month">権利月:</label>
        <select id="rights-month" bind:value={filters.rightsMonth} on:change={handleFilterChange}>
          <option value="all">すべて</option>
          {#each rightsMonths as month}
            <option value={month}>{month}月</option>
          {/each}
        </select>
      </div>

      <div class="filter-group">
        <label>
          <input type="checkbox" bind:checked={showRSI} />
          RSI表示
        </label>
      </div>

      <div class="filter-group">
        <label for="rsi-filter">RSI状態:</label>
        <select id="rsi-filter" bind:value={filters.rsiFilter} on:change={handleFilterChange}>
          <option value="all">すべて</option>
          <option value="oversold">売られすぎ（&lt;30）</option>
          <option value="neutral">適正（30-70）</option>
          <option value="overbought">買われすぎ（&gt;70）</option>
        </select>
      </div>

      <div class="filter-group">
        <label for="long-term">長期保有制度:</label>
        <select id="long-term" bind:value={filters.longTermHolding} on:change={handleFilterChange}>
          <option value="all">すべて</option>
          <option value="yes">あり</option>
          <option value="no">なし</option>
        </select>
      </div>
    </div>
  </section>

  {#if !loading && !error && stocks.length > 0}
    <section class="stats-section">
      <div class="stat-card">
        <div class="stat-value">{displayedStocks} / {totalCount}</div>
        <div class="stat-label">表示銘柄数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{averageYield}%</div>
        <div class="stat-label">平均総合利回り</div>
      </div>
    </section>
  {/if}

  {#if loading}
    <div class="loading">読み込み中...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if stocks.length === 0}
    <div class="no-results">
      該当する銘柄が見つかりませんでした。
      <br>データベースの初期化が必要な場合は、以下のコマンドを実行してください：
      <br><code>npm run db:init && npm run scrape</code>
    </div>
  {:else}
    <section class="stock-grid">
      {#each stocks as stock (stock.code)}
        <StockCard {stock} {showRSI} on:updatePrice={handleUpdatePrice} />
      {/each}
    </section>
    
    {#if totalPages > 1}
      <section class="pagination">
        <button 
          class="btn btn-secondary" 
          on:click={() => changePage(currentPage - 1)}
          disabled={currentPage === 1}
        >
          ← 前へ
        </button>
        
        <span class="page-info">
          ページ {currentPage} / {totalPages}
        </span>
        
        <button 
          class="btn btn-secondary" 
          on:click={() => changePage(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          次へ →
        </button>
      </section>
    {/if}
  {/if}
</main>

<style>
  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    margin: 2rem 0;
    padding: 1rem;
  }
  
  .page-info {
    font-weight: 500;
    color: var(--text-secondary);
  }
  
  .pagination button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>