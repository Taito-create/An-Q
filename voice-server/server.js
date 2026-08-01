const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

// AquesTalkPlayer の実行ファイルパス
// Windows: D:\AquesTalkPlayer\aquestalkplayer_20250606\aquestalkplayer\AquesTalkPlayer.exe
// Linux (Render): 環境変数 AQUESTALK_PATH で指定
const AQUESTALK_PATH = process.env.AQUESTALK_PATH || 'D:\\AquesTalkPlayer\\aquestalkplayer_20250606\\aquestalkplayer\\AquesTalkPlayer.exe';

// キャッシュディレクトリ
const CACHE_DIR = path.join(__dirname, 'voice-cache');

// キャッシュディレクトリが存在しない場合は作成
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
  console.log(`📁 キャッシュディレクトリを作成: ${CACHE_DIR}`);
}

app.use(cors());
app.use(express.json());

// ============================================================
// ヘルスチェック
// ============================================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Voice server is running' });
});

// ============================================================
// 音声生成エンドポイント
// ============================================================
app.post('/speak', (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'テキストが指定されていません' });
  }

  console.log(`🎤 音声生成リクエスト: "${text}"`);

  // テキストからハッシュを生成（キャッシュキー）
  const hash = crypto.createHash('md5').update(text).digest('hex');
  const cachedFilePath = path.join(CACHE_DIR, `${hash}.wav`);

  // 1. キャッシュに存在する場合は即座に返却
  if (fs.existsSync(cachedFilePath)) {
    console.log(`✅ キャッシュから音声を返却: "${text}"`);
    return res.sendFile(cachedFilePath);
  }

  // 2. キャッシュにない場合は新規生成
  const tempFileName = `voice_${Date.now()}.wav`;
  const tempFilePath = path.join(__dirname, tempFileName);

  // AquesTalkPlayer をコマンドラインから実行
  // /T: テキスト, /W: 出力WAVファイルパス
  const command = `"${AQUESTALK_PATH}" /T "${text}" /W "${tempFilePath}"`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ AquesTalkPlayer 実行エラー:', error.message);
      console.error('stderr:', stderr);
      return res.status(500).json({ error: '音声生成に失敗しました。' });
    }

    // 生成されたファイルの存在確認
    if (!fs.existsSync(tempFilePath)) {
      console.error('❌ 音声ファイルが生成されませんでした');
      return res.status(500).json({ error: '音声生成に失敗しました。' });
    }

    // 生成されたファイルをキャッシュディレクトリに移動
    try {
      fs.renameSync(tempFilePath, cachedFilePath);
      console.log(`💾 音声をキャッシュに保存: "${text}" -> ${hash}.wav`);
    } catch (moveError) {
      console.error('⚠️ キャッシュ保存に失敗（一時ファイルを直接返却）:', moveError.message);
      // キャッシュ保存に失敗した場合は一時ファイルを直接返却
      return res.sendFile(tempFilePath, (err) => {
        // 送信後に一時ファイルを削除
        try { fs.unlinkSync(tempFilePath); } catch (e) {}
      });
    }

    // キャッシュからファイルを送信
    res.sendFile(cachedFilePath);
  });
});

// ============================================================
// サーバー起動
// ============================================================
app.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🎙️  Voice Server (AquesTalkPlayer)`);
  console.log(`📡 ポート: http://localhost:${PORT}`);
  console.log(`🎵 AquesTalkPlayer: ${AQUESTALK_PATH}`);
  console.log(`📁 キャッシュ: ${CACHE_DIR}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('エンドポイント:');
  console.log('  POST /speak  - 音声生成 (body: {"text": "こんにちは"})');
  console.log('  GET  /health - ヘルスチェック');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});