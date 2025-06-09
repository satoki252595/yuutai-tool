/**
 * 共通ユーティリティ関数
 * コードの重複を削減し、再利用性を向上
 */

// 数値フォーマット関数
export const formatPrice = (price) => price ? price.toLocaleString('ja-JP') : '0';
export const formatPercent = (percent) => percent ? percent.toFixed(2) : '0.00';

// 月名取得
const MONTHS = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
export const getMonthName = (month) => MONTHS[month] || `${month}月`;

// 優待タイプの色定義
const BENEFIT_COLORS = {
  '食事券・グルメ券': '#ff6b6b',
  '商品券・ギフトカード': '#e74c3c',
  'QUOカード・図書カード': '#4ecdc4',
  '割引券・優待券': '#45b7d1',
  '自社製品・商品': '#f39c12',
  'カタログギフト': '#9b59b6',
  'ポイント・電子マネー': '#2ecc71',
  '宿泊・レジャー': '#e67e22',
  '交通・乗車券': '#3498db',
  '金券・現金': '#27ae60',
  '寄付選択制': '#f1c40f',
  '美容・健康': '#e91e63',
  '本・雑誌・エンタメ': '#673ab7',
  'その他': '#95a5a6'
};
export const getBenefitTypeColor = (type) => BENEFIT_COLORS[type] || '#95a5a6';

// RSI関連ユーティリティ
export const getRSIColor = (rsi) => {
  if (rsi == null) return '#999';
  return rsi < 30 ? '#e74c3c' : rsi > 70 ? '#f39c12' : '#27ae60';
};

export const getRSIStatus = (rsi) => {
  if (rsi == null) return '-';
  return rsi < 30 ? '売られすぎ' : rsi > 70 ? '買われすぎ' : '適正';
};

// 初期フィルター設定
export const INITIAL_FILTERS = {
  sortBy: 'totalYield',
  sortOrder: 'desc',
  benefitType: 'all',
  rightsMonth: 'all',
  rsiFilter: 'all',
  longTermHolding: 'all'
};


