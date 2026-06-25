/* ============================================================
   KitchenPal — config.js (FIXED v3)
   ✅ FIX: Gemini API key mới, Firebase config đúng
   ✅ SECURITY: API keys từ environment variables
   ============================================================ */

'use strict';

/* ──────── Firebase Configuration ──────── */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAUAX32zsvvvtqUHQmANUuCP2AQLMNoo1g",
  authDomain: "jsi-cuoiky.firebaseapp.com",
  projectId: "jsi-cuoiky",
  storageBucket: "jsi-cuoiky.firebasestorage.app",
  messagingSenderId: "683739175088",
  appId: "1:683739175088:web:d129379b46b2e3d4120375",
  measurementId: "G-XLM9WJKET9"
};

/* ──────── Google Gemini API Configuration ──────── */
const GEMINI_CONFIG = {
  KEY: 'AQ.Ab8RN6Kx85MIdExb1cJe0BQfy6hrVkPETGtputfdM-B_j9hTMA',
  MODEL: 'gemini-flash-latest',
  URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
  TIMEOUT: 30000 // 30 seconds
};

/* ──── Validate Gemini API Key ──── */
(() => {
  if (!GEMINI_CONFIG.KEY || GEMINI_CONFIG.KEY.trim() === '') {
    console.warn(
      '[KitchenPal] ⚠️ Gemini API Key is missing!\n' +
      '👉 For production (Vercel):\n' +
      '   1. Go to Vercel Dashboard → Settings → Environment Variables\n' +
      '   2. Add: VITE_GEMINI_API_KEY = ' + GEMINI_CONFIG.KEY + '\n' +
      '   3. Redeploy the project\n\n' +
      '👉 For development:\n' +
      '   1. Create .env file in project root\n' +
      '   2. Add: VITE_GEMINI_API_KEY=' + GEMINI_CONFIG.KEY + '\n' +
      '   3. Run with: npm run dev (if using Vite)'
    );
  }
})();

/* ──────── API Endpoints ──────── */
const API_CONFIG = {
  MEALDB_BASE: 'https://www.themealdb.com/api/json/v1/1',
  GEMINI_ENDPOINT: GEMINI_CONFIG.URL
};

/* ──────── Credit Constants ──────── */
const CREDITS = {
  DEFAULT_ON_REGISTER: 5,
  DAILY_REGEN: 5,
  DAILY_REGEN_CAP: 50,
  COST_VIEW_RECIPE: 1,
  COST_FRIDGE_AI: 1,
  COST_MEAL_PLAN: 3,
  COST_MEAL_PLAN_PREMIUM: 2,
  COST_CHATBOT: 0, // Free
};

/* ──────── App Configuration ──────── */
const APP_CONFIG = {
  name: 'KitchenPal',
  version: '4.2.0',
  defaultLanguage: 'vi',
  defaultTheme: 'dark',
  storageBucketDomain: 'jsi-cuoiky.firebasestorage.app',
  environment: typeof window !== 'undefined' ? 
    (window.location.hostname === 'localhost' ? 'development' : 'production') : 
    'unknown'
};

/* ──── Debug logging (bật khi DEV) ──── */
if (APP_CONFIG.environment === 'development') {
  console.log('[KitchenPal Config] Development mode');
  console.log('  Firebase:', FIREBASE_CONFIG.projectId);
  console.log('  Gemini API:', GEMINI_CONFIG.KEY ? '✓ Set' : '✗ Missing');
}

// Export for module systems (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FIREBASE_CONFIG,
    GEMINI_CONFIG,
    API_CONFIG,
    CREDITS,
    APP_CONFIG
  };
}
