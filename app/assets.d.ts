// 画像アセット（png/jpg/gif/webp）のモジュール宣言
// Vite が png をアセット URL（or base64 data URI）に変換し default export する
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.gif' {
  const src: string;
  export default src;
}
declare module '*.webp' {
  const src: string;
  export default src;
}
