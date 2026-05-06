module.exports = function (api) {
  api.cache(true);
  return {
    // プリセットの中に既にルーティング機能が含まれているので、
    // ここだけで大丈夫です
    presets: ['babel-preset-expo'],
    plugins: [], // ここを空にする、またはpluginsの行ごと消してもOK
  };
};