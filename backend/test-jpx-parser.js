import fetch from 'node-fetch';
import * as XLSX from 'xlsx';

async function testJPXParser() {
  try {
    // JPXのページからExcelファイルのURLを取得
    const jpxUrl = 'https://www.jpx.co.jp/markets/statistics-equities/misc/01.html';
    const response = await fetch(jpxUrl);
    const html = await response.text();
    
    // ExcelファイルのURLを抽出
    const excelUrlMatch = html.match(/<a href="(.+?\.xls[x]?)"/);
    if (!excelUrlMatch) {
      throw new Error('ExcelファイルのURLが見つかりません');
    }
    
    const excelUrl = 'https://www.jpx.co.jp' + excelUrlMatch[1];
    console.log(`Excelファイル URL: ${excelUrl}`);
    
    // Excelファイルをダウンロード
    const excelResponse = await fetch(excelUrl);
    const arrayBuffer = await excelResponse.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    // Excelファイルを解析
    const workbook = XLSX.read(data, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    // ヘッダーを確認
    console.log('\nヘッダー:');
    console.log(jsonData[0]);
    
    // データの最初の10行を確認
    console.log('\nデータサンプル:');
    for (let i = 1; i <= 10 && i < jsonData.length; i++) {
      console.log(`Row ${i}:`, jsonData[i]);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testJPXParser();