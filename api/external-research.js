const axios = require('axios');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query, apiKey } = req.body;

    if (!query || !apiKey) {
      return res.status(400).json({ error: 'クエリとAPIキーが必要です' });
    }

    // OpenAI APIを使用して外部情報を生成
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `あなたは商品情報の専門家です。ユーザーからの質問に対して、一般的な知識や業界標準に基づいた有益な情報を提供してください。

重要な注意事項:
- 薬機法に違反する表現（「シミが消える」「痩せる」「病気が治る」など）は絶対に使用しないでください
- 景品表示法に違反する根拠のない最上級表現（「業界No.1」「最高級」など）は避けてください
- 食品表示法・健康増進法に違反する健康効果の断定表現は使用しないでください
- 事実に基づいた、客観的な情報を提供してください
- 具体的で実用的な回答を心がけてください`
          },
          {
            role: 'user',
            content: query
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const answer = response.data.choices[0].message.content.trim();

    // 外部情報として sourceType を付与
    return res.status(200).json({ 
      answer,
      sourceType: 'external' // 外部リサーチは常に external
    });

  } catch (error) {
    console.error('External research error:', error.response?.data || error.message);
    return res.status(500).json({ 
      error: '外部情報の取得に失敗しました',
      details: error.response?.data?.error?.message || error.message 
    });
  }
};
