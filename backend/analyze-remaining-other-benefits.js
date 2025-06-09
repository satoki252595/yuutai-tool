import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function analyzeOtherBenefits() {
  const db = new sqlite3.Database(path.join(__dirname, 'db', 'yuutai.db'));
  const dbAll = promisify(db.all.bind(db));
  const dbClose = promisify(db.close.bind(db));

  try {
    // Get all "その他" benefits
    const otherBenefits = await dbAll(`
      SELECT 
        sb.id,
        sb.stock_code,
        s.name as company_name,
        sb.description as benefit_description,
        sb.min_shares as minimum_shares,
        sb.monetary_value as benefit_value
      FROM shareholder_benefits sb
      JOIN stocks s ON sb.stock_code = s.code
      WHERE sb.benefit_type = 'その他'
      ORDER BY RANDOM()
    `);

    console.log(`Total "その他" benefits: ${otherBenefits.length}\n`);

    // Analyze patterns
    const patterns = {
      // Pattern categories
      giftCard: { pattern: /(ギフトカード|ギフト券|プリペイドカード)/i, count: 0, examples: [] },
      points: { pattern: /(ポイント|point)/i, count: 0, examples: [] },
      voucher: { pattern: /(優待券|ご優待券|利用券|割引券|クーポン)/i, count: 0, examples: [] },
      quoCard: { pattern: /(クオカード|QUOカード|Quoカード)/i, count: 0, examples: [] },
      catalog: { pattern: /(カタログ|選べる)/i, count: 0, examples: [] },
      ticket: { pattern: /(チケット|入場券|招待券)/i, count: 0, examples: [] },
      service: { pattern: /(サービス|施設利用|会員)/i, count: 0, examples: [] },
      simpleValue: { pattern: /^[\d,]+円相当$/i, count: 0, examples: [] },
      valueWithItem: { pattern: /([\d,]+円相当|[\d,]+円分).*(?!の)/i, count: 0, examples: [] },
      product: { pattern: /(商品|製品|自社製品)/i, count: 0, examples: [] },
      travel: { pattern: /(旅行|宿泊|ホテル)/i, count: 0, examples: [] },
      health: { pattern: /(健康|医療|検診)/i, count: 0, examples: [] },
      sports: { pattern: /(スポーツ|ゴルフ|フィットネス)/i, count: 0, examples: [] },
      event: { pattern: /(イベント|コンサート|公演)/i, count: 0, examples: [] },
      digital: { pattern: /(デジタル|電子|オンライン|アプリ)/i, count: 0, examples: [] },
      subscription: { pattern: /(定期購読|会費|年会費)/i, count: 0, examples: [] },
      donation: { pattern: /(寄付|寄贈|社会貢献)/i, count: 0, examples: [] }
    };

    // Analyze each benefit
    const unmatched = [];
    otherBenefits.forEach(benefit => {
      let matched = false;
      
      for (const [key, data] of Object.entries(patterns)) {
        if (data.pattern.test(benefit.benefit_description)) {
          data.count++;
          if (data.examples.length < 3) {
            data.examples.push({
              code: benefit.stock_code,
              company: benefit.company_name,
              description: benefit.benefit_description
            });
          }
          matched = true;
          break; // Only count in the first matching category
        }
      }
      
      if (!matched) {
        unmatched.push(benefit);
      }
    });

    // Display results
    console.log("=== Pattern Analysis Results ===\n");

    // Sort patterns by count
    const sortedPatterns = Object.entries(patterns)
      .sort(([,a], [,b]) => b.count - a.count)
      .filter(([,data]) => data.count > 0);

    sortedPatterns.forEach(([key, data]) => {
      const percentage = ((data.count / otherBenefits.length) * 100).toFixed(1);
      console.log(`\n【${key}】 ${data.count}件 (${percentage}%)`);
      console.log("Examples:");
      data.examples.forEach(ex => {
        console.log(`  - [${ex.code}] ${ex.company}: ${ex.description}`);
      });
    });

    // Show unmatched samples
    console.log(`\n\n=== Unmatched Benefits === ${unmatched.length}件 (${((unmatched.length / otherBenefits.length) * 100).toFixed(1)}%)\n`);
    console.log("Sample of unmatched benefits (up to 20):");
    unmatched.slice(0, 20).forEach(benefit => {
      console.log(`  - [${benefit.stock_code}] ${benefit.company_name}: ${benefit.benefit_description}`);
    });

    // Analyze simple "X円相当" patterns
    console.log("\n\n=== Analysis of Simple '円相当' Benefits ===");
    const simpleValueBenefits = otherBenefits.filter(b => /^[\d,]+円相当$/.test(b.benefit_description));
    console.log(`Total simple "X円相当" benefits: ${simpleValueBenefits.length}`);

    // Group by company to see if there are patterns
    const companiesWithSimpleValue = {};
    simpleValueBenefits.forEach(benefit => {
      if (!companiesWithSimpleValue[benefit.company_name]) {
        companiesWithSimpleValue[benefit.company_name] = [];
      }
      companiesWithSimpleValue[benefit.company_name].push(benefit);
    });

    console.log("\nCompanies with simple '円相当' benefits:");
    Object.entries(companiesWithSimpleValue)
      .slice(0, 10)
      .forEach(([company, benefits]) => {
        console.log(`  - ${company}: ${benefits.map(b => b.benefit_description).join(', ')}`);
      });

    // Recommendations
    console.log("\n\n=== Recommendations for New Categories ===");
    console.log("Based on the analysis, consider adding these categories:");
    console.log("1. ギフトカード・金券 - For gift cards and prepaid cards");
    console.log("2. ポイント - For point-based benefits");
    console.log("3. 施設利用券 - For facility usage vouchers");
    console.log("4. カタログギフト - For catalog gifts");
    console.log("5. デジタルサービス - For digital/online services");
    console.log("6. 寄付・社会貢献 - For donation options");

    // Additional insights
    console.log("\n\n=== Additional Insights ===");
    const totalValue = otherBenefits.reduce((sum, b) => sum + (b.benefit_value || 0), 0);
    const avgValue = totalValue / otherBenefits.filter(b => b.benefit_value > 0).length;
    console.log(`Average benefit value: ${avgValue.toFixed(0)}円`);

    // Check for benefits that might belong to existing categories
    console.log("\n=== Benefits that might belong to existing categories ===");
    const foodKeywords = /(食品|食事|飲食|レストラン|飲料|お菓子|グルメ)/i;
    const foodInOther = otherBenefits.filter(b => foodKeywords.test(b.benefit_description));
    console.log(`\nPotential 食品・飲料 (${foodInOther.length} items):`);
    foodInOther.slice(0, 5).forEach(b => {
      console.log(`  - [${b.stock_code}] ${b.company_name}: ${b.benefit_description}`);
    });

    const dailyKeywords = /(洗剤|シャンプー|化粧品|日用品)/i;
    const dailyInOther = otherBenefits.filter(b => dailyKeywords.test(b.benefit_description));
    console.log(`\nPotential 日用品 (${dailyInOther.length} items):`);
    dailyInOther.slice(0, 5).forEach(b => {
      console.log(`  - [${b.stock_code}] ${b.company_name}: ${b.benefit_description}`);
    });

    await dbClose();
  } catch (error) {
    console.error('Error:', error);
    await dbClose();
  }
}

// Run the analysis
analyzeOtherBenefits();