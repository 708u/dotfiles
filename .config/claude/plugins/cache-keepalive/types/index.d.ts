export type Warmth = {
  // main thread の最後の応答時刻。放置時間の起点
  respondedAt: number;
  // cache の期限の起点。cache に当たった main か fork のリクエストを送り始めた時刻
  refreshedAt: number;
  // respondedAt 時点の model。切り替え後の fork は旧 model の cache にしか当たらない
  model: string;
  forks: number;
};

declare module "claude-code" {
  interface PluginState {
    "cache-keepalive": { warmth: Warmth | null; isTurnRunning: boolean };
  }
}
