import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { chatPlugin } from './server/chatPlugin';

export default defineConfig({ plugins: [react(), chatPlugin()] });
