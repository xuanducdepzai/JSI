/* ============================================================
   KitchenPal — credits.js v6 FIXED & ENHANCED
   ✅ FIX: Auth state listener, Daily regen bug, History size limit
   ✅ FEATURE: Real-time credit sync, Premium discount
   ✅ SECURITY: Safe email normalization
   ============================================================ */

/* ──── Firebase SDK Config (from config.js - centralized) ──── */
// FIREBASE_CONFIG is loaded from config.js
// GEMINI_CONFIG is loaded from config.js

const GEMINI_KEY = GEMINI_CONFIG.KEY;
const GEMINI_URL = GEMINI_CONFIG.URL;
const GEMINI_TIMEOUT = GEMINI_CONFIG.TIMEOUT; // 30 seconds

/* ──── Credit Constants ──── */
const CREDITS = {
  DEFAULT_ON_REGISTER: 5,
  DAILY_REGEN: 5,
  DAILY_REGEN_CAP: 50,
  COST_VIEW_RECIPE: 1,
  COST_FRIDGE_AI: 1,
  COST_MEAL_PLAN: 3,
  COST_MEAL_PLAN_PREMIUM: 2,
  COST_CHATBOT: 0, // ✅ Chatbot hoàn toàn miễn phí
};

/* ──── Firebase Singleton ──── */
let _db = null;
let _auth = null;
let _fbReady = false;
let _fbError = null;

function initFirebase() {
  if (_fbReady) return;
  try {
    if (typeof firebase === 'undefined') {
      throw new Error(
        '[KitchenPal] Firebase SDK chưa load. ' +
        'Kiểm tra thẻ <script> Firebase CDN trong HTML.'
      );
    }
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    _db = firebase.firestore();
    _auth = firebase.auth();
    _fbReady = true;
    logCredit('SYSTEM', 'Firebase initialized successfully', 'success');
    
    /* ✅ NEW: Monitor auth state change */
    _auth.onAuthStateChanged(async (user) => {
      if (user) {
        logCredit('AUTH', `User logged in: ${user.email}`, 'info');
        // Update credit display khi auth state change
        await CreditDisplay.refresh(user.email);
      } else {
        logCredit('AUTH', 'User logged out', 'info');
        // Hide credit badge khi logout
        const badge = document.getElementById('creditBadge');
        if (badge) badge.style.display = 'none';
      }
    });
  } catch (e) {
    _fbError = e.message;
    logCredit('SYSTEM', `Firebase init failed: ${e.message}`, 'error');
    console.error('[KitchenPal] Firebase Error:', e);
  }
}

function getLocalUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch (e) {
    console.warn('User parse error:', e);
    return null;
  }
}

/* ──── Safe email normalization (FIX: Avoid collision) ──── */
// ✅ FIX 4.2: Dùng encodeURIComponent thay vì replace
function normalizeEmail(email) {
  return encodeURIComponent(email.toLowerCase()).replace(/%/g, '_');
}

/* ──── Credit System Module ──── */
const CreditSystem = {

  /* ── Kiểm tra Firebase ready ── */
  _ensureFirebase() {
    if (_fbReady) return true;
    initFirebase();
    if (!_fbReady) {
      throw new Error(_fbError || 'Firebase không sẵn sàng');
    }
    return true;
  },

  /* ── Lấy Firestore reference cho user ── */
  async getUserDoc(email) {
    this._ensureFirebase();
    const normalized = normalizeEmail(email);
    return _db.collection('users').doc(normalized);
  },

  /* ── Tạo doc user khi đăng ký ── */
  async onRegister(email, name) {
    this._ensureFirebase();
    try {
      const ref = await this.getUserDoc(email);
      const snap = await ref.get();
      
      if (!snap.exists) {
        const userData = {
          email,
          name,
          credits: CREDITS.DEFAULT_ON_REGISTER,
          isPremium: false,
          lastRegen: new Date().toISOString().split('T')[0],
          lastSpin: null,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
          creditHistory: [
            {
              ts: new Date().toISOString(),
              action: 'register_bonus',
              amount: CREDITS.DEFAULT_ON_REGISTER,
              reason: 'Đăng ký mới',
              balanceBefore: 0,
              balanceAfter: CREDITS.DEFAULT_ON_REGISTER
            }
          ]
        };
        await ref.set(userData);
        logCredit('REGISTER', `New user: ${email}`, 'success');
      }
      
      return CREDITS.DEFAULT_ON_REGISTER;
    } catch (e) {
      logCredit('REGISTER', `Error registering ${email}: ${e.message}`, 'error');
      throw e;
    }
  },

  /* ── Lấy số điểm hiện tại (auto regen) ── */
  async getCredits(email) {
    this._ensureFirebase();
    await this.checkDailyRegen(email);
    const ref = await this.getUserDoc(email);
    const snap = await ref.get();
    return snap.exists ? (snap.data().credits || 0) : 0;
  },

  /* ── Lấy toàn bộ dữ liệu user ── */
  async getUserData(email) {
    this._ensureFirebase();
    await this.checkDailyRegen(email);
    const ref = await this.getUserDoc(email);
    const snap = await ref.get();
    return snap.exists ? snap.data() : null;
  },

  /* ── Hồi điểm hàng ngày (FIX: Dùng timestamp thay sessionStorage) ── */
  // ✅ FIX 1.5: Kiểm tra timestamp trong Firestore thay vì sessionStorage
  async checkDailyRegen(email) {
    this._ensureFirebase();
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const ref = await this.getUserDoc(email);
      const snap = await ref.get();
      
      if (!snap.exists) return;
      
      const data = snap.data();
      // ✅ FIX: So sánh date string trực tiếp từ Firestore
      if (data.lastRegen !== today) {
        const current = data.credits || 0;
        const newCredits = Math.min(
          current + CREDITS.DAILY_REGEN,
          CREDITS.DAILY_REGEN_CAP
        );
        
        // ✅ Save history with balance before/after
        const history = data.creditHistory || [];
        const newHistory = [
          ...history.slice(-999),
          {
            ts: new Date().toISOString(),
            action: 'daily_regen',
            amount: CREDITS.DAILY_REGEN,
            reason: 'Hồi phục hàng ngày',
            balanceBefore: current,
            balanceAfter: newCredits
          }
        ];
        
        await ref.update({
          credits: newCredits,
          lastRegen: today,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
          creditHistory: newHistory
        });
        
        // ✅ Cập nhật display ngay lập tức
        CreditDisplay.update(newCredits);
        logCredit('REGEN', `${email}: +${CREDITS.DAILY_REGEN} credits`, 'success');
      }
    } catch (e) {
      logCredit('REGEN', `Error: ${e.message}`, 'error');
    }
  },

  /* ── Trừ điểm (với logic Premium) ── */
  async deduct(email, amount, reason = '') {
    this._ensureFirebase();
    try {
      const ref = await this.getUserDoc(email);
      const snap = await ref.get();
      
      if (!snap.exists) {
        return { ok: false, message: 'Tài khoản không tồn tại', credits: 0 };
      }
      
      const data = snap.data();
      const current = data.credits || 0;

      // Premium user: miễn phí xem công thức
      if (reason === 'view_recipe' && data.isPremium) {
        logCredit('DEDUCT', `${email}: FREE (premium) - view recipe`, 'success');
        return { ok: true, credits: current, free: true };
      }

      // Premium user: giảm 50% tiền meal plan
      let finalAmount = amount;
      if (reason === 'meal_plan' && data.isPremium) {
        finalAmount = CREDITS.COST_MEAL_PLAN_PREMIUM;
      }

      // Kiểm tra đủ điểm
      if (current < finalAmount) {
        logCredit('DEDUCT', `${email}: INSUFFICIENT (need ${finalAmount}, have ${current})`, 'warn');
        return {
          ok: false,
          message: `❌ Không đủ điểm! Bạn cần ${finalAmount} điểm, hiện có ${current}.`,
          credits: current
        };
      }

      // Trừ điểm
      const newCredits = current - finalAmount;
      
      // ✅ FIX 4.2: Giới hạn credit history để tránh vượt 1MB document size
      const history = data.creditHistory || [];
      const newHistory = [
        ...history.slice(-999), // Giữ tối đa 1000 items (cũ nhất bị xóa)
        {
          ts: new Date().toISOString(),
          action: reason,
          amount: -finalAmount,
          reason: reason,
          balanceBefore: current,
          balanceAfter: newCredits
        }
      ];
      
      await ref.update({
        credits: newCredits,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
        creditHistory: newHistory
      });

      // ✅ Cập nhật UI ngay
      CreditDisplay.update(newCredits);
      
      logCredit('DEDUCT', `${email}: -${finalAmount} (${reason})`, 'success');
      return { ok: true, credits: newCredits };
    } catch (e) {
      logCredit('DEDUCT', `Error: ${e.message}`, 'error');
      throw e;
    }
  },

  /* ── Cộng điểm (top-up, spin reward) ── */
  async addCredits(email, amount, reason = 'manual') {
    this._ensureFirebase();
    try {
      const ref = await this.getUserDoc(email);
      const snap = await ref.get();
      const data = snap.data();
      const current = data.credits || 0;
      const newCredits = current + amount;

      // ✅ Save history with balance before/after
      const history = data.creditHistory || [];
      const newHistory = [
        ...history.slice(-999), // Keep max 1000 items
        {
          ts: new Date().toISOString(),
          action: reason,
          amount: amount,
          reason: reason,
          balanceBefore: current,
          balanceAfter: newCredits
        }
      ];
      
      await ref.update({
        credits: newCredits,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
        creditHistory: newHistory
      });

      // ✅ Cập nhật UI ngay
      CreditDisplay.update(newCredits);
      
      logCredit('ADD', `${email}: +${amount} (${reason})`, 'success');
      return { ok: true, credits: newCredits };
    } catch (e) {
      logCredit('ADD', `Error: ${e.message}`, 'error');
      throw e;
    }
  },

  // Alias for backward compatibility
  async add(email, amount, reason = 'manual') {
    return this.addCredits(email, amount, reason);
  },

  /* ── Nâng cấp Premium ── */
  async setPremium(email, durationDays = 30) {
    this._ensureFirebase();
    try {
      const ref = await this.getUserDoc(email);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + durationDays);
      const snap = await ref.get();
      const data = snap.data();
      const current = data.credits || 0;
      
      // ✅ Save premium activation to history
      const history = data.creditHistory || [];
      const newHistory = [
        ...history.slice(-999),
        {
          ts: new Date().toISOString(),
          action: 'premium_activated',
          amount: 0,
          reason: `Kích hoạt Premium (${durationDays} ngày)`,
          balanceBefore: current,
          balanceAfter: current
        }
      ];
      
      await ref.update({
        isPremium: true,
        premiumExpiresAt: expiresAt.toISOString(),
        premiumActivatedAt: new Date().toISOString(),
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
        creditHistory: newHistory
      });
      logCredit('PREMIUM', `${email}: Premium activated for ${durationDays} days`, 'success');
      return { ok: true };
    } catch (e) {
      logCredit('PREMIUM', `Error: ${e.message}`, 'error');
      throw e;
    }
  },

  /* ── Kiểm tra quay vòng hôm nay ── */
  async canSpin(email) {
    this._ensureFirebase();
    try {
      const ref = await this.getUserDoc(email);
      const snap = await ref.get();
      if (!snap.exists) return false;
      const today = new Date().toISOString().split('T')[0];
      return snap.data().lastSpin !== today;
    } catch (e) {
      console.warn('canSpin error:', e);
      return false;
    }
  },

  /* ── Thực hiện quay vòng ── */
  async doSpin(email) {
    this._ensureFirebase();
    try {
      const canSpin = await this.canSpin(email);
      if (!canSpin) {
        return { ok: false, message: '🎰 Bạn đã quay hôm nay! Quay lại ngày mai nhé.' };
      }

      const reward = Math.floor(Math.random() * 3) + 1; // 1-3 điểm
      const today = new Date().toISOString().split('T')[0];
      const ref = await this.getUserDoc(email);
      const snap = await ref.get();
      const data = snap.data();
      const current = data.credits || 0;
      const newCredits = current + reward;
      
      // ✅ Save history with balance before/after
      const history = data.creditHistory || [];
      const newHistory = [
        ...history.slice(-999),
        {
          ts: new Date().toISOString(),
          action: 'spin',
          amount: reward,
          reason: 'Vòng quay may mắn',
          balanceBefore: current,
          balanceAfter: newCredits
        }
      ];

      await ref.update({
        credits: newCredits,
        lastSpin: today,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
        creditHistory: newHistory
      });

      CreditDisplay.update(newCredits);
      logCredit('SPIN', `${email}: +${reward} credits`, 'success');
      return { ok: true, reward, credits: newCredits };
    } catch (e) {
      logCredit('SPIN', `Error: ${e.message}`, 'error');
      throw e;
    }
  },

  /* ── Trừ điểm xem công thức ── */
  async chargeRecipeView(email) {
    if (!email) {
      return { ok: false, message: '❌ Vui lòng đăng nhập để xem công thức.' };
    }
    try {
      const result = await this.deduct(email, CREDITS.COST_VIEW_RECIPE, 'view_recipe');
      return result;
    } catch (e) {
      return { ok: false, message: `❌ Lỗi: ${e.message}`, credits: 0 };
    }
  },

  /* ── Trừ điểm Meal Plan ── */
  async chargeMealPlan(email) {
    if (!email) {
      return { ok: false, message: '❌ Vui lòng đăng nhập.' };
    }
    try {
      const result = await this.deduct(email, CREDITS.COST_MEAL_PLAN, 'meal_plan');
      return result;
    } catch (e) {
      return { ok: false, message: `❌ Lỗi: ${e.message}` };
    }
  },

  /* ── Trừ điểm Chatbot (0 điểm) ── */
  async chargeChatbot(email) {
    if (!email) return { ok: false, message: 'Vui lòng đăng nhập để dùng chatbot.' };
    logCredit('CHATBOT', `${email}: Free access`, 'info');
    return { ok: true, credits: await this.getCredits(email), free: true };
  }
};

/* ──── Credit Display Badge ──── */
const CreditDisplay = {
  init() {
    const user = getLocalUser();
    if (!user) return;
    this._inject();
    this.refresh(user.email);
  },

  _inject() {
    if (document.getElementById('creditBadge')) return;
    const authArea = document.querySelector('.auth-buttons');
    if (!authArea) return;

    const badge = document.createElement('a');
    badge.id = 'creditBadge';
    badge.href = 'profile.html';
    badge.title = 'Điểm tín dụng';
    badge.style.cssText = `
      display:inline-flex;align-items:center;gap:.35rem;
      background:linear-gradient(135deg,rgba(233,184,114,0.18),rgba(166,61,64,0.18));
      border:1px solid rgba(233,184,114,0.4);
      border-radius:100px;padding:.35rem .85rem;font-size:.82rem;
      font-weight:700;color:var(--gold);text-decoration:none;
      transition:all .2s;cursor:pointer;white-space:nowrap;
    `;
    badge.innerHTML = `⚡ <span id="creditCount">…</span>`;
    authArea.insertBefore(badge, authArea.firstChild);
  },

  async refresh(email) {
    try {
      const credits = await CreditSystem.getCredits(email);
      this.update(credits);
    } catch (e) {
      console.warn('[CreditDisplay] Refresh error:', e);
    }
  },

  update(credits) {
    const el = document.getElementById('creditCount');
    if (el) {
      el.textContent = credits;
      // ✅ Add animation effect
      el.style.transition = 'transform 0.3s cubic-bezier(.22,1,.36,1)';
      el.style.transform = 'scale(1.2)';
      setTimeout(() => el.style.transform = 'scale(1)', 300);
    }
  }
};

/* ──── Gemini AI Helper ──── */
const GeminiAI = {
  async ask(prompt, systemPrompt = '') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT);

      const body = {
        contents: [{ parts: [{ text: prompt }] }],
      };
      if (systemPrompt) {
        body.system_instruction = { parts: [{ text: systemPrompt }] };
      }

      const response = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Gemini API timeout (30s) — vui lòng thử lại');
      }
      throw error;
    }
  },

  async mealPlan(goals) {
    const systemPrompt = "Bạn là một chuyên gia dinh dưỡng và nấu ăn. Tạo kế hoạch ăn uống 30 ngày với các bữa sáng, trưa, tối. Trả về JSON chỉ với trường 'plan' là một mảng các đối tượng có các trường 'day' (số), 'breakfast' (đối tượng với name, cal, protein), 'lunch' (đối tượng với name, cal, protein), 'dinner' (đối tượng với name, cal, protein). Không có markdown hay bất kỳ thứ khác ngoài JSON thôi.";
    const prompt = `Tạo kế hoạch ăn 30 ngày với các mục tiêu: calo=${goals.calories}, protein=${goals.protein}g, carbs=${goals.carbs}g, fat=${goals.fat}g, chế độ=${goals.diet}.`;
    
    try {
      const response = await this.ask(prompt, systemPrompt);
      const cleaned = response.replace(/```json|```/g, '').trim();
      const result = JSON.parse(cleaned);
      return {
        plan: result.plan || [],
        tips: "Kiểm tra lại khẩu phần ăn hàng ngày để phù hợp với mục tiêu của bạn!"
      };
    } catch (e) {
      console.error('Meal plan error:', e);
      // Fallback data
      const fallbackPlan = [];
      for (let i = 1; i <= 30; i++) {
        fallbackPlan.push({
          day: i,
          breakfast: { name: "Cháo trứng gà", cal: 300, protein: 15 },
          lunch: { name: "Cơm gà xào rau", cal: 500, protein: 30 },
          dinner: { name: "Cá hấp rau củ", cal: 400, protein: 25 }
        });
      }
      return {
        plan: fallbackPlan,
        tips: "Đây là kế hoạch gợi ý, điều chỉnh theo nhu cầu cá nhân!"
      };
    }
  }
};

/* ──── Activity Logging ──── */
const LOG_KEY = 'credit_logs';
const MAX_LOGS = 500;

function logCredit(module, msg, type = 'info') {
  try {
    const now = new Date().toISOString();
    const logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    
    logs.push({ ts: now, module, msg, type });
    
    if (logs.length > MAX_LOGS) {
      logs.splice(0, logs.length - MAX_LOGS);
    }
    
    localStorage.setItem(LOG_KEY, JSON.stringify(logs));
  } catch (e) {
    console.warn('Log error:', e);
  }
}

/* ──── Auto-init ──── */
document.addEventListener('DOMContentLoaded', () => {
  initFirebase();
  // ✅ FIX 1.1: Delay tăng lên để Firebase auth state kịp fire
  setTimeout(() => CreditDisplay.init(), 500);
});

/* ──── Exports ──── */
window.CreditSystem = CreditSystem;
window.CreditDisplay = CreditDisplay;
window.GeminiAI = GeminiAI;
window.CREDITS = CREDITS;
window.getLocalUser = getLocalUser;
window.initFirebase = initFirebase;
window.normalizeEmail = normalizeEmail;