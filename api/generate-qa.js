const axios = require('axios');
const cheerio = require('cheerio');
const OpenAI = require('openai');
const { crawlWithPuppeteer } = require('./puppeteer-crawler');

// より多様なUser-Agentを追加
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
  // Googlebot
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDetailedError(error, context = '') {
  const errorInfo = {
    message: error.message || 'Unknown error',
    context: context,
    timestamp: new Date().toISOString(),
    type: error.constructor.name
  };

  if (error.response) {
    errorInfo.httpStatus = error.response.status;
    errorInfo.httpStatusText = error.response.statusText;
  }

  if (error.stack) {
    errorInfo.stack = error.stack.split('\n').slice(0, 3).join('\n');
  }

  return errorInfo;
}

function getDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return '';
  }
}

function detectProductCategory(productData) {
  try {
    const text = `${productData.title || ''} ${productData.description || ''} ${productData.details || ''}`.toLowerCase();
    
    if (text.match(/靴|シューズ|ブーツ|スニーカー|サンダル|パンプス/)) return 'footwear';
    if (text.match(/服|シャツ|パンツ|スカート|ワンピース|ジャケット|コート|ニット|カーディガン/)) return 'apparel';
    if (text.match(/ゴルフ|クラブ|ドライバー|アイアン|パター|ウッド|ボール/)) return 'golf';
    if (text.match(/バッグ|鞄|かばん|リュック|トート|ショルダー/)) return 'bag';
    if (text.match(/時計|ウォッチ|腕時計/)) return 'watch';
    if (text.match(/アクセサリー|ネックレス|ピアス|リング|指輪|ブレスレット/)) return 'accessory';
    if (text.match(/美容家電|ドライヤー|美顔器|脱毛器/)) return 'beauty_appliance';
    if (text.match(/家電|電化製品|冷蔵庫|洗濯機|エアコン|テレビ/)) return 'home_appliance';
    if (text.match(/化粧品|コスメ|スキンケア|ファンデーション|口紅|美容液/)) return 'cosmetics';
    if (text.match(/サプリ|サプリメント|健康食品|栄養補助/)) return 'supplement';
    if (text.match(/食品|食材|飲料|お菓子|スイーツ|グルメ/)) return 'food';
    
    return 'general';
  } catch (error) {
    return 'general';
  }
}


/**
 * HTMLソースコードを直接パースする関数
 */
async function parseSourceCode(sourceCode) {
  try {
    console.log('[SOURCE CODE MODE] Parsing HTML...');
    const $ = cheerio.load(sourceCode);

    let title = $('h1').first().text().trim() || $('title').text().trim() || '商品名不明';
    let description = $('meta[name="description"]').attr('content') || $('.description').first().text().trim() || '';
    let price = $('.price').first().text().trim() || '';
    
    const images = [];
    $('img').each((i, el) => {
      if (images.length >= 10) return false;
      let src = $(el).attr('src') || $(el).attr('data-src');
      if (src && src.startsWith('http')) images.push(src);
    });
    
    const details = [];
    $('[class*="spec"], table').each((i, el) => {
      if (details.length >= 5) return false;
      const text = $(el).text().trim();
      if (text && text.length > 10 && text.length < 500) details.push(text);
    });
    
    let bodyText = '';
    $('p, div').each((i, el) => {
      if (bodyText.length >= 8000) return false;
      const text = $(el).text().trim();
      if (text && text.length > 20) bodyText += text + ' ';
    });

    return { title, description, price, images, details, bodyText: bodyText.substring(0, 8000), sourceMode: true };
  } catch (error) {
    throw new Error(`HTMLソースコードの解析に失敗: ${error.message}`);
  }
}

/**
 * 強化版クローリング関数
 * - より多様なヘッダー
 * - 段階的なタイムアウト増加
 * - フォールバックメカニズム
 */
async function crawlProductPage(url, retries = 5) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[STEP 1] Crawling (Attempt ${attempt}/${retries}): ${url}`);
      
      // リトライ時の待機時間を段階的に増加
      if (attempt > 1) {
        const waitTime = Math.min(attempt * 3000, 15000); // 最大15秒
        console.log(`[STEP 1] Waiting ${waitTime}ms before retry...`);
        await delay(waitTime);
      }

      // タイムアウトを段階的に増加（30秒 → 45秒 → 60秒）
      const timeout = 30000 + (attempt - 1) * 15000;
      console.log(`[STEP 1] Using timeout: ${timeout}ms`);

      // より詳細なヘッダーを設定
      const headers = {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'max-age=0',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'DNT': '1'
      };

      // Refererを設定（2回目以降）
      if (attempt > 1) {
        const urlObj = new URL(url);
        headers['Referer'] = `${urlObj.protocol}//${urlObj.hostname}/`;
      }

      const response = await axios.get(url, {
        headers: headers,
        timeout: timeout,
        maxRedirects: 10, // リダイレクト許容数を増加
        validateStatus: (status) => status >= 200 && status < 500,
        decompress: true, // 自動解凍を有効化
        maxContentLength: 50 * 1024 * 1024, // 50MB
        maxBodyLength: 50 * 1024 * 1024
      });

      // ステータスコード別の処理
      if (response.status === 429) {
        if (attempt < retries) {
          console.log('[STEP 1] 429 Rate Limit - Waiting longer...');
          await delay(10000); // 10秒待機
          continue;
        }
        throw new Error('アクセス制限がかかっています。数分待ってから再試行してください。');
      }

      if (response.status === 403) {
        if (attempt < retries) {
          console.log('[STEP 1] 403 Forbidden - Changing User-Agent...');
          continue;
        }
        throw new Error('アクセスが拒否されました。このサイトはボット対策が強い可能性があります。');
      }

      if (response.status === 503 || response.status === 502) {
        if (attempt < retries) {
          console.log(`[STEP 1] ${response.status} Server Error - Retrying...`);
          continue;
        }
        throw new Error(`サーバーエラー（${response.status}）: サーバーが一時的に利用できません。`);
      }

      if (response.status >= 400) {
        throw new Error(`HTTPステータス ${response.status}: ${response.statusText}`);
      }

      console.log('[STEP 1] Page fetched successfully');

      // HTMLのパース
      const $ = cheerio.load(response.data);
      
      // タイトル取得（複数の方法を試行）
      const title = $('h1').first().text().trim() || 
                    $('h1[class*="title"]').first().text().trim() ||
                    $('h1[class*="name"]').first().text().trim() ||
                    $('[class*="product-title"]').first().text().trim() ||
                    $('[class*="productName"]').first().text().trim() ||
                    $('title').text().trim() || 
                    $('meta[property="og:title"]').attr('content') || 
                    $('meta[name="title"]').attr('content') || '';
      
      // 説明文取得
      const description = $('meta[name="description"]').attr('content') || 
                         $('meta[property="og:description"]').attr('content') ||
                         $('[class*="description"]').first().text().trim() || '';
      
      // 価格取得
      const price = $('[class*="price"], [id*="price"], [class*="Price"]').first().text().trim() || 
                   $('meta[property="og:price:amount"]').attr('content') || '';
      
      // 画像取得
      const images = [];
      $('img').each((i, elem) => {
        const src = $(elem).attr('src') || $(elem).attr('data-src') || $(elem).attr('data-lazy-src');
        if (src && !src.includes('icon') && !src.includes('logo') && !src.includes('sprite')) {
          try {
            const fullUrl = src.startsWith('http') ? src : new URL(src, url).href;
            if (!images.includes(fullUrl)) {
              images.push(fullUrl);
            }
          } catch (e) {}
        }
      });

      // 本文テキスト取得
      const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
      
      // 商品詳細取得
      const details = [];
      $('[class*="detail"], [class*="spec"], [class*="description"], [class*="info"]').each((i, elem) => {
        const text = $(elem).text().trim();
        if (text && text.length > 10 && text.length < 5000) {
          details.push(text);
        }
      });

      // タイトルが取得できない場合のフォールバック
      if (!title || title.length < 3) {
        console.warn('[STEP 1] Title not found, trying fallback methods...');
        
        // フォールバック: bodyテキストから推測
        const firstHeading = $('h1, h2, h3').first().text().trim();
        if (firstHeading && firstHeading.length > 3) {
          console.log('[STEP 1] Using fallback title from heading');
          return {
            url,
            title: firstHeading,
            description,
            price,
            images: images.slice(0, 15),
            bodyText: bodyText.substring(0, 10000),
            details: details.join('\n\n'),
            warning: 'タイトル取得に標準外の方法を使用しました'
          };
        }
        
        // それでもダメな場合は、最小限の情報で継続
        console.warn('[STEP 1] Using minimal data - title extraction failed');
        return {
          url,
          title: getDomain(url) + 'の商品',
          description: description || bodyText.substring(0, 200),
          price,
          images: images.slice(0, 15),
          bodyText: bodyText.substring(0, 10000),
          details: details.join('\n\n'),
          warning: 'タイトル取得に失敗しました。制限付きで処理を続行します。'
        };
      }

      return {
        url,
        title,
        description,
        price,
        images: images.slice(0, 15),
        bodyText: bodyText.substring(0, 10000),
        details: details.join('\n\n')
      };

    } catch (error) {
      lastError = error;
      
      console.error(`[STEP 1] Attempt ${attempt} failed:`, error.message);
      
      // タイムアウトエラーの場合は再試行
      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        if (attempt < retries) {
          console.log('[STEP 1] Timeout - will retry with longer timeout...');
          continue;
        }
      }
      
      // 接続エラーの場合は再試行
      if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
        if (attempt < retries) {
          console.log('[STEP 1] Connection error - retrying...');
          continue;
        }
      }
      
      // 最後の試行でもエラーの場合、Puppeteerフォールバックを試行
      if (attempt === retries) {
        console.log('[STEP 1] All axios attempts failed. Trying Puppeteer fallback...');
        
        try {
          const puppeteerData = await crawlWithPuppeteer(url);
          console.log('[STEP 1] Puppeteer fallback succeeded!');
          return puppeteerData;
        } catch (puppeteerError) {
          console.error('[STEP 1] Puppeteer fallback also failed:', puppeteerError.message);
          
          // Puppeteerでも失敗した場合、エラーメッセージを返す
          if (error.code === 'ENOTFOUND') {
            throw new Error(`URLにアクセスできません: ${url}`);
          } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
            throw new Error(`接続がタイムアウトしました（${retries}回試行、最大${30000 + (retries - 1) * 15000}ms待機）。Puppeteerでも失敗しました。`);
          } else if (error.response && error.response.status === 403) {
            throw new Error('アクセスが拒否されました。axiosとPuppeteer両方で失敗しました。');
          } else {
            throw new Error(`ページのクロールに失敗しました（axios & Puppeteer）: ${error.message}`);
          }
        }
      }
    }
  }
  
  throw lastError || new Error('クローリングに失敗しました');
}

async function analyzeImages(apiKey, imageUrls, productTitle) {
  if (!imageUrls || imageUrls.length === 0) {
    return { ocrResults: [], features: [] };
  }

  try {
    console.log(`[STEP 2] Analyzing ${imageUrls.length} images...`);
    
    const openai = new OpenAI({ apiKey });
    const imagesToAnalyze = imageUrls.slice(0, 5);
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: '商品画像から情報を抽出してください。テキスト、特徴、仕様などを詳細に記述してください。'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: `「${productTitle}」の画像から、サイズ、素材、色、特徴、注意事項などの情報を抽出してください。` },
            ...imagesToAnalyze.map(url => ({ type: 'image_url', image_url: { url } }))
          ]
        }
      ],
      max_tokens: 2000,
      temperature: 0.3
    });

    const analysis = response.choices[0].message.content;
    console.log('[STEP 2] Image analysis completed');

    return {
      ocrResults: [analysis],
      features: analysis.split('\n').filter(line => line.trim().length > 0)
    };
  } catch (error) {
    console.error('[STEP 2] Image analysis failed:', error.message);
    return { ocrResults: [], features: [], error: error.message };
  }
}

async function generateQuestionsAndAnswers(apiKey, productData, imageAnalysis, category, qaCount = 100, sourceType = 'both') {
  const openai = new OpenAI({ apiKey });
  
  console.log(`[STEP 3] Generating ${qaCount} Q&As for category: ${category}, sourceType: ${sourceType}`);

  const categoryPrompts = {
    footwear: `
靴製品について、以下の観点から質問と回答を生成してください：
- サイズ感・フィット感
- 素材・品質
- デザイン・スタイル
- 履き心地・クッション性
- 防水性・耐久性
- 手入れ・メンテナンス方法
- 使用シーン・コーディネート
- 配送・返品・交換
`,
    apparel: `
アパレル製品について、以下の観点から質問と回答を生成してください：
- サイズ感・着丈
- 素材・生地の特徴
- デザイン・カラー
- 着心地・伸縮性
- 洗濯・お手入れ方法
- コーディネート提案
- シーズン・使用シーン
- 配送・返品・交換
`,
    golf: `
ゴルフ用品について、以下の観点から質問と回答を生成してください：
- 製品仕様・スペック
- 適合ゴルファー（レベル・スイングタイプ）
- 飛距離・方向性
- 打感・操作性
- カスタマイズオプション
- 使用上の注意点
- メンテナンス方法
- 配送・保証
`,
    bag: `
バッグ製品について、以下の観点から質問と回答を生成してください：
- サイズ・容量
- 素材・品質
- デザイン・カラー
- 収納力・ポケット
- 重量・持ち運びやすさ
- 使用シーン
- 手入れ方法
- 配送・返品
`,
    watch: `
時計製品について、以下の観点から質問と回答を生成してください：
- 仕様・機能
- デザイン・サイズ
- ムーブメント
- 防水性能
- ベルト・バンド
- 使用シーン
- メンテナンス・保証
- 配送・返品
`,
    accessory: `
アクセサリー製品について、以下の観点から質問と回答を生成してください：
- サイズ・サイズ調整
- 素材・品質
- デザイン・スタイル
- アレルギー対応
- 使用シーン・コーディネート
- お手入れ方法
- ギフト包装
- 配送・返品
`,
    beauty_appliance: `
美容家電について、以下の観点から質問と回答を生成してください：
- 機能・性能
- 使用方法
- 効果・期待できる結果
- 安全性・注意事項
- 消耗品・交換部品
- 使用頻度・タイミング
- お手入れ・メンテナンス
- 保証・配送
`,
    home_appliance: `
家電製品について、以下の観点から質問と回答を生成してください：
- 製品仕様・性能
- 機能・操作方法
- 設置・サイズ
- 消費電力・ランニングコスト
- お手入れ・メンテナンス
- 保証・修理
- 配送・設置サービス
- 使用上の注意
`,
    cosmetics: `
化粧品について、以下の観点から質問と回答を生成してください（薬機法遵守）：
- 製品の特徴（効能効果は控えめに）
- 使用方法
- 成分・配合
- 肌質への適合性
- 使用感・テクスチャー
- 使用期限・保管方法
- アレルギーテスト
- 配送・返品
※医薬品的な効能表現は避けてください
`,
    supplement: `
サプリメントについて、以下の観点から質問と回答を生成してください（薬機法・健康増進法遵守）：
- 製品の特徴（効果効能は表現しない）
- 成分・栄養素
- 摂取方法・タイミング
- 1日の摂取目安量
- 原材料・アレルゲン
- 保管方法・賞味期限
- 注意事項
- 配送・返品
※病気の治療・予防効果の表現は厳禁
`,
    food: `
食品について、以下の観点から質問と回答を生成してください（食品表示法遵守）：
- 商品の特徴・おすすめポイント
- 原材料・栄養成分
- 味・食感
- 調理方法・食べ方
- 保存方法・賞味期限
- アレルゲン情報
- 産地・製造地
- 配送方法
※健康効果の過大な表現は避けてください
`,
    general: `
この商品について、以下の観点から質問と回答を生成してください：
- 商品の特徴・仕様
- 使用方法・使い方
- サイズ・寸法
- 素材・品質
- 使用シーン
- お手入れ・メンテナンス
- 配送・返品・交換
- その他よくある質問
`
  };

  const categoryPrompt = categoryPrompts[category] || categoryPrompts.general;

  const systemPrompt = `あなたは商品Q&A作成の専門家です。

重要な制約:
1. 指定された数（${qaCount}問）のQ&Aを必ず生成してください
2. **価格に関するQ&Aは絶対に含めないでください**
   - 「いくらですか」「値段は」「価格は」「〇〇円」などの価格関連の質問と回答は除外
   - セール・割引・クーポンに関する質問も除外
3. リソースタイプ指定: ${sourceType}
   - "specified_url": 指定されたページの情報のみ使用（外部情報は含めない）
   - "external": 外部情報・一般知識のみ使用（指定ページの具体的情報は含めない）
   - "both": 両方の情報を統合して使用

4. 各Q&Aには必ずsourceTypeフィールドを付与:
   - "specified_page": 指定されたページから取得した情報
   - "same_domain": 同ドメイン内の別ページから取得した情報
   - "external": 外部情報・AI提案（一般的な知識）

5. JSONフォーマット:
{
  "qa": [
    {
      "q": "質問文",
      "a": "回答文",
      "sourceType": "specified_page"
    }
  ]
}

${categoryPrompt}

法令遵守（重要）:
- 薬機法: 医薬品的効能の表現を避ける
- 景品表示法: 誇大広告を避ける
- 食品表示法: 健康効果の過大表現を避ける
- 健康増進法: 疾病の治療・予防効果の表現を避ける`;

  const userPrompt = `
商品情報:
タイトル: ${productData.title}
説明: ${productData.description}
価格: ${productData.price}
詳細: ${productData.details}

画像分析結果: ${imageAnalysis.ocrResults.join('\n')}

指定数: ${qaCount}問
リソースタイプ: ${sourceType}

上記情報をもとに、${qaCount}問のQ&Aを生成してください。`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0].message.content);
    console.log(`[STEP 3] Generated ${result.qa?.length || 0} Q&As`);

    return result.qa || [];
  } catch (error) {
    console.error('[STEP 3] Q&A generation failed:', error.message);
    throw error;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { url, apiKey, qaCount = 100, sourceType = 'both' } = req.body;
    const { sourceCode } = req.body;
    const isSourceCodeMode = url === 'source_code_input' && sourceCode;

    // ソースコードモードの検証
    if (isSourceCodeMode && sourceCode.length > 2000000) {
      throw new Error('HTMLソースコードが大きすぎます（最大2MB）');
    }

    if (!url || !apiKey) {
      throw new Error('URLとAPIキーが必要です');
    }

    // 検証
    if (qaCount < 10 || qaCount > 100) {
      throw new Error('Q&A数は10〜100の範囲で指定してください');
    }

    if (!['specified_url', 'external', 'both'].includes(sourceType)) {
      throw new Error('sourceTypeは specified_url, external, both のいずれかを指定してください');
    }

    console.log(`Starting Q&A generation: qaCount=${qaCount}, sourceType=${sourceType}, isSourceCodeMode=${isSourceCodeMode}`);

    // ステップ1: ページデータ取得
    let productData;
    
    if (isSourceCodeMode) {
      // HTMLソースコードモード
      res.write(`data: ${JSON.stringify({ type: 'progress', progress: 10, message: 'ステップ1: HTMLソースコードを解析中...' })}\n\n`);
      productData = await parseSourceCode(sourceCode);
      console.log('[SOURCE CODE MODE] Parsed HTML source code successfully');
    } else {
      // URLモード
      res.write(`data: ${JSON.stringify({ type: 'progress', progress: 10, message: 'ステップ1: 商品ページを取得中...' })}\n\n`);
      productData = await crawlProductPage(url);
    }

    if (productData.warning) {
      res.write(`data: ${JSON.stringify({ type: 'progress', progress: 15, message: `警告: ${productData.warning}` })}\n\n`);
    }

    // ステップ2: 画像分析
    res.write(`data: ${JSON.stringify({ type: 'progress', progress: 30, message: 'ステップ2: 画像を分析中...' })}\n\n`);
    const imageAnalysis = await analyzeImages(apiKey, productData.images, productData.title);

    // カテゴリ検出
    const category = detectProductCategory(productData);
    console.log(`Detected category: ${category}`);

    // ステップ3: Q&A生成
    res.write(`data: ${JSON.stringify({ type: 'progress', progress: 50, message: `ステップ3: ${qaCount}問のQ&Aを生成中...` })}\n\n`);
    
    let allQAs = await generateQuestionsAndAnswers(apiKey, productData, imageAnalysis, category, qaCount, sourceType);

    // sourceTypeによるフィルタリング
    if (sourceType === 'specified_url') {
      allQAs = allQAs.filter(qa => qa.sourceType === 'specified_page' || qa.sourceType === 'same_domain');
      console.log(`Filtered to ${allQAs.length} Q&As (specified_url only)`);
    } else if (sourceType === 'external') {
      allQAs = allQAs.filter(qa => qa.sourceType === 'external');
      console.log(`Filtered to ${allQAs.length} Q&As (external only)`);
    }

    // Q&A数の調整
    if (allQAs.length > qaCount) {
      allQAs = allQAs.slice(0, qaCount);
    }

    // Q&Aを順次送信
    for (let i = 0; i < allQAs.length; i++) {
      const progress = 50 + Math.floor((i / allQAs.length) * 40);
      res.write(`data: ${JSON.stringify({ type: 'progress', progress, message: `Q&A ${i + 1}/${allQAs.length} 生成完了` })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'qa', data: { question: allQAs[i].q, answer: allQAs[i].a, sourceType: allQAs[i].sourceType } })}\n\n`);
    }

    // 完了
    res.write(`data: ${JSON.stringify({ type: 'progress', progress: 100, message: `✅ ${allQAs.length}問のQ&A生成完了！` })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Generation error:', error);
    const errorInfo = formatDetailedError(error, 'メイン処理');
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message, details: errorInfo })}\n\n`);
    res.end();
  }
};
