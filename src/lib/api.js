const API_BASE = '/api'; // 相対パスに変更して本番環境対応

// APIリクエストの共通処理（コード圧縮）
const apiRequest = async (endpoint, options = {}) => {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

// URLパラメータ構築ヘルパー
const buildParams = (options) => {
  const params = new URLSearchParams();
  Object.entries(options).forEach(([key, value]) => {
    if (value && value !== 'all') params.append(key, value);
  });
  return params.toString();
};

export const searchStocks = (options = {}) => {
  // 20件制限でパフォーマンス最適化
  const defaultOptions = {
    page: 1,
    limit: 20,  // 開発・本番共に20件制限
    ...options
  };
  const query = buildParams(defaultOptions);
  return apiRequest(`/stocks${query ? `?${query}` : ''}`);
};

export const getBenefitTypes = () => apiRequest('/benefit-types');
export const getRightsMonths = () => apiRequest('/rights-months');
export const getStock = (code) => apiRequest(`/stocks/${code}`);

export const updateStockPrice = (code) => 
  apiRequest(`/stocks/${code}/update-price`, { method: 'POST' });

export const addBenefit = (code, benefit) => 
  apiRequest(`/stocks/${code}/benefits`, {
    method: 'POST',
    body: JSON.stringify(benefit)
  });