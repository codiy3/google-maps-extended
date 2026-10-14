import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  base: mode === 'public' ? '/google-maps-extended/' : '/',
  // 公開ビルドでは.env.localの内容にかかわらずGoogleキーを埋め込まない。
  define:
    mode === 'public'
      ? {
          'import.meta.env.VITE_DATA_MODE': JSON.stringify('static'),
          'import.meta.env.VITE_GOOGLE_MAPS_MODE': JSON.stringify('osm'),
          'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(''),
        }
      : {},
  plugins: [
    react(),
    {
      name: 'public-demo-security',
      transformIndexHtml(html) {
        if (mode !== 'public') return html;
        return html.replace(
          '<head>',
          `<head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />`,
        );
      },
    },
  ],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], restoreMocks: true },
}));
