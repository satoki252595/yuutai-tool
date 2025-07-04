<script>
  import { createEventDispatcher } from 'svelte';
  import { 
    formatPrice, formatPercent, getMonthName, getBenefitTypeColor,
    getRSIColor, getRSIStatus, formatRightsMonths
  } from './utils.js';
  
  export let stock;
  export let showRSI = true;
  
  const dispatch = createEventDispatcher();
  
  // データ正規化（最適化版）
  $: s = {
    code: stock?.code || '',
    name: stock?.name || '',
    price: stock?.price || 0,
    dividendYield: stock?.dividendYield || 0,
    benefitYield: stock?.benefitYield || 0,
    totalYield: stock?.totalYield || 0,
    benefits: stock?.shareholderBenefits || [],
    hasLongTermHolding: stock?.hasLongTermHolding || false,
    rsi14: stock?.rsi14,
    rsi28: stock?.rsi28,
    rsi14Stats: stock?.rsi14Stats,
    rsi28Stats: stock?.rsi28Stats
  };
  
  const handleUpdatePrice = () => dispatch('updatePrice', { code: s.code });
  
</script>

<div class="stock-card">
  <div class="stock-header">
    <div class="stock-info">
      <div class="stock-code">{s.code}</div>
      <h3 class="stock-name">{s.name}</h3>
      {#if s.hasLongTermHolding}
        <div class="long-term-badge">長期保有優遇</div>
      {/if}
    </div>
    <div class="stock-price">
      <div class="price">¥{formatPrice(s.price)}</div>
      <button class="update-btn" on:click={handleUpdatePrice} title="株価を更新">🔄</button>
    </div>
  </div>
  
  {#if showRSI && (s.rsi14 != null || s.rsi28 != null)}
    <div class="rsi-section">
      <div class="rsi-item">
        <div class="rsi-label">RSI(14)</div>
        <div class="rsi-value" style="color: {getRSIColor(s.rsi14)}">
          {s.rsi14 != null ? formatPercent(s.rsi14) : '-'}
          {#if s.rsi14Stats?.percentile != null}
            <span class="rsi-percentile">({formatPercent(s.rsi14Stats.percentile)}%ile)</span>
          {/if}
        </div>
        <div class="rsi-status">{getRSIStatus(s.rsi14)}</div>
      </div>
      <div class="rsi-item">
        <div class="rsi-label">RSI(28)</div>
        <div class="rsi-value" style="color: {getRSIColor(s.rsi28)}">
          {s.rsi28 != null ? formatPercent(s.rsi28) : '-'}
          {#if s.rsi28Stats?.percentile != null}
            <span class="rsi-percentile">({formatPercent(s.rsi28Stats.percentile)}%ile)</span>
          {/if}
        </div>
        <div class="rsi-status">{getRSIStatus(s.rsi28)}</div>
      </div>
    </div>
  {/if}
  
  <div class="yield-section">
    <div class="yield-item">
      <div class="yield-label">配当利回り</div>
      <div class="yield-value">{formatPercent(s.dividendYield)}%</div>
    </div>
    <div class="yield-item">
      <div class="yield-label">優待利回り</div>
      <div class="yield-value">{formatPercent(s.benefitYield)}%</div>
    </div>
    <div class="yield-item total">
      <div class="yield-label">総合利回り</div>
      <div class="yield-value">{formatPercent(s.totalYield)}%</div>
    </div>
  </div>
  
  {#if s.benefits.length > 0}
    <div class="benefits-section">
      <h4 class="benefits-title">株主優待内容</h4>
      <div class="benefits-list">
        {#each s.benefits as benefit}
          <div class="benefit-item">
            <div class="benefit-header">
              <span 
                class="benefit-type" 
                style="background-color: {getBenefitTypeColor(benefit.benefit_type)}"
              >
                {benefit.benefit_type || 'その他'}
              </span>
              <span class="benefit-month">{formatRightsMonths(benefit.rightsMonths || benefit.ex_rights_month || 3)}</span>
            </div>
            {#if benefit.benefit_content && benefit.benefit_content !== benefit.description}
              <div class="benefit-content-section">
                <h5 class="benefit-content-label">優待内容</h5>
                <p class="benefit-content">{benefit.benefit_content}</p>
              </div>
            {/if}
            <div class="benefit-description-section">
              <h5 class="benefit-description-label">詳細条件</h5>
              <p class="benefit-description">{benefit.description || '詳細情報なし'}</p>
            </div>
            <div class="benefit-details">
              <span class="benefit-value">¥{formatPrice(benefit.monetary_value || 0)}相当</span>
              <span class="benefit-shares">{benefit.min_shares || 100}株以上</span>
              {#if benefit.has_long_term_holding}
                <span class="long-term-info">🆁 {benefit.long_term_months || 12}ヶ月以上</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="no-benefits">優待情報はありません</div>
  {/if}
</div>

<style>
  .stock-card {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    padding: 1.5rem;
    transition: transform 0.2s, box-shadow 0.2s;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  
  .stock-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }
  
  .stock-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #eee;
  }
  
  .stock-info { flex: 1; }
  
  .stock-code {
    font-size: 0.875rem;
    color: #666;
    margin-bottom: 0.25rem;
  }
  
  .stock-name {
    font-size: 1.25rem;
    font-weight: 600;
    color: #333;
    margin: 0;
  }
  
  .long-term-badge {
    display: inline-block;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.2rem 0.5rem;
    border-radius: 10px;
    margin-top: 0.3rem;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }
  
  .stock-price {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .price {
    font-size: 1.5rem;
    font-weight: bold;
    color: #007bff;
  }
  
  .update-btn {
    background: none;
    border: none;
    font-size: 1.2rem;
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.2s;
    padding: 0.25rem;
  }
  
  .update-btn:hover { opacity: 1; }
  
  .yield-section, .rsi-section {
    display: grid;
    gap: 1rem;
    margin: 1rem 0;
    padding: 1rem;
    border-radius: 4px;
  }
  
  .yield-section {
    grid-template-columns: repeat(3, 1fr);
    background-color: #f8f9fa;
  }
  
  .rsi-section {
    grid-template-columns: 1fr 1fr;
    background-color: #f0f4f8;
  }
  
  .yield-item, .rsi-item { text-align: center; }
  
  .yield-item.total {
    border-left: 2px solid #dee2e6;
    padding-left: 1rem;
  }
  
  .yield-label, .rsi-label {
    font-size: 0.75rem;
    color: #666;
    margin-bottom: 0.25rem;
    font-weight: 600;
  }
  
  .yield-value, .rsi-value {
    font-size: 1.25rem;
    font-weight: bold;
    color: #333;
    margin-bottom: 0.25rem;
  }
  
  .yield-item.total .yield-value {
    color: #28a745;
    font-size: 1.5rem;
  }
  
  .yield-value.with-tooltip {
    position: relative;
    cursor: help;
    border-bottom: 1px dotted #666;
    display: inline-block;
  }
  
  .rsi-percentile {
    font-size: 0.75rem;
    font-weight: normal;
    opacity: 0.8;
  }
  
  .rsi-status {
    font-size: 0.75rem;
    color: #666;
  }
  
  .benefits-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    margin-top: 1rem;
  }
  
  .benefits-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: #666;
    margin: 0 0 0.75rem 0;
  }
  
  .benefits-list {
    flex: 1;
    overflow-y: auto;
    max-height: 300px;
  }
  
  .benefit-item {
    padding: 0.75rem;
    background-color: #f8f9fa;
    border-radius: 4px;
    margin-bottom: 0.5rem;
  }
  
  .benefit-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  
  .benefit-type {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    color: white;
    border-radius: 3px;
    font-size: 0.75rem;
    font-weight: 500;
  }
  
  .benefit-month {
    font-size: 0.75rem;
    color: #666;
  }
  
  .benefit-content-section,
  .benefit-description-section {
    margin: 0.75rem 0;
  }
  
  .benefit-content-label,
  .benefit-description-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #666;
    margin: 0 0 0.25rem 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .benefit-content {
    font-size: 0.95rem;
    color: #007bff;
    font-weight: 600;
    margin: 0;
    line-height: 1.4;
    word-break: break-word;
  }
  
  .benefit-description {
    font-size: 0.875rem;
    color: #333;
    margin: 0;
    line-height: 1.4;
    word-break: break-word;
  }
  
  .long-term-info {
    font-size: 0.75rem;
    color: #6c757d;
    background-color: #e9ecef;
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
    white-space: nowrap;
  }
  
  .benefit-details {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.5rem;
  }
  
  .benefit-value {
    font-weight: 600;
    color: #28a745;
    font-size: 0.875rem;
  }
  
  .benefit-shares {
    font-size: 0.75rem;
    color: #666;
  }
  
  .no-benefits {
    text-align: center;
    padding: 2rem;
    color: #999;
    font-size: 0.875rem;
  }
</style>