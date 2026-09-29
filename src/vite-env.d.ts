/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUDINARY_CLOUD_NAME: string;
  readonly VITE_CLOUDINARY_UPLOAD_PRESET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// vite.config.ts の define が .env の値を文字列として埋め込むグローバル定数。
// アプリ側は import.meta を直接参照せず globalThis 経由で読む（Jest 互換のため）。
declare const __VITE_CLOUDINARY_CLOUD_NAME__: string;
declare const __VITE_CLOUDINARY_UPLOAD_PRESET__: string;

interface Window {
  __VITE_CLOUDINARY_CLOUD_NAME__?: string;
  __VITE_CLOUDINARY_UPLOAD_PRESET__?: string;
}