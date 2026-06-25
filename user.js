/* ============================================================
   KitchenPal — user.js (FIXED v2)
   ✅ FIX: Chatbot auth check, Timeout handling, History persist
   ✅ FEATURE: Spin wheel implementation
   ============================================================ */

'use strict';

/* ──────────────────────────────────────────────────────────────
   1.  CHATBOT MODULE  —  Food Expert AI (Miễn phí, không tốn credit)
   Nổi bọt hình tròn dưới phải, mở ra chat overlay toàn màn hình
   ────────────────────────────────────────────────────────────── */
const FoodChatbot = (() => {

  /* ── Gemini config (từ config.js - centralized) ── */
  const GEMINI_KEY  = GEMINI_CONFIG.KEY;
  const GEMINI_URL  = GEMINI_CONFIG.URL;
  const GEMINI_TIMEOUT = GEMINI_CONFIG.TIMEOUT;

  const SYSTEM_PROMPT = `Bạn là Chef AI — chuyên gia ẩm thực cao cấp của KitchenPal.
Nhiệm vụ: tư vấn món ăn, gợi ý công thức, giải thích kỹ thuật nấu nướng, 
phân tích dinh dưỡng, và trả lời mọi câu hỏi liên quan đến thực phẩm.

Quy tắc:
- Trả lời bằng TIẾNG VIỆT trừ khi user hỏi bằng tiếng Anh.
- Luôn nhiệt tình, thân thiện, dễ hiểu. Dùng emoji ẩm thực khi phù hợp.
- Nếu gợi ý món ăn, hãy kèm: thời gian nấu, nguyên liệu chính, mức độ khó.
- Không trả lời các chủ đề ngoài ẩm thực và thực phẩm.
- KHÔNG tính phí / KHÔNG yêu cầu điểm tín dụng — đây là dịch vụ miễn phí.
- Nếu không biết, hãy thành thật nói bạn không chắc chắn thay vì bịa đặt thông tin.`;

  let isOpen      = false;
  let isTyping    = false;
  let messages    = []; // { role: 'user'|'assistant', content: string }
  let _container  = null;

  /* ── Load chat history từ localStorage (FIX 2.4) ── */
  function _loadHistory() {
    try {
      const saved = localStorage.getItem('chatbot_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.warn('History load error:', e);
      return [];
    }
  }

  /* ── Save chat history vào localStorage ── */
  function _saveHistory() {
    try {
      // Giữ tối đa 50 messages
      const toSave = messages.slice(-50);
      localStorage.setItem('chatbot_history', JSON.stringify(toSave));
    } catch (e) {
      console.warn('History save error:', e);
    }
  }

  /* ── Build DOM ── */
  function _buildDOM() {
    if (document.getElementById('chatbotWidget')) return;

    const css = `
      #chatbotBubble {
        position:fixed;bottom:1.5rem;right:1.5rem;
        width:56px;height:56px;border-radius:50%;
        background:linear-gradient(135deg,var(--accent),var(--gold));
        box-shadow:0 4px 20px rgba(166,61,64,0.5);
        cursor:pointer;z-index:9000;
        display:flex;align-items:center;justify-content:center;
        font-size:1.4rem;border:none;
        transition:transform .25s var(--ease),box-shadow .25s var(--ease);
        animation:bubblePulse 3s ease-in-out infinite;
      }
      #chatbotBubble:hover {
        transform:scale(1.12);
        box-shadow:0 6px 30px rgba(166,61,64,0.7);
      }
      @keyframes bubblePulse {
        0%,100%{box-shadow:0 4px 20px rgba(166,61,64,0.5)}
        50%{box-shadow:0 4px 32px rgba(166,61,64,0.8),0 0 0 8px rgba(166,61,64,0.15)}
      }
      #chatbotWidget {
        position:fixed;bottom:5rem;right:1.5rem;
        width:min(420px,calc(100vw - 2rem));
        height:min(600px,calc(100vh - 7rem));
        background:var(--bg-2);
        border:1px solid var(--border-2);
        border-radius:var(--r-xl);
        box-shadow:0 16px 64px rgba(0,0,0,0.5);
        display:flex;flex-direction:column;
        z-index:8999;
        transform:scale(.85) translateY(20px);opacity:0;pointer-events:none;
        transition:transform .3s var(--ease),opacity .3s var(--ease);
        overflow:hidden;
      }
      #chatbotWidget.open {
        transform:scale(1) translateY(0);opacity:1;pointer-events:all;
      }
      .cb-header {
        display:flex;align-items:center;gap:.75rem;
        padding:1rem 1.25rem;
        background:linear-gradient(135deg,rgba(166,61,64,.18),rgba(233,184,114,.1));
        border-bottom:1px solid var(--border);flex-shrink:0;
      }
      .cb-avatar {
        width:40px;height:40px;border-radius:50%;
        background:linear-gradient(135deg,var(--accent),var(--gold));
        display:flex;align-items:center;justify-content:center;
        font-size:1.1rem;flex-shrink:0;
      }
      .cb-title { font-family:var(--font-display);font-size:1rem;line-height:1.2; }
      .cb-sub { font-size:.72rem;color:var(--green);font-weight:600;letter-spacing:.03em; }
      .cb-close {
        margin-left:auto;background:none;border:none;cursor:pointer;
        color:var(--text-3);font-size:1.2rem;padding:.25rem;
        border-radius:50%;transition:all .2s;
      }
      .cb-close:hover { background:var(--surface-2);color:var(--text); }
      .cb-messages {
        flex:1;overflow-y:auto;padding:1rem 1.25rem;
        display:flex;flex-direction:column;gap:.75rem;
        scroll-behavior:smooth;
      }
      .cb-messages::-webkit-scrollbar { width:4px; }
      .cb-messages::-webkit-scrollbar-thumb { background:var(--border-2);border-radius:4px; }
      .cb-msg {
        max-width:85%;padding:.65rem .9rem;
        border-radius:18px;font-size:.875rem;line-height:1.55;
        animation:msgIn .2s var(--ease);
        word-wrap:break-word;
      }
      @keyframes msgIn {
        from{opacity:0;transform:translateY(6px)}
        to{opacity:1;transform:translateY(0)}
      }
      .cb-msg.user {
        align-self:flex-end;
        background:linear-gradient(135deg,var(--accent),#c9585b);
        color:#fff;border-bottom-right-radius:6px;
      }
      .cb-msg.assistant {
        align-self:flex-start;
        background:var(--surface-2);color:var(--text);
        border-bottom-left-radius:6px;border:1px solid var(--border);
      }
      .cb-msg.assistant strong { color:var(--gold); }
      .cb-msg.error {
        align-self:flex-start;
        background:rgba(220,38,38,0.1);color:#dc2626;
        border:1px solid rgba(220,38,38,0.3);
      }
      .cb-typing {
        align-self:flex-start;padding:.65rem .9rem;
        background:var(--surface-2);border-radius:18px;border-bottom-left-radius:6px;
        border:1px solid var(--border);display:flex;gap:.3rem;align-items:center;
      }
      .cb-typing span {
        width:6px;height:6px;background:var(--text-3);border-radius:50%;
        animation:dotBounce 1.2s ease-in-out infinite;
      }
      .cb-typing span:nth-child(2){animation-delay:.2s}
      .cb-typing span:nth-child(3){animation-delay:.4s}
      @keyframes dotBounce {
        0%,60%,100%{transform:translateY(0)}
        30%{transform:translateY(-6px)}
      }
      .cb-quick-btns {
        display:flex;flex-wrap:wrap;gap:.4rem;
        padding:.5rem 1.25rem;flex-shrink:0;
      }
      .cb-quick {
        font-size:.72rem;padding:.3rem .75rem;
        border-radius:100px;border:1px solid var(--border-2);
        background:var(--surface);color:var(--text-2);
        cursor:pointer;transition:all .2s;white-space:nowrap;
      }
      .cb-quick:hover { border-color:var(--gold);color:var(--gold); }
      .cb-input-row {
        display:flex;gap:.5rem;padding:.75rem 1rem;
        border-top:1px solid var(--border);flex-shrink:0;
        background:var(--bg-2);
      }
      .cb-input {
        flex:1;background:var(--surface);border:1px solid var(--border-2);
        border-radius:var(--r-sm);padding:.6rem 1rem;
        color:var(--text);font-family:var(--font-body);font-size:.875rem;
        outline:none;resize:none;max-height:100px;
        transition:border-color .2s;line-height:1.4;
      }
      .cb-input:focus { border-color:var(--accent); }
      .cb-input:disabled { opacity:.5;cursor:not-allowed; }
      .cb-send {
        width:40px;height:40px;border-radius:50%;flex-shrink:0;
        background:linear-gradient(135deg,var(--accent),var(--gold));
        border:none;cursor:pointer;color:#fff;font-size:1rem;
        display:flex;align-items:center;justify-content:center;
        transition:transform .2s,opacity .2s;
      }
      .cb-send:disabled { opacity:.5;cursor:not-allowed; }
      .cb-send:not(:disabled):hover { transform:scale(1.1); }
      .cb-free-badge {
        font-size:.68rem;padding:.15rem .5rem;background:rgba(144,169,89,.2);
        color:var(--green);border-radius:100px;font-weight:700;letter-spacing:.04em;
      }
      .cb-auth-required {
        padding:1.5rem;text-align:center;color:var(--text-3);font-size:.875rem;
      }
      .cb-auth-required a {
        color:var(--accent);text-decoration:none;font-weight:600;
      }
      .cb-auth-required a:hover { text-decoration:underline; }
    `;

    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    /* Bubble button */
    const bubble = document.createElement('button');
    bubble.id = 'chatbotBubble';
    bubble.innerHTML = '👨‍🍳';
    bubble.title = 'Chef AI — Tư vấn ẩm thực miễn phí';
    bubble.addEventListener('click', toggle);
    document.body.appendChild(bubble);

    /* Widget */
    const widget = document.createElement('div');
    widget.id = 'chatbotWidget';
    widget.innerHTML = `
      <div class="cb-header">
        <div class="cb-avatar">👨‍🍳</div>
        <div>
          <div class="cb-title">Chef AI</div>
          <div class="cb-sub">🟢 Online · Miễn phí <span class="cb-free-badge">FREE</span></div>
        </div>
        <button class="cb-close" id="cbClose" title="Đóng">✕</button>
      </div>
      <div class="cb-messages" id="cbMessages"></div>
      <div class="cb-quick-btns" id="cbQuickBtns">
        <button class="cb-quick" onclick="FoodChatbot.sendQuick('Gợi ý món ăn dễ nấu?')">🍳 Món dễ nấu</button>
        <button class="cb-quick" onclick="FoodChatbot.sendQuick('Món ăn giảm cân tốt nhất?')">🥗 Giảm cân</button>
        <button class="cb-quick" onclick="FoodChatbot.sendQuick('Thực phẩm giàu protein?')">💪 Protein cao</button>
        <button class="cb-quick" onclick="FoodChatbot.sendQuick('Món tráng miệng nhanh?')">🍮 Tráng miệng</button>
      </div>
      <div class="cb-input-row">
        <textarea class="cb-input" id="cbInput" placeholder="Hỏi Chef AI về ẩm thực..." rows="1"></textarea>
        <button class="cb-send" id="cbSend" title="Gửi">➤</button>
      </div>`;
    document.body.appendChild(widget);
    _container = widget;

    /* Events */
    document.getElementById('cbClose').addEventListener('click', () => toggle(false));
    document.getElementById('cbSend').addEventListener('click', _handleSend);
    const input = document.getElementById('cbInput');
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _handleSend(); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });

    /* Load history and show messages */
    messages = _loadHistory();
    if (messages.length === 0) {
      _appendMsg('assistant',
        '👋 Xin chào! Tôi là **Chef AI** — chuyên gia ẩm thực của KitchenPal.\n\n' +
        'Tôi có thể giúp bạn:\n' +
        '🍳 Gợi ý công thức & món ăn\n' +
        '🥗 Tư vấn dinh dưỡng\n' +
        '👨‍🍳 Giải thích kỹ thuật nấu nướng\n\n' +
        'Dịch vụ này **hoàn toàn miễn phí**, không tốn điểm tín dụng! ✨'
      );
    } else {
      // Display existing messages
      messages.forEach(m => {
        _appendMsg(m.role === 'model' ? 'assistant' : 'user', m.content, true);
      });
    }
  }

  function _appendMsg(role, content, skipHistory = false) {
    const container = document.getElementById('cbMessages');
    if (!container) return;

    /* Hide quick btns after first user message */
    if (role === 'user') {
      const qb = document.getElementById('cbQuickBtns');
      if (qb) qb.style.display = 'none';
    }

    const div = document.createElement('div');
    div.className = `cb-msg ${role}`;
    /* Simple markdown: **bold** → <strong> */
    const html = content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    div.innerHTML = html;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;

    if (!skipHistory) {
      messages.push({ role: role === 'assistant' ? 'model' : 'user', content });
      _saveHistory();
    }
  }

  function _showTyping() {
    const container = document.getElementById('cbMessages');
    if (!container) return null;
    const div = document.createElement('div');
    div.className = 'cb-typing';
    div.id = 'cbTyping';
    div.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
  }

  async function _handleSend() {
    /* ✅ FIX 2.1: Check xem user đã đăng nhập chưa */
    const user = getLocalUser();
    if (!user) {
      _appendMsg('assistant', 
        '⚠️ Bạn cần phải **đăng nhập** để sử dụng Chef AI.\n\n' +
        '[Đăng nhập tại đây](auth.html)'
      );
      return;
    }

    const input = document.getElementById('cbInput');
    const sendBtn = document.getElementById('cbSend');
    if (!input || isTyping) return;

    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = 'auto';
    _appendMsg('user', text);
    isTyping = true;
    if (sendBtn) sendBtn.disabled = true;

    const typing = _showTyping();

    try {
      /* ✅ FIX 2.3: Thêm timeout handling với AbortController */
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT);

      /* Build conversation history for Gemini */
      const history = messages.slice(0, -1).map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));

      const body = {
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          ...history,
          { role: 'user', parts: [{ text }] }
        ]
      };

      const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ||
        'Xin lỗi, tôi không thể trả lời lúc này. Vui lòng thử lại!';

      typing?.remove();
      _appendMsg('assistant', reply);
    } catch (err) {
      typing?.remove();
      console.error('[ChatBot] Error:', err);
      
      let errorMsg = '⚠️ Kết nối AI tạm thời gián đoạn. Vui lòng thử lại!';
      if (err.name === 'AbortError') {
        errorMsg = '⏱️ Chef AI bận quá! Vui lòng thử lại sau ít phút.';
      }
      
      _appendMsg('assistant', errorMsg);
    } finally {
      isTyping = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  function toggle(forceState) {
    const w = document.getElementById('chatbotWidget');
    if (!w) return;
    isOpen = typeof forceState === 'boolean' ? forceState : !isOpen;
    w.classList.toggle('open', isOpen);
    if (isOpen) document.getElementById('cbInput')?.focus();
  }

  return {
    init() {
      document.addEventListener('DOMContentLoaded', () => {
        _buildDOM();
      });
      if (document.readyState !== 'loading') _buildDOM();
    },
    toggle,
    sendQuick(text) {
      const input = document.getElementById('cbInput');
      if (input) { input.value = text; _handleSend(); }
    }
  };
})();


/* ──────────────────────────────────────────────────────────────
   2.  SPIN WHEEL IMPLEMENTATION  —  Quay vòng hàng ngày
   ────────────────────────────────────────────────────────────── */

const SpinWheel = {
  /* ✅ NEW: Vẽ spin wheel với Canvas */
  drawWheel(canvasEl) {
    const ctx = canvasEl.getContext('2d');
    const radius = canvasEl.width / 2;
    const segments = 8;
    const rewards = [1, 2, 3, 1, 2, 1, 3, 2];

    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const nextAngle = ((i + 1) / segments) * Math.PI * 2;

      // Draw segment
      ctx.fillStyle = i % 2 === 0 ? 'rgba(233,184,114,0.3)' : 'rgba(166,61,64,0.3)';
      ctx.beginPath();
      ctx.moveTo(radius, radius);
      ctx.arc(radius, radius, radius, angle, nextAngle);
      ctx.closePath();
      ctx.fill();

      // Draw border
      ctx.strokeStyle = 'rgba(233,184,114,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw number
      const textAngle = angle + (nextAngle - angle) / 2;
      const x = radius + Math.cos(textAngle) * (radius * 0.65);
      const y = radius + Math.sin(textAngle) * (radius * 0.65);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(rewards[i], x, y);
    }

    // Draw center circle
    ctx.fillStyle = 'linear-gradient(135deg, var(--accent), var(--gold))';
    ctx.beginPath();
    ctx.arc(radius, radius, 20, 0, Math.PI * 2);
    ctx.fill();
  },

  /* Spin animation */
  async spin(canvasEl, reward) {
    return new Promise((resolve) => {
      const segments = 8;
      const targetIndex = (reward - 1) % segments;
      const spinDuration = 3000; // 3 seconds
      const totalSpins = 5; // 5 full rotations
      
      let startAngle = 0;
      let currentRotation = 0;
      const targetAngle = ((segments - targetIndex) / segments) * Math.PI * 2;
      const totalRotation = Math.PI * 2 * totalSpins + targetAngle;

      const animationStart = Date.now();

      const animate = () => {
        const elapsed = Date.now() - animationStart;
        const progress = Math.min(elapsed / spinDuration, 1);
        
        // Easing function (ease-out)
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        currentRotation = totalRotation * easeProgress;

        canvasEl.style.transform = `rotate(${currentRotation}rad)`;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      animate();
    });
  }
};


/* ──────────────────────────────────────────────────────────────
   3.  TOP-UP SYSTEM  —  Nạp credit
   ────────────────────────────────────────────────────────────── */

const TopupSystem = {
  /* Các gói nạp */
  packages: [
    { amount: 50, price: 29000, bonus: 5, popular: false },
    { amount: 100, price: 49000, bonus: 15, popular: true },
    { amount: 500, price: 199000, bonus: 100, popular: false },
    { amount: 1000, price: 349000, bonus: 250, popular: false },
  ],

  /* Simulate payment (thực tế sẽ gọi Stripe/VNPay) */
  async purchase(email, packageIndex) {
    const pkg = this.packages[packageIndex];
    if (!pkg) return { ok: false, message: 'Gói không hợp lệ' };

    try {
      // ✅ TODO: Integrate with actual payment gateway
      // For now, directly add credits (not recommended for production!)
      const totalAmount = pkg.amount + pkg.bonus;
      // ✅ FIX: Use correct function name CreditSystem.add()
      const result = await CreditSystem.add(email, totalAmount, `topup_${pkg.amount}`);
      
      if (result.ok) {
        return { 
          ok: true, 
          message: `✅ Nạp thành công! +${totalAmount} điểm (bao gồm ${pkg.bonus} điểm thưởng)`,
          credits: result.credits
        };
      } else {
        return { ok: false, message: result.message || 'Lỗi khi nạp credit' };
      }
    } catch (e) {
      console.error('Purchase error:', e);
      return { ok: false, message: `Lỗi: ${e.message}` };
    }
  }
};


/* ──────────────────────────────────────────────────────────────
   4.  INITIALIZATION  —  Khởi tạo
   ────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize chatbot on every page
  FoodChatbot.init();
});

/* Exports */
window.FoodChatbot = FoodChatbot;
window.SpinWheel = SpinWheel;
window.TopupSystem = TopupSystem;