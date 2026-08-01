const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

// VOICEVOX Engine のURL（RenderでデプロイしたサービスのURL）
// 環境変数が設定されていればそれを使い、なければデフォルト値
const VOICEVOX_URL = process.env.VOICEVOX_URL || 'http://localhost:50021';
// ずんだもんのスピーカーID（1）
const SPEAKER_ID = 1;

app.use(cors());
app.use(express.json());

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Voice server is running (VOICEVOX)' });
});

// 音声生成エンドポイント
app.post('/speak', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'テキストが指定されていません。' });
  }

  try {
    console.log(`🎤 音声生成リクエスト: "${text}"`);

    // 1. 音声クエリを作成
    const queryResponse = await axios.post(
      `${VOICEVOX_URL}/audio_query`,
      null,
      {
        params: {
          text: text,
          speaker: SPEAKER_ID,
        },
        headers: { 'Content-Type': 'application/json' }
      }
    );

    // 2. 音声を合成
    const synthesisResponse = await axios.post(
      `${VOICEVOX_URL}/synthesis`,
      queryResponse.data,
      {
        params: {
          speaker: SPEAKER_ID,
        },
        responseType: 'arraybuffer',
        headers: { 'Content-Type': 'application/json' }
      }
    );

    // 3. 音声データを返却
    const audioBuffer = Buffer.from(synthesisResponse.data);
    res.set('Content-Type', 'audio/wav');
    res.send(audioBuffer);

    console.log(`✅ 音声生成完了: "${text}"`);
  } catch (error) {
    console.error('❌ 音声生成エラー:', error.message);
    if (error.response) {
      console.error('  レスポンス:', error.response.status, error.response.data);
    }
    res.status(500).json({ error: '音声生成に失敗しました。' });
  }
});

app.listen(PORT, () => {
  console.log(`🎙️ Voice Server (VOICEVOX) running on port ${PORT}`);
  console.log(`📡 VOICEVOX Engine URL: ${VOICEVOX_URL}`);
  console.log(`🗣️  Speaker ID: ${SPEAKER_ID} (ずんだもん)`);
});