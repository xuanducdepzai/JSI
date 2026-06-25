/* ============================================================
   KitchenPal — admin.js  (Firebase-connected Admin Panel)
   Chỉ giữ những tính năng THỰC SỰ hoạt động được:
   ✅ Dashboard: số liệu thật từ Firestore
   ✅ Quản lý người dùng: CRUD thật
   ✅ Tín dụng: chỉnh sửa thật
   ✅ Công thức: fetch từ TheMealDB
   ✅ Logs: localStorage-based (không cần server)
   ✅ Settings: lưu vào localStorage

   ❌ Đã xoá: Analytics fake charts, Reports giả, heatmap giả
   ============================================================ */

/* ─── Firebase Config (from config.js - centralized) ─── */
// FIREBASE_CONFIG is loaded from config.js

const MEALDB_BASE = API_CONFIG.MEALDB_BASE;

/* ─── State ─── */
let db = null;
let allUsers = [];         // cache từ Firestore
let filteredUsers = [];
let currentPage = 1;
const PAGE_SIZE = 15;
let allRecipes = [];       // cache từ MealDB

/* ─── Init ─── */
document.addEventListener('DOMContentLoaded', () => {
  initFirebaseAdmin();
  setupSidebar();
  setupTheme();
  setupPanelNav();
  setupSettingsTabs();
  addLog('SYSTEM', 'Admin Panel khởi động', 'info');
});

function initFirebaseAdmin() {
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
    addLog('DB', 'Kết nối Firebase Firestore thành công', 'success');

    // ✅ CHECK AUTHENTICATION AND ADMIN AUTHORIZATION
    firebase.auth().onAuthStateChanged(async (user) => {
      if (!user) {
        addLog('AUTH', 'Chưa đăng nhập, chuyển hướng...', 'warn');
        showAdminToast('Vui lòng đăng nhập tài khoản Admin!', 'error');
        setTimeout(() => {
          window.location.href = 'auth.html?redirect=admin.html';
        }, 1500);
        return;
      }

      try {
        const docId = user.email.replace(/\./g, '_');
        const snap = await db.collection('users').doc(docId).get();
        if (snap.exists) {
          const data = snap.data();
          if (data.role === 'admin' || data.isAdmin === true) {
            // Authorized!
            addLog('AUTH', `Admin đăng nhập thành công: ${user.email}`, 'success');
            
            // Cập nhật thông tin admin hiển thị
            const nameEl = document.querySelector('.admin-name');
            const avatarEl = document.querySelector('.admin-avatar');
            if (nameEl) nameEl.textContent = data.name || user.email;
            if (avatarEl) avatarEl.textContent = (data.name || user.email)[0].toUpperCase();

            // Loại bỏ overlay loader
            document.getElementById('adminAuthLoader')?.remove();

            // Kích hoạt panel mặc định
            switchPanel('dashboard');
            return;
          }
        }
        
        // Not an admin: access denied
        addLog('AUTH', `Từ chối truy cập: ${user.email} (không phải admin)`, 'warn');
        showAdminToast('Cảnh báo: Bạn không có quyền truy cập trang quản trị!', 'error');
        document.body.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #0f1117; color: #fff; font-family: 'Plus Jakarta Sans', sans-serif;">
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 3rem; border-radius: 12px; text-align: center; max-width: 450px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
              <span style="font-size: 4rem; display: block; margin-bottom: 1.5rem;">🔒</span>
              <h1 style="font-size: 2rem; margin-bottom: 1rem; font-family: 'DM Serif Display', serif;">Truy cập bị từ chối</h1>
              <p style="color: #a0aec0; margin-bottom: 2.5rem; line-height: 1.6;">Tài khoản <strong>\${user.email}</strong> của bạn không có đặc quyền quản trị viên.</p>
              <div style="display: flex; gap: 1rem; justify-content: center;">
                <a href="index.html" style="padding: 0.75rem 1.5rem; background: #A63D40; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold; transition: opacity 0.2s;">Trang chủ</a>
                <button onclick="firebase.auth().signOut().then(() => window.location.reload())" style="padding: 0.75rem 1.5rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: #fff; border-radius: 6px; font-weight: bold; cursor: pointer; transition: background 0.2s;">Đăng xuất</button>
              </div>
            </div>
          </div>
        `;
      } catch (err) {
        console.error(err);
        showAdminToast('Lỗi kiểm tra quyền truy cập!', 'error');
      }
    });
  } catch (e) {
    addLog('DB', 'Lỗi kết nối Firebase: ' + e.message, 'error');
    showAdminToast('Lỗi kết nối Firebase!', 'error');
  }
}

/* ══════════════ SIDEBAR ══════════════ */
function setupSidebar() {
  const sidebar = document.getElementById('sidebar');
  const main    = document.getElementById('adminMain');
  const toggle  = document.getElementById('sidebarToggle');
  const mobileBtn = document.getElementById('mobileMenuBtn');

  // Desktop collapse
  toggle?.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    main.classList.toggle('sidebar-collapsed');
  });

  // Mobile
  mobileBtn?.addEventListener('click', () => {
    sidebar.classList.toggle('mobile-open');
    getOrCreateOverlay().classList.toggle('show');
  });
}

function getOrCreateOverlay() {
  let ov = document.querySelector('.sidebar-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'sidebar-overlay';
    ov.addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('mobile-open');
      ov.classList.remove('show');
    });
    document.body.appendChild(ov);
  }
  return ov;
}

/* ══════════════ THEME ══════════════ */
function setupTheme() {
  const saved = localStorage.getItem('admin_theme') || 'dark';
  applyTheme(saved);
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('admin_theme', theme);
  const icon = document.querySelector('.theme-icon');
  if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

/* ══════════════ PANEL NAV ══════════════ */
function setupPanelNav() {
  document.querySelectorAll('.nav-item[data-panel]').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      switchPanel(item.dataset.panel);
    });
  });
}

function switchPanel(name) {
  // Nav active
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  const navEl = document.querySelector(`.nav-item[data-panel="${name}"]`);
  if (navEl) navEl.classList.add('active');

  // Panel show
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`panel-${name}`);
  if (panel) panel.classList.add('active');

  // Breadcrumb
  const labels = {
    dashboard: 'Dashboard', users: 'Quản lý người dùng',
    credits: 'Tín dụng', recipes: 'Công thức',
    reports: 'Báo cáo', settings: 'Cài đặt', logs: 'Activity Log'
  };
  const bc = document.getElementById('breadcrumbText');
  if (bc) bc.textContent = labels[name] || name;

  // Load data lazily
  if (name === 'dashboard') loadDashboard();
  if (name === 'users') loadUsers();
  if (name === 'credits') loadCreditsPanel();
  if (name === 'recipes') fetchLiveRecipes();
  if (name === 'reports') initReports();
  if (name === 'logs') loadLogs();

  addLog('ADMIN', `Chuyển đến panel: ${name}`, 'admin');
}

/* ══════════════ DASHBOARD ══════════════ */
async function loadDashboard() {
  if (!db) return;
  try {
    const snap = await db.collection('users').get();
    const users = snap.docs.map(d => d.data());

    const totalUsers = users.length;
    const totalCredits = users.reduce((s, u) => s + (u.credits || 0), 0);
    const premiumCount = users.filter(u => u.isPremium).length;

    // "Active today" = users where lastRegen === today
    const today = new Date().toISOString().split('T')[0];
    const activeToday = users.filter(u => u.lastRegen === today).length;

    animateNumber('statUsers', totalUsers);
    animateNumber('statCredits', totalCredits);
    animateNumber('statPremium', premiumCount);
    animateNumber('statActive', activeToday);

    // Update user count badge on sidebar
    const badge = document.getElementById('userCountBadge');
    if (badge) badge.textContent = totalUsers;

    // Recent users list (5 mới nhất — sắp theo createdAt)
    const sorted = [...users].sort((a, b) => {
      const ta = a.createdAt?.seconds || 0;
      const tb = b.createdAt?.seconds || 0;
      return tb - ta;
    });
    renderRecentUsers(sorted.slice(0, 5));

    addLog('DB', `Dashboard loaded: ${totalUsers} users, ${totalCredits} credits`, 'info');
  } catch (e) {
    addLog('DB', 'Lỗi load dashboard: ' + e.message, 'error');
    showAdminToast('Lỗi tải dashboard', 'error');
  }
}

function animateNumber(elId, target) {
  const el = document.getElementById(elId);
  if (!el) return;
  let current = 0;
  const step = Math.max(1, Math.round(target / 40));
  const interval = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current.toLocaleString('vi');
    if (current >= target) clearInterval(interval);
  }, 20);
}

function renderRecentUsers(users) {
  const list = document.getElementById('recentUsersList');
  if (!list) return;
  if (!users.length) {
    list.innerHTML = '<p style="color:var(--text-3);padding:1rem;text-align:center;">Chưa có người dùng</p>';
    return;
  }
  list.innerHTML = users.map(u => `
    <div class="recent-user-item" onclick="openUserDetail('${u.email}')">
      <div class="ru-avatar">${(u.name || u.email)[0].toUpperCase()}</div>
      <div class="ru-info">
        <div class="ru-name">${u.name || '—'}</div>
        <div class="ru-email">${u.email}</div>
      </div>
      <div class="ru-credits">⚡ ${u.credits || 0}</div>
    </div>`).join('');
}

function refreshDashboard() {
  loadDashboard();
  showAdminToast('Dashboard đã làm mới!', 'success');
}

/* ══════════════ USERS PANEL ══════════════ */
async function loadUsers() {
  if (!db) return;
  showTableLoading('usersTableBody', 8);

  try {
    const snap = await db.collection('users').get();
    allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    applyUserFilters();
    addLog('DB', `Loaded ${allUsers.length} users`, 'info');
  } catch (e) {
    addLog('DB', 'Lỗi load users: ' + e.message, 'error');
    showAdminToast('Lỗi tải danh sách người dùng', 'error');
  }
}

function applyUserFilters() {
  const search = document.getElementById('userSearch')?.value?.toLowerCase() || '';
  const filter = document.getElementById('userFilter')?.value || 'all';
  const sort   = document.getElementById('userSort')?.value || 'newest';

  let result = [...allUsers];

  // Filter
  if (filter === 'premium') result = result.filter(u => u.isPremium);
  if (filter === 'free')    result = result.filter(u => !u.isPremium);

  // Search
  if (search) {
    result = result.filter(u =>
      (u.email || '').toLowerCase().includes(search) ||
      (u.name  || '').toLowerCase().includes(search)
    );
  }

  // Sort
  if (sort === 'newest') result.sort((a, b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
  if (sort === 'credits') result.sort((a, b) => (b.credits||0) - (a.credits||0));
  if (sort === 'name') result.sort((a, b) => (a.name||'').localeCompare(b.name||''));

  filteredUsers = result;
  currentPage = 1;
  renderUsersTable();
}

function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  const info  = document.getElementById('tableInfo');
  const pagEl = document.getElementById('userPagination');
  if (!tbody) return;

  const totalPages = Math.ceil(filteredUsers.length / PAGE_SIZE);
  const start = (currentPage - 1) * PAGE_SIZE;
  const page  = filteredUsers.slice(start, start + PAGE_SIZE);

  if (!page.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-loading">Không tìm thấy người dùng nào</td></tr>';
    if (info) info.textContent = 'Hiển thị 0 kết quả';
    if (pagEl) pagEl.innerHTML = '';
    return;
  }

  tbody.innerHTML = page.map(u => {
    const joined = u.createdAt?.seconds
      ? new Date(u.createdAt.seconds * 1000).toLocaleDateString('vi')
      : '—';
    const lastSeen = u.lastRegen || '—';
    return `<tr>
      <td><input type="checkbox" class="row-check" data-email="${u.email}" onchange="updateBulkBar()"></td>
      <td><div class="user-cell">
        <div class="user-cell-avatar">${(u.name||u.email)[0].toUpperCase()}</div>
        <div><div class="user-cell-name">${u.name || '—'}</div></div>
      </div></td>
      <td style="font-family:var(--font-mono);font-size:.78rem;">${u.email}</td>
      <td><span class="credit-chip">⚡ ${u.credits || 0}</span></td>
      <td>${u.isPremium
        ? '<span class="badge badge-premium">👑 Premium</span>'
        : '<span class="badge badge-free">Free</span>'}</td>
      <td style="color:var(--text-3);font-size:.78rem;">${joined}</td>
      <td style="color:var(--text-3);font-size:.78rem;">${lastSeen}</td>
      <td><div class="action-btns">
        <button class="action-btn" onclick="openUserDetail('${u.email}')">Chi tiết</button>
        <button class="action-btn" onclick="openEditCredits('${u.email}', ${u.credits||0})">⚡ Điểm</button>
        <button class="action-btn danger" onclick="confirmDeleteUser('${u.email}')">Xoá</button>
      </div></td>
    </tr>`;
  }).join('');

  if (info) info.textContent = `Hiển thị ${start + 1}–${Math.min(start + PAGE_SIZE, filteredUsers.length)} / ${filteredUsers.length} kết quả`;

  // Pagination
  if (pagEl) {
    let pages = '';
    for (let i = 1; i <= totalPages; i++) {
      pages += `<button class="pg-btn${i === currentPage ? ' active' : ''}" onclick="goPage(${i})">${i}</button>`;
    }
    pagEl.innerHTML = pages;
  }
}

function goPage(n) { currentPage = n; renderUsersTable(); }

function toggleSelectAll(cb) {
  document.querySelectorAll('.row-check').forEach(c => c.checked = cb.checked);
  updateBulkBar();
}

function updateBulkBar() {
  const checked = document.querySelectorAll('.row-check:checked').length;
  const bar = document.getElementById('bulkActions');
  const cnt = document.getElementById('selectedCount');
  if (bar) bar.style.display = checked > 0 ? 'flex' : 'none';
  if (cnt) cnt.textContent = checked;
}

function getSelectedEmails() {
  return [...document.querySelectorAll('.row-check:checked')].map(c => c.dataset.email);
}

/* ── User Detail Modal ── */
async function openUserDetail(email) {
  if (!db) return;
  try {
    const docId = email.replace(/\./g, '_');
    const snap = await db.collection('users').doc(docId).get();
    const u = snap.data() || {};
    const isAdminUser = u.role === 'admin' || u.isAdmin === true;
    document.getElementById('userDetailTitle').textContent = `Chi tiết: ${email}`;
    document.getElementById('userDetailBody').innerHTML = `
      <div class="user-detail-grid">
        <div class="detail-stat"><div class="detail-stat-val">${u.credits || 0}</div><div class="detail-stat-label">Credits</div></div>
        <div class="detail-stat"><div class="detail-stat-val">${u.isPremium ? '👑' : 'Free'}</div><div class="detail-stat-label">Gói</div></div>
        <div class="detail-stat"><div class="detail-stat-val">${u.lastRegen || '—'}</div><div class="detail-stat-label">Regen gần nhất</div></div>
        <div class="detail-stat"><div class="detail-stat-val">${u.lastSpin || 'Chưa'}</div><div class="detail-stat-label">Spin gần nhất</div></div>
      </div>
      <div style="margin-top:1.25rem;">
        <p style="font-size:.82rem;color:var(--text-2);margin-bottom:.3rem;"><strong>Email:</strong> ${u.email || email}</p>
        <p style="font-size:.82rem;color:var(--text-2);margin-bottom:.3rem;"><strong>Tên:</strong> ${u.name || '—'}</p>
        <p style="font-size:.82rem;color:var(--text-2);margin-bottom:.3rem;"><strong>Vai trò:</strong> ${isAdminUser ? '<span style="color:var(--gold);font-weight:700;">Quản trị viên (Admin)</span>' : 'Người dùng thường'}</p>
        <p style="font-size:.82rem;color:var(--text-2);margin-bottom:.3rem;"><strong>Ngày tạo:</strong> ${
          u.createdAt?.seconds ? new Date(u.createdAt.seconds * 1000).toLocaleString('vi') : '—'
        }</p>
        <p style="font-size:.82rem;color:var(--text-2);"><strong>Premium từ:</strong> ${u.premiumActivatedAt || '—'}</p>
      </div>
      <div style="margin-top:1.5rem;display:flex;gap:.75rem;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" onclick="openEditCredits('${email}',${u.credits||0});closeModal('userDetailModal')">⚡ Chỉnh điểm</button>
        ${!u.isPremium ? `<button class="btn btn-glass btn-sm" onclick="adminGrantPremium('${email}')">👑 Cấp Premium</button>` : ''}
        ${!isAdminUser ? `<button class="btn btn-glass btn-sm" onclick="adminGrantAdmin('${email}', true)">🛡️ Cấp Admin</button>` : `<button class="btn btn-danger btn-sm" onclick="adminGrantAdmin('${email}', false)">🛡️ Thu hồi Admin</button>`}
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteUser('${email}');closeModal('userDetailModal')">Xoá tài khoản</button>
      </div>`;
    openModal('userDetailModal');
  } catch (e) {
    showAdminToast('Lỗi tải chi tiết: ' + e.message, 'error');
  }
}

async function adminGrantAdmin(email, makeAdmin) {
  if (!db) return;
  const docId = email.replace(/\./g, '_');
  try {
    await db.collection('users').doc(docId).update({
      isAdmin: makeAdmin,
      role: makeAdmin ? 'admin' : 'user',
      creditHistory: firebase.firestore.FieldValue.arrayUnion({
        ts: new Date().toISOString(),
        action: makeAdmin ? 'admin_grant' : 'admin_revoke',
        amount: 0,
        reason: makeAdmin ? 'Được cấp quyền Admin bởi Admin' : 'Bị thu hồi quyền Admin bởi Admin'
      })
    });
    showAdminToast(makeAdmin ? `🛡️ Đã cấp quyền Admin cho ${email}` : `🛡️ Đã thu hồi quyền Admin của ${email}`, 'success');
    addLog('ADMIN', makeAdmin ? `Cấp Admin: ${email}` : `Thu hồi Admin: ${email}`, 'admin');
    loadUsers();
    closeModal('userDetailModal');
  } catch (e) {
    showAdminToast('Lỗi thay đổi quyền Admin: ' + e.message, 'error');
  }
}

/* ── Edit Credits Modal ── */
function openEditCredits(email, current) {
  document.getElementById('editCreditEmail').textContent = email;
  document.getElementById('editCreditCurrent').value = current;
  document.getElementById('editCreditAmount').value = 5;
  document.getElementById('editCreditAction').value = 'add';
  document.getElementById('editCreditReason').value = '';
  openModal('editCreditsModal');
}

async function confirmEditCredits() {
  const email   = document.getElementById('editCreditEmail').textContent;
  const current = parseInt(document.getElementById('editCreditCurrent').value) || 0;
  const amount  = parseInt(document.getElementById('editCreditAmount').value) || 0;
  const action  = document.getElementById('editCreditAction').value;
  const reason  = document.getElementById('editCreditReason').value || 'Admin điều chỉnh';

  if (!db || amount < 0) return;
  const docId = email.replace(/\./g, '_');

  let newCredits;
  if (action === 'set')      newCredits = amount;
  else if (action === 'add') newCredits = current + amount;
  else                       newCredits = Math.max(0, current - amount);

  try {
    await db.collection('users').doc(docId).update({ 
      credits: newCredits,
      creditHistory: firebase.firestore.FieldValue.arrayUnion({
        ts: new Date().toISOString(),
        action: 'admin_adjust',
        amount: newCredits - current,
        reason: reason || `Admin điều chỉnh (${current} -> ${newCredits})`
      })
    });
    showAdminToast(`✅ Cập nhật điểm: ${email} → ${newCredits}`, 'success');
    addLog('CREDIT', `[${reason}] ${email}: ${current} → ${newCredits}`, 'credit');
    closeModal('editCreditsModal');
    loadUsers();
  } catch (e) {
    showAdminToast('Lỗi cập nhật: ' + e.message, 'error');
  }
}

/* ── Add User Modal ── */
function openAddUserModal() { openModal('addUserModal'); }

async function confirmAddUser() {
  const name    = document.getElementById('newUserName').value.trim();
  const email   = document.getElementById('newUserEmail').value.trim();
  const credits = parseInt(document.getElementById('newUserCredits').value) || 5;
  const premium = document.getElementById('newUserPremium').value === 'true';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return showAdminToast('Email không hợp lệ', 'error');
  }
  if (!db) return;

  const docId = email.replace(/\./g, '_');
  const today = new Date().toISOString().split('T')[0];

  try {
    const existing = await db.collection('users').doc(docId).get();
    if (existing.exists) return showAdminToast('Email đã tồn tại!', 'error');

    await db.collection('users').doc(docId).set({
      email, name, credits, isPremium: premium,
      lastRegen: today, lastSpin: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      creditHistory: [
        {
          ts: new Date().toISOString(),
          action: 'admin_create',
          amount: credits,
          reason: 'Tài khoản được tạo bởi Admin'
        }
      ]
    });
    showAdminToast(`✅ Đã thêm user: ${email}`, 'success');
    addLog('ADMIN', `Thêm user mới: ${email}`, 'admin');
    closeModal('addUserModal');
    loadUsers();
  } catch (e) {
    showAdminToast('Lỗi thêm user: ' + e.message, 'error');
  }
}

/* ── Delete User ── */
function confirmDeleteUser(email) {
  showConfirmModal(
    'Xoá tài khoản',
    `Bạn chắc chắn muốn xoá tài khoản <strong>${email}</strong>? Hành động này không thể hoàn tác.`,
    async () => {
      if (!db) return;
      const docId = email.replace(/\./g, '_');
      try {
        await db.collection('users').doc(docId).delete();
        showAdminToast(`✅ Đã xoá: ${email}`, 'success');
        addLog('ADMIN', `Xoá tài khoản: ${email}`, 'warn');
        closeModal('confirmModal');
        loadUsers();
      } catch (e) {
        showAdminToast('Lỗi xoá: ' + e.message, 'error');
      }
    }
  );
}

/* ── Grant Premium ── */
async function adminGrantPremium(email) {
  if (!db) return;
  const docId = email.replace(/\./g, '_');
  try {
    await db.collection('users').doc(docId).update({
      isPremium: true,
      premiumActivatedAt: new Date().toISOString(),
      creditHistory: firebase.firestore.FieldValue.arrayUnion({
        ts: new Date().toISOString(),
        action: 'admin_premium',
        amount: 0,
        reason: 'Được cấp quyền Premium bởi Admin'
      })
    });
    showAdminToast(`👑 Đã cấp Premium cho ${email}`, 'success');
    addLog('ADMIN', `Cấp Premium: ${email}`, 'admin');
    loadUsers();
  } catch (e) {
    showAdminToast('Lỗi cấp Premium: ' + e.message, 'error');
  }
}

/* ── Bulk actions ── */
async function bulkCreditSelected() {
  const emails = getSelectedEmails();
  if (!emails.length) return showAdminToast('Chưa chọn user nào', 'error');
  const amount = parseInt(prompt(`Cộng bao nhiêu điểm cho ${emails.length} user?`), 10);
  if (!amount || amount <= 0) return;

  let ok = 0;
  for (const email of emails) {
    try {
      const docId = email.replace(/\./g, '_');
      await db.collection('users').doc(docId).update({
        credits: firebase.firestore.FieldValue.increment(amount)
      });
      ok++;
    } catch {}
  }
  showAdminToast(`✅ Cộng ${amount} điểm cho ${ok}/${emails.length} users`, 'success');
  addLog('CREDIT', `Bulk +${amount} điểm → ${ok} users`, 'credit');
  loadUsers();
}

async function bulkDeleteSelected() {
  const emails = getSelectedEmails();
  if (!emails.length) return showAdminToast('Chưa chọn user nào', 'error');
  showConfirmModal(
    'Xoá hàng loạt',
    `Xoá <strong>${emails.length}</strong> tài khoản đã chọn?`,
    async () => {
      let ok = 0;
      for (const email of emails) {
        try {
          await db.collection('users').doc(email.replace(/\./g,'_')).delete();
          ok++;
        } catch {}
      }
      showAdminToast(`✅ Đã xoá ${ok} tài khoản`, 'success');
      addLog('ADMIN', `Bulk delete: ${ok} users`, 'warn');
      closeModal('confirmModal');
      loadUsers();
    }
  );
}

/* ── Export CSV ── */
function exportUsers() {
  if (!filteredUsers.length) return showAdminToast('Không có dữ liệu', 'error');
  const rows = [
    ['Email','Tên','Credits','Premium','Ngày tạo','Regen gần nhất'],
    ...filteredUsers.map(u => [
      u.email, u.name||'', u.credits||0, u.isPremium?'Yes':'No',
      u.createdAt?.seconds ? new Date(u.createdAt.seconds*1000).toLocaleDateString('vi') : '',
      u.lastRegen||''
    ])
  ];
  downloadCSV(rows, 'users_export.csv');
  addLog('ADMIN', `Xuất CSV: ${filteredUsers.length} users`, 'admin');
}

/* ── Global user search ── */
document.getElementById('userSearch')?.addEventListener('input', debounce(applyUserFilters, 400));
document.getElementById('userFilter')?.addEventListener('change', applyUserFilters);
document.getElementById('userSort')?.addEventListener('change', applyUserFilters);
document.getElementById('globalSearch')?.addEventListener('input', debounce(e => {
  const val = e.target.value;
  if (val.length > 1) {
    switchPanel('users');
    setTimeout(() => {
      const el = document.getElementById('userSearch');
      if (el) { el.value = val; applyUserFilters(); }
    }, 100);
  }
}, 400));

/* ══════════════ CREDITS PANEL ══════════════ */
async function loadCreditsPanel() {
  if (!db) return;
  // Load existing config from Firestore or localStorage
  const cfg = getConfig();
  document.getElementById('cfg_register').value  = cfg.register  || 5;
  document.getElementById('cfg_daily').value     = cfg.daily     || 5;
  document.getElementById('cfg_view').value      = cfg.view      || 1;
  document.getElementById('cfg_fridge').value    = cfg.fridge    || 1;
  document.getElementById('cfg_mealplan').value  = cfg.mealplan  || 3;
  document.getElementById('cfg_maxcredits').value = cfg.maxcredits || 50;

  renderSpinConfig();
  renderTopupConfig();
  loadTransactions();
}

function getConfig() {
  try { return JSON.parse(localStorage.getItem('admin_config') || '{}'); } catch { return {}; }
}

function saveConfig(key) {
  const map = {
    register: 'cfg_register', daily: 'cfg_daily', view: 'cfg_view',
    fridge: 'cfg_fridge', mealplan: 'cfg_mealplan', maxcredits: 'cfg_maxcredits'
  };
  const val = parseInt(document.getElementById(map[key])?.value) || 0;
  const cfg = getConfig();
  cfg[key] = val;
  localStorage.setItem('admin_config', JSON.stringify(cfg));
  showAdminToast(`✅ Lưu cấu hình: ${key} = ${val}`, 'success');
  addLog('ADMIN', `Config update: ${key} = ${val}`, 'admin');
}

/* Spin config UI */
const DEFAULT_SPIN = [
  { label: '1 điểm', value: 1, color: '#A63D40' },
  { label: '2 điểm', value: 2, color: '#E9B872' },
  { label: '3 điểm', value: 3, color: '#90A959' },
];

function renderSpinConfig() {
  const spins = JSON.parse(localStorage.getItem('admin_spin') || 'null') || DEFAULT_SPIN;
  const list = document.getElementById('spinConfigList');
  if (!list) return;
  list.innerHTML = spins.map((s, i) => `
    <div class="spin-config-item">
      <div class="spin-swatch" style="background:${s.color}"></div>
      <span style="flex:1;font-size:.82rem;">${s.label}</span>
      <input type="number" value="${s.value}" min="0" max="50" data-i="${i}" onchange="updateSpin(${i},this.value)" style="width:70px;font-family:var(--font-mono);">
      <input type="color" value="${s.color}" data-i="${i}" onchange="updateSpinColor(${i},this.value)">
    </div>`).join('');
}

function updateSpin(i, val) {
  const spins = JSON.parse(localStorage.getItem('admin_spin') || 'null') || DEFAULT_SPIN;
  spins[i].value = parseInt(val) || 0;
  localStorage.setItem('admin_spin', JSON.stringify(spins));
}
function updateSpinColor(i, val) {
  const spins = JSON.parse(localStorage.getItem('admin_spin') || 'null') || DEFAULT_SPIN;
  spins[i].color = val;
  spins[i].label = `${spins[i].value} điểm`;
  localStorage.setItem('admin_spin', JSON.stringify(spins));
  renderSpinConfig();
}
function saveSpinConfig() {
  showAdminToast('✅ Lưu cấu hình vòng quay!', 'success');
  addLog('ADMIN', 'Cập nhật cấu hình vòng quay', 'admin');
}

/* Top-up packages */
const DEFAULT_TOPUPS = [
  { points: 10, price: '9.000đ', bonus: 0 },
  { points: 30, price: '25.000đ', bonus: 3 },
  { points: 60, price: '45.000đ', bonus: 12 },
  { points: 120, price: '79.000đ', bonus: 40 },
];

function renderTopupConfig() {
  const packs = JSON.parse(localStorage.getItem('admin_topups') || 'null') || DEFAULT_TOPUPS;
  const list = document.getElementById('topupConfigList');
  if (!list) return;
  list.innerHTML = packs.map((p, i) => `
    <div class="topup-config-item">
      <label>Điểm</label>
      <input type="number" value="${p.points}" min="1" data-i="${i}" data-key="points" onchange="updateTopup(${i},'points',this.value)" style="width:90px;">
      <label>Giá</label>
      <input type="text" value="${p.price}" data-i="${i}" data-key="price" onchange="updateTopup(${i},'price',this.value)" style="width:100px;">
      <label>Bonus</label>
      <input type="number" value="${p.bonus}" min="0" data-i="${i}" data-key="bonus" onchange="updateTopup(${i},'bonus',this.value)" style="width:70px;">
      <button class="action-btn danger" onclick="removeTopup(${i})">✕</button>
    </div>`).join('');
}

function updateTopup(i, key, val) {
  const packs = JSON.parse(localStorage.getItem('admin_topups') || 'null') || DEFAULT_TOPUPS;
  packs[i][key] = isNaN(val) ? val : +val;
  localStorage.setItem('admin_topups', JSON.stringify(packs));
}
function removeTopup(i) {
  const packs = JSON.parse(localStorage.getItem('admin_topups') || 'null') || DEFAULT_TOPUPS;
  packs.splice(i, 1);
  localStorage.setItem('admin_topups', JSON.stringify(packs));
  renderTopupConfig();
}
function addTopupPackage() {
  const packs = JSON.parse(localStorage.getItem('admin_topups') || 'null') || DEFAULT_TOPUPS;
  packs.push({ points: 50, price: '39.000đ', bonus: 0 });
  localStorage.setItem('admin_topups', JSON.stringify(packs));
  renderTopupConfig();
}

/* Bulk credit for all */
async function executeBulkCredit() {
  if (!db) return;
  const target = document.getElementById('bulkTarget').value;
  const amount = parseInt(document.getElementById('bulkAmount').value) || 0;
  if (amount <= 0) return showAdminToast('Nhập số điểm hợp lệ', 'error');

  showConfirmModal(
    'Cộng điểm hàng loạt',
    `Cộng <strong>+${amount} điểm</strong> cho nhóm: <strong>${target}</strong>?`,
    async () => {
      let snap;
      try {
        if (target === 'premium') {
          snap = await db.collection('users').where('isPremium', '==', true).get();
        } else if (target === 'free') {
          snap = await db.collection('users').where('isPremium', '==', false).get();
        } else {
          snap = await db.collection('users').get();
        }
        const batch = db.batch();
        snap.docs.forEach(doc => {
          batch.update(doc.ref, { 
            credits: firebase.firestore.FieldValue.increment(amount),
            creditHistory: firebase.firestore.FieldValue.arrayUnion({
              ts: new Date().toISOString(),
              action: 'bulk_credit',
              amount: amount,
              reason: 'Cộng điểm hàng loạt từ Admin'
            })
          });
        });
        await batch.commit();
        showAdminToast(`✅ Cộng ${amount} điểm cho ${snap.docs.length} users!`, 'success');
        addLog('CREDIT', `Bulk +${amount} điểm cho ${snap.docs.length} users [${target}]`, 'credit');
        closeModal('confirmModal');
      } catch (e) {
        showAdminToast('Lỗi: ' + e.message, 'error');
      }
    }
  );
}

/* Transactions (read from Firestore if you have a transactions collection, else show users) */
async function loadTransactions() {
  const tbody = document.getElementById('transactionsBody');
  if (!tbody || !db) return;
  try {
    const snap = await db.collection('users').get();
    let txs = [];
    snap.docs.forEach(doc => {
      const u = doc.data();
      if (u.creditHistory && Array.isArray(u.creditHistory)) {
        u.creditHistory.forEach(tx => {
          txs.push({
            email: u.email,
            ts: tx.ts || '',
            action: tx.action || 'manual',
            amount: tx.amount || 0,
            reason: tx.reason || ''
          });
        });
      }
    });
    
    // Sort transactions by timestamp desc
    txs.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
    
    const rows = txs.slice(0, 50).map(tx => {
      let dateStr = '—';
      if (tx.ts) {
        try {
          const d = new Date(tx.ts);
          dateStr = `${d.toLocaleDateString('vi')} ${d.toLocaleTimeString('vi', {hour: '2-digit', minute:'2-digit'})}`;
        } catch(e) {}
      }
      const amtColor = tx.amount > 0 ? 'var(--green)' : 'var(--accent)';
      const amtSign = tx.amount > 0 ? '+' : '';
      return `<tr>
        <td style="font-family:var(--font-mono);font-size:.75rem;">${dateStr}</td>
        <td style="font-size:.78rem;">${tx.email}</td>
        <td><span class="badge badge-info">${tx.action}</span></td>
        <td><span style="color:${amtColor};font-weight:700;">${amtSign}${tx.amount}</span></td>
        <td style="color:var(--text-3); font-size:.75rem;">${tx.reason || '—'}</td>
      </tr>`;
    });
    tbody.innerHTML = rows.join('') || '<tr><td colspan="5" class="table-loading">Chưa có giao dịch</td></tr>';
  } catch (e) {
    console.error(e);
    tbody.innerHTML = '<tr><td colspan="5" class="table-loading">Lỗi tải dữ liệu: ' + e.message + '</td></tr>';
  }
}

/* ══════════════ RECIPES PANEL ══════════════ */
async function fetchLiveRecipes() {
  const tbody = document.getElementById('recipesTableBody');
  if (!tbody) return;
  showTableLoading('recipesTableBody', 6);

  try {
    // Fetch a few categories to get variety
    const categories = ['Chicken', 'Beef', 'Seafood', 'Pasta', 'Dessert', 'Vegetarian'];
    const promises = categories.map(cat =>
      fetch(`${MEALDB_BASE}/filter.php?c=${cat}`).then(r => r.json())
    );
    const results = await Promise.all(promises);
    allRecipes = results.flatMap(r => (r.meals || []).slice(0, 5)).map(m => ({
      id: m.idMeal,
      title: m.strMeal,
      image: m.strMealThumb,
      category: categories[results.findIndex(r => r.meals?.some(x => x.idMeal === m.idMeal))] || '—',
    }));

    // Stats
    const catSet = new Set(allRecipes.map(r => r.category));
    document.getElementById('totalRecipesVal').textContent = allRecipes.length;
    document.getElementById('totalFavsVal').textContent    = getTotalFavsCount();
    document.getElementById('totalViewsVal').textContent   = '—';
    document.getElementById('totalCatsVal').textContent    = catSet.size;

    renderRecipesTable(allRecipes);
    addLog('DB', `Loaded ${allRecipes.length} recipes from TheMealDB`, 'info');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Lỗi tải công thức</td></tr>';
    addLog('DB', 'Lỗi tải recipes: ' + e.message, 'error');
  }
}

function getTotalFavsCount() {
  // Sum up all favorites from all users (we don't store this, so approximate)
  return allUsers.reduce((s, u) => s + (u.favorites?.length || 0), 0) || '—';
}

function renderRecipesTable(recipes) {
  const tbody = document.getElementById('recipesTableBody');
  if (!tbody) return;
  tbody.innerHTML = recipes.map(r => `
    <tr>
      <td><img src="${r.image}/preview" alt="" style="width:48px;height:36px;object-fit:cover;border-radius:6px;"></td>
      <td style="font-weight:600;font-size:.82rem;">${r.title}</td>
      <td><span class="badge badge-info" style="font-size:.7rem;">${r.category}</span></td>
      <td style="color:var(--text-3);">—</td>
      <td style="color:var(--text-3);">—</td>
      <td><div class="action-btns">
        <a href="detail.html?id=${r.id}" target="_blank" class="action-btn">Xem</a>
      </div></td>
    </tr>`).join('');
}

function filterRecipes(q) {
  const filtered = allRecipes.filter(r => r.title.toLowerCase().includes(q.toLowerCase()));
  renderRecipesTable(filtered);
}

/* ══════════════ REPORTS PANEL ══════════════ */
function initReports() {
  // Set default date range
  const dateTo = new Date().toISOString().split('T')[0];
  const dateFrom = new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
  const fromEl = document.getElementById('dateFrom');
  const toEl   = document.getElementById('dateTo');
  if (fromEl && !fromEl.value) fromEl.value = dateFrom;
  if (toEl   && !toEl.value)   toEl.value   = dateTo;
}

async function generateReport(type) {
  if (!db) return showAdminToast('Không có kết nối Firebase', 'error');

  showAdminToast('⏳ Đang tạo báo cáo...', 'info');

  try {
    if (type === 'users' || type === 'activity') {
      const snap = await db.collection('users').get();
      const users = snap.docs.map(d => d.data());
      const rows = [
        ['Email', 'Tên', 'Credits', 'Premium', 'Regen gần nhất', 'Spin gần nhất'],
        ...users.map(u => [u.email, u.name||'', u.credits||0, u.isPremium?'Yes':'No', u.lastRegen||'', u.lastSpin||''])
      ];
      downloadCSV(rows, `report_users_${Date.now()}.csv`);
      showAdminToast(`✅ Xuất ${users.length} người dùng`, 'success');
      addLog('ADMIN', `Generated users report: ${users.length} rows`, 'admin');
    }

    if (type === 'credits') {
      const snap = await db.collection('users').get();
      const users = snap.docs.map(d => d.data());
      const rows = [
        ['Email', 'Credits', 'Premium', 'Regen gần nhất'],
        ...users.map(u => [u.email, u.credits||0, u.isPremium?'Yes':'No', u.lastRegen||''])
      ];
      downloadCSV(rows, `report_credits_${Date.now()}.csv`);
      showAdminToast('✅ Báo cáo tín dụng đã xuất', 'success');
    }

    if (type === 'premium') {
      const snap = await db.collection('users').where('isPremium', '==', true).get();
      const users = snap.docs.map(d => d.data());
      const rows = [
        ['Email', 'Tên', 'Premium từ', 'Credits'],
        ...users.map(u => [u.email, u.name||'', u.premiumActivatedAt||'', u.credits||0])
      ];
      downloadCSV(rows, `report_premium_${Date.now()}.csv`);
      showAdminToast(`✅ Xuất ${users.length} premium users`, 'success');
    }
  } catch (e) {
    showAdminToast('Lỗi tạo báo cáo: ' + e.message, 'error');
  }
}

async function exportByDateRange() {
  const from = document.getElementById('dateFrom')?.value;
  const to   = document.getElementById('dateTo')?.value;
  const type = document.getElementById('exportType')?.value || 'users';
  if (!from || !to) return showAdminToast('Chọn khoảng ngày!', 'error');
  await generateReport(type);
}

function exportReport() { generateReport('users'); }

/* ══════════════ SETTINGS ══════════════ */
function setupSettingsTabs() {
  document.querySelectorAll('.stab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.stab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const el = document.getElementById('stab-' + btn.dataset.stab);
      if (el) el.classList.add('active');
    });
  });
}

function saveSettings(section) {
  showAdminToast(`✅ Đã lưu cài đặt: ${section}`, 'success');
  addLog('ADMIN', `Lưu cài đặt section: ${section}`, 'admin');
}

function toggleApiKey(id) {
  const el = document.getElementById(id);
  if (el) el.type = el.type === 'password' ? 'text' : 'password';
}

function clearCache() {
  sessionStorage.clear();
  showAdminToast('✅ Cache đã được xoá', 'success');
  addLog('ADMIN', 'Clear sessionStorage cache', 'admin');
}

function resetRegen() {
  showConfirmModal('Reset Daily Regen', 'Xoá tất cả cache regen trong session hiện tại?', () => {
    const keys = Object.keys(sessionStorage).filter(k => k.startsWith('regen_'));
    keys.forEach(k => sessionStorage.removeItem(k));
    showAdminToast(`✅ Đã reset ${keys.length} regen cache`, 'success');
    addLog('ADMIN', `Reset ${keys.length} regen cache entries`, 'admin');
    closeModal('confirmModal');
  });
}

async function deleteTestData() {
  if (!db) return;
  showConfirmModal(
    '⚠️ Xoá dữ liệu test',
    'Xoá tất cả tài khoản có email chứa <strong>@test.com</strong>?',
    async () => {
      try {
        const snap = await db.collection('users').get();
        const testDocs = snap.docs.filter(d => d.data().email?.includes('@test.com'));
        const batch = db.batch();
        testDocs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        showAdminToast(`✅ Đã xoá ${testDocs.length} tài khoản test`, 'success');
        addLog('ADMIN', `Deleted ${testDocs.length} test accounts`, 'warn');
        closeModal('confirmModal');
        loadUsers();
      } catch (e) {
        showAdminToast('Lỗi: ' + e.message, 'error');
      }
    }
  );
}

function applyColors() {
  const accent = document.getElementById('colorAccent')?.value || '#A63D40';
  const gold   = document.getElementById('colorGold')?.value   || '#E9B872';
  const bg     = document.getElementById('colorBg')?.value     || '#0f1117';
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--gold', gold);
  document.documentElement.style.setProperty('--bg', bg);
  showAdminToast('✅ Đã áp dụng màu mới', 'success');
}

function resetColors() {
  document.documentElement.style.removeProperty('--accent');
  document.documentElement.style.removeProperty('--gold');
  document.documentElement.style.removeProperty('--bg');
  showAdminToast('✅ Đặt lại màu mặc định', 'success');
}

/* ══════════════ LOGS ══════════════ */
const LOG_KEY = 'admin_logs';
const MAX_LOGS = 200;

function addLog(module, msg, type = 'info') {
  const now = new Date().toLocaleTimeString('vi');
  const logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
  logs.push({ ts: now, module, msg, type });
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
  localStorage.setItem(LOG_KEY, JSON.stringify(logs));

  // Live append to terminal if visible
  const term = document.getElementById('logTerminal');
  if (term && document.getElementById('panel-logs')?.classList.contains('active')) {
    const line = document.createElement('div');
    line.className = `log-line log-${type}`;
    line.textContent = `[${now}] [${module}] ${msg}`;
    term.appendChild(line);
    term.scrollTop = term.scrollHeight;
  }
}

function loadLogs() {
  const term = document.getElementById('logTerminal');
  if (!term) return;
  const logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
  const type  = document.getElementById('logTypeFilter')?.value || 'all';
  const search = document.getElementById('logSearch')?.value?.toLowerCase() || '';

  const filtered = logs.filter(l => {
    const typeMatch = type === 'all' || l.type === type || l.module.toLowerCase() === type;
    const searchMatch = !search || l.msg.toLowerCase().includes(search) || l.module.toLowerCase().includes(search);
    return typeMatch && searchMatch;
  });

  term.innerHTML = filtered.length
    ? filtered.map(l => `<div class="log-line log-${l.type}">[${l.ts}] [${l.module}] ${l.msg}</div>`).join('')
    : '<div class="log-line log-info">[SYSTEM] Không có log nào phù hợp</div>';

  term.scrollTop = term.scrollHeight;
}

function filterLogs() { loadLogs(); }

function clearLogs() {
  showConfirmModal('Xoá tất cả log', 'Xoá toàn bộ log hiện tại?', () => {
    localStorage.removeItem(LOG_KEY);
    const term = document.getElementById('logTerminal');
    if (term) term.innerHTML = '<div class="log-line log-info">[SYSTEM] Log đã được xoá</div>';
    closeModal('confirmModal');
    showAdminToast('✅ Đã xoá logs', 'success');
  });
}

function exportLogs() {
  const logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
  const rows = [['Thời gian','Module','Loại','Nội dung'], ...logs.map(l => [l.ts, l.module, l.type, l.msg])];
  downloadCSV(rows, 'admin_logs.csv');
  showAdminToast(`✅ Xuất ${logs.length} log entries`, 'success');
}

/* ══════════════ MODALS ══════════════ */
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

function showConfirmModal(title, desc, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmDesc').innerHTML = desc;
  const btn = document.getElementById('confirmActionBtn');
  btn.onclick = onConfirm;
  openModal('confirmModal');
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(ov => {
  ov.addEventListener('click', e => {
    if (e.target === ov) ov.classList.remove('open');
  });
});

/* ══════════════ ADMIN AUTH ══════════════ */
function adminLogout() {
  addLog('AUTH', 'Admin đăng xuất', 'info');
  // Redirect to main site
  window.location.href = 'index.html';
}

/* ══════════════ TOAST ══════════════ */
function showAdminToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

/* ══════════════ UTILITIES ══════════════ */
function showTableLoading(tbodyId, cols) {
  const el = document.getElementById(tbodyId);
  if (el) el.innerHTML = `<tr><td colspan="${cols}" class="table-loading"><div class="spinner-mini"></div> Đang tải...</td></tr>`;
}

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

function downloadCSV(rows, filename) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* Broadcast modal (đơn giản - chỉ log) */
function broadcastModal() {
  const msg = prompt('Nội dung thông báo đến tất cả users:');
  if (msg) {
    addLog('ADMIN', `Broadcast: ${msg}`, 'admin');
    showAdminToast('📢 Thông báo đã được ghi lại (chưa tích hợp push notification)', 'info');
  }
}

function bulkAddCreditsModal() {
  switchPanel('credits');
  setTimeout(() => document.getElementById('bulkAmount')?.focus(), 300);
}