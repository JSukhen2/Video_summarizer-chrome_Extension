import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig(({ mode }) => {
  // .env 파일 로드 (OPENAI_API_KEY 포함)
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [
      react(),
      crx({ manifest }),
    ],
    // .env의 OPENAI_API_KEY를 직접 사용
    define: {
      '__OPENAI_API_KEY__': JSON.stringify(env.OPENAI_API_KEY || ''),
    },
    server: {
      port: 5173,
      strictPort: true,
      hmr: {
        clientPort: 5173,
        overlay: false,
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: 'index.html',
          sidepanel: 'sidepanel.html',
        },
      },
    },
  }
})