const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

// ★修正1: VOICEVOX_URL を localhost に変更（127.0.0.1 から）
const VOICEVOX_URL = process.env.VOICEVOX_URL || 'http://localhost:50021';
const DEFAULT_SPEAKER = 3;

// ★修正2: axios のプロキシを明示的に無効化
const axiosInstance = axios.create({
  proxy: false,
  timeout: 60000,
});

// AquesTalkPlayer（フォールバック）※パスは環境変数 AQUESTALK_PATH で上書き可能（可搬性対応）
const AQUESTALK_PATH = process.env.AQUESTALK_PATH
  || 'D:\\AquesTalkPlayer\\aquestalkplayer_20250606\\aquestalkplayer\\AquesTalkPlayer.exe';

// キャッシュディレクトリ
const CACHE_DIR = path.join(__dirname, 'voice-cache');
const FALLBACK_CACHE_DIR = path.join(__dirname, 'voice-cache-fallback');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);
if (!fs.existsSync(FALLBACK_CACHE_DIR)) fs.mkdirSync(FALLBACK_CACHE_DIR);

app.use(cors());
app.use(express.json());

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Voice server is running' });
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Voice server is running' });
});

// ─── 音声生成エンドポイント ───
app.post('/speak', async (req, res) => {
  const { text, speaker = DEFAULT_SPEAKER } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'テキストが指定されていません' });
  }
  console.log(`🎤 音声生成リクエスト: "${text}" (speaker=${speaker})`);

  const hash = crypto.createHash('md5').update(`${text}:${speaker}`).digest('hex');
  const cachedFilePath = path.join(CACHE_DIR, `${hash}.wav`);
  const fallbackCachedFilePath = path.join(FALLBACK_CACHE_DIR, `${hash}.wav`);

  if (fs.existsSync(cachedFilePath)) {
    console.log(`✅ キャッシュから音声を返却 (speaker=${speaker})`);
    return res.sendFile(cachedFilePath);
  }
  if (fs.existsSync(fallbackCachedFilePath)) {
    console.log(`⚠️ フォールバックキャッシュから音声を返却 (speaker=${speaker})`);
    return res.sendFile(fallbackCachedFilePath);
  }

  try {
    // ★修正3: axiosInstance を使用（プロキシ無効）
    const queryResponse = await axiosInstance.post(
      `${VOICEVOX_URL}/audio_query`,
      null,
      { params: { text, speaker } }
    );
    const synthResponse = await axiosInstance.post(
      `${VOICEVOX_URL}/synthesis`,
      queryResponse.data,
      { params: { speaker }, responseType: 'arraybuffer' }
    );
    const audioBuffer = Buffer.from(synthResponse.data);
    fs.writeFileSync(cachedFilePath, audioBuffer);
    console.log(`💾 音声をキャッシュに保存: ${hash}.wav (speaker=${speaker})`);
    res.sendFile(cachedFilePath);
  } catch (error) {
    console.error('❌ VOICEVOX エラー:', error.message);
    console.warn('⚠️ VOICEVOX 失敗 → AquesTalkPlayer でフォールバック');
    if (!fs.existsSync(AQUESTALK_PATH)) {
      return res.status(500).json({ error: '音声生成に失敗しました（フォールバックなし）' });
    }
    const { exec } = require('child_process');
    const tempFilePath = path.join(__dirname, `voice_${Date.now()}.wav`);
    const command = `"${AQUESTALK_PATH}" /T "${text}" /W "${tempFilePath}"`;
    exec(command, (execError) => {
      if (execError || !fs.existsSync(tempFilePath)) {
        return res.status(500).json({ error: '音声生成に失敗しました' });
      }
      fs.renameSync(tempFilePath, fallbackCachedFilePath);
      res.sendFile(fallbackCachedFilePath);
    });
  }
});

// ─── サーバー起動 ───
const server = app.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🎙️  Voice Server (VOICEVOX + AquesTalk フォールバック)`);
  console.log(`📡 ポート: http://localhost:${PORT}`);
  console.log(`🗣️  VOICEVOX Engine: ${VOICEVOX_URL}`);
  console.log(`📁 キャッシュ: ${CACHE_DIR}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('エンドポイント:');
  console.log('  POST /speak  - 音声生成 (body: {"text": "...", "speaker": 3})');
  console.log('  GET  /health - ヘルスチェック');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

server.on('error', (err) => {
  console.error('❌ Server failed to start:', err);
});