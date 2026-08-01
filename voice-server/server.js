const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

// VOICEVOX Engine のURL
const VOICEVOX_URL = process.env.VOICEVOX_URL || 'https://voicevox-engine.onrender.com';
// ずんだもんのスピーカーID
const SPEAKER_ID = 1;

// CORS 設定
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:3004',
    'http://localhost:3005',
    'http://localhost:3006',
    'https://an-q.vercel.app',
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
};

app.use(cors(corsOptions));
app.use(express.json());

// ルートルート（テスト用）
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Voice server is running' });
});

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Voice server (VOICEVOX)' });
});

// 音声生成エンドポイント
app.post('/speak', async (req, res) => {
  const { text } = req.body;
  console.log(`🎤 音声生成リクエスト: "${text}"`);

  if (!text) {
    console.error('❌ テキストが空です');
    return res.status(400).json({ error: 'テキストが指定されていません。' });
  }

  try {
    console.log(`📡 VOICEVOX Engine にリクエスト送信: ${VOICEVOX_URL}/audio_query`);

    // 1. 音声クエリを作成
    const queryResponse = await axios.post(
      `${VOICEVOX_URL}/audio_query`,
      null,
      {
        params: { text, speaker: SPEAKER_ID },
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000, // 60秒タイムアウト
      }
    );
    console.log(`✅ audio_query 成功`);

    // 2. 音声を合成
    console.log(`📡 VOICEVOX Engine に合成リクエスト送信`);
    const synthesisResponse = await axios.post(
      `${VOICEVOX_URL}/synthesis`,
      queryResponse.data,
      {
        params: { speaker: SPEAKER_ID },
        responseType: 'arraybuffer',
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000, // 60秒タイムアウト
      }
    );
    console.log(`✅ synthesis 成功 (${synthesisResponse.data.length} バイト)`);

    // 3. 音声データを返却
    const audioBuffer = Buffer.from(synthesisResponse.data);
    console.log(`📤 音声データ返却 (${audioBuffer.length} バイト)`);

    res.set({
      'Content-Type': 'audio/wav',
      'Content-Length': audioBuffer.length,
    });
    res.send(audioBuffer);
    console.log(`✅ 音声生成完了: "${text}"`);

  } catch (error) {
    console.error('❌ 音声生成エラー:', error.message);
    if (error.response) {
      console.error('  レスポンスステータス:', error.response.status);
      console.error('  レスポンスデータ:', error.response.data);
    }
    if (error.code === 'ECONNABORTED') {
      console.error('  ⏰ タイムアウト発生');
    }
    res.status(500).json({
      error: '音声生成に失敗しました。',
      details: error.message,
    });
  }
});

// Keep-alive: VOICEVOX Engine のスリープを防ぐ
setInterval(async () => {
  try {
    await axios.get(`${VOICEVOX_URL}/`, { timeout: 5000 });
    console.log('💓 VOICEVOX Engine ヘルスチェック OK');
  } catch (e) {
    console.log('💔 VOICEVOX Engine ヘルスチェック失敗:', e.message);
  }
}, 5 * 60 * 1000); // 5分ごと

// サーバー起動
app.listen(PORT, () => {
  console.log(`🎙️ Voice Server (VOICEVOX) running on port ${PORT}`);
  console.log(`📡 VOICEVOX Engine URL: ${VOICEVOX_URL}`);
  console.log(`🗣️  Speaker ID: ${SPEAKER_ID}`);
}).on('error', (err) => {
  console.error('❌ Server failed to start:', err);
});