import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // ผลลัพธ์ build ของ Cloudflare — โค้ดที่เครื่องสร้าง ไม่ใช่ของเรา
    ".open-next/**",
    ".wrangler/**",
    // type ที่ wrangler สร้างให้ worker ตัวตั้งเวลา
    "workers/**/worker-configuration.d.ts",
  ]),
]);

export default eslintConfig;
