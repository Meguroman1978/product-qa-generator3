const officegen = require('officegen');

/**
 * ソースタイプのラベル取得
 */
function getSourceLabel(sourceType) {
  const labels = {
    'specified_page': 'ソース: 指定されたページ',
    'same_domain': 'ソース: 指定サイト内の別ページ',
    'external': 'ソース: ファイアーワークからの提案（回答内容は仮）'
  };
  return labels[sourceType] || 'ソース: 不明';
}

/**
 * Word文書生成
 */
async function generateWord(data, includeLabels) {
  return new Promise((resolve, reject) => {
    try {
      const docx = officegen({
        type: 'docx',
        orientation: 'portrait',
        subject: 'Product Q&A Collection',
        creator: 'Product Q&A Generator v4.2',
        description: 'AI-generated product Q&A'
      });

      // エラーハンドリング
      docx.on('error', (err) => {
        console.error('Word generation error:', err);
        reject(err);
      });

      // タイトル
      let pObj = docx.createP({ align: 'center' });
      pObj.addText('商品Q&A集', {
        bold: true,
        font_size: 24,
        color: '333333'
      });

      // 商品名
      if (data.title) {
        pObj = docx.createP({ align: 'center' });
        pObj.addText(data.title, {
          bold: true,
          font_size: 16,
          color: '666666'
        });
      }

      // URL
      if (data.url) {
        pObj = docx.createP({ align: 'center' });
        pObj.addText(data.url, {
          font_size: 10,
          color: '0066cc',
          underline: true
        });
      }

      // 生成情報
      pObj = docx.createP({ align: 'center' });
      pObj.addText(`生成日時: ${new Date().toLocaleString('ja-JP')}`, {
        font_size: 10,
        color: '999999'
      });

      pObj = docx.createP({ align: 'center' });
      pObj.addText(`質問数: ${data.qa.length}問`, {
        font_size: 10,
        color: '999999'
      });

      // 空行
      docx.createP();
      docx.createP();

      // Q&A
      data.qa.forEach((item, index) => {
        // ラベル表示（オプション）
        if (includeLabels && item.sourceType) {
          pObj = docx.createP();
          const label = getSourceLabel(item.sourceType);
          let color = '000000';
          if (item.sourceType === 'specified_page') color = '0066cc'; // 青
          else if (item.sourceType === 'same_domain') color = 'ffa500'; // オレンジ
          else if (item.sourceType === 'external') color = 'ff0000'; // 赤
          
          pObj.addText(`[${label}]`, {
            font_size: 9,
            color: color,
            bold: true
          });
        }

        // 質問番号
        pObj = docx.createP();
        pObj.addText(`Q${index + 1}.`, {
          bold: true,
          font_size: 11,
          color: '0066cc'
        });

        // 質問内容
        pObj = docx.createP();
        pObj.addText(item.q || item.question, {
          font_size: 11,
          bold: true
        });

        // 回答
        pObj = docx.createP();
        pObj.addText('A.', {
          bold: true,
          font_size: 10,
          color: '333333'
        });

        pObj = docx.createP();
        pObj.addText(item.a || item.answer, {
          font_size: 10
        });

        // 区切り線（最後以外）
        if (index < data.qa.length - 1) {
          pObj = docx.createP();
          pObj.addText('───────────────────────────────', {
            font_size: 8,
            color: 'cccccc'
          });
        }

        // 空行
        docx.createP();
      });

      // フッター
      docx.createP();
      pObj = docx.createP({ align: 'center' });
      pObj.addText('━━━━━━━━━━━━━━━━━━━━', {
        font_size: 10,
        color: '999999'
      });

      pObj = docx.createP({ align: 'center' });
      pObj.addText('Product Q&A Generator Premium v4.2 Final', {
        font_size: 10,
        color: '999999'
      });

      pObj = docx.createP({ align: 'center' });
      pObj.addText('※ このQ&A集はAI技術を用いて自動生成されています', {
        font_size: 8,
        color: '999999'
      });

      // バッファに出力
      const chunks = [];
      
      docx.on('finalize', (written) => {
        console.log(`Word document finalized: ${written} bytes`);
      });

      docx.on('data', (chunk) => {
        chunks.push(chunk);
      });

      docx.on('end', () => {
        console.log('Word document stream ended');
        const buffer = Buffer.concat(chunks);
        console.log(`Final buffer size: ${buffer.length} bytes`);
        
        if (buffer.length === 0) {
          reject(new Error('生成されたWord文書が空です'));
        } else {
          resolve(buffer);
        }
      });

      // 生成開始
      docx.generate(Buffer);

    } catch (error) {
      console.error('Word generation setup error:', error);
      reject(error);
    }
  });
}

/**
 * メインハンドラー
 */
module.exports = async (req, res) => {
  // CORS設定
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
    // 両方のパラメータ形式に対応
    const { url, title, qa, qaData, productUrl, includeLabels } = req.body;
    
    const finalUrl = url || productUrl;
    const finalQA = qa || qaData;

    if (!finalQA || !Array.isArray(finalQA)) {
      console.error('Invalid QA data:', { qa, qaData, finalQA });
      return res.status(400).json({ 
        error: 'Q&Aデータが不正です',
        details: 'qaまたはqaDataが配列ではありません'
      });
    }

    if (finalQA.length === 0) {
      return res.status(400).json({ 
        error: 'Q&Aデータが空です',
        details: 'Q&Aを生成してからダウンロードしてください'
      });
    }

    console.log(`Generating Word document with ${finalQA.length} Q&As, includeLabels: ${includeLabels}`);

    const wordBuffer = await generateWord({ url: finalUrl, title, qa: finalQA }, includeLabels);

    if (!wordBuffer || wordBuffer.length === 0) {
      throw new Error('Word文書の生成に失敗しました（バッファが空）');
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="product-qa-${Date.now()}.docx"`);
    res.setHeader('Content-Length', wordBuffer.length);
    
    console.log('Sending Word document to client...');
    res.send(wordBuffer);

  } catch (error) {
    console.error('Word generation error:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({
      error: 'Word生成中にエラーが発生しました',
      message: error.message,
      details: error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : 'No stack trace'
    });
  }
};
