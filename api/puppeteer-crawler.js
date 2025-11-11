/**
 * Puppeteerによるヘッドレスブラウザクローリングモジュール
 * Vercel Hobby plan対応（メモリ2048MB制限）
 */

/**
 * Puppeteerでページをクロール
 * @param {string} url - クロール対象URL
 * @returns {Promise<object>} - クロール結果
 */
async function crawlWithPuppeteer(url) {
  let chromium, puppeteer;
  
  // ライブラリの動的インポート
  try {
    chromium = require('@sparticuz/chromium');
    puppeteer = require('puppeteer-core');
  } catch (e) {
    console.error('[PUPPETEER] Libraries not available:', e.message);
    throw new Error('Puppeteer is not installed or not available in this environment');
  }
  
  let browser = null;
  
  try {
    console.log('[PUPPETEER] Launching headless browser for URL:', url);
    
    // メモリ削減のための最適化設定
    const chromeArgs = [
      ...chromium.args,
      '--disable-dev-shm-usage',      // /dev/shm使用を無効化
      '--disable-gpu',                 // GPU無効化
      '--single-process',              // シングルプロセス
      '--no-zygote',                   // Zygoteプロセス無効化
      '--disable-setuid-sandbox',      // Sandboxの最適化
      '--disable-software-rasterizer', // ソフトウェアラスタライザ無効化
    ];
    
    // Chromiumの起動
    browser = await puppeteer.launch({
      args: chromeArgs,
      defaultViewport: { width: 1280, height: 720 }, // 小さめのビューポート
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    console.log('[PUPPETEER] Browser launched successfully');
    
    const page = await browser.newPage();
    
    // メモリ削減: 画像とCSSを読み込まない（必要な情報は取得できる）
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    // Googlebotとして振る舞う（多くのサイトがGooglebotを許可している）
    await page.setUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    });
    
    console.log(`[PUPPETEER] Navigating to: ${url}`);
    
    // ページに移動（networkidle2: ネットワークがアイドル状態になるまで待機）
    await page.goto(url, {
      waitUntil: 'domcontentloaded', // メモリ削減: networkidle2からdomcontentloadedに変更
      timeout: 60000
    });
    
    console.log('[PUPPETEER] Page loaded, waiting for JavaScript execution...');
    
    // JavaScriptが実行されるまで少し待機（短縮）
    await page.waitForTimeout(1500);
    
    // ページ情報を抽出
    const pageData = await page.evaluate(() => {
      // タイトル取得
      const title = document.querySelector('h1')?.textContent?.trim() ||
                    document.querySelector('h1[class*="title"]')?.textContent?.trim() ||
                    document.querySelector('[class*="product-title"]')?.textContent?.trim() ||
                    document.querySelector('[class*="productName"]')?.textContent?.trim() ||
                    document.title ||
                    document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
                    '';
      
      // 説明文取得
      const description = document.querySelector('meta[name="description"]')?.getAttribute('content') ||
                         document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
                         document.querySelector('[class*="description"]')?.textContent?.trim() ||
                         '';
      
      // 価格取得
      const price = document.querySelector('[class*="price"], [id*="price"], [class*="Price"]')?.textContent?.trim() ||
                   document.querySelector('meta[property="og:price:amount"]')?.getAttribute('content') ||
                   '';
      
      // 画像取得（最大10枚に制限）
      const images = [];
      const imgElements = document.querySelectorAll('img');
      let count = 0;
      for (let i = 0; i < imgElements.length && count < 10; i++) {
        const img = imgElements[i];
        const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
        if (src && !src.includes('icon') && !src.includes('logo') && !src.includes('sprite')) {
          if (!images.includes(src)) {
            images.push(src);
            count++;
          }
        }
      }
      
      // 本文テキスト（文字数制限）
      const bodyText = document.body.textContent.replace(/\s+/g, ' ').trim();
      
      // 商品詳細（最大5個に制限）
      const details = [];
      const detailElements = document.querySelectorAll('[class*="detail"], [class*="spec"], [class*="description"], [class*="info"]');
      for (let i = 0; i < detailElements.length && details.length < 5; i++) {
        const text = detailElements[i].textContent.trim();
        if (text && text.length > 10 && text.length < 5000) {
          details.push(text);
        }
      }
      
      return {
        title,
        description,
        price,
        images: images.slice(0, 10),
        bodyText: bodyText.substring(0, 8000), // 10000から8000に削減
        details: details.join('\n\n')
      };
    });
    
    // ブラウザを即座に閉じる
    await browser.close();
    browser = null;
    
    console.log('[PUPPETEER] Success! Extracted data:');
    console.log(`  - Title: ${pageData.title}`);
    console.log(`  - Images: ${pageData.images.length}`);
    console.log(`  - Body text length: ${pageData.bodyText.length}`);
    
    return {
      ...pageData,
      url,
      method: 'puppeteer',
      crawlMethod: 'headless-browser'
    };
    
  } catch (error) {
    if (browser) {
      await browser.close().catch(() => {});
    }
    console.error('[PUPPETEER] Error:', error.message);
    throw error;
  }
}

module.exports = { crawlWithPuppeteer };
