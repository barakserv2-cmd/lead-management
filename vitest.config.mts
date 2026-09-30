import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * ללא הקובץ הזה vitest לא יודע לפתוח את הכינוי "@/" של Next, וכל טסט
 * שנוגע במודול שמייבא דרכו נופל על "Cannot find package". זה חסם
 * בדיקה של חלון 24 השעות (whatsappService), ולכן נוסף.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
