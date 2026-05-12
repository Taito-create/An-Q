const QRCode = require('qrcode');

// IPアドレスを取得
const { exec } = require('child_process');

function getLocalIP() {
  return new Promise((resolve, reject) => {
    exec('ipconfig', (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      
      // IPv4アドレスを抽出
      const match = stdout.match(/IPv4 アドレス[^\d]*: (\d+\.\d+\.\d+\.\d+)/);
      if (match) {
        resolve(match[1]);
      } else {
        reject(new Error('IP address not found'));
      }
    });
  });
}

async function generateQRCode() {
  try {
    const ip = await getLocalIP();
    const url = `http://${ip}:8081`;
    
    console.log(`\n🌐 URL: ${url}`);
    console.log('📱 QRコードを生成中...\n');
    
    // QRコードをターミナルに表示
    await QRCode.toString(url, {
      type: 'terminal',
      small: true
    });
    
    console.log('\n✅ QRコードが生成されました！');
    console.log('📲 スキャンしてアクセスしてください');
    
  } catch (error) {
    console.error('❌ エラー:', error.message);
    
    // フォールバック：localhost
    const fallbackUrl = 'http://localhost:8081';
    console.log(`\n🔄 フォールバックURL: ${fallbackUrl}`);
    
    await QRCode.toString(fallbackUrl, {
      type: 'terminal',
      small: true
    });
  }
}

generateQRCode();
