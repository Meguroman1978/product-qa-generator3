const PDFDocument = require('pdfkit');
const axios = require('axios');
const fs = require('fs');

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
 * ソースタイプの色取得
 */
function getSourceColor(sourceType) {
  const colors = {
    'specified_page': '#0066cc',  // 青
    'same_domain': '#ffa500',     // オレンジ
    'external': '#ff0000'         // 赤
  };
  return colors[sourceType] || '#000000';
}

/**
 * 日本語フォント対応のPDF生成
 */
async function generatePDF(data, includeLabels) {
  return new Promise(async (resolve, reject) => {
    try {
      let fontPath = '/tmp/NotoSansJP-Regular.ttf';
      let boldFontPath = '/tmp/NotoSansJP-Bold.ttf';

      if (!fs.existsSync(fontPath)) {
        console.log('Downloading Japanese font...');
        const fontUrl = 'https://github.com/google/fonts/raw/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf';
        const fontResponse = await axios.get(fontUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(fontPath, fontResponse.data);
        fs.writeFileSync(boldFontPath, fontResponse.data);
      }

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 60, right: 60 },
        info: {
          Title: `${data.title || '商品'} - Q&A集`,
          Author: 'Product Q&A Generator Premium',
          Subject: 'Product Q&A Collection',
          Creator: 'Product Q&A Generator v4.2'
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        const sizeMB = pdfBuffer.length / (1024 * 1024);
        console.log(`PDF size: ${sizeMB.toFixed(2)}MB`);

        if (pdfBuffer.length > 100 * 1024 * 1024) {
          reject(new Error(`PDFサイズが100MBを超えています: ${sizeMB.toFixed(2)}MB`));
        } else {
          resolve(pdfBuffer);
        }
      });

      doc.on('error', (err) => {
        reject(err);
      });

      doc.registerFont('NotoSans', fontPath);
      doc.registerFont('NotoSansBold', boldFontPath);

      // タイトルページ
      doc.font('NotoSansBold')
         .fontSize(24)
         .text('商品Q&A集', { align: 'center' })
         .moveDown(0.5);

      if (data.title) {
        doc.font('NotoSansBold')
           .fontSize(16)
           .text(data.title, { align: 'center' })
           .moveDown(0.3);
      }

      if (data.url) {
        doc.font('NotoSans')
           .fontSize(10)
           .fillColor('#0066cc')
           .text(data.url, { align: 'center', link: data.url })
           .fillColor('#000000')
           .moveDown(0.5);
      }

      doc.font('NotoSans')
         .fontSize(10)
         .fillColor('#666666')
         .text(`生成日時: ${new Date().toLocaleString('ja-JP')}`, { align: 'center' })
         .text(`質問数: ${data.qa.length}問`, { align: 'center' })
         .fillColor('#000000')
         .moveDown(2);

      // Q&A本文
      data.qa.forEach((item, index) => {
        if (doc.y > 700) {
          doc.addPage();
        }

        // ソースラベル表示（オプション）
        if (includeLabels && item.sourceType) {
          const label = getSourceLabel(item.sourceType);
          const color = getSourceColor(item.sourceType);
          
          doc.font('NotoSansBold')
             .fontSize(8)
             .fillColor(color)
             .text(`[${label}]`, { continued: false })
             .fillColor('#000000')
             .moveDown(0.1);
        }

        // 質問番号
        doc.font('NotoSansBold')
           .fontSize(10)
           .fillColor('#0066cc')
           .text(`Q${index + 1}.`, { continued: false })
           .moveDown(0.2);

        // 質問
        doc.font('NotoSansBold')
           .fontSize(11)
           .fillColor('#000000')
           .text(item.q || item.question, { 
             indent: 25,
             align: 'left'
           })
           .moveDown(0.3);

        // 回答
        doc.font('NotoSansBold')
           .fontSize(10)
           .fillColor('#333333')
           .text('A.', { continued: false })
           .moveDown(0.2);

        doc.font('NotoSans')
           .fontSize(10)
           .fillColor('#000000')
           .text(item.a || item.answer, {
             indent: 25,
             align: 'left',
             lineGap: 3
           })
           .moveDown(0.8);

        // 区切り線
        if (index < data.qa.length - 1) {
          doc.strokeColor('#dddddd')
             .lineWidth(0.5)
             .moveTo(60, doc.y)
             .lineTo(550, doc.y)
             .stroke()
             .moveDown(0.8);
        }
      });

      // フッター
      doc.addPage()
         .font('NotoSans')
         .fontSize(10)
         .fillColor('#666666')
         .text('━━━━━━━━━━━━━━━━━━━━', { align: 'center' })
         .moveDown(0.5)
         .text('Product Q&A Generator Premium v4.2 Final', { align: 'center' })
         .text('Q&A数・リソースタイプ選択機能付き', { align: 'center' })
         .moveDown(0.5)
         .fontSize(8)
         .text('※ このQ&A集はAI技術を用いて自動生成されています', { align: 'center' })
         .text('※ 最新情報は必ず商品ページでご確認ください', { align: 'center' });

      if (includeLabels) {
        doc.moveDown(0.5)
           .fontSize(8)
           .fillColor('#0066cc')
           .text('【ソースラベルの説明】', { align: 'center' })
           .fillColor('#666666')
           .text('青: 指定されたページの情報 / オレンジ: 同サイト内の別ページ / 赤: 外部情報', { align: 'center' });
      }

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * メインハンドラー
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
    // 両方のパラメータ形式に対応
    const { url, title, qa, qaData, productUrl, includeLabels } = req.body;
    
    const finalUrl = url || productUrl;
    const finalQA = qa || qaData;

    if (!finalQA || !Array.isArray(finalQA)) {
      return res.status(400).json({ error: 'Q&Aデータが不正です' });
    }

    console.log(`Generating PDF with ${finalQA.length} Q&As, includeLabels: ${includeLabels}`);

    const pdfBuffer = await generatePDF({ url: finalUrl, title, qa: finalQA }, includeLabels);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="product-qa-${Date.now()}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('PDF generation error:', error);
    return res.status(500).json({
      error: 'PDF生成中にエラーが発生しました',
      message: error.message
    });
  }
};
