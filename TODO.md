# TODO

- [ ] 1) 環境調査：loginScreen（/auth/loginScreen）に対応する実体ファイルが存在するか確認
- [ ] 2) 既存の原因修正：expo-router のルーティングでログイン画面へ遷移できない/認証チェックが暴走している点を特定
- [ ] 3) ログインの最小実装：既存の `authStorage.ts` を使って /auth/loginScreen を追加し、保存→遷移→トップ表示まで動作させる
- [ ] 4) ついで対応：`package.json` の cSpell/文字列パターン警告（predeploy/xdate）を無害化してビルド/起動に影響しないよう整理
- [ ] 5) 動作確認：`expo start`（webでも可）でログインフロー確認

