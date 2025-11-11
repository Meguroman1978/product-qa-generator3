/**
 * Puppeteerによるヘッドレスブラウザクローリング
 * Vercel環境で動作するように最適化
 */

const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

/**
 * ヘッドレスブラウザでページをクロール
 */
async function crawlWithBrowser(url, options = {}) {
  const {
    timeout = 60000,
    waitForSelector = 'body',
    userAgent = null
  } = options;

  let browser = null;
  
  try {
    console.log('[BROWSER] Launching headless browser...');
    
    // Vercel環境でChromiumを起動
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    console.log('[BROWSER] Browser launched successfully');
    
    const page = await browser.newPage();
    
    // User-Agentを設定（指定があれば使用、なければGooglebotを含む複数を試行）
    const userAgents = userAgent ? [userAgent] : [
      // Googlebot
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      // 通常のブラウザ
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    
    const selectedUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    await page.setUserAgent(selectedUserAgent);
    console.log(`[BROWSER] User-Agent: ${selectedUserAgent.substring(0, 50)}...`);
    
    // 追加のヘッダーを設定
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    });
    
    // ページに移動
    console.log(`[BROWSER] Navigating to: ${url}`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: timeout
    });
    
    console.log('[BROWSER] Page loaded, waiting for content...');
    
    // コンテンツが読み込まれるまで待機
    try {
      await page.waitForSelector(waitForSelector, { timeout: 10000 });
    } catch (e) {
      console.warn('[BROWSER] Selector wait timeout, continuing anyway...');
    }
    
    // 少し待機してJavaScriptが実行されるのを待つ
    await page.waitForTimeout(2000);
    
    console.log('[BROWSER] Extracting content...');
    
    // ページ情報を取得
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
      
      // 画像取得
      const images = [];
      document.querySelectorAll('img').forEach(img => {
        const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
        if (src && !src.includes('icon') && !src.includes('logo') && !src.includes('sprite')) {
          if (!images.includes(src)) {
            images.push(src);
          }
        }
      });
      
      // 本文テキスト
      const bodyText = document.body.textContent.replace(/\s+/g, ' ').trim();
      
      // 商品詳細
      const details = [];
      document.querySelectorAll('[class*="detail"], [class*="spec"], [class*="description"], [class*="info"]').forEach(elem => {
        const text = elem.textContent.trim();
        if (text && text.length > 10 && text.length < 5000) {
          details.push(text);
        }
      });
      
      return {
        title,
        description,
        price,
        images: images.slice(0, 15),
        bodyText: bodyText.substring(0, 10000),
        details: details.join('\n\n')
      };
    });
    
    console.log('[BROWSER] Content extracted successfully');
    console.log(`[BROWSER] Title: ${pageData.title}`);
    console.log(`[BROWSER] Images: ${pageData.images.length}`);
    
    await browser.close();
    
    return {
      ...pageData,
      url,
      method: 'browser',
      userAgent: selectedUserAgent
    };
    
  } catch (error) {
    if (browser) {
      await browser.close().catch(() => {});
    }
    throw error;
  }
}

/**
 * APIハンドラー
 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url, timeout, userAgent } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URLが必要です' });
    }

    console.log(`[API] Starting browser crawl for: ${url}`);
    
    const result = await crawlWithBrowser(url, { timeout, userAgent });
    
    console.log('[API] Crawl completed successfully');
    res.json(result);
    
  } catch (error) {
    console.error('[API] Browser crawl error:', error);
    res.status(500).json({
      error: 'ブラウザクローリングに失敗しました',
      message: error.message,
      details: error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : ''
    });
  }
};
