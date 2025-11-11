/**
 * RTF (Rich Text Format) ダウンロードAPI
 * WindowsとMacの両方で表示可能なリッチテキスト形式
 */

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
 * テキストをRTF形式にエスケープ
 */
function escapeRTF(text) {
  if (!text) return '';
  
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = text.charCodeAt(i);
    
    // 特殊文字のエスケープ
    if (char === '\\') {
      result += '\\\\';
    } else if (char === '{') {
      result += '\\{';
    } else if (char === '}') {
      result += '\\}';
    } else if (char === '\n') {
      result += '\\line ';
    } else if (code > 127) {
      // Unicode文字をRTF形式に変換
      result += '\\u' + code + '?';
    } else {
      result += char;
    }
  }
  
  return result;
}

/**
 * RTF文書生成
 */
function generateRTF(data, includeLabels) {
  const rtfHeader = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0\\fnil\\fcharset128 MS Gothic;}{\\f1\\fnil\\fcharset0 Arial;}}
{\\colortbl;\\red0\\green102\\blue204;\\red255\\green165\\blue0;\\red255\\green0\\blue0;\\red51\\green51\\blue51;\\red102\\green102\\blue102;}
\\viewkind4\\uc1\\pard\\qc\\f0\\fs36\\b 商品Q&A集\\b0\\fs20\\line\\line
`;

  let rtfBody = '';

  // タイトル
  if (data.title) {
    rtfBody += `\\fs28\\b ${escapeRTF(data.title)}\\b0\\fs20\\line\\line\n`;
  }

  // URL
  if (data.url) {
    rtfBody += `\\cf1 ${escapeRTF(data.url)}\\cf0\\line\\line\n`;
  }

  // 生成情報
  rtfBody += `\\cf5\\fs16 生成日時: ${escapeRTF(new Date().toLocaleString('ja-JP'))}\\line\n`;
  rtfBody += `質問数: ${data.qa.length}問\\cf0\\fs20\\line\\line\\line\n`;

  // Q&A本文
  rtfBody += '\\pard\\ql\n'; // 左揃えに変更

  data.qa.forEach((item, index) => {
    // ソースラベル（オプション）
    if (includeLabels && item.sourceType) {
      const label = getSourceLabel(item.sourceType);
      let colorIndex = 0;
      if (item.sourceType === 'specified_page') colorIndex = 1;
      else if (item.sourceType === 'same_domain') colorIndex = 2;
      else if (item.sourceType === 'external') colorIndex = 3;
      
      rtfBody += `\\fs16\\b\\cf${colorIndex}[${escapeRTF(label)}]\\cf0\\b0\\fs20\\line\n`;
    }

    // 質問番号
    rtfBody += `\\cf1\\b Q${index + 1}.\\cf0\\b0\\line\n`;

    // 質問内容
    rtfBody += `\\b ${escapeRTF(item.q || item.question)}\\b0\\line\\line\n`;

    // 回答
    rtfBody += `\\cf4\\b A.\\cf0\\b0\\line\n`;
    rtfBody += `${escapeRTF(item.a || item.answer)}\\line\\line\n`;

    // 区切り線
    if (index < data.qa.length - 1) {
      rtfBody += '\\line───────────────────────────────\\line\\line\n';
    }
  });

  // フッター
  rtfBody += `\\line\\line\\pard\\qc\\cf5\\fs16
━━━━━━━━━━━━━━━━━━━━\\line
Product Q&A Generator Premium v4.2 Final\\line
Q&A数・リソースタイプ選択機能付き\\line\\line
※ このQ&A集はAI技術を用いて自動生成されています\\line
※ 最新情報は必ず商品ページでご確認ください\\line
`;

  if (includeLabels) {
    rtfBody += `\\line\\cf1【ソースラベルの説明】\\cf0\\line
青: 指定されたページの情報 / オレンジ: 同サイト内の別ページ / 赤: 外部情報\\line
`;
  }

  rtfBody += '\\cf0\\fs20\n';

  const rtfFooter = '}';

  return rtfHeader + rtfBody + rtfFooter;
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

    console.log(`Generating RTF document with ${finalQA.length} Q&As, includeLabels: ${includeLabels}`);

    const rtfContent = generateRTF({ url: finalUrl, title, qa: finalQA }, includeLabels);
    const rtfBuffer = Buffer.from(rtfContent, 'utf8');

    console.log(`RTF document generated: ${rtfBuffer.length} bytes`);

    res.setHeader('Content-Type', 'application/rtf');
    res.setHeader('Content-Disposition', `attachment; filename="product-qa-${Date.now()}.rtf"`);
    res.setHeader('Content-Length', rtfBuffer.length);
    
    res.send(rtfBuffer);

  } catch (error) {
    console.error('RTF generation error:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({
      error: 'RTF生成中にエラーが発生しました',
      message: error.message,
      details: error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : 'No stack trace'
    });
  }
};
