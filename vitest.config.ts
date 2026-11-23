import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['packages/**/*.test.ts'],testTimeout:600000,hookTimeout:900000,fileParallelism:false,reporters:['verbose'],disableConsoleIntercept:true}});
