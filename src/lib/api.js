const API_BASE = 'http://localhost:5001/api';

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
  const query = buildParams(options);
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