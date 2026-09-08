// ─────────────────────────────────────────────
// 共通画像リソース（サイバーパンク風アイコン）
// coin / book は Home・Shop・Gacha などのヘッダーバッジで使用
//
// ※ 本プロジェクトは Vite + react-native-web 構成のため require() は使用不可
//   （Metro ではなく Vite でバンドルされるため、require はランタイムエラーになる）。
//   ESM import で画像を読み込み、RNW の Image が期待する { uri } 形式で公開する。
// ─────────────────────────────────────────────
import coinCyber from '../../assets/images/coin_cyber.png';
import bookCyber from '../../assets/images/book_cyber.png';

export const IMAGES = {
  coin: { uri: coinCyber },
  book: { uri: bookCyber },
} as const;
