import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Carrega variáveis de ambiente do .env na raiz do projeto
  // FIX: Cast `process` to `any` to bypass incorrect type definitions that can cause `cwd` to be flagged as non-existent.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // Expõe a variável de ambiente da API do Gemini para o código da aplicação,
      // permitindo que `process.env.API_KEY` funcione como esperado pelo SDK.
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  }
})
