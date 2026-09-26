const API = "";
let token = localStorage.getItem("sph_token");
let user = JSON.parse(localStorage.getItem("sph_user") || "null");
let authMode = "login";
let ALL_SUBJECTS = [];
let ALL_CLASSES = [];
let currentCourseId = null;
let currentCourse = null;
let editingUserId = null;

let TEAM = [];
let editingTeamId = null;
let pendingTeamPhoto = null;

let chatContacts = [];
let activeChatId = null;
let chatPollTimer = null;
let chatUnreadTimer = null;

let mediaKind = "image";
let mediaPayload = null;
let moduleImageB64 = null;

let notifPollTimer = null;
let captchaVerified = false;
let adminCaptchaVerified = false;
let courseTab = "overview";
let lastCourseView = "courses";

let editingClassId = null;
let eligibleTeachers = [];
let eligibleStudents = [];

let BOT_USERNAME = "";
let SYSTEM_VERSION = "";

let viewedUserId = null;
let viewedUserData = null;
let previousView = "people";

let SPH_KB = [];
let editingQAId = null;

let gradingSubmissionId = null;
let allStudentRegs = [];

let viewAsRole = null;
let maintenanceMode = false;

let loginAttempts = 0;
let loginLockUntil = 0;
let loginLockTimer = null;
let adminLoginAttempts = 0;
let adminLoginLockUntil = 0;
let adminLoginLockTimer = null;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const avatarOf = (u) => u?.avatar || `https://ui-avatars.com/api/?background=16a34a&color=fff&name=${encodeURIComponent(u?.fullName || u?.name || "U")}`;

const sameId = (a, b) => {
  if (a == null || b == null) return false;
  const sa = typeof a === "object" && a._id ? String(a._id) : String(a);
  const sb = typeof b === "object" && b._id ? String(b._id) : String(b);
  return sa === sb;
};
const idOf = (x) => (x && typeof x === "object" && x._id) ? String(x._id) : String(x ?? "");
const jsId = (v) => String(v ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r");

function toast(type, title, msg) {
  const wrap = $("toastWrap");
  const el = document.createElement("div");
  el.className = "toast " + (type || "");
  const icon = type === "danger" ? "fa-circle-exclamation" : type === "warn" ? "fa-triangle-exclamation" : "fa-circle-check";
  el.innerHTML = `<i class="fas ${icon}"></i><div><div class="t-title">${esc(title)}</div><div class="t-msg">${esc(msg)}</div></div><button class="x" onclick="this.parentElement.remove()">✕</button>`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

async function api(endpoint, options = {}) {
  const res = await fetch(API + endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function statusLabel(s) { return { planning: "Planning", in_progress: "In Progress", review: "In Review", completed: "Completed", graded: "Graded", returned: "Returned" }[s] || s; }
function isOverdue(dateStr) { if (!dateStr) return false; return new Date(dateStr) < new Date(new Date().toDateString()); }
function isUrgent(dateStr) { if (!dateStr) return false; const d = new Date(dateStr); const diff = (d - new Date()) / (1000 * 60 * 60 * 24); return diff >= 0 && diff <= 3; }
function deadlineChip(dateStr) {
  if (!dateStr) return "";
  const cls = isOverdue(dateStr) ? "overdue" : isUrgent(dateStr) ? "urgent" : "";
  const label = isOverdue(dateStr) ? "Overdue" : isUrgent(dateStr) ? "Due soon" : "Due";
  return `<span class="deadline-chip ${cls}"><i class="fas fa-calendar"></i> ${label}: ${new Date(dateStr).toLocaleDateString()}</span>`;
}
function maskPhone(p) { const s = String(p || ""); return s.length < 6 ? s : s.slice(0, 4) + "****" + s.slice(-3); }
function maskChatId(id) { const s = String(id || ""); return s.length <= 4 ? "••••" : "••••" + s.slice(-4); }
function calcAge(b) { if (!b) return null; const d = new Date(b); if (isNaN(d.getTime())) return null; const a = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25)); return a > 0 && a < 120 ? a : null; }
function togglePassword(inputId, btn) { const inp = document.getElementById(inputId); if (!inp) return; const isP = inp.type === "password"; inp.type = isP ? "text" : "password"; const icon = btn.querySelector("i"); if (icon) icon.className = isP ? "fas fa-eye-slash" : "fas fa-eye"; }

function startCaptchaVerify() {
  if (captchaVerified) return;
  const box = $("captchaBox");
  if (!box || box.classList.contains("loading")) return;
  box.classList.add("loading");
  const spinner = $("captchaSpinner");
  const tick = $("captchaTick");
  const txt = $("captchaText");
  if (spinner) spinner.style.display = "inline-block";
  if (tick) tick.style.display = "none";
  if (txt) txt.innerText = "Verifying...";
  setTimeout(() => {
    captchaVerified = true;
    box.classList.remove("loading");
    box.classList.add("verified");
    if (spinner) spinner.style.display = "none";
    if (tick) tick.style.display = "inline-block";
    if (txt) txt.innerText = "I'm not a robot";
    const s = $("submitBtn"); if (s) s.disabled = false;
  }, 1400);
}
function resetCaptcha() {
  captchaVerified = false;
  const box = $("captchaBox");
  const spinner = $("captchaSpinner");
  const tick = $("captchaTick");
  const txt = $("captchaText");
  if (box) { box.classList.remove("loading"); box.classList.remove("verified"); }
  if (spinner) spinner.style.display = "none";
  if (tick) tick.style.display = "none";
  if (txt) txt.innerText = "I'm not a robot";
  const s = $("submitBtn"); if (s) s.disabled = true;
}
function startAdminCaptchaVerify() {
  if (adminCaptchaVerified) return;
  const box = $("adminCaptchaBox");
  if (!box || box.classList.contains("loading")) return;
  box.classList.add("loading");
  const spinner = $("adminCaptchaSpinner");
  const tick = $("adminCaptchaTick");
  const txt = $("adminCaptchaText");
  if (spinner) spinner.style.display = "inline-block";
  if (tick) tick.style.display = "none";
  if (txt) txt.innerText = "Verifying...";
  setTimeout(() => {
    adminCaptchaVerified = true;
    box.classList.remove("loading");
    box.classList.add("verified");
    if (spinner) spinner.style.display = "none";
    if (tick) tick.style.display = "inline-block";
    if (txt) txt.innerText = "I'm not a robot";
    const s = $("adminSubmitBtn"); if (s) s.disabled = false;
  }, 1400);
}
function resetAdminCaptcha() {
  adminCaptchaVerified = false;
  const box = $("adminCaptchaBox");
  const spinner = $("adminCaptchaSpinner");
  const tick = $("adminCaptchaTick");
  const txt = $("adminCaptchaText");
  if (box) { box.classList.remove("loading"); box.classList.remove("verified"); }
  if (spinner) spinner.style.display = "none";
  if (tick) tick.style.display = "none";
  if (txt) txt.innerText = "I'm not a robot";
  const s = $("adminSubmitBtn"); if (s) s.disabled = true;
}

function updateAttemptHint() {
  const hint = $("attemptHint");
  const adminHint = $("adminAttemptHint");
  const txt = (attempts, lockUntil) => {
    if (Date.now() < lockUntil) {
      const secs = Math.ceil((lockUntil - Date.now()) / 1000);
      return `Too many attempts. Please wait <b>${secs}s</b> before trying again.`;
    }
    if (attempts > 0) return `Attempts remaining: <b>${Math.max(0, 5 - attempts)}</b> of 5`;
    return "";
  };
  if (hint) hint.innerHTML = txt(loginAttempts, loginLockUntil);
  if (adminHint) adminHint.innerHTML = txt(adminLoginAttempts, adminLoginLockUntil);
}
function startAttemptTimer() {
  if (loginLockTimer) clearInterval(loginLockTimer);
  loginLockTimer = setInterval(() => {
    updateAttemptHint();
    if (Date.now() >= loginLockUntil && loginAttempts > 0 && loginAttempts >= 5) {
      loginAttempts = 0;
      updateAttemptHint();
    }
    if (Date.now() >= loginLockUntil && loginLockUntil !== 0) {
      clearInterval(loginLockTimer);
      loginLockTimer = null;
      updateAttemptHint();
    }
  }, 500);
}
function startAdminAttemptTimer() {
  if (adminLoginLockTimer) clearInterval(adminLoginLockTimer);
  adminLoginLockTimer = setInterval(() => {
    updateAttemptHint();
    if (Date.now() >= adminLoginLockUntil && adminLoginAttempts > 0 && adminLoginAttempts >= 5) {
      adminLoginAttempts = 0;
      updateAttemptHint();
    }
    if (Date.now() >= adminLoginLockUntil && adminLoginLockUntil !== 0) {
      clearInterval(adminLoginLockTimer);
      adminLoginLockTimer = null;
      updateAttemptHint();
    }
  }, 500);
}
function registerFailedLogin(isAdmin = false) {
  if (isAdmin) {
    adminLoginAttempts++;
    if (adminLoginAttempts >= 5) {
      adminLoginLockUntil = Date.now() + 10000;
      startAdminAttemptTimer();
    }
  } else {
    loginAttempts++;
    if (loginAttempts >= 5) {
      loginLockUntil = Date.now() + 10000;
      startAttemptTimer();
    }
  }
  updateAttemptHint();
}
function resetLoginAttempts() {
  loginAttempts = 0;
  loginLockUntil = 0;
  if (loginLockTimer) { clearInterval(loginLockTimer); loginLockTimer = null; }
  updateAttemptHint();
}
function resetAdminLoginAttempts() {
  adminLoginAttempts = 0;
  adminLoginLockUntil = 0;
  if (adminLoginLockTimer) { clearInterval(adminLoginLockTimer); adminLoginLockTimer = null; }
  updateAttemptHint();
}
function isLoginLocked(isAdmin = false) {
  if (isAdmin) return Date.now() < adminLoginLockUntil;
  return Date.now() < loginLockUntil;
}

function showMaintenanceOverlay() {
  const ov = $("maintenanceOverlay");
  if (!ov) return;
  ov.classList.remove("hidden");
  const y = $("maintenanceYear"); if (y) y.innerText = new Date().getFullYear();
}
function hideMaintenanceOverlay() {
  const ov = $("maintenanceOverlay");
  if (ov) ov.classList.add("hidden");
}
function backToLoginFromMaintenance() {
  hideMaintenanceOverlay();
  if (user && user.role !== "admin") {
    localStorage.removeItem("sph_token");
    localStorage.removeItem("sph_user");
    location.reload();
    return;
  }
  if (user && user.role === "admin") return;
  $("app").style.display = "none";
  $("authSection").style.display = "flex";
}
async function loadMaintenanceStatus() {
  try {
    const r = await fetch("/api/maintenance/status");
    if (r.ok) {
      const d = await r.json();
      maintenanceMode = !!d.maintenance;
    }
  } catch {}
  applyMaintenanceGate();
}
function applyMaintenanceGate() {
  const role = user ? (user.role === "admin" ? (viewAsRole || "admin") : user.role) : null;
  const isAdminView = role === "admin";
  if (maintenanceMode && !isAdminView) {
    showMaintenanceOverlay();
  } else {
    hideMaintenanceOverlay();
  }
}
async function toggleMaintenanceMode() {
  if (user?.role !== "admin") return;
  try {
    const target = !maintenanceMode;
    await api("/api/admin/maintenance", { method: "POST", body: JSON.stringify({ maintenance: target }) });
    maintenanceMode = target;
    updateMaintenanceUI();
    applyMaintenanceGate();
    toast("success", target ? "Maintenance ON" : "Maintenance OFF",
      target ? "Students & teachers now see the maintenance screen." : "The app is open to everyone again.");
  } catch (e) { toast("danger", "Error", e.message); }
}
function updateMaintenanceUI() {
  const btn = $("maintenanceToggleBtn");
  const txt = $("maintenanceToggleText");
  const chip = $("maintenanceStatusChip");
  if (!btn) return;
  if (maintenanceMode) {
    btn.style.background = "linear-gradient(135deg, #dc2626, #ef4444)";
    if (txt) txt.innerText = "Disable Maintenance";
    if (chip) { chip.innerText = "Maintenance ON"; chip.className = "chip private"; }
  } else {
    btn.style.background = "";
    if (txt) txt.innerText = "Enable Maintenance";
    if (chip) { chip.innerText = "Maintenance OFF"; chip.className = "chip green"; }
  }
}

function showAdminLogin() { $("userAuthCard").classList.add("hidden"); $("adminAuthCard").classList.remove("hidden"); document.body.classList.add("admin-mode"); resetAdminCaptcha(); resetAdminLoginAttempts(); setTimeout(() => $("adminEmail")?.focus(), 200); }
function showUserLogin() { $("adminAuthCard").classList.add("hidden"); $("userAuthCard").classList.remove("hidden"); document.body.classList.remove("admin-mode"); resetCaptcha(); resetLoginAttempts(); setTimeout(() => $("email")?.focus(), 200); }

function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); localStorage.setItem("sph_theme", t); }
function toggleTheme() { const cur = localStorage.getItem("sph_theme") || "light"; applyTheme(cur === "light" ? "dark" : "light"); }
(function initTheme() { const s = localStorage.getItem("sph_theme"); applyTheme(s || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")); })();

function toggleMode(mode) {
  authMode = mode;
  $("tabLogin").classList.toggle("active", mode === "login");
  $("tabSignup").classList.toggle("active", mode === "signup");
  ["fieldName","fieldRole","fieldCourse","fieldYear","fieldPhone","fieldStudentId"].forEach(id => $(id).classList.toggle("hidden", mode === "login"));
  $("submitBtn").innerText = mode === "login" ? "Login" : "Create Account";
  resetCaptcha();
  onRoleChange();
}
function onRoleChange() {
  const role = $("regRole")?.value;
  if (authMode !== "signup") { $("fieldSubjects").classList.add("hidden"); return; }
  if (role === "teacher") {
    $("fieldSubjects").classList.remove("hidden");
    $("fieldCourse").classList.add("hidden");
    $("fieldYear").classList.add("hidden");
    $("fieldStudentId").classList.add("hidden");
  } else {
    $("fieldSubjects").classList.add("hidden");
    $("fieldCourse").classList.remove("hidden");
    $("fieldYear").classList.remove("hidden");
    $("fieldStudentId").classList.remove("hidden");
  }
}
function renderSubjectCheckboxes(cid, sel = []) { const c = $(cid); if (!c) return; c.innerHTML = ALL_SUBJECTS.map(s => `<label><input type="checkbox" value="${esc(s)}" ${sel.includes(s) ? "checked" : ""}> ${esc(s)}</label>`).join(""); }
function getCheckedSubjects(cid) { const c = $(cid); if (!c) return []; return Array.from(c.querySelectorAll("input:checked")).map(i => i.value); }

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!captchaVerified) return toast("warn", "Captcha required", "Please verify you're not a robot.");
  if (isLoginLocked(false)) {
    const secs = Math.ceil((loginLockUntil - Date.now()) / 1000);
    return toast("warn", "Please wait", `Too many failed attempts. Try again in ${secs}s.`);
  }
  const email = $("email").value.trim().toLowerCase();
  const password = $("pass").value;
  try {
    if (authMode === "signup") {
      const fullName = $("regName").value.trim();
      const role = $("regRole").value;
      const phone = $("regPhone").value.trim();
      const studentId = $("regStudentId")?.value.trim() || "";
      if (!fullName) return toast("warn", "Missing", "Enter your name");
      if (password.length < 6) return toast("warn", "Weak", "Min 6 characters");
      if (phone && !/^\+?[0-9]{10,15}$/.test(phone)) return toast("warn", "Invalid phone", "Use format +639171234567");
      const body = { fullName, email, password, role, phone, studentId };
      if (role === "teacher") {
        body.subjects = getCheckedSubjects("subjectCheckboxes");
        if (!body.subjects.length) return toast("warn", "No subjects", "Select at least one");
      } else {
        if (!studentId) return toast("warn", "Missing Student ID", "Enter the ID given by your admin");
        body.course = $("regCourse").value.trim();
        body.yearLevel = $("regYear").value;
      }
      const data = await api("/api/signup", { method: "POST", body: JSON.stringify(body) });
      token = data.token; user = data.user;
      localStorage.setItem("sph_token", token);
      localStorage.setItem("sph_user", JSON.stringify(user));
      toast("success", "Welcome!", `Hello ${fullName}`);
      resetLoginAttempts();
    } else {
      const data = await api("/api/login", { method: "POST", body: JSON.stringify({ email, password }) });
      if (data.user && data.user.role === "admin") {
        toast("warn", "Admins only", "Please use the Admin button at the top-right.");
        resetCaptcha();
        return;
      }
      if (maintenanceMode) {
        toast("warn", "Under Maintenance", "The site is currently under maintenance. Please try again later.");
        resetCaptcha();
        return;
      }
      token = data.token; user = data.user;
      localStorage.setItem("sph_token", token);
      localStorage.setItem("sph_user", JSON.stringify(user));
      toast("success", "Welcome back!", `Hello ${user.fullName}`);
      resetLoginAttempts();
    }
    initApp();
  } catch (err) {
    if (err.message.toLowerCase().includes("not enrolled")) toast("danger", "Not Enrolled", "Contact the admin to enroll you first.");
    else toast("danger", "Error", err.message);
    registerFailedLogin(false);
    resetCaptcha();
  }
});

$("adminAuthForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!adminCaptchaVerified) return toast("warn", "Captcha required", "Please verify you're not a robot.");
  if (isLoginLocked(true)) {
    const secs = Math.ceil((adminLoginLockUntil - Date.now()) / 1000);
    return toast("warn", "Please wait", `Too many failed attempts. Try again in ${secs}s.`);
  }
  const email = $("adminEmail").value.trim().toLowerCase();
  const password = $("adminPass").value;
  try {
    const data = await api("/api/login", { method: "POST", body: JSON.stringify({ email, password }) });
    if (!data.user || data.user.role !== "admin") {
      toast("danger", "Access denied", "This account is not an administrator.");
      registerFailedLogin(true);
      resetAdminCaptcha();
      return;
    }
    token = data.token; user = data.user;
    viewAsRole = "admin";
    localStorage.setItem("sph_token", token);
    localStorage.setItem("sph_user", JSON.stringify(user));
    toast("success", "Welcome, Admin!", `Hello ${user.fullName}`);
    resetAdminLoginAttempts();
    initApp();
  } catch (err) {
    toast("danger", "Error", err.message);
    registerFailedLogin(true);
    resetAdminCaptcha();
  }
});

function logout() {
  const backdrop = $("logoutBackdrop");
  if (!backdrop) {
    if (!confirm("Log out?")) return;
    return doLogout();
  }
  backdrop.classList.add("show");
  setTimeout(() => backdrop.querySelector(".logout-btn-cancel")?.focus(), 120);
}
function closeLogoutModal() {
  $("logoutBackdrop")?.classList.remove("show");
}
function confirmLogout() {
  const btn = document.querySelector(".logout-btn-confirm");
  if (btn) {
    btn.classList.add("loading");
    const icon = btn.querySelector("i");
    if (icon) icon.className = "fas fa-spinner";
    const textNode = Array.from(btn.childNodes).find(n => n.nodeType === 3 && n.textContent.trim());
    if (textNode) textNode.textContent = " Signing out...";
  }
  setTimeout(doLogout, 500);
}
function doLogout() {
  stopChatPolling();
  if (chatUnreadTimer) clearInterval(chatUnreadTimer);
  if (notifPollTimer) clearInterval(notifPollTimer);
  localStorage.removeItem("sph_token");
  localStorage.removeItem("sph_user");
  location.reload();
}

async function initApp() {
  resetCaptcha();
  resetAdminCaptcha();
  $("authSection").style.display = "none";
  $("app").style.display = "block";
  document.body.classList.remove("admin-mode");

  if (user.role === "admin" && !viewAsRole) viewAsRole = "admin";

  try {
    const s = await api("/api/subjects");
    ALL_SUBJECTS = s.subjects;
    renderSubjectCheckboxes("subjectCheckboxes", []);
    renderSubjectCheckboxes("profSubjects", user.subjects || []);
    renderSubjectCheckboxes("uSubjects", []);
    $("courseSubject").innerHTML = ALL_SUBJECTS.map(s => `<option>${esc(s)}</option>`).join("");
    $("courseSubjectFilter").innerHTML = `<option value="">All subjects</option>` + ALL_SUBJECTS.map(s => `<option>${esc(s)}</option>`).join("");
    $("browseSubject").innerHTML = `<option value="">All subjects</option>` + ALL_SUBJECTS.map(s => `<option>${esc(s)}</option>`).join("");
    try { const c = await api("/api/classes"); ALL_CLASSES = c.classes || []; } catch {}
  } catch {}

  try {
    const cfg = await api("/api/config");
    BOT_USERNAME = cfg.botUsername || "";
    SYSTEM_VERSION = cfg.version || "";
  } catch {}

  await loadMaintenanceStatus();

  hydrateTopBar();
  applyRoleUI();
  showView("dashboard");
  refreshAllBadges();
  if (chatUnreadTimer) clearInterval(chatUnreadTimer);
  chatUnreadTimer = setInterval(refreshAllBadges, 15000);
  if (notifPollTimer) clearInterval(notifPollTimer);
  notifPollTimer = setInterval(loadNotifications, 20000);
  loadNotifications();
  await loadChatbotQA();
  try {
    const me = await api("/api/me");
    if (me.success && me.user) {
      user = { ...user, ...me.user };
      localStorage.setItem("sph_user", JSON.stringify(user));
      hydrateTopBar();
    }
  } catch {}
}

function effectiveRole() {
  if (user.role === "admin") return viewAsRole || "admin";
  return user.role;
}

function applyRoleUI() {
  const role = effectiveRole();
  $("nav-admin").classList.toggle("hidden", role !== "admin");
  const label = role === "student" ? "My Project" : role === "teacher" ? "My Projects" : "All Projects";
  $("navCoursesLabel").innerText = label;
  $("coursesTitle").innerText = label;
  $("newCourseBtn").classList.toggle("hidden", !(role === "teacher" || role === "admin"));
  if ($("newClassBtn")) $("newClassBtn").classList.toggle("hidden", role !== "admin");
  if ($("classesTitle")) $("classesTitle").innerText = role === "admin" ? "All Classes" : role === "teacher" ? "My Classes" : "My Classes";
  $("nav-browse").classList.toggle("hidden", role !== "student");
  $("teacherSubjectsField").classList.toggle("hidden", role !== "teacher");
  $("nav-teacher-courses").classList.toggle("hidden", !(role === "teacher" || role === "admin"));
  if ($("tcSubjectFilter") && ALL_SUBJECTS.length) {
    $("tcSubjectFilter").innerHTML = `<option value="">All subjects</option>` + ALL_SUBJECTS.map(s => `<option>${esc(s)}</option>`).join("");
  }

  const rb = $("roleBadge");
  const rbt = $("roleBadgeText");
  if (rb && rbt) {
    rb.className = "role-" + role;
    rbt.innerText = role.charAt(0).toUpperCase() + role.slice(1);
    let icon = "fa-user";
    if (role === "teacher") icon = "fa-chalkboard-user";
    if (role === "admin") icon = "fa-shield-halved";
    const i = rb.querySelector("i");
    if (i) i.className = "fas " + icon;
  }

  const viewAsWrap = $("viewAsWrap");
  if (viewAsWrap) {
    const isAdmin = user.role === "admin";
    viewAsWrap.classList.toggle("hidden", !isAdmin);
    if (isAdmin) $("viewAsLabel").innerText = `View As: ${role.charAt(0).toUpperCase() + role.slice(1)}`;
  }
}

function toggleViewAsMenu(e) {
  if (e) e.stopPropagation();
  const m = $("viewAsMenu");
  if (m) m.classList.toggle("hidden");
}
document.addEventListener("click", (e) => {
  const m = $("viewAsMenu");
  if (m && !m.classList.contains("hidden") && !e.target.closest("#viewAsWrap")) m.classList.add("hidden");
  const p = $("notifPanel");
  if (p && p.classList.contains("show") && !p.contains(e.target) && !e.target.closest("button")) p.classList.remove("show");
  if (e.target && e.target.id === "logoutBackdrop") closeLogoutModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("logoutBackdrop")?.classList.contains("show")) {
    closeLogoutModal();
  }
});

function setViewAs(role) {
  if (user.role !== "admin") return;
  if (!["admin", "teacher", "student"].includes(role)) return;
  viewAsRole = role;
  $("viewAsMenu").classList.add("hidden");
  applyRoleUI();
  refreshAllBadges();
  applyMaintenanceGate();
  if (role === "admin") showView("admin");
  else if (role === "teacher") showView("teacher-courses");
  else showView("courses");
  toast("", "View As", `Now viewing as ${role}.`);
}

function hydrateTopBar() {
  $("userGreet").innerText = user.fullName;
  $("userEmailSmall").innerText = user.email;
  $("topAvatar").src = avatarOf(user);
  $("userAvatar").src = avatarOf(user);
  if ($("profName")) $("profName").value = user.fullName || "";
  if ($("profBio")) $("profBio").value = user.bio || "";
  if ($("profSchool")) $("profSchool").value = user.school || "";
  if ($("profStudentId")) $("profStudentId").value = user.studentId || "";
  if ($("profCourse")) $("profCourse").value = user.course || "";
  if ($("profYear")) $("profYear").value = user.yearLevel || "";
  if ($("profSection")) $("profSection").value = user.section || "";
  if ($("profBirthday")) $("profBirthday").value = user.birthday || "";
  if ($("profGender")) $("profGender").value = user.gender || "";
  if ($("profAddress")) $("profAddress").value = user.address || "";
  if ($("profContact")) $("profContact").value = user.contactNumber || "";
  if ($("profPhone")) $("profPhone").value = user.phone || "";
  if ($("profGuardianName")) $("profGuardianName").value = user.guardianName || "";
  if ($("profGuardianContact")) $("profGuardianContact").value = user.guardianContact || "";
  if ($("profHobbies")) $("profHobbies").value = (user.hobbies || []).join(", ");
  if ($("profSkills")) $("profSkills").value = (user.skills || []).join(", ");
  if ($("profTelegram")) $("profTelegram").value = user.telegramChatId || "";
  const banner = $("profileBanner");
  if (banner) {
    if (user.banner) { banner.style.backgroundImage = `url(${user.banner})`; banner.style.backgroundSize = "cover"; banner.style.backgroundPosition = "center"; }
    else banner.style.backgroundImage = "";
  }
  updateTelegramStatusBox();
}

const VIEWS = ["dashboard","courses","browse","course","friends","chat","people","profile","user-profile","classes","admin","teacher-courses"];
function showView(v) {
  const role = effectiveRole();
  if (v === "admin" && role !== "admin") v = "dashboard";
  VIEWS.forEach(id => $("view-" + id)?.classList.add("hidden"));
  $("view-" + v)?.classList.remove("hidden");
  document.querySelectorAll(".nav a").forEach(a => a.classList.remove("active"));
  $("nav-" + v)?.classList.add("active");
  if (window.innerWidth <= 820) closeDrawer();
  if (v === "dashboard") loadDashboard();
  if (v === "courses") loadCourses();
  if (v === "browse") loadBrowse();
  if (v === "profile") hydrateTopBar();
  if (v === "friends") { loadFriendRequests(); loadFriends(); }
  if (v === "chat") loadContacts();
  if (v === "classes") loadClasses();
  if (v === "admin") { loadAdminUsers(); loadAdminCourses(); loadAdminClasses(); loadAdminTeam(); loadAdminQA(); updateMaintenanceUI(); loadSystemUpdates(); }
  if (v === "teacher-courses") loadTeacherCourses();
}
function toggleDrawer() { $("sidebar").classList.toggle("open"); $("drawerBackdrop").classList.toggle("show"); }
function closeDrawer() { $("sidebar").classList.remove("open"); $("drawerBackdrop").classList.remove("show"); }
function backFromCourse() { showView(lastCourseView || "courses"); }

async function loadSystemUpdates() {
  const card = $("systemUpdatesCard");
  const list = $("systemUpdatesList");
  const badge = $("systemUpdatesBadge");
  if (!card || !list) return;
  try {
    const data = await api("/api/system-updates");
    const updates = data.updates || [];
    if (badge) {
      if (data.unreadCount > 0) { badge.classList.remove("hidden"); badge.innerText = data.unreadCount > 9 ? "9+" : data.unreadCount; }
      else badge.classList.add("hidden");
    }
    if (!updates.length) {
      list.innerHTML = `<p class="muted" style="font-size:.88rem;">No updates yet.</p>`;
      return;
    }
    list.innerHTML = updates.map(u => `
      <div style="padding:12px; border:1px solid var(--border); border-radius:12px; margin-bottom:10px; ${u.read ? '' : 'background:rgba(22,163,74,.06); border-color:var(--primary);'}">
        <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:center;">
          <div style="font-weight:800;">${esc(u.title)} ${u.read ? '' : '<span class="chip green" style="margin-left:6px; font-size:.65rem;">NEW</span>'}</div>
          <span class="chip" style="font-size:.7rem;">v${esc(u.version)}</span>
        </div>
        <div class="muted" style="font-size:.75rem; margin-top:4px;">${new Date(u.deployedAt).toLocaleString()}</div>
        ${u.body ? `<div style="margin-top:8px; font-size:.88rem; line-height:1.5;">${esc(u.body)}</div>` : ""}
        ${!u.read ? `<button class="btn-ghost" style="margin-top:8px; padding:4px 10px; font-size:.75rem;" onclick="markSystemUpdateRead('${jsId(u._id)}')"><i class="fas fa-check"></i> Mark as read</button>` : ""}
      </div>
    `).join("");
  } catch (e) {
    list.innerHTML = `<p class="muted" style="font-size:.88rem;">Failed to load updates.</p>`;
  }
}

async function markSystemUpdateRead(id) {
  try {
    await api(`/api/system-updates/${id}/read`, { method: "POST" });
    loadSystemUpdates();
  } catch (e) { toast("danger", "Error", e.message); }
}

async function markAllSystemUpdatesRead() {
  try {
    await api("/api/system-updates/read-all", { method: "POST" });
    loadSystemUpdates();
    toast("success", "Marked all read", "");
  } catch (e) { toast("danger", "Error", e.message); }
}

async function loadTeacherCourses() {
  try {
    const q = $("tcSearch").value.trim().toLowerCase();
    const subj = $("tcSubjectFilter").value;
    const data = await api("/api/teacher/my-courses");
    let list = data.courses || [];
    if (q) list = list.filter(p => p.title.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q));
    if (subj) list = list.filter(p => p.subject === subj);
    const grid = $("teacherCoursesGrid");
    if (!list.length) { grid.innerHTML = `<div class="empty"><i class="fas fa-book-open"></i><p>You haven't created any projects yet.</p></div>`; return; }
    renderCourses(grid, list);
  } catch (e) { toast("danger", "Error", e.message); }
}

async function openUserProfile(userId) {
  if (!userId) return;
  if (sameId(userId, user.id) || sameId(userId, user._id)) { showView("profile"); return; }
  const activeNav = document.querySelector(".nav a.active")?.id?.replace("nav-", "");
  if (activeNav && activeNav !== "user-profile") previousView = activeNav;
  viewedUserId = userId; viewedUserData = null;
  $("userProfileContent").innerHTML = `<div class="card" style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:2rem; color:var(--primary);"></i><p class="muted" style="margin-top:12px;">Loading profile...</p></div>`;
  showView("user-profile");
  try { viewedUserData = await api("/api/users/" + userId + "/profile"); renderUserProfile(viewedUserData); }
  catch (e) {
    $("userProfileContent").innerHTML = `<div class="card" style="text-align:center; padding:40px;"><i class="fas fa-circle-exclamation" style="font-size:2rem; color:var(--danger);"></i><p class="muted" style="margin-top:12px;">${esc(e.message || "Failed to load profile")}</p><button class="btn-ghost" style="margin-top:14px;" onclick="backFromUserProfile()">← Back</button></div>`;
  }
}

function renderUserProfile(data) {
  const u = data.user;
  const stats = data.stats || {};
  const courses = data.courses || [];
  const relation = data.relation;
  const isSelf = relation === "self";
  const isFriend = relation === "friend";
  const canChat = isFriend || u.role === "teacher" || user.role === "admin";

  $("userChatBtn").style.display = canChat ? "inline-flex" : "none";
  $("userAddFriendBtn").style.display = (!isFriend && !isSelf && user.role !== "admin") ? "inline-flex" : "none";
  $("userUnfriendBtn").style.display = (isFriend && !isSelf) ? "inline-flex" : "none";

  const chips = [];
  if (u.course) chips.push(`<span class="chip green"><i class="fas fa-book"></i> ${esc(u.course)}</span>`);
  if (u.yearLevel) chips.push(`<span class="chip"><i class="fas fa-graduation-cap"></i> ${esc(u.yearLevel)}</span>`);
  if (u.section) chips.push(`<span class="chip"><i class="fas fa-users"></i> Section ${esc(u.section)}</span>`);
  if (u.gender) chips.push(`<span class="chip"><i class="fas fa-user"></i> ${esc(u.gender)}</span>`);
  if (u.birthday) { const age = calcAge(u.birthday); chips.push(`<span class="chip"><i class="fas fa-birthday-cake"></i> ${age !== null ? age + " years old" : new Date(u.birthday).toLocaleDateString()}</span>`); }

  const hobbyChips = (u.hobbies || []).map(h => `<span class="chip"><i class="fas fa-heart"></i> ${esc(h)}</span>`).join("");
  const skillChips = (u.skills || []).map(s => `<span class="chip green"><i class="fas fa-star"></i> ${esc(s)}</span>`).join("");

  const courseCards = courses.length ? courses.map(p => `
    <div class="course-card" onclick="openCourse('${jsId(p._id)}')">
      <div class="course-cover"><i class="fas fa-graduation-cap"></i><span class="status-badge">${statusLabel(p.status)}</span></div>
      <div class="course-body">
        <div class="course-title">${esc(p.title)}</div>
        <div class="chips" style="margin-top:6px;"><span class="chip green"><i class="fas fa-book"></i> ${esc(p.subject)}</span></div>
      </div>
    </div>`).join("") : `<p class="muted" style="font-size:.85rem;">No projects yet.</p>`;

  const bannerStyle = u.banner ? `background:url(${u.banner}); background-size:cover; background-position:center;` : "";
  const isAdmin = user.role === "admin";

  $("userProfileContent").innerHTML = `
    <div class="profile-banner-wrap" style="margin-bottom:70px;">
      <div class="profile-banner" style="${bannerStyle}"></div>
      <div class="profile-banner-avatar"><img src="${avatarOf(u)}" alt="${esc(u.fullName)}"></div>
    </div>
    <div class="card" style="text-align:center;">
      <h2 style="font-size:1.6rem; margin-bottom:4px;">${esc(u.fullName)}</h2>
      <div style="margin-bottom:8px;">
        <span class="role-badge ${u.role}" style="display:inline-block; padding:2px 10px; border-radius:999px; font-size:.68rem; font-weight:700; text-transform:uppercase; background:rgba(22,163,74,.15); color:var(--primary-dark);">${esc(u.role)}</span>
        ${isSelf ? `<span class="chip green" style="margin-left:6px;"><i class="fas fa-user"></i> You</span>` : ""}
        ${isFriend ? `<span class="chip green" style="margin-left:6px;"><i class="fas fa-user-check"></i> Friends</span>` : ""}
      </div>
      ${u.bio ? `<p style="max-width:600px; margin:10px auto; line-height:1.6;">${esc(u.bio)}</p>` : `<p class="muted">No bio yet</p>`}
      <div class="chips" style="justify-content:center; margin-top:10px;">${chips.join("")}</div>
    </div>
    <div class="kpi-grid" style="max-width:600px; margin:0 auto 14px;">
      <div class="kpi-tile"><i class="fas fa-book"></i><div class="kpi-num">${stats.courses || 0}</div><div class="kpi-lbl">Projects</div></div>
      <div class="kpi-tile"><i class="fas fa-users"></i><div class="kpi-num">${stats.friends || 0}</div><div class="kpi-lbl">Friends</div></div>
    </div>
    ${(u.school || u.studentId || (isAdmin && (u.email || u.phone))) ? `
      <div class="card">
        <h3><i class="fas fa-id-card"></i> Details</h3>
        <div class="chips">
          ${u.school ? `<span class="chip"><i class="fas fa-school"></i> ${esc(u.school)}</span>` : ""}
          ${u.studentId ? `<span class="chip"><i class="fas fa-id-badge"></i> ${esc(u.studentId)}</span>` : ""}
          ${(isAdmin && u.email) ? `<span class="chip"><i class="fas fa-envelope"></i> ${esc(u.email)}</span>` : ""}
          ${(isAdmin && u.phone) ? `<span class="chip"><i class="fas fa-mobile-alt"></i> ${esc(u.phone)}</span>` : ""}
        </div>
      </div>` : ""}
    ${hobbyChips ? `<div class="card"><h3><i class="fas fa-heart"></i> Hobbies</h3><div class="chips">${hobbyChips}</div></div>` : ""}
    ${skillChips ? `<div class="card"><h3><i class="fas fa-star"></i> Skills</h3><div class="chips">${skillChips}</div></div>` : ""}
    <div class="card">
      <h3><i class="fas fa-book"></i> Projects</h3>
      <div class="course-grid" style="margin-top:10px;">${courseCards}</div>
    </div>`;
}
function backFromUserProfile() { showView(previousView || "people"); }
async function chatWithViewedUser() {
  if (!viewedUserId) return;
  try {
    if (!chatContacts.length) await loadContacts();
    if (chatContacts.find(c => sameId(c.id, viewedUserId))) { showView("chat"); setTimeout(() => openChatWith(viewedUserId), 300); }
    else toast("warn", "Can't chat", "You can only chat with friends or your teachers.");
  } catch (e) { toast("danger", "Error", e.message); }
}
async function addFriendViewedUser() {
  if (!viewedUserId) return;
  try { await api("/api/friends/request-by-id", { method: "POST", body: JSON.stringify({ userId: viewedUserId }) }); toast("success", "Sent", "Friend request sent."); $("userAddFriendBtn").classList.add("hidden"); }
  catch (e) { toast("danger", "Error", e.message); }
}
async function unfriendViewedUser() {
  if (!viewedUserId) return;
  if (!confirm("Unfriend this user?")) return;
  try { await api("/api/friends/unfriend", { method: "POST", body: JSON.stringify({ id: viewedUserId }) }); toast("", "Removed", ""); openUserProfile(viewedUserId); }
  catch (e) { toast("danger", "Error", e.message); }
}

function updateTelegramStatusBox() {
  const box = $("tgStatusBox"); const hint = $("tgHint"); const unlinkBtn = $("unlinkTgBtn");
  if (!box) return;
  if (user?.telegramChatId) {
    box.innerHTML = `<div style="display:flex; align-items:center; gap:10px; padding:10px 14px; background:rgba(34,197,94,.12); border-radius:12px; border:1px solid rgba(34,197,94,.35);"><i class="fas fa-circle-check" style="color:var(--success); font-size:1.3rem;"></i><div style="flex:1;"><div style="font-weight:800; color:var(--success);">Telegram Linked</div><div class="muted" style="font-size:.8rem;">Chat ID: ${esc(maskChatId(user.telegramChatId))}</div></div></div>`;
    if (hint) hint.style.display = "none";
    if (unlinkBtn) unlinkBtn.style.display = "inline-flex";
  } else {
    box.innerHTML = `<div style="display:flex; align-items:center; gap:10px; padding:10px 14px; background:rgba(245,158,11,.12); border-radius:12px; border:1px solid rgba(245,158,11,.35);"><i class="fas fa-triangle-exclamation" style="color:var(--warn); font-size:1.3rem;"></i><div style="flex:1;"><div style="font-weight:800; color:var(--warn);">Not Linked Yet</div><div class="muted" style="font-size:.8rem;">You won't be able to reset your password</div></div></div>`;
    if (hint) { hint.style.display = "block"; hint.innerHTML = `<b>Quick setup:</b><br>1. In Telegram, message <b>@userinfobot</b> to get your Chat ID<br>2. Search <b>@${BOT_USERNAME || "StudentProjectHubBot"}</b> and press START<br>3. Paste your Chat ID below → Save`; }
    if (unlinkBtn) unlinkBtn.style.display = "none";
  }
}
async function testTelegramLink() {
  const chatId = ($("profTelegram")?.value || user?.telegramChatId || "").trim();
  if (!chatId) return toast("warn", "Missing", "Save your Chat ID first");
  const status = $("telegramStatus");
  status.innerHTML = `<p class="muted" style="font-size:.85rem;"><i class="fas fa-spinner fa-spin"></i> Sending...</p>`;
  try {
    const data = await api("/api/me/test-telegram", { method: "POST", body: JSON.stringify({ chatId }) });
    if (data.success) { status.innerHTML = `<p style="color:var(--success); font-size:.88rem;"><i class="fas fa-circle-check"></i> Test sent!</p>`; toast("success", "Test Sent!", "Check your Telegram."); }
    else status.innerHTML = `<p style="color:var(--danger); font-size:.88rem;">${esc(data.error)}</p>`;
  } catch (e) { status.innerHTML = `<p style="color:var(--danger); font-size:.88rem;">${esc(e.message)}</p>`; }
}
async function unlinkTelegram() {
  if (!confirm("Unlink Telegram?")) return;
  try { await api("/api/me/telegram", { method: "DELETE" }); user.telegramChatId = ""; localStorage.setItem("sph_user", JSON.stringify(user)); hydrateTopBar(); toast("success", "Unlinked", ""); }
  catch (e) { toast("danger", "Error", e.message); }
}

function showForgotPassword() {
  ["forgotStep1", "forgotStep2"].forEach((id, i) => {
    const el = $(id);
    if (el) el.style.display = i === 0 ? "block" : "none";
  });
  ["forgotEmail", "forgotPhone", "forgotOtp", "forgotNewPass"].forEach(id => {
    const el = $(id);
    if (el) el.value = "";
  });
  $("forgotBackdrop").style.display = "flex";
}
function closeForgotPassword() { $("forgotBackdrop").style.display = "none"; }
function showForgotStep1() { $("forgotStep1").style.display = "block"; $("forgotStep2").style.display = "none"; }
async function requestTelegramReset() {
  const email = $("forgotEmail").value.trim().toLowerCase();
  const phone = $("forgotPhone").value.trim();
  if (!email || !phone) return toast("warn", "Missing", "Enter email and phone");
  try {
    await api("/api/forgot/telegram/request", { method: "POST", body: JSON.stringify({ email, phone }) });
    toast("success", "Sent!", "Check Telegram.");
    $("forgotStep1").style.display = "none";
    $("forgotStep2").style.display = "block";
  } catch (e) { toast("danger", "Error", e.message); }
}
async function submitTelegramReset() {
  const email = $("forgotEmail").value.trim().toLowerCase();
  const otp = $("forgotOtp").value.trim();
  const newPassword = $("forgotNewPass").value;
  if (!otp || otp.length !== 6) return toast("warn", "Invalid", "6-digit code");
  if (!newPassword || newPassword.length < 6) return toast("warn", "Weak", "Min 6 chars");
  try {
    await api("/api/forgot/telegram/verify", { method: "POST", body: JSON.stringify({ email, otp }) });
    await api("/api/forgot/telegram/reset", { method: "POST", body: JSON.stringify({ email, otp, newPassword }) });
    toast("success", "Password reset!", "Login now.");
    closeForgotPassword();
  } catch (e) { toast("danger", "Error", e.message); }
}

function toggleNotifications(e) { if (e) e.stopPropagation(); const p = $("notifPanel"); p.classList.toggle("show"); if (p.classList.contains("show")) loadNotifications(); }

async function loadNotifications() {
  try {
    const data = await api("/api/notifications");
    const c = $("notifList");
    if (!data.notifications.length) { c.innerHTML = `<p class="muted" style="text-align:center; padding:20px; font-size:.85rem;">No notifications</p>`; return; }
    c.innerHTML = data.notifications.map(n => `<div class="notif-item ${n.read ? '' : 'unread'}" onclick="handleNotifClick('${jsId(n._id)}','${jsId(n.link || '')}')"><div class="n-text">${esc(n.text)}</div><div class="n-time">${new Date(n.createdAt).toLocaleString()}</div></div>`).join("");
  } catch {}
}
async function handleNotifClick(id, link) {
  try { await api("/api/notifications/read-all", { method: "POST" }); } catch {}
  $("notifPanel").classList.remove("show");
  refreshNotifBadge();
  if (link && link.startsWith("/course/")) openCourse(link.split("/").pop());
  else if (link && link.startsWith("/classes/")) showView("classes");
}
async function markAllNotifRead() { try { await api("/api/notifications/read-all", { method: "POST" }); loadNotifications(); refreshNotifBadge(); } catch {} }
async function refreshNotifBadge() {
  try {
    const data = await api("/api/notifications/unread/count");
    const b = $("notifBadge"); if (!b) return;
    if (data.count > 0) { b.classList.remove("hidden"); b.innerText = data.count > 9 ? "9+" : data.count; }
    else b.classList.add("hidden");
  } catch {}
}
async function refreshAllBadges() { refreshNotifBadge(); refreshChatBadge(); refreshFriendBadge(); }

async function loadDashboard() {
  const role = effectiveRole();

  ["studentDashboard","teacherDashboard","adminDashboard"].forEach(id => {
    const el = $(id); if (el) el.classList.add("hidden");
  });

  const existing = $("tgPromptBanner"); if (existing) existing.remove();
  if (user && !user.telegramChatId && role !== "admin") {
    const wrap = document.querySelector("#view-dashboard");
    if (wrap) {
      const banner = document.createElement("div");
      banner.id = "tgPromptBanner";
      banner.className = "card";
      banner.style.cssText = "background:linear-gradient(135deg, rgba(34,158,217,.12), rgba(22,163,74,.08)); border:2px dashed #229ED9; margin-bottom:14px;";
      banner.innerHTML = `<div style="display:flex; gap:14px; align-items:flex-start; flex-wrap:wrap;"><div style="font-size:2.4rem; color:#229ED9;"><i class="fab fa-telegram"></i></div><div style="flex:1; min-width:220px;"><h3 style="margin:0 0 6px 0;"><i class="fas fa-shield-halved"></i> Link your Telegram for password recovery</h3><p class="muted" style="font-size:.88rem; line-height:1.5; margin:0 0 10px 0;">If you forget your password, we'll send a 6-digit code to Telegram.</p><div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn-inline" onclick="goToTelegramSetup()"><i class="fas fa-link"></i> Link Now</button><button class="btn-ghost" onclick="document.getElementById('tgPromptBanner').remove()">Later</button></div></div></div>`;
      wrap.insertBefore(banner, wrap.firstChild);
    }
  }

  try {
    const data = await api("/api/dashboard");
    const s = data.stats;

    if (role === "student") {
      const el = $("studentDashboard"); if (el) el.classList.remove("hidden");
      const heroName = $("studentHeroName"); if (heroName) heroName.innerText = user.fullName?.split(" ")[0] || "Student";
      $("kpiGridStudent").innerHTML = `${tile("fa-book", s.courses, "My Projects")}${tile("fa-compass", s.openCourses, "Open to Join")}`;
      if (data.openCourses && data.openCourses.length > 0) {
        $("openCoursesCardStudent").classList.remove("hidden");
        $("openCoursesListStudent").innerHTML = data.openCourses.map(p => `<div class="course-card" onclick="openCourse('${jsId(p._id)}')"><div class="course-cover"><i class="fas fa-compass"></i><span class="status-badge">Open</span></div><div class="course-body"><div class="course-title">${esc(p.title)}</div><div class="chips" style="margin-top:6px;"><span class="chip green"><i class="fas fa-book"></i> ${esc(p.subject)}</span><span class="chip"><i class="fas fa-chalkboard-user"></i> ${esc(p.owner.fullName)}</span></div></div></div>`).join("");
      } else $("openCoursesCardStudent").classList.add("hidden");
      renderCourses($("dashCoursesStudent"), data.recentCourses || []);
      const regsCard = $("studentRegsCard"); if (regsCard) regsCard.classList.add("hidden");
    } else if (role === "teacher") {
      const el = $("teacherDashboard"); if (el) el.classList.remove("hidden");
      $("kpiGridTeacher").innerHTML = `${tile("fa-book", s.subjects, "Subjects")}${tile("fa-chalkboard", s.classes, "Classes")}${tile("fa-users", s.totalStudents, "Students")}${tile("fa-inbox", s.applications, "Applications")}`;
      renderCourses($("dashCoursesTeacher"), data.recentCourses || []);
      loadStudentRegistrations();
    } else {
      const el = $("adminDashboard"); if (el) el.classList.remove("hidden");
      $("kpiGridAdmin").innerHTML = `${tile("fa-users", s.users, "Total Users")}${tile("fa-user-graduate", s.students, "Students")}${tile("fa-chalkboard-user", s.teachers, "Teachers")}${tile("fa-book", s.courses, "Projects")}`;
      renderCourses($("dashCoursesAdmin"), data.recentCourses || []);
      loadStudentRegistrations();
    }
    loadAnnouncementFeed();
  } catch (e) { toast("danger", "Error", e.message); }
}
function tile(icon, num, label) { return `<div class="kpi-tile"><i class="fas ${icon}"></i><div class="kpi-num">${esc(num)}</div><div class="kpi-lbl">${esc(label)}</div></div>`; }
function goToTelegramSetup() {
  showView("profile");
  setTimeout(() => { const el = document.getElementById("profTelegram"); if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); el.style.boxShadow = "0 0 0 4px rgba(34,158,217,.4)"; setTimeout(() => el.style.boxShadow = "", 2000); } }, 400);
}

async function loadStudentRegistrations() {
  const card = $("studentRegsCard"); if (!card) return;
  if (user.role !== "teacher" && user.role !== "admin") { card.classList.add("hidden"); return; }
  card.classList.remove("hidden");
  try {
    const data = await api("/api/admin/student-registrations");
    allStudentRegs = data.students || [];
    $("studentRegsCount").innerText = allStudentRegs.length;
    renderStudentRegs(allStudentRegs);
  } catch { $("studentRegsBody").innerHTML = `<tr><td colspan="6" class="muted" style="padding:20px; text-align:center;">Failed to load.</td></tr>`; }
}
function renderStudentRegs(list) {
  const body = $("studentRegsBody"); const empty = $("studentRegsEmpty");
  if (!body) return;
  if (!list.length) { body.innerHTML = ""; if (empty) empty.classList.remove("hidden"); return; }
  if (empty) empty.classList.add("hidden");
  const isAdmin = user.role === "admin";
  body.innerHTML = list.map(s => {
    const enrollDateStr = new Date(s.enrolledAt).toISOString().split('T')[0];
    return `<tr>
      <td style="font-family:monospace; font-weight:700; cursor:pointer;" onclick="openUserProfile('${jsId(s._id)}')">${esc(s.studentId)}</td>
      <td style="cursor:pointer;" onclick="openUserProfile('${jsId(s._id)}')">
        <div style="display:flex; align-items:center; gap:8px;">
          <img src="${avatarOf(s)}" style="width:30px; height:30px; border-radius:50%; object-fit:cover;">
          <span style="font-weight:600;">${esc(s.fullName)}</span>
        </div>
      </td>
      <td>${esc(s.course)}${s.yearLevel ? `<br><span class="muted" style="font-size:.75rem;">${esc(s.yearLevel)}${s.section ? " - " + esc(s.section) : ""}</span>` : ""}</td>
      <td>
        ${isAdmin
          ? `<div style="display:flex; gap:6px; align-items:center;">
               <input type="date" id="enrollDate-${jsId(s._id)}" value="${enrollDateStr}" style="padding:4px 8px; border-radius:8px; border:1px solid var(--border); background:var(--card); color:var(--text); font-size:.82rem;">
               <button class="iconbtn" style="padding:4px 8px; font-size:.75rem;" onclick="event.stopPropagation(); saveEnrollDate('${jsId(s._id)}')" title="Save">
                 <i class="fas fa-check"></i>
               </button>
             </div>`
          : new Date(s.enrolledAt).toLocaleDateString()}
      </td>
      <td><span class="chip green"><i class="fas fa-clock"></i> ${esc(s.duration)}</span></td>
      <td>${s.isEnrolled
        ? `<span class="chip green"><i class="fas fa-circle-check"></i> Registered</span>`
        : `<span class="chip warn"><i class="fas fa-hourglass-half"></i> Pending</span>`}</td>
    </tr>`;
  }).join("");
}
async function saveEnrollDate(userId) {
  const inp = $("enrollDate-" + userId);
  if (!inp) return;
  const newDate = inp.value;
  if (!newDate) return toast("warn", "Missing", "Pick a date");
  try {
    await api("/api/admin/users/" + userId, { method: "PUT", body: JSON.stringify({ enrolledAt: newDate }) });
    toast("success", "Updated", "Enrolled date saved.");
    loadStudentRegistrations();
  } catch (e) { toast("danger", "Error", e.message); }
}
function filterStudentRegs() {
  const q = $("studentRegsSearch").value.trim().toLowerCase();
  if (!q) return renderStudentRegs(allStudentRegs);
  renderStudentRegs(allStudentRegs.filter(s => s.fullName.toLowerCase().includes(q) || (s.studentId || "").toLowerCase().includes(q) || (s.course || "").toLowerCase().includes(q)));
}

async function loadCourses() {
  try {
    const q = $("courseSearch").value.trim().toLowerCase();
    const subj = $("courseSubjectFilter").value;
    const data = await api("/api/courses");
    let list = data.courses;
    if (q) list = list.filter(p => p.title.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q));
    if (subj) list = list.filter(p => p.subject === subj);
    renderCourses($("coursesGrid"), list);
  } catch (e) { toast("danger", "Error", e.message); }
}
async function loadBrowse() {
  try {
    const q = $("browseSearch").value.trim().toLowerCase();
    const subj = $("browseSubject").value;
    const data = await api("/api/courses");
    let list = data.courses.filter(p => p.isOpen && !(p.members || []).some(m => sameId(m, user.id)));
    if (q) list = list.filter(p => p.title.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q));
    if (subj) list = list.filter(p => p.subject === subj);
    renderCourses($("browseGrid"), list, true);
  } catch (e) { toast("danger", "Error", e.message); }
}
function renderCourses(container, courses, isBrowse = false) {
  if (!container) return;
  if (!courses.length) {
    const msg = isBrowse ? "No open projects right now." : effectiveRole() === "student" ? "No projects yet." : "No projects yet. Click New Project.";
    container.innerHTML = `<div class="empty"><i class="fas fa-book-open"></i><p>${msg}</p></div>`;
    return;
  }
  const role = effectiveRole();
  container.innerHTML = courses.map(p => {
    const teacher = p.owner || {};
    const memberCount = (p.members || []).length;
    const isMember = (p.members || []).some(m => sameId(m, user.id));
    const pending = (p.pendingMembers || []).some(pm => sameId(pm.user, user.id) && pm.status === "pending");
    return `<div class="course-card" onclick="openCourse('${jsId(p._id)}')">
      <div class="course-cover"><i class="fas fa-graduation-cap"></i><span class="status-badge">${p.isOpen && !isMember ? "Open" : statusLabel(p.status)}</span></div>
      <div class="course-body">
        <div class="course-title">${esc(p.title)}</div>
        <div class="course-desc">${esc(p.description || "No description")}</div>
        <div class="chips">
          <span class="chip green"><i class="fas fa-book"></i> ${esc(p.subject)}</span>
          <span class="chip"><i class="fas fa-users"></i> ${memberCount}</span>
          ${p.deadline ? deadlineChip(p.deadline) : ""}
          ${role !== "student" ? `<span class="chip"><i class="fas fa-chalkboard-user"></i> ${esc(teacher.fullName || "Teacher")}</span>` : ""}
          ${pending ? `<span class="chip warn"><i class="fas fa-hourglass-half"></i> Pending</span>` : ""}
        </div>
      </div>
    </div>`;
  }).join("");
}

async function openCourse(id) {
  try {
    currentCourseId = id;
    const data = await api("/api/courses/" + id);
    currentCourse = data.course;
    currentCourse._relation = data.relation;
    if ((user.role === "teacher" || user.role === "admin") && id) {
      try {
        const p = await api(`/api/courses/${id}/member-progress`);
        currentCourse._progressMap = {};
        (p.progress || []).forEach(item => { currentCourse._progressMap[String(item._id)] = item; });
      } catch { currentCourse._progressMap = {}; }
    } else currentCourse._progressMap = {};
    renderCourseDetail(data);
    const activeNav = document.querySelector(".nav a.active")?.id?.replace("nav-", "");
    if (["courses", "browse", "dashboard", "teacher-courses"].includes(activeNav)) lastCourseView = activeNav;
    showView("course");
    if (courseTab === 'chat' && data.relation !== 'applicant') loadCourseChat();
  } catch (e) { toast("danger", "Error", e.message); }
}
function switchCourseTab(tab) { courseTab = tab; openCourse(currentCourseId); }

function renderDeadlineBanner(course) {
  if (!course.deadline) return "";
  const deadlineEnd = new Date(course.deadline); deadlineEnd.setHours(23, 59, 59, 999);
  const diffMs = deadlineEnd.getTime() - Date.now();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const role = effectiveRole();
  if (role !== "student") {
    if (diffMs < 0) return `<div class="deadline-banner">⏰ Deadline passed (${new Date(course.deadline).toLocaleDateString()})</div>`;
    if (diffDays <= 3) return `<div class="deadline-banner warning">⏰ Deadline in ${diffDays} day${diffDays === 1 ? "" : "s"}</div>`;
    return "";
  }
  if (diffMs < 0) return `<div class="deadline-banner">⏰ Deadline passed on ${new Date(course.deadline).toLocaleDateString()} — submissions closed</div>`;
  if (diffDays <= 3) return `<div class="deadline-banner warning">⏰ Due in ${diffDays} day${diffDays === 1 ? "" : "s"}</div>`;
  return "";
}

function renderCourseDetail({ course, submissions, comments, relation }) {
  course._submissions = submissions; course._comments = comments; course._relation = relation;
  const isOwner = relation === "owner";
  const isMember = relation === "member";
  const isTeacher = relation === "teacher";
  const isAdmin = relation === "admin";
  const isApplicant = relation === "applicant";
  const canManage = isOwner || isAdmin;
  const canUpload = isOwner || isMember || isAdmin;
  const canChat = !isApplicant;
  const canGrade = isOwner || isTeacher || isAdmin;
  $("inviteBtn").style.display = canManage ? "inline-flex" : "none";
  $("editCourseBtn").style.display = canManage ? "inline-flex" : "none";
  const pendingApplicants = (course.pendingMembers || []).filter(pm => pm.status === "pending");
  $("courseDetail").innerHTML = `
    <div class="card" style="background:linear-gradient(135deg, var(--primary), var(--primary2)); color:white;">
      <h1 style="font-size:1.6rem; margin-bottom:6px;">${esc(course.title)}</h1>
      <div class="chips">
        <span class="chip" style="background:rgba(255,255,255,.25); color:white;"><i class="fas fa-book"></i> ${esc(course.subject)}</span>
        <span class="chip" style="background:rgba(255,255,255,.25); color:white;"><i class="fas fa-circle-notch"></i> ${statusLabel(course.status)}</span>
        ${course.isOpen ? `<span class="chip" style="background:rgba(255,255,255,.25); color:white;"><i class="fas fa-door-open"></i> Open</span>` : ""}
        ${course.deadline ? `<span class="chip" style="background:rgba(255,255,255,.25); color:white;"><i class="fas fa-calendar"></i> ${new Date(course.deadline).toLocaleDateString()}</span>` : ""}
      </div>
    </div>
    ${course.moduleTitle || course.moduleImage ? `<div class="module-card"><h3><i class="fas fa-book-open" style="color:var(--primary);"></i> Module: ${esc(course.moduleTitle || course.title)}</h3>${course.moduleImage ? `<img src="${course.moduleImage}" alt="Module" onclick="openLightbox('${jsId(course.moduleImage)}','image')" style="cursor:zoom-in;">` : ""}</div>` : ""}
    ${renderDeadlineBanner(course)}
    ${isApplicant ? `<div class="card" style="text-align:center; border:2px dashed var(--primary);"><i class="fas fa-door-open" style="font-size:2rem; color:var(--primary); margin-bottom:8px;"></i><h3>Want to join this project?</h3><p class="muted" style="margin:8px 0 14px;">Send an application to the teacher.</p><button class="btn-inline" onclick="openApplyModal()"><i class="fas fa-paper-plane"></i> Apply to Join</button></div>` : ""}
    ${isMember || canManage ? `
      <div class="course-tabs">
        <button class="course-tab ${courseTab === 'overview' ? 'active' : ''}" onclick="switchCourseTab('overview')"><i class="fas fa-circle-info"></i> Overview</button>
        <button class="course-tab ${courseTab === 'team' ? 'active' : ''}" onclick="switchCourseTab('team')"><i class="fas fa-users"></i> Members <span class="chip">${(course.members || []).length}</span>${canManage && pendingApplicants.length ? `<span class="nav-badge" style="margin-left:4px;">${pendingApplicants.length}</span>` : ""}</button>
        <button class="course-tab ${courseTab === 'chat' ? 'active' : ''}" onclick="switchCourseTab('chat')"><i class="fas fa-comments"></i> Chat</button>
        <button class="course-tab ${courseTab === 'files' ? 'active' : ''}" onclick="switchCourseTab('files')"><i class="fas fa-paperclip"></i> Files <span class="chip">${submissions.length}</span></button>
      </div>
      ${courseTab === 'overview' ? renderOverview(course, comments, canManage) : ""}
      ${courseTab === 'team' ? renderTeamTab(course, canManage, canGrade) : ""}
      ${courseTab === 'chat' && canChat ? renderCourseChat() : (courseTab === 'chat' ? '<div class="card"><p class="muted">Chat is only for members.</p></div>' : "")}
      ${courseTab === 'files' ? renderFilesTab(submissions, canUpload, canGrade) : ""}
    ` : `<div class="card"><h3><i class="fas fa-align-left"></i> Description</h3><p style="line-height:1.6;">${esc(course.description || "No description.")}</p></div>`}
  `;
}

function renderOverview(course, comments, canManage) {
  return `
    <div class="card">
      <h3><i class="fas fa-align-left"></i> Description</h3>
      <p style="line-height:1.6;">${esc(course.description || "No description.")}</p>
      <div class="chips" style="margin-top:10px;">
        <span class="chip green"><i class="fas fa-chalkboard-user"></i> Teacher: ${esc(course.owner.fullName)}</span>
        <span class="chip"><i class="fas fa-users"></i> ${(course.members || []).length} member(s)</span>
      </div>
    </div>
    <div class="card">
      <h3><i class="fas fa-comments"></i> Discussion</h3>
      <div style="margin-top:10px;">
        ${comments.length ? comments.map(c => {
          const canDeleteComment = sameId(c.user, user.id) || user.role === "admin";
          return `<div class="comment-item"><img src="${avatarOf(c.user)}"><div class="comment-body"><div class="comment-name">${esc(c.user.fullName)}${c.user.role === "teacher" ? `<span class="role-tag teacher">Teacher</span>` : ""}</div><div class="comment-text">${esc(c.text)}</div><div class="comment-time">${new Date(c.createdAt).toLocaleString()}</div></div>${canDeleteComment ? `<button class="iconbtn no-print" onclick="deleteComment('${jsId(c._id)}')"><i class="fas fa-trash"></i></button>` : ""}</div>`;
        }).join("") : `<p class="muted">No comments yet.</p>`}
      </div>
      <div class="no-print" style="display:flex; gap:8px; margin-top:12px;">
        <input id="commentInput" class="input" placeholder="Write a comment..." onkeydown="if(event.key==='Enter')addComment()">
        <button class="btn-inline" onclick="addComment()"><i class="fas fa-paper-plane"></i></button>
      </div>
    </div>
    ${canManage ? `<div class="card no-print" style="text-align:center;"><button class="btn-ghost" style="color:var(--danger);" onclick="deleteCourse()"><i class="fas fa-trash"></i> Delete Project</button></div>` : ""}
  `;
}

function renderTeamTab(course, canManage, canGrade) {
  const pending = (course.pendingMembers || []).filter(p => p.status === "pending");
  const role = effectiveRole();
  const canSeeProgress = role === "teacher" || role === "admin";
  const progressMap = course._progressMap || {};
  const totalSubmitted = Object.values(progressMap).filter(p => p.hasSubmitted).length;
  const totalMembers = (course.members || []).length;
  return `
    <div class="card">
      <h3><i class="fas fa-users"></i> Members <span class="chip">${totalMembers}</span>${canSeeProgress ? `<span class="chip green" style="margin-left:8px;"><i class="fas fa-chart-simple"></i> ${totalSubmitted}/${totalMembers} submitted</span>` : ""}</h3>
      <div class="team-roster">
        ${totalMembers === 0 ? `<p class="muted" style="grid-column:1/-1; text-align:center;">No members yet.</p>`
          : (course.members || []).map(m => {
            const prog = progressMap[String(m._id)];
            return `<div class="roster-card" style="${prog?.hasSubmitted ? 'border-color: var(--primary); border-width: 2px;' : ''}">
              <img src="${avatarOf(m)}" style="cursor:pointer;" onclick="openUserProfile('${jsId(m._id)}')">
              <div class="rname" style="cursor:pointer;" onclick="openUserProfile('${jsId(m._id)}')">${esc(m.fullName || "Member")}</div>
              <div class="remail">${esc(m.course || "")} ${m.yearLevel ? "• " + esc(m.yearLevel) : ""}</div>
              ${canSeeProgress && prog ? `<div style="margin-top:8px; display:flex; flex-direction:column; gap:4px; align-items:center;">${prog.hasSubmitted ? `<span class="chip green"><i class="fas fa-circle-check"></i> Submitted (${prog.submissionsCount})</span>` : `<span class="chip warn"><i class="fas fa-hourglass-half"></i> Not yet submitted</span>`}${prog.latestGrade !== null && prog.latestGrade !== undefined ? `<span class="chip green"><i class="fas fa-star"></i> ${prog.latestGrade}/100</span>` : ""}${prog.latestSubmissionAt ? `<span class="muted" style="font-size:.7rem;">Last: ${new Date(prog.latestSubmissionAt).toLocaleDateString()}</span>` : ""}</div>` : ""}
              ${canManage ? `<button class="btn-ghost" style="margin-top:8px; padding:4px 10px; font-size:.72rem; color:var(--danger);" onclick="removeMember('${jsId(m._id)}')"><i class="fas fa-user-minus"></i> Remove</button>` : ""}
            </div>`;
          }).join("")}
      </div>
    </div>
    ${canManage && pending.length ? `<div class="card"><h3><i class="fas fa-inbox"></i> Pending Applications <span class="chip warn">${pending.length}</span></h3>${pending.map(p => `<div style="display:flex; gap:12px; align-items:center; padding:10px; border-bottom:1px solid var(--border);"><img src="${avatarOf(p.user)}" style="width:42px; height:42px; border-radius:50%; object-fit:cover; cursor:pointer;" onclick="openUserProfile('${jsId(p.user._id)}')"><div style="flex:1; cursor:pointer;" onclick="openUserProfile('${jsId(p.user._id)}')"><div style="font-weight:700;">${esc(p.user.fullName || "")}</div><div class="muted" style="font-size:.8rem;">${esc(p.user.course || "")}</div></div><button class="btn-inline" onclick="acceptApplicant('${jsId(p.user._id)}')"><i class="fas fa-check"></i></button><button class="btn-ghost" onclick="rejectApplicant('${jsId(p.user._id)}')"><i class="fas fa-xmark"></i></button></div>`).join("")}</div>` : ""}
    ${canManage ? `<div class="card" style="text-align:center;"><button class="btn-inline" onclick="openInviteModal()"><i class="fas fa-user-plus"></i> Invite a Student</button></div>` : ""}
  `;
}

function renderCourseChat() {
  return `<div class="card"><h3><i class="fas fa-comments"></i> Project Chat</h3><div class="course-chat-box" id="courseChatBox"><p class="muted" style="text-align:center; margin:auto;">Loading...</p></div><div style="display:flex; gap:8px;"><button class="btn-ghost no-print" title="Send photo" onclick="triggerCourseChatImage()"><i class="fas fa-image"></i></button><input type="file" id="courseChatImageInput" class="hidden" accept="image/*" onchange="handleCourseChatImage(event)"><input id="courseChatInput" class="input" placeholder="Message the group..." onkeydown="if(event.key==='Enter')sendCourseChat()"><button class="btn-inline" onclick="sendCourseChat()"><i class="fas fa-paper-plane"></i></button></div></div>`;
}

function renderFilesTab(submissions, canUpload, canGrade) {
  const deadlineEnd = currentCourse?.deadline ? (() => { const d = new Date(currentCourse.deadline); d.setHours(23,59,59,999); return d.getTime(); })() : null;
  const deadlinePassed = deadlineEnd && Date.now() > deadlineEnd;
  const isStudent = effectiveRole() === "student";
  let uploadButton = "";
  if (canUpload) {
    if (isStudent && deadlinePassed) uploadButton = `<span class="chip private"><i class="fas fa-lock"></i> Deadline passed — submissions locked</span>`;
    else uploadButton = `<button class="btn-inline no-print" style="float:right;" onclick="openMediaModal()"><i class="fas fa-plus"></i> New Submission</button>`;
  }
  return `<div class="card"><h3><i class="fas fa-paperclip"></i> Submissions <span class="chip">${submissions.length}</span>${isStudent ? `<span class="chip"><i class="fas fa-eye-slash"></i> Only you & your teacher can see these</span>` : `<span class="chip"><i class="fas fa-eye"></i> All students (you're a teacher)</span>`}${uploadButton}</h3><div style="margin-top:14px;">${submissions.length ? submissions.map(s => renderSubmissionItem(s, canUpload && !deadlinePassed, canGrade)).join("") : `<p class="muted">${isStudent ? "You haven't submitted anything yet." : "No submissions yet."}</p>`}</div></div>`;
}

function renderSubmissionItem(s, canDelete, canGrade) {
  const kind = s.mediaKind || "file";
  let thumb = "";
  if (kind === "image") thumb = `<img src="${s.dataUrl}" class="submission-thumb" style="object-fit:cover; cursor:pointer;" onclick="openLightbox('${jsId(s.dataUrl)}','image')">`;
  else if (kind === "video") thumb = `<div class="submission-thumb" style="position:relative; cursor:pointer;" onclick="openLightbox('${jsId(s.dataUrl)}','video')"><i class="fas fa-play" style="position:relative; z-index:2;"></i><video src="${s.dataUrl}" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; border-radius:10px; opacity:.6;"></video></div>`;
  else thumb = `<div class="submission-thumb"><i class="fas fa-file"></i></div>`;
  const kindLabel = kind === "image" ? "Photo" : kind === "video" ? "Video" : "File";
  const uploader = s.uploadedBy;
  const gradeBadge = (s.grade !== null && s.grade !== undefined) ? `<span class="grade-badge-inline"><i class="fas fa-star"></i> ${s.grade}/100</span>` : "";
  const feedbackHtml = (s.grade !== null && s.grade !== undefined && s.feedback) ? `<div class="feedback-box"><b>Feedback:</b> ${esc(s.feedback)}</div>` : (s.grade !== null && s.grade !== undefined && !s.feedback) ? `<div class="feedback-box muted"><i>No feedback given.</i></div>` : "";
  const role = effectiveRole();
  const studentCanDelete = canDelete && (role === "student" ? sameId(uploader, user.id) : true);
  return `<div class="submission-item">${thumb}<div class="submission-info"><div class="submission-name">${esc(s.fileName)} <span class="chip">v${s.version || 1}</span></div><div class="submission-meta">${kindLabel} • ${(s.fileSize/1024).toFixed(1)} KB • ${new Date(s.createdAt).toLocaleString()}${uploader ? " • by " + esc(uploader.fullName || "Unknown") : ""}</div>${s.note ? `<div class="submission-note">${esc(s.note)}</div>` : ""}${gradeBadge}${feedbackHtml}<div class="no-print" style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;"><a href="${s.dataUrl}" download="${esc(s.fileName)}" class="btn-ghost" style="text-decoration:none; padding:6px 10px; font-size:.78rem;"><i class="fas fa-download"></i> Download</a>${kind !== "file" ? `<button class="btn-ghost" style="padding:6px 10px; font-size:.78rem;" onclick="openLightbox('${jsId(s.dataUrl)}','${kind}')"><i class="fas fa-expand"></i> View</button>` : ""}${canGrade ? `<button class="btn-inline" style="padding:6px 10px; font-size:.78rem;" onclick="openGradeSubmissionModal('${jsId(s._id)}', '${jsId(uploader?.fullName || "")}', '${jsId(s.fileName)}', ${s.grade ?? 'null'}, '${jsId(s.feedback || '')}')"><i class="fas fa-star"></i> ${s.grade !== null && s.grade !== undefined ? "Update Grade" : "Grade"}</button>` : ""}${studentCanDelete ? `<button class="btn-ghost" style="padding:6px 10px; font-size:.78rem; color:var(--danger);" onclick="deleteSubmission('${jsId(s._id)}')"><i class="fas fa-trash"></i></button>` : ""}</div></div></div>`;
}

async function loadCourseChat() {
  if (!currentCourseId) return;
  try {
    const data = await api(`/api/courses/${currentCourseId}/chat`);
    const box = $("courseChatBox"); if (!box) return;
    if (!data.messages.length) { box.innerHTML = `<p class="muted" style="text-align:center; margin:auto;">No messages yet. Say hi!</p>`; return; }
    box.innerHTML = data.messages.map(m => {
      const canDelete = sameId(m.user, user.id) || user.role === "admin";
      const imageHtml = m.image ? `<img src="${m.image}" style="max-width:240px; max-height:240px; border-radius:10px; margin-top:6px; cursor:pointer; display:block;" onclick="openLightbox('${jsId(m.image)}','image')">` : "";
      return `<div class="course-chat-msg"><img src="${avatarOf(m.user)}"><div class="course-chat-body"><div class="course-chat-name">${esc(m.user.fullName)}${m.user.role !== "student" ? ` <span class="role-tag ${m.user.role}">${m.user.role}</span>` : ""}</div>${m.text ? `<div class="course-chat-text">${esc(m.text)}</div>` : ""}${imageHtml}<div class="course-chat-time">${new Date(m.createdAt).toLocaleString()}</div>${canDelete ? `<div class="course-chat-actions"><button class="msg-del-btn" onclick="deleteCourseChatMessage('${jsId(m._id)}')"><i class="fas fa-trash"></i> Delete</button></div>` : ""}</div></div>`;
    }).join("");
    box.scrollTop = box.scrollHeight;
  } catch (e) {}
}
function triggerCourseChatImage() { $("courseChatImageInput")?.click(); }
function handleCourseChatImage(e) {
  const f = e.target.files?.[0]; if (!f) return;
  if (f.size > 5_000_000) { e.target.value = ""; return toast("warn", "Too large", "Max 5MB"); }
  const reader = new FileReader();
  reader.onload = async () => {
    try { await api(`/api/courses/${currentCourseId}/chat`, { method: "POST", body: JSON.stringify({ image: reader.result }) }); e.target.value = ""; loadCourseChat(); }
    catch (err) { toast("danger", "Error", err.message); }
  };
  reader.readAsDataURL(f);
}
async function sendCourseChat() {
  const inp = $("courseChatInput"); const text = inp.value.trim(); if (!text) return; inp.value = "";
  try { await api(`/api/courses/${currentCourseId}/chat`, { method: "POST", body: JSON.stringify({ text }) }); loadCourseChat(); }
  catch (e) { toast("danger", "Error", e.message); }
}
async function deleteCourseChatMessage(id) {
  if (!confirm("Delete this message?")) return;
  try { await api("/api/courses/chat/messages/" + id, { method: "DELETE" }); loadCourseChat(); }
  catch (e) { toast("danger", "Error", e.message); }
}

function openApplyModal() { $("applyMessage").value = ""; $("applyBackdrop").style.display = "flex"; }
function closeApplyModal() { $("applyBackdrop").style.display = "none"; }
async function submitApplication() {
  try {
    await api(`/api/courses/${currentCourseId}/apply`, { method: "POST", body: JSON.stringify({ message: $("applyMessage").value.trim() }) });
    toast("success", "Applied!", "Sent to teacher.");
    closeApplyModal(); openCourse(currentCourseId);
  } catch (e) { toast("danger", "Error", e.message); }
}
async function acceptApplicant(userId) {
  try { await api(`/api/courses/${currentCourseId}/applicants/${userId}/accept`, { method: "POST" }); toast("success", "Accepted", ""); openCourse(currentCourseId); }
  catch (e) { toast("danger", "Error", e.message); }
}
async function rejectApplicant(userId) {
  try { await api(`/api/courses/${currentCourseId}/applicants/${userId}/reject`, { method: "POST" }); toast("", "Rejected", ""); openCourse(currentCourseId); }
  catch (e) { toast("danger", "Error", e.message); }
}

function openInviteModal() { $("inviteEmail").value = ""; $("inviteBackdrop").style.display = "flex"; }
function closeInviteModal() { $("inviteBackdrop").style.display = "none"; }
async function sendInvite() {
  const email = $("inviteEmail").value.trim().toLowerCase();
  if (!email) return toast("warn", "Missing", "Enter email");
  try { await api(`/api/courses/${currentCourseId}/invite`, { method: "POST", body: JSON.stringify({ email }) }); toast("success", "Sent", ""); closeInviteModal(); }
  catch (e) { toast("danger", "Error", e.message); }
}
async function removeMember(userId) {
  if (!confirm("Remove member?")) return;
  try { await api(`/api/courses/${currentCourseId}/remove-member`, { method: "POST", body: JSON.stringify({ userId }) }); toast("", "Removed", ""); openCourse(currentCourseId); }
  catch (e) { toast("danger", "Error", e.message); }
}

function openLightbox(url, kind) {
  const existing = $("lightbox"); if (existing) existing.remove();
  const lb = document.createElement("div");
  lb.id = "lightbox";
  lb.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,.9); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px; cursor:zoom-out;";
  lb.onclick = () => lb.remove();
  lb.innerHTML = kind === "video" ? `<video src="${url}" controls autoplay style="max-width:100%; max-height:100%; border-radius:12px;" onclick="event.stopPropagation()"></video>` : `<img src="${url}" style="max-width:100%; max-height:100%; border-radius:12px;">`;
  document.body.appendChild(lb);
}

function openMediaModal() {
  mediaKind = "image"; mediaPayload = null;
  $("mediaNote").value = ""; $("mediaPreview").innerHTML = ""; $("mediaFileInput").value = ""; $("mediaFileInput").accept = "image/*"; $("mediaKindLabel").innerText = "Photo";
  document.querySelectorAll(".media-tab").forEach(t => t.classList.toggle("active", t.dataset.kind === "image"));
  $("mediaBackdrop").style.display = "flex";
}
function closeMediaModal() { $("mediaBackdrop").style.display = "none"; mediaPayload = null; }
function setMediaKind(kind) {
  mediaKind = kind; mediaPayload = null; $("mediaPreview").innerHTML = ""; $("mediaFileInput").value = "";
  document.querySelectorAll(".media-tab").forEach(t => t.classList.toggle("active", t.dataset.kind === kind));
  const labels = { image: "Photo", video: "Video", file: "File" };
  $("mediaKindLabel").innerText = labels[kind];
  $("mediaFileInput").accept = kind === "image" ? "image/*" : kind === "video" ? "video/*" : "*/*";
}
function handleMediaFile(e) {
  const f = e.target.files?.[0]; if (!f) return;
  const maxSize = mediaKind === "video" ? 15_000_000 : 5_000_000;
  if (f.size > maxSize) { e.target.value = ""; return toast("warn", "Too large", `Max ${mediaKind === "video" ? "15MB" : "5MB"}`); }
  const reader = new FileReader();
  reader.onload = () => {
    mediaPayload = { name: f.name, size: f.size, type: f.type, dataUrl: reader.result };
    const prev = $("mediaPreview");
    if (mediaKind === "image") prev.innerHTML = `<img src="${mediaPayload.dataUrl}" class="media-preview-img">`;
    else if (mediaKind === "video") prev.innerHTML = `<video src="${mediaPayload.dataUrl}" controls class="media-preview-video"></video>`;
    else prev.innerHTML = `<div class="media-file-icon"><i class="fas fa-file"></i></div>`;
  };
  reader.readAsDataURL(f);
}
async function submitMedia() {
  if (!mediaPayload) return toast("warn", "No file", "Choose a file");
  try {
    await api(`/api/courses/${currentCourseId}/submissions`, { method: "POST", body: JSON.stringify({ fileName: mediaPayload.name, fileSize: mediaPayload.size, fileType: mediaPayload.type, mediaKind, dataUrl: mediaPayload.dataUrl, note: $("mediaNote").value.trim() }) });
    toast("success", "Submitted", "Only you and your teacher can see this.");
    closeMediaModal(); openCourse(currentCourseId);
  } catch (e) { toast("danger", "Error", e.message); }
}
async function deleteSubmission(id) {
  if (!confirm("Delete submission?")) return;
  try { await api("/api/submissions/" + id, { method: "DELETE" }); openCourse(currentCourseId); }
  catch (e) { toast("danger", "Error", e.message); }
}

function openGradeSubmissionModal(subId, studentName, fileName, grade, feedback) {
  gradingSubmissionId = subId;
  $("gsStudentName").innerText = studentName || "Student";
  $("gsFileName").innerText = fileName || "file";
  $("gsGradeValue").value = grade ?? "";
  $("gsFeedback").value = feedback || "";
  $("gradeSubmissionBackdrop").style.display = "flex";
}
function closeGradeSubmissionModal() { $("gradeSubmissionBackdrop").style.display = "none"; gradingSubmissionId = null; }
async function submitSubmissionGrade() {
  if (!gradingSubmissionId) return;
  const grade = parseInt($("gsGradeValue").value);
  if (isNaN(grade) || grade < 0 || grade > 100) return toast("warn", "Invalid", "0-100");
  try {
    await api("/api/submissions/" + gradingSubmissionId + "/grade", { method: "POST", body: JSON.stringify({ grade, feedback: $("gsFeedback").value.trim() }) });
    toast("success", "Graded", "Student has been notified.");
    closeGradeSubmissionModal();
    openCourse(currentCourseId);
  } catch (e) { toast("danger", "Error", e.message); }
}

async function addComment() {
  const inp = $("commentInput"); const text = inp.value.trim(); if (!text) return; inp.value = "";
  try { await api(`/api/courses/${currentCourseId}/comments`, { method: "POST", body: JSON.stringify({ text }) }); openCourse(currentCourseId); }
  catch (e) { toast("danger", "Error", e.message); }
}
async function deleteComment(id) {
  if (!confirm("Delete comment?")) return;
  try { await api("/api/comments/" + id, { method: "DELETE" }); openCourse(currentCourseId); }
  catch (e) { toast("danger", "Error", e.message); }
}

function previewModuleImage(e) {
  const f = e.target.files?.[0]; if (!f) return;
  if (f.size > 3_000_000) { e.target.value = ""; return toast("warn", "Too large", "Max 3MB"); }
  const reader = new FileReader();
  reader.onload = () => { moduleImageB64 = reader.result; const prev = $("courseModuleImagePreview"); prev.src = moduleImageB64; prev.classList.remove("hidden"); };
  reader.readAsDataURL(f);
}
function clearModuleImage() {
  moduleImageB64 = null;
  const prev = $("courseModuleImagePreview"); if (prev) { prev.src = ""; prev.classList.add("hidden"); }
  const inp = $("courseModuleImage"); if (inp) inp.value = "";
}

async function openCourseModal() {
  if (effectiveRole() !== "teacher" && user.role !== "admin") {
    return toast("warn", "Teachers only", "Only teachers can create projects.");
  }
  $("courseModalTitle").innerText = "New Project";
  $("courseTitle").value = ""; $("courseDesc").value = ""; $("courseDeadline").value = "";
  $("courseSubject").value = ALL_SUBJECTS[0] || ""; $("courseOpen").checked = true; $("courseModuleTitle").value = "";
  clearModuleImage();
  await renderCourseClassCheckboxes([], false);
  $("courseBackdrop").style.display = "flex";
}
async function openEditCourseModal() {
  $("courseModalTitle").innerText = "Edit Project";
  $("courseTitle").value = currentCourse.title;
  $("courseDesc").value = currentCourse.description || "";
  $("courseDeadline").value = currentCourse.deadline || "";
  $("courseSubject").value = currentCourse.subject;
  $("courseOpen").checked = currentCourse.isOpen !== false;
  $("courseModuleTitle").value = currentCourse.moduleTitle || "";
  moduleImageB64 = currentCourse.moduleImage || null;
  const prev = $("courseModuleImagePreview");
  if (moduleImageB64) { prev.src = moduleImageB64; prev.classList.remove("hidden"); }
  else prev.classList.add("hidden");
  const current = (currentCourse.classes || []).map(c => String(c._id || c));
  await renderCourseClassCheckboxes(current, false);
  $("courseBackdrop").style.display = "flex";
}
async function renderCourseClassCheckboxes(selected = [], locked = false) {
  const c = $("courseClassCheckboxes"); if (!c) return;
  try {
    const data = await api("/api/classes");
    let classes = data.classes || [];
    if (user.role === "teacher") {
      const myClassIds = (user.classIds || []).map(x => String(x._id || x));
      classes = classes.filter(cls => myClassIds.includes(String(cls._id)));
    }
    if (!classes.length) {
      if (user.role === "teacher") c.innerHTML = `<div style="padding:14px; background:rgba(245,158,11,.12); border:1px solid rgba(245,158,11,.35); border-radius:12px;"><div style="font-weight:800; color:var(--warn); margin-bottom:6px;"><i class="fas fa-triangle-exclamation"></i> No classes assigned to you</div><p class="muted" style="font-size:.85rem; line-height:1.5; margin:0;">Ask your admin to add you to a class.</p></div>`;
      else c.innerHTML = `<p class="muted" style="font-size:.8rem;">No classes yet.</p>`;
      return;
    }
    c.innerHTML = classes.map(cls => `<label><input type="checkbox" value="${cls._id}" ${selected.includes(String(cls._id)) ? "checked" : ""} ${locked ? "disabled" : ""}> ${esc(cls.name)} <span class="muted" style="font-size:.75rem;">(${cls.studentIds?.length || 0} students)</span></label>`).join("");
  } catch (e) { c.innerHTML = `<p class="muted">Failed to load classes.</p>`; }
}
function closeCourseModal() { $("courseBackdrop").style.display = "none"; }
async function saveCourse() {
  const title = $("courseTitle").value.trim();
  const subject = $("courseSubject").value;
  if (!title) return toast("warn", "Missing", "Enter title");
  if (!subject) return toast("warn", "Missing", "Select subject");
  const classIds = Array.from($("courseClassCheckboxes").querySelectorAll("input:checked")).map(i => i.value);
  if (!classIds.length) {
    if (user.role === "teacher" && !(user.classIds || []).length) return toast("warn", "No classes assigned", "Ask your admin to assign you to a class first.");
    return toast("warn", "No classes", "Select at least one");
  }
  const body = { title, description: $("courseDesc").value.trim(), subject, deadline: $("courseDeadline").value, isOpen: $("courseOpen").checked, classIds, moduleTitle: $("courseModuleTitle").value.trim(), moduleImage: moduleImageB64 };
  try {
    if ($("courseModalTitle").innerText === "Edit Project" && currentCourseId) {
      await api("/api/courses/" + currentCourseId, { method: "PUT", body: JSON.stringify(body) });
      toast("success", "Saved", "");
      closeCourseModal(); openCourse(currentCourseId);
    } else {
      const data = await api("/api/courses", { method: "POST", body: JSON.stringify(body) });
      const count = data.course.members?.length || 0;
      toast("success", "Created", `${count} student(s) auto-enrolled.`);
      closeCourseModal(); openCourse(data.course._id);
    }
  } catch (e) { toast("danger", "Error", e.message); }
}
async function deleteCourse() {
  if (!confirm("Delete this project?")) return;
  try { await api("/api/courses/" + currentCourseId, { method: "DELETE" }); toast("", "Deleted", ""); showView("courses"); }
  catch (e) { toast("danger", "Error", e.message); }
}
function printCourse() { window.print(); }

async function sendFriendRequest() {
  const email = $("friendEmail").value.trim().toLowerCase();
  if (!email) return toast("warn", "Missing", "Enter email");
  try { await api("/api/friends/request", { method: "POST", body: JSON.stringify({ email }) }); $("friendEmail").value = ""; toast("success", "Sent", ""); }
  catch (e) { toast("danger", "Error", e.message); }
}
async function loadFriendRequests() {
  const c = $("friendRequestsList"); c.innerHTML = `<p class="muted">Loading...</p>`;
  try {
    const data = await api("/api/friends/requests");
    if (!data.requests.length) { c.innerHTML = `<p class="muted">No pending requests.</p>`; return; }
    c.innerHTML = data.requests.map(r => `<div style="display:flex; gap:12px; align-items:center; padding:10px; border-bottom:1px solid var(--border);"><img src="${avatarOf(r)}" style="width:42px; height:42px; border-radius:50%; object-fit:cover; cursor:pointer;" onclick="openUserProfile('${jsId(r.id)}')"><div style="flex:1; cursor:pointer;" onclick="openUserProfile('${jsId(r.id)}')"><div style="font-weight:700;">${esc(r.name)}</div><div class="muted" style="font-size:.8rem;">${r.course ? esc(r.course) : ""}${r.yearLevel ? " • " + esc(r.yearLevel) : ""}</div></div><button class="btn-inline" onclick="acceptFriend('${jsId(r.id)}')"><i class="fas fa-check"></i></button><button class="btn-ghost" onclick="rejectFriend('${jsId(r.id)}')"><i class="fas fa-xmark"></i></button></div>`).join("");
  } catch (e) { c.innerHTML = `<p class="muted">Failed to load</p>`; }
}
async function acceptFriend(id) {
  try { await api("/api/friends/accept", { method: "POST", body: JSON.stringify({ id }) }); toast("success", "Accepted", ""); loadFriendRequests(); loadFriends(); refreshFriendBadge(); }
  catch (e) { toast("danger", "Error", e.message); }
}
async function rejectFriend(id) {
  try { await api("/api/friends/reject", { method: "POST", body: JSON.stringify({ id }) }); loadFriendRequests(); refreshFriendBadge(); }
  catch (e) { toast("danger", "Error", e.message); }
}
async function loadFriends() {
  const c = $("friendsList"); c.innerHTML = `<p class="muted">Loading...</p>`;
  try {
    const data = await api("/api/friends/list");
    $("friendCount").innerText = `(${data.friends.length})`;
    if (!data.friends.length) { c.innerHTML = `<p class="muted" style="grid-column:1/-1;">No friends yet.</p>`; return; }
    c.innerHTML = data.friends.map(f => `<div class="person-card"><img src="${avatarOf(f)}" style="cursor:pointer;" onclick="openUserProfile('${jsId(f.id)}')"><div class="name" style="cursor:pointer;" onclick="openUserProfile('${jsId(f.id)}')">${esc(f.name)}</div><span class="role-badge ${f.role}">${esc(f.role)}</span>${f.course ? `<div class="muted" style="font-size:.78rem; margin-top:4px;">${esc(f.course)}</div>` : ""}<div style="display:flex; gap:6px; justify-content:center; margin-top:10px;"><button class="btn-inline" style="padding:6px 12px; font-size:.78rem;" onclick="startChatWith('${jsId(f.id)}')"><i class="fas fa-comment"></i> Chat</button><button class="btn-ghost" style="padding:6px 12px; font-size:.78rem; color:var(--danger);" onclick="unfriend('${jsId(f.id)}','${jsId(f.name)}')"><i class="fas fa-user-minus"></i></button></div></div>`).join("");
  } catch (e) { c.innerHTML = `<p class="muted">Failed to load</p>`; }
}
async function unfriend(id, name) {
  if (!confirm(`Unfriend ${name}?`)) return;
  try { await api("/api/friends/unfriend", { method: "POST", body: JSON.stringify({ id }) }); toast("", "Removed", ""); loadFriends(); refreshFriendBadge(); }
  catch (e) { toast("danger", "Error", e.message); }
}
async function refreshFriendBadge() {
  try {
    const data = await api("/api/friends/requests");
    const b = $("friendBadge"); if (!b) return;
    if (data.requests.length > 0) { b.classList.remove("hidden"); b.innerText = data.requests.length; } else b.classList.add("hidden");
  } catch {}
}
async function refreshChatBadge() {
  try {
    const data = await api("/api/chat/unread/count");
    const b = $("chatBadge"); if (!b) return;
    if (data.count > 0) { b.classList.remove("hidden"); b.innerText = data.count > 9 ? "9+" : data.count; } else b.classList.add("hidden");
  } catch {}
}

async function loadContacts() {
  const c = $("contactsList"); c.innerHTML = `<p class="muted" style="padding:10px; font-size:.85rem;">Loading contacts...</p>`;
  try { const data = await api("/api/chat/contacts"); chatContacts = data.contacts || []; renderContacts(chatContacts); }
  catch (e) { c.innerHTML = `<p class="muted" style="padding:10px;">Failed to load contacts</p>`; }
}
function renderContacts(list) {
  const c = $("contactsList");
  if (!list.length) { c.innerHTML = `<p class="muted" style="padding:10px; font-size:.85rem;">No contacts yet.</p>`; return; }
  c.innerHTML = list.map(ct => `<div class="contact-item ${sameId(ct.id, activeChatId) ? 'active' : ''}" onclick="openChatWith('${jsId(ct.id)}')"><img src="${avatarOf({ fullName: ct.name, avatar: ct.avatar })}"><div class="contact-info"><div class="contact-name">${esc(ct.name)}</div><div class="contact-sub">${ct.role ? esc(ct.role) : ""}</div></div><span class="contact-rel ${ct.relation === 'teacher' ? 'teacher' : ''}">${esc(ct.relation)}</span></div>`).join("");
}
function filterContacts() {
  const q = $("contactSearch").value.trim().toLowerCase();
  if (!q) return renderContacts(chatContacts);
  renderContacts(chatContacts.filter(c => c.name.toLowerCase().includes(q)));
}
function startChatWith(id) { showView("chat"); setTimeout(() => openChatWith(id), 300); }
async function openChatWith(id) {
  activeChatId = id;
  const contact = chatContacts.find(c => sameId(c.id, id));
  const headerName = contact?.name || "Chat";
  const headerAvatar = avatarOf({ fullName: headerName, avatar: contact?.avatar });
  $("chatMain").innerHTML = `<div class="chat-header"><img src="${headerAvatar}" onclick="openUserProfile('${jsId(id)}')" style="cursor:pointer;"><div style="flex:1; cursor:pointer;" onclick="openUserProfile('${jsId(id)}')"><div style="font-weight:800;">${esc(headerName)}</div><div class="muted" style="font-size:.75rem;">${contact?.role ? esc(contact.role) : ""}</div></div><button class="btn-ghost" style="padding:6px 10px; font-size:.75rem;" onclick="openUserProfile('${jsId(id)}')"><i class="fas fa-user"></i> View Profile</button></div><div class="chat-messages" id="chatMessages"></div><div class="chat-input-row"><button class="btn-ghost no-print" title="Send photo" onclick="triggerChatImage()"><i class="fas fa-image"></i></button><input type="file" id="chatImageInput" class="hidden" accept="image/*" onchange="handleChatImage(event)"><input id="chatInput" class="input" placeholder="Type a message..." onkeydown="if(event.key==='Enter')sendChatMessage()"><button class="btn-inline" onclick="sendChatMessage()"><i class="fas fa-paper-plane"></i></button></div>`;
  renderContacts(chatContacts);
  await loadChatMessages();
  stopChatPolling();
  chatPollTimer = setInterval(loadChatMessages, 3000);
}
function stopChatPolling() { if (chatPollTimer) { clearInterval(chatPollTimer); chatPollTimer = null; } }
async function loadChatMessages() {
  if (!activeChatId) return;
  try {
    const data = await api("/api/chat/" + activeChatId);
    const c = $("chatMessages"); if (!c) return;
    if (!data.messages.length) { c.innerHTML = `<p class="muted" style="text-align:center; margin:auto;">No messages yet.</p>`; return; }
    c.innerHTML = data.messages.map(m => {
      const isMine = sameId(m.from, user.id);
      const canDelete = isMine || user.role === "admin";
      const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const imageHtml = m.image ? `<img src="${m.image}" style="max-width:240px; max-height:240px; border-radius:10px; margin-top:4px; cursor:pointer; display:block;" onclick="openLightbox('${jsId(m.image)}','image')">` : "";
      return `<div class="msg-wrap ${isMine ? 'mine' : 'theirs'}">${m.text ? `<div class="msg ${isMine ? 'mine' : 'theirs'}">${esc(m.text)}</div>` : ""}${imageHtml}<div class="msg-time">${time}</div>${canDelete ? `<div class="msg-actions"><button class="msg-del-btn" onclick="deleteChatMessage('${jsId(m._id)}')"><i class="fas fa-trash"></i> Delete</button></div>` : ""}</div>`;
    }).join("");
    c.scrollTop = c.scrollHeight;
    refreshChatBadge();
  } catch (e) {}
}
function triggerChatImage() { $("chatImageInput")?.click(); }
function handleChatImage(e) {
  const f = e.target.files?.[0]; if (!f) return;
  if (f.size > 5_000_000) { e.target.value = ""; return toast("warn", "Too large", "Max 5MB"); }
  const reader = new FileReader();
  reader.onload = async () => {
    try { await api("/api/chat/" + activeChatId, { method: "POST", body: JSON.stringify({ image: reader.result }) }); e.target.value = ""; await loadChatMessages(); }
    catch (err) { toast("danger", "Error", err.message); }
  };
  reader.readAsDataURL(f);
}
async function sendChatMessage() {
  const inp = $("chatInput"); const text = inp.value.trim(); if (!text || !activeChatId) return; inp.value = "";
  try { await api("/api/chat/" + activeChatId, { method: "POST", body: JSON.stringify({ text }) }); await loadChatMessages(); }
  catch (e) { toast("danger", "Error", e.message); }
}
async function deleteChatMessage(id) {
  if (!confirm("Delete this message?")) return;
  try { await api("/api/chat/messages/" + id, { method: "DELETE" }); await loadChatMessages(); }
  catch (e) { toast("danger", "Error", e.message); }
}

let peopleTimeout = null;
function searchPeople() {
  clearTimeout(peopleTimeout);
  peopleTimeout = setTimeout(async () => {
    const q = $("peopleSearch").value.trim();
    if (!q) { $("peopleGrid").innerHTML = ""; return; }
    try {
      const data = await api("/api/people/search?q=" + encodeURIComponent(q));
      const list = data.users || [];
      $("peopleGrid").innerHTML = list.length ? list.map(u => `<div class="person-card"><img src="${avatarOf(u)}" style="cursor:pointer;" onclick="openUserProfile('${jsId(u._id)}')"><div class="name" style="cursor:pointer;" onclick="openUserProfile('${jsId(u._id)}')">${esc(u.fullName)}</div><span class="role-badge ${u.role}">${esc(u.role)}</span>${u.course ? `<div class="muted" style="font-size:.82rem; margin-top:6px;">${esc(u.course)}</div>` : ""}<div style="display:flex; gap:6px; justify-content:center; margin-top:10px; flex-wrap:wrap;"><button class="btn-ghost" style="padding:6px 12px; font-size:.78rem;" onclick="openUserProfile('${jsId(u._id)}')"><i class="fas fa-user"></i> Profile</button><button class="btn-ghost" style="padding:6px 12px; font-size:.78rem;" onclick="quickAddFriendById('${jsId(u._id)}')"><i class="fas fa-user-plus"></i> Add</button></div></div>`).join("") : `<div class="empty"><i class="fas fa-user-slash"></i><p>No users found.</p></div>`;
    } catch (e) { toast("danger", "Error", e.message); }
  }, 300);
}
async function quickAddFriendById(userId) {
  try { await api("/api/friends/request-by-id", { method: "POST", body: JSON.stringify({ userId }) }); toast("success", "Sent", "Friend request sent."); }
  catch (e) { toast("danger", "Error", e.message); }
}

async function saveProfile() {
  try {
    const phone = ($("profPhone")?.value || "").trim();
    if (phone && !/^\+?[0-9]{10,15}$/.test(phone)) return toast("warn", "Invalid phone", "Use +639171234567");
    const body = {
      fullName: $("profName")?.value.trim() || "",
      bio: $("profBio")?.value.trim() || "",
      school: $("profSchool")?.value.trim() || "",
      studentId: $("profStudentId")?.value.trim() || "",
      course: $("profCourse")?.value.trim() || "",
      yearLevel: $("profYear")?.value || "",
      section: $("profSection")?.value.trim() || "",
      birthday: $("profBirthday")?.value || "",
      gender: $("profGender")?.value || "",
      address: $("profAddress")?.value.trim() || "",
      contactNumber: $("profContact")?.value.trim() || "",
      phone,
      guardianName: $("profGuardianName")?.value.trim() || "",
      guardianContact: $("profGuardianContact")?.value.trim() || "",
      telegramChatId: $("profTelegram")?.value.trim() || "",
      hobbies: ($("profHobbies")?.value || "").split(",").map(s => s.trim()).filter(Boolean),
      skills: ($("profSkills")?.value || "").split(",").map(s => s.trim()).filter(Boolean)
    };
    if (user.role === "teacher" && $("profSubjects")) body.subjects = getCheckedSubjects("profSubjects");
    const data = await api("/api/me", { method: "PUT", body: JSON.stringify(body) });
    user = { ...user, ...data.user };
    localStorage.setItem("sph_user", JSON.stringify(user));
    hydrateTopBar();
    toast("success", "Saved", "Profile updated.");
  } catch (e) { toast("danger", "Error", e.message); }
}
async function changePassword() {
  const cur = $("curPass").value, nw = $("newPass").value;
  if (!cur || !nw) return toast("warn", "Missing", "Fill both");
  if (nw.length < 6) return toast("warn", "Weak", "Min 6");
  try { await api("/api/me/password", { method: "PUT", body: JSON.stringify({ currentPassword: cur, newPassword: nw }) }); $("curPass").value = ""; $("newPass").value = ""; toast("success", "Changed", ""); }
  catch (e) { toast("danger", "Error", e.message); }
}
async function uploadAvatar(e) {
  const file = e.target.files?.[0]; if (!file) return;
  if (file.size > 2_000_000) return toast("warn", "Too large", "Max 2MB");
  const reader = new FileReader();
  reader.onload = async () => {
    try { const data = await api("/api/me", { method: "PUT", body: JSON.stringify({ avatar: reader.result }) }); user = { ...user, ...data.user }; localStorage.setItem("sph_user", JSON.stringify(user)); hydrateTopBar(); toast("success", "Updated", ""); }
    catch (e) { toast("danger", "Error", e.message); }
  };
  reader.readAsDataURL(file);
}
async function uploadBanner(e) {
  const file = e.target.files?.[0]; if (!file) return;
  if (file.size > 3_000_000) return toast("warn", "Too large", "Max 3MB");
  const reader = new FileReader();
  reader.onload = async () => {
    try { const data = await api("/api/me", { method: "PUT", body: JSON.stringify({ banner: reader.result }) }); user = { ...user, ...data.user }; localStorage.setItem("sph_user", JSON.stringify(user)); hydrateTopBar(); toast("success", "Updated", ""); }
    catch (e) { toast("danger", "Error", e.message); }
  };
  reader.readAsDataURL(file);
}

async function loadClasses() {
  try {
    const data = await api("/api/classes");
    ALL_CLASSES = data.classes || [];
    renderClassesGrid(ALL_CLASSES);
  } catch (e) { toast("danger", "Error", e.message); }
}
function renderClassesGrid(classes) {
  const grid = $("classesGrid"); const detail = $("classDetail");
  if (detail) detail.classList.add("hidden");
  if (grid) grid.classList.remove("hidden");
  if (!classes.length) { grid.innerHTML = `<div class="empty"><i class="fas fa-chalkboard"></i><p>No classes yet.</p></div>`; return; }
  grid.innerHTML = classes.map(c => `<div class="course-card" onclick="openClassDetail('${jsId(c._id)}')"><div class="course-cover"><i class="fas fa-chalkboard"></i><span class="status-badge">${c.studentIds?.length || 0} students</span></div><div class="course-body"><div class="course-title">${esc(c.name)}</div><div class="course-desc">${esc(c.description || "")}</div><div class="chips" style="margin-top:6px;">${c.course ? `<span class="chip green"><i class="fas fa-book"></i> ${esc(c.course)}</span>` : ""}${c.yearLevel ? `<span class="chip"><i class="fas fa-graduation-cap"></i> ${esc(c.yearLevel)}</span>` : ""}</div></div></div>`).join("");
}
async function openClassDetail(id) {
  try {
    const data = await api("/api/classes/" + id);
    const cls = data.class;
    $("classesGrid").classList.add("hidden");
    $("classDetail").classList.remove("hidden");
    const canManage = effectiveRole() === "admin";
    $("classDetailContent").innerHTML = `<div class="card"><h3><i class="fas fa-chalkboard"></i> ${esc(cls.name)} ${canManage ? `<button class="btn-inline" style="float:right;" onclick="openClassModal('${jsId(cls._id)}')"><i class="fas fa-pen"></i> Edit</button>` : ""}</h3><div class="chips" style="margin-top:10px;">${cls.course ? `<span class="chip"><i class="fas fa-book"></i> ${esc(cls.course)}</span>` : ""}${cls.yearLevel ? `<span class="chip"><i class="fas fa-graduation-cap"></i> ${esc(cls.yearLevel)}</span>` : ""}</div></div><div class="card"><h3><i class="fas fa-chalkboard-user"></i> Teachers <span class="chip">${cls.teacherIds.length}</span></h3><div class="team-roster">${cls.teacherIds.length ? cls.teacherIds.map(t => `<div class="roster-card" style="cursor:pointer;" onclick="openUserProfile('${jsId(t._id)}')"><img src="${avatarOf(t)}"><div class="rname">${esc(t.fullName)}</div></div>`).join("") : `<p class="muted">No teachers.</p>`}</div></div><div class="card"><h3><i class="fas fa-users"></i> Students <span class="chip">${cls.studentIds.length}</span></h3><div class="team-roster">${cls.studentIds.length ? cls.studentIds.map(s => `<div class="roster-card" style="cursor:pointer;" onclick="openUserProfile('${jsId(s._id)}')"><img src="${avatarOf(s)}"><div class="rname">${esc(s.fullName)}</div><div class="remail">${esc(s.course || "")} ${s.yearLevel ? "• " + esc(s.yearLevel) : ""}</div></div>`).join("") : `<p class="muted">No students.</p>`}</div></div>`;
    const isMyClass = user.role === "admin" || (user.role === "teacher" && cls.teacherIds.some(t => sameId(t._id || t, user.id)));
    loadClassAnnouncements(cls._id, cls.name, isMyClass);
  } catch (e) { toast("danger", "Error", e.message); }
}
function closeClassDetail() { $("classDetail").classList.add("hidden"); $("classesGrid").classList.remove("hidden"); }
async function openClassModal(id = null) {
  if (effectiveRole() !== "admin") return toast("warn", "Admins only", "");
  editingClassId = id;
  const cls = id ? ALL_CLASSES.find(c => sameId(c._id, id)) : null;
  $("classModalTitle").innerHTML = id ? `<i class="fas fa-chalkboard"></i> Edit Class` : `<i class="fas fa-chalkboard"></i> New Class`;
  $("classModalName").value = cls?.name || ""; $("classModalCourse").value = cls?.course || "";
  $("classModalYear").value = cls?.yearLevel || ""; $("classModalSection").value = cls?.section || "";
  $("classModalDesc").value = cls?.description || "";
  try {
    const tData = await api("/api/admin/users?role=teacher");
    eligibleTeachers = tData.users || [];
    const sData = await api("/api/admin/users?role=student");
    eligibleStudents = sData.users || [];
  } catch {}
  const curT = (cls?.teacherIds || []).map(t => String(t._id || t));
  const curS = (cls?.studentIds || []).map(s => String(s._id || s));
  $("classModalTeacherList").innerHTML = eligibleTeachers.map(t => `<label><input type="checkbox" value="${t._id}" ${curT.includes(String(t._id)) ? "checked" : ""}> ${esc(t.fullName)}</label>`).join("") || `<p class="muted">No teachers available.</p>`;
  $("classModalStudentList").innerHTML = eligibleStudents.map(s => `<label><input type="checkbox" value="${s._id}" ${curS.includes(String(s._id)) ? "checked" : ""}> ${esc(s.fullName)}</label>`).join("") || `<p class="muted">No students available.</p>`;
  $("classBackdrop").style.display = "flex";
}
function closeClassModal() { $("classBackdrop").style.display = "none"; editingClassId = null; }
async function saveClass() {
  if (user.role !== "admin") return;
  const name = $("classModalName").value.trim();
  if (!name) return toast("warn", "Missing", "Class name required");
  const teacherIds = Array.from($("classModalTeacherList").querySelectorAll("input:checked")).map(i => i.value);
  const studentIds = Array.from($("classModalStudentList").querySelectorAll("input:checked")).map(i => i.value);
  const body = { name, course: $("classModalCourse").value.trim(), yearLevel: $("classModalYear").value, section: $("classModalSection").value.trim(), description: $("classModalDesc").value.trim(), teacherIds, studentIds };
  try {
    if (editingClassId) { await api("/api/classes/" + editingClassId, { method: "PUT", body: JSON.stringify(body) }); toast("success", "Updated", ""); }
    else { await api("/api/classes", { method: "POST", body: JSON.stringify(body) }); toast("success", "Created", ""); }
    closeClassModal(); loadClasses();
    if ($("adminClassList")) loadAdminClasses();
  } catch (e) { toast("danger", "Error", e.message); }
}
async function loadAdminClasses() {
  const c = $("adminClassList"); if (!c) return;
  try {
    const data = await api("/api/classes");
    const list = data.classes || [];
    if (!list.length) { c.innerHTML = `<p class="muted">No classes yet.</p>`; return; }
    c.innerHTML = list.map(cls => `<div style="display:flex; gap:12px; align-items:center; padding:10px; border-bottom:1px solid var(--border);"><div style="width:42px; height:42px; border-radius:10px; background:linear-gradient(135deg, var(--primary), var(--primary2)); display:flex; align-items:center; justify-content:center; color:white;"><i class="fas fa-chalkboard"></i></div><div style="flex:1;"><div style="font-weight:700;">${esc(cls.name)}</div><div class="muted" style="font-size:.8rem;">${cls.teacherIds?.length || 0} teachers • ${cls.studentIds?.length || 0} students</div></div><button class="iconbtn" onclick="openClassModal('${jsId(cls._id)}')"><i class="fas fa-pen"></i></button><button class="iconbtn" style="color:var(--danger);" onclick="deleteClass('${jsId(cls._id)}','${jsId(cls.name)}')"><i class="fas fa-trash"></i></button></div>`).join("");
  } catch (e) { c.innerHTML = `<p class="muted">Failed to load classes.</p>`; }
}
async function deleteClass(id, name) {
  if (!confirm(`Delete class "${name}"?`)) return;
  try { await api("/api/classes/" + id, { method: "DELETE" }); toast("", "Deleted", ""); loadAdminClasses(); if ($("view-classes") && !$("view-classes").classList.contains("hidden")) loadClasses(); }
  catch (e) { toast("danger", "Error", e.message); }
}

let annCurrentClassId = null;
let annCurrentClassName = "";

async function loadClassAnnouncements(classId, className, canPost) {
  annCurrentClassId = classId;
  annCurrentClassName = className || "";
  const list = $("classAnnouncementsList");
  const newBtn = $("newAnnBtn");
  if (!list) return;
  newBtn.classList.toggle("hidden", !canPost);
  list.innerHTML = `<p class="muted" style="text-align:center; padding:14px;"><i class="fas fa-spinner fa-spin"></i> Loading...</p>`;
  try {
    const data = await api(`/api/classes/${classId}/announcements`);
    renderAnnouncementList(list, data.announcements || []);
  } catch (e) {
    list.innerHTML = `<p class="muted" style="text-align:center; padding:14px;">Failed to load announcements.</p>`;
  }
}

function renderAnnouncementList(container, list) {
  if (!list.length) {
    container.innerHTML = `<div class="empty" style="padding:20px;"><i class="fas fa-bullhorn"></i><p style="font-size:.9rem;">No announcements yet.</p></div>`;
    return;
  }
  const canManage = user.role === "teacher" || user.role === "admin";
  container.innerHTML = list.map(a => {
    const isAuthor = sameId(a.author, user.id);
    const canEdit = canManage && (isAuthor || user.role === "admin");
    return `<div style="padding:14px; border:1px solid var(--border); border-radius:12px; margin-bottom:10px; position:relative; ${a.pinned ? 'background:rgba(22,163,74,.06); border-color:var(--primary);' : ''}">
      ${a.pinned ? `<span class="chip green" style="position:absolute; top:10px; right:10px; font-size:.68rem;"><i class="fas fa-thumbtack"></i> Pinned</span>` : ""}
      <div style="display:flex; gap:10px; align-items:flex-start;">
        <img src="${avatarOf(a.author)}" style="width:38px; height:38px; border-radius:50%; object-fit:cover; flex-shrink:0;">
        <div style="flex:1; min-width:0;">
          <div style="font-weight:800; font-size:1rem; word-break:break-word;">${esc(a.title)}</div>
          <div class="muted" style="font-size:.75rem; margin-top:2px;">
            ${esc(a.author?.fullName || "Unknown")}
            ${a.author?.role && a.author.role !== "student" ? `<span class="role-tag ${a.author.role}" style="margin-left:6px;">${a.author.role}</span>` : ""}
            • ${new Date(a.createdAt).toLocaleString()}
          </div>
          <div style="margin-top:8px; line-height:1.55; white-space:pre-wrap; word-break:break-word;">${esc(a.body)}</div>
          ${canEdit ? `<div style="display:flex; gap:6px; margin-top:10px; flex-wrap:wrap;">
            <button class="btn-ghost" style="padding:5px 10px; font-size:.75rem;" onclick="editAnnouncement('${jsId(a._id)}')"><i class="fas fa-pen"></i> Edit</button>
            <button class="btn-ghost" style="padding:5px 10px; font-size:.75rem; color:var(--danger);" onclick="deleteAnnouncement('${jsId(a._id)}')"><i class="fas fa-trash"></i> Delete</button>
            <button class="btn-ghost" style="padding:5px 10px; font-size:.75rem;" onclick="toggleAnnouncementPin('${jsId(a._id)}', ${!a.pinned})"><i class="fas fa-thumbtack"></i> ${a.pinned ? "Unpin" : "Pin"}</button>
          </div>` : ""}
        </div>
      </div>
    </div>`;
  }).join("");
}

function openAnnouncementModal(editData = null) {
  if (!annCurrentClassId) return toast("warn", "No class", "Open a class first");
  $("annModalTitle").innerHTML = editData ? `<i class="fas fa-bullhorn"></i> Edit Announcement` : `<i class="fas fa-bullhorn"></i> New Announcement`;
  $("annModalClass").innerText = editData ? "" : `Posting to: ${annCurrentClassName}`;
  $("annTitle").value = editData?.title || "";
  $("annBody").value = editData?.body || "";
  $("annPinned").checked = !!editData?.pinned;
  $("annBackdrop").dataset.editId = editData?._id || "";
  $("annBackdrop").style.display = "flex";
  setTimeout(() => $("annTitle")?.focus(), 150);
}
function closeAnnouncementModal() {
  $("annBackdrop").style.display = "none";
  $("annBackdrop").dataset.editId = "";
}
async function saveAnnouncement() {
  const editId = $("annBackdrop").dataset.editId;
  const title = $("annTitle").value.trim();
  const body = $("annBody").value.trim();
  const pinned = $("annPinned").checked;
  if (!title) return toast("warn", "Missing", "Enter a title");
  if (!body) return toast("warn", "Missing", "Enter the announcement text");
  try {
    if (editId) {
      await api(`/api/announcements/${editId}`, { method: "PUT", body: JSON.stringify({ title, body, pinned }) });
      toast("success", "Updated", "Announcement updated.");
    } else {
      await api(`/api/classes/${annCurrentClassId}/announcements`, { method: "POST", body: JSON.stringify({ title, body, pinned }) });
      toast("success", "Posted!", "Students in this class were notified.");
    }
    closeAnnouncementModal();
    loadClassAnnouncements(annCurrentClassId, annCurrentClassName, true);
  } catch (e) { toast("danger", "Error", e.message); }
}
async function deleteAnnouncement(id) {
  if (!confirm("Delete this announcement?")) return;
  try {
    await api(`/api/announcements/${id}`, { method: "DELETE" });
    toast("", "Deleted", "");
    loadClassAnnouncements(annCurrentClassId, annCurrentClassName, true);
  } catch (e) { toast("danger", "Error", e.message); }
}
async function toggleAnnouncementPin(id, pinned) {
  try {
    await api(`/api/announcements/${id}`, { method: "PUT", body: JSON.stringify({ pinned }) });
    loadClassAnnouncements(annCurrentClassId, annCurrentClassName, true);
  } catch (e) { toast("danger", "Error", e.message); }
}
async function editAnnouncement(id) {
  try {
    const list = (await api(`/api/classes/${annCurrentClassId}/announcements`)).announcements || [];
    const item = list.find(a => sameId(a._id, id));
    if (!item) return toast("danger", "Error", "Not found");
    openAnnouncementModal(item);
  } catch (e) { toast("danger", "Error", e.message); }
}

async function loadAnnouncementFeed() {
  const card = $("annFeedCard"); const list = $("annFeedList");
  if (!card || !list) return;
  try {
    const data = await api("/api/announcements/feed");
    const feed = data.announcements || [];
    if (!feed.length) { card.classList.add("hidden"); return; }
    card.classList.remove("hidden");
    list.innerHTML = feed.slice(0, 5).map(a => `
      <div style="padding:10px; border-left:3px solid var(--primary); background:rgba(22,163,74,.06); border-radius:8px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div style="font-weight:800; font-size:.92rem;">${esc(a.title)}</div>
          <span class="chip" style="font-size:.65rem;">${esc(a.classId?.name || "Class")}</span>
        </div>
        <div class="muted" style="font-size:.72rem; margin-top:2px;">${esc(a.author?.fullName || "")} • ${new Date(a.createdAt).toLocaleString()}</div>
        <div style="margin-top:6px; font-size:.85rem; line-height:1.5; white-space:pre-wrap;">${esc(a.body.slice(0, 200))}${a.body.length > 200 ? "..." : ""}</div>
      </div>`).join("");
  } catch { card.classList.add("hidden"); }
}

async function loadAdminUsers() {
  try {
    const q = $("adminUserSearch").value.trim();
    const role = $("adminRoleFilter").value;
    const data = await api(`/api/admin/users?q=${encodeURIComponent(q)}&role=${role}`);
    const list = data.users || [];
    $("adminUsersList").innerHTML = list.length ? list.map(u => `<div style="display:flex; gap:12px; align-items:center; padding:10px; border-bottom:1px solid var(--border);"><img src="${avatarOf(u)}" style="width:42px; height:42px; border-radius:50%; cursor:pointer;" onclick="openUserProfile('${jsId(u._id)}')"><div style="flex:1; cursor:pointer;" onclick="openUserProfile('${jsId(u._id)}')"><div style="font-weight:700;">${esc(u.fullName)} <span class="role-badge ${u.role}" style="display:inline-block; padding:2px 10px; border-radius:999px; font-size:.68rem; text-transform:uppercase; background:rgba(22,163,74,.15); color:var(--primary-dark);">${esc(u.role)}</span></div><div class="muted" style="font-size:.8rem;">${esc(u.email)}${u.phone ? " • " + esc(u.phone) : ""}${u.studentId ? " • ID: " + esc(u.studentId) : ""}</div></div><button class="iconbtn" onclick="editUser('${jsId(u._id)}')"><i class="fas fa-pen"></i></button><button class="iconbtn" style="color:var(--danger);" onclick="deleteUser('${jsId(u._id)}', '${jsId(u.fullName)}')"><i class="fas fa-trash"></i></button></div>`).join("") : `<p class="muted">No users found.</p>`;
  } catch (e) { toast("danger", "Error", e.message); }
}
async function loadAdminCourses() {
  try {
    const data = await api("/api/admin/courses");
    const list = data.courses || [];
    $("adminCoursesList").innerHTML = list.length ? list.map(p => `<div style="display:flex; gap:12px; align-items:center; padding:10px; border-bottom:1px solid var(--border);"><div style="width:42px; height:42px; border-radius:10px; background:linear-gradient(135deg, var(--primary), var(--primary2)); display:flex; align-items:center; justify-content:center; color:white;"><i class="fas fa-book"></i></div><div style="flex:1;"><div style="font-weight:700;">${esc(p.title)}</div><div class="muted" style="font-size:.8rem;">${esc(p.subject)} • by ${esc(p.owner?.fullName || "?")} • ${p.membersCount} members</div></div>${p.pendingApplications ? `<span class="chip warn"><i class="fas fa-inbox"></i> ${p.pendingApplications}</span>` : ""}<span class="chip">${statusLabel(p.status)}</span><button class="iconbtn" onclick="openCourse('${jsId(p._id)}')"><i class="fas fa-eye"></i></button><button class="iconbtn" style="color:var(--danger);" onclick="adminDeleteCourse('${jsId(p._id)}')"><i class="fas fa-trash"></i></button></div>`).join("") : `<p class="muted">No projects yet.</p>`;
  } catch (e) { toast("danger", "Error", e.message); }
}
function openUserModal() {
  editingUserId = null;
  $("userModalTitle").innerText = "Add User";
  ["uName","uEmail","uPhone","uPass","uCourse","uBio"].forEach(id => $(id).value = "");
  $("uYear").value = ""; $("uRole").value = "student"; $("uActive").checked = true;
  $("pwHint").innerText = "(required for new user)";
  renderSubjectCheckboxes("uSubjects", []);
  onAdminRoleChange();
  $("userBackdrop").style.display = "flex";
}
function closeUserModal() { $("userBackdrop").style.display = "none"; editingUserId = null; }
function onAdminRoleChange() {
  const r = $("uRole").value;
  $("uStudentFields").classList.toggle("hidden", r !== "student");
  $("uSubjectsField").classList.toggle("hidden", r !== "teacher");
}
async function editUser(id) {
  try {
    const data = await api("/api/admin/users?q=");
    const u = data.users.find(x => sameId(x._id, id)); if (!u) return;
    editingUserId = id;
    $("userModalTitle").innerText = "Edit User";
    $("uName").value = u.fullName || ""; $("uEmail").value = u.email || ""; $("uPhone").value = u.phone || ""; $("uPass").value = "";
    $("pwHint").innerText = "(leave blank to keep)";
    $("uRole").value = u.role; $("uCourse").value = u.course || ""; $("uYear").value = u.yearLevel || "";
    $("uBio").value = u.bio || ""; $("uActive").checked = u.isActive !== false;
    renderSubjectCheckboxes("uSubjects", u.subjects || []);
    onAdminRoleChange();
    $("userBackdrop").style.display = "flex";
  } catch (e) { toast("danger", "Error", e.message); }
}
async function saveUser() {
  const fullName = $("uName").value.trim();
  const email = $("uEmail").value.trim().toLowerCase();
  const password = $("uPass").value;
  const role = $("uRole").value;
  if (!fullName || !email) return toast("warn", "Missing", "Name and email required");
  if (!editingUserId && password.length < 6) return toast("warn", "Weak", "Password must be 6+");
  const body = { fullName, email, role, phone: $("uPhone").value.trim(), course: $("uCourse").value.trim(), yearLevel: $("uYear").value, bio: $("uBio").value.trim(), isActive: $("uActive").checked };
  if (role === "teacher") body.subjects = getCheckedSubjects("uSubjects"); else body.subjects = [];
  if (password) body.password = password;
  try {
    if (editingUserId) { await api("/api/admin/users/" + editingUserId, { method: "PUT", body: JSON.stringify(body) }); toast("success", "Updated", ""); }
    else { await api("/api/admin/users", { method: "POST", body: JSON.stringify(body) }); toast("success", "Created", ""); }
    closeUserModal(); loadAdminUsers();
  } catch (e) { toast("danger", "Error", e.message); }
}
async function deleteUser(id, name) {
  if (!confirm(`Delete user "${name}"?`)) return;
  try { await api("/api/admin/users/" + id, { method: "DELETE" }); toast("", "Deleted", ""); loadAdminUsers(); loadAdminCourses(); }
  catch (e) { toast("danger", "Error", e.message); }
}
async function adminDeleteCourse(id) {
  if (!confirm("Delete project?")) return;
  try { await api("/api/admin/courses/" + id, { method: "DELETE" }); toast("", "Deleted", ""); loadAdminCourses(); }
  catch (e) { toast("danger", "Error", e.message); }
}

async function openEnrollModal() {
  if (effectiveRole() !== "admin") return toast("warn", "Admins only", "");
  ["enName","enEmail","enStudentId","enCourse","enSection"].forEach(id => $(id).value = "");
  $("enYear").value = "";
  $("enEnrolledAt").value = new Date().toISOString().split("T")[0];
  try {
    const data = await api("/api/classes");
    const classes = data.classes || [];
    $("enClass").innerHTML = `<option value="">— None —</option>` + classes.map(c => `<option value="${c._id}">${esc(c.name)}</option>`).join("");
  } catch { $("enClass").innerHTML = `<option value="">— None —</option>`; }
  $("enrollBackdrop").style.display = "flex";
}
function closeEnrollModal() { $("enrollBackdrop").style.display = "none"; }
async function saveEnrollStudent() {
  const fullName = $("enName").value.trim();
  const email = $("enEmail").value.trim().toLowerCase();
  const studentId = $("enStudentId").value.trim();
  if (!fullName || !email || !studentId) return toast("warn", "Missing", "Name, email, and Student ID required");
  const body = {
    fullName, email, studentId,
    course: $("enCourse").value.trim(),
    yearLevel: $("enYear").value,
    section: $("enSection").value.trim(),
    classId: $("enClass").value || null,
    enrolledAt: $("enEnrolledAt").value || null
  };
  try {
    await api("/api/admin/enroll-student", { method: "POST", body: JSON.stringify(body) });
    toast("success", "Enrolled", "Student can now sign up with their Student ID.");
    closeEnrollModal(); loadAdminUsers(); loadStudentRegistrations();
  } catch (e) { toast("danger", "Error", e.message); }
}

async function loadTeam() {
  try { const data = await api("/api/team"); TEAM = data.members || []; renderTeam(); }
  catch (e) { TEAM = []; renderTeam(); }
}
function renderTeam() {
  const c = $("teamList"); if (!c) return;
  if (!TEAM.length) { c.innerHTML = `<div class="empty" style="grid-column:1/-1;"><i class="fas fa-users"></i><p>No team members yet.</p></div>`; return; }
  const isAdmin = user?.role === "admin";
  c.innerHTML = TEAM.map(m => {
    const photoHtml = m.photo ? `<img class="member-photo" src="${esc(m.photo)}">` : `<div class="member-photo-placeholder"><i class="fas fa-user"></i></div>`;
    const links = [];
    if (m.facebook) links.push(`<a href="${esc(m.facebook)}" target="_blank"><i class="fab fa-facebook-f"></i></a>`);
    if (m.github) links.push(`<a href="${esc(m.github)}" target="_blank"><i class="fab fa-github"></i></a>`);
    if (m.email) links.push(`<a href="mailto:${esc(m.email)}"><i class="fas fa-envelope"></i></a>`);
    return `<div class="member" style="position:relative;">${isAdmin ? `<div style="position:absolute; top:8px; right:8px; display:flex; gap:4px;"><button class="iconbtn" style="min-width:32px; min-height:32px; padding:4px 6px;" onclick="openTeamModal('${jsId(m._id)}')"><i class="fas fa-pen" style="font-size:.75rem;"></i></button><button class="iconbtn" style="min-width:32px; min-height:32px; padding:4px 6px; color:var(--danger);" onclick="deleteTeamMember('${jsId(m._id)}','${jsId(m.name)}')"><i class="fas fa-trash" style="font-size:.75rem;"></i></button></div>` : ""}${photoHtml}<div class="member-name">${esc(m.name)}</div>${m.badge ? `<span class="member-badge ${esc(m.badge)}">${esc(m.badge)}</span>` : ""}<div class="member-role">${esc(m.role)}</div>${m.desc ? `<div class="member-desc">${esc(m.desc)}</div>` : ""}${links.length ? `<div class="member-links">${links.join("")}</div>` : ""}</div>`;
  }).join("");
}
async function openAbout() {
  await loadTeam();
  const y = $("aboutYear"); if (y) y.innerText = new Date().getFullYear();
  const s = $("aboutSubjects");
  if (s && ALL_SUBJECTS.length) s.innerHTML = ALL_SUBJECTS.map(sub => `<span class="chip green"><i class="fas fa-book"></i> ${esc(sub)}</span>`).join("");
  const addBtn = $("addTeamMemberBtn"); if (addBtn) addBtn.classList.toggle("hidden", user?.role !== "admin");
  $("aboutBackdrop").style.display = "flex";
}
function closeAbout() { $("aboutBackdrop").style.display = "none"; }
function openTeamModal(id = null) {
  if (user?.role !== "admin") return toast("warn", "Admins only", "");
  editingTeamId = id;
  const m = id ? TEAM.find(x => sameId(x._id, id)) : null;
  $("teamModalTitle").innerHTML = id ? `<i class="fas fa-user-pen"></i> Edit Team Member` : `<i class="fas fa-user-plus"></i> Add Team Member`;
  ["tmName","tmRole","tmDesc","tmFacebook","tmGithub","tmEmail"].forEach(id => $(id).value = "");
  if (m) {
    $("tmName").value = m.name || ""; $("tmRole").value = m.role || ""; $("tmBadge").value = m.badge || "";
    $("tmDesc").value = m.desc || ""; $("tmFacebook").value = m.facebook || ""; $("tmGithub").value = m.github || "";
    $("tmEmail").value = m.email || ""; $("tmOrder").value = m.order ?? 0;
  } else { $("tmBadge").value = ""; $("tmOrder").value = 0; }
  pendingTeamPhoto = null;
  const prev = $("tmPhotoPreview"); if (m?.photo) { prev.src = m.photo; prev.classList.remove("hidden"); } else prev.classList.add("hidden");
  $("teamBackdrop").style.display = "flex";
}
function closeTeamModal() { $("teamBackdrop").style.display = "none"; editingTeamId = null; pendingTeamPhoto = null; }
function handleTeamPhoto(e) {
  const f = e.target.files?.[0]; if (!f) return;
  if (f.size > 1_500_000) return toast("warn", "Too large", "Max 1.5MB");
  const reader = new FileReader();
  reader.onload = () => { pendingTeamPhoto = reader.result; const prev = $("tmPhotoPreview"); prev.src = pendingTeamPhoto; prev.classList.remove("hidden"); };
  reader.readAsDataURL(f);
}
async function saveTeamMember() {
  if (user?.role !== "admin") return;
  const name = $("tmName").value.trim(), role = $("tmRole").value.trim();
  if (!name || !role) return toast("warn", "Missing", "Name and role required");
  const body = { name, role, badge: $("tmBadge").value, desc: $("tmDesc").value.trim(), facebook: $("tmFacebook").value.trim(), github: $("tmGithub").value.trim(), email: $("tmEmail").value.trim(), order: parseInt($("tmOrder").value) || 0 };
  if (pendingTeamPhoto) body.photo = pendingTeamPhoto;
  try {
    if (editingTeamId) { await api("/api/team/" + editingTeamId, { method: "PUT", body: JSON.stringify(body) }); toast("success", "Updated", ""); }
    else { await api("/api/team", { method: "POST", body: JSON.stringify(body) }); toast("success", "Added", ""); }
    closeTeamModal(); await loadTeam();
    if ($("adminTeamList")) loadAdminTeam();
  } catch (e) { toast("danger", "Error", e.message); }
}
async function deleteTeamMember(id, name) {
  if (user?.role !== "admin") return;
  if (!confirm(`Delete "${name}"?`)) return;
  try { await api("/api/team/" + id, { method: "DELETE" }); toast("", "Deleted", ""); await loadTeam(); if ($("adminTeamList")) loadAdminTeam(); }
  catch (e) { toast("danger", "Error", e.message); }
}
async function loadAdminTeam() {
  const c = $("adminTeamList"); if (!c) return;
  try {
    const data = await api("/api/team");
    const list = data.members || [];
    if (!list.length) { c.innerHTML = `<p class="muted">No team members yet.</p>`; return; }
    c.innerHTML = list.map(m => `<div style="display:flex; gap:12px; align-items:center; padding:10px; border-bottom:1px solid var(--border);">${m.photo ? `<img src="${esc(m.photo)}" style="width:42px; height:42px; border-radius:50%; object-fit:cover; border:2px solid var(--primary);">` : `<div style="width:42px; height:42px; border-radius:50%; background:linear-gradient(135deg, var(--primary), var(--primary2)); display:flex; align-items:center; justify-content:center; color:white;"><i class="fas fa-user"></i></div>`}<div style="flex:1;"><div style="font-weight:700;">${esc(m.name)}</div><div class="muted" style="font-size:.8rem;">${esc(m.role)}</div></div><button class="iconbtn" onclick="openTeamModal('${jsId(m._id)}')"><i class="fas fa-pen"></i></button><button class="iconbtn" style="color:var(--danger);" onclick="deleteTeamMember('${jsId(m._id)}','${jsId(m.name)}')"><i class="fas fa-trash"></i></button></div>`).join("");
  } catch (e) { c.innerHTML = `<p class="muted">Failed to load team.</p>`; }
}

async function loadAdminQA() {
  const c = $("adminQAList"); if (!c) return;
  c.innerHTML = `<p class="muted">Loading...</p>`;
  try {
    const data = await api("/api/admin/chatbot/qa");
    let list = data.qa || [];
    const search = $("qaSearch")?.value.trim().toLowerCase() || "";
    const catFilter = $("qaCategoryFilter")?.value || "";
    if (search) list = list.filter(item => (item.answer || "").toLowerCase().includes(search) || (item.keywords || []).some(k => k.toLowerCase().includes(search)));
    if (catFilter) list = list.filter(item => item.category === catFilter);
    if (!list.length) { c.innerHTML = `<div class="empty"><i class="fas fa-robot"></i><p>No answers yet.</p></div>`; return; }
    c.innerHTML = list.map(item => `<div style="display:flex; gap:12px; align-items:flex-start; padding:12px; border-bottom:1px solid var(--border);"><div style="flex:1;"><div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px;"><span class="chip green"><i class="fas fa-tag"></i> ${esc(item.category || "General")}</span>${item.isActive ? `<span class="chip"><i class="fas fa-circle-check"></i> Active</span>` : `<span class="chip warn"><i class="fas fa-circle-pause"></i> Inactive</span>`}<span class="chip"><i class="fas fa-sort"></i> Order ${item.order || 0}</span></div><div style="font-weight:700; margin-bottom:4px;">Keywords:</div><div class="chips" style="margin-bottom:8px;">${(item.keywords || []).map(k => `<span class="chip">${esc(k)}</span>`).join("")}</div><div style="font-weight:700; margin-bottom:4px;">Answer:</div><div class="muted" style="font-size:.85rem; line-height:1.5; white-space:pre-wrap;">${esc((item.answer || "").slice(0, 300))}${(item.answer || "").length > 300 ? "..." : ""}</div></div><div style="display:flex; flex-direction:column; gap:6px;"><button class="iconbtn" onclick="editQA('${jsId(item._id)}')"><i class="fas fa-pen"></i></button><button class="iconbtn" style="color:var(--danger);" onclick="deleteQA('${jsId(item._id)}')"><i class="fas fa-trash"></i></button><button class="iconbtn" onclick="toggleQA('${jsId(item._id)}', ${!item.isActive})"><i class="fas fa-${item.isActive ? 'pause' : 'play'}"></i></button></div></div>`).join("");
  } catch (e) { c.innerHTML = `<p class="muted">Failed to load: ${esc(e.message)}</p>`; }
}

function openQAModal() {
  editingQAId = null;
  $("qaModalTitle").innerHTML = `<i class="fas fa-robot"></i> Add Chatbot Answer`;
  $("qaKeywords").value = ""; $("qaAnswer").value = ""; $("qaCategory").value = "General";
  $("qaOrder").value = "0"; $("qaActive").checked = true;
  $("qaBackdrop").style.display = "flex";
}
function closeQAModal() { $("qaBackdrop").style.display = "none"; editingQAId = null; }
async function editQA(id) {
  try {
    const data = await api("/api/admin/chatbot/qa");
    const item = (data.qa || []).find(q => sameId(q._id, id));
    if (!item) return toast("danger", "Error", "Not found");
    editingQAId = id;
    $("qaModalTitle").innerHTML = `<i class="fas fa-robot"></i> Edit Chatbot Answer`;
    $("qaKeywords").value = (item.keywords || []).join(", ");
    $("qaAnswer").value = item.answer || "";
    $("qaCategory").value = item.category || "General";
    $("qaOrder").value = item.order || 0;
    $("qaActive").checked = item.isActive !== false;
    $("qaBackdrop").style.display = "flex";
  } catch (e) { toast("danger", "Error", e.message); }
}
async function saveQA() {
  const keywordsRaw = $("qaKeywords").value.trim();
  const answer = $("qaAnswer").value.trim();
  if (!keywordsRaw) return toast("warn", "Missing", "Enter at least one keyword");
  if (!answer) return toast("warn", "Missing", "Enter the answer");
  const keywords = keywordsRaw.split(",").map(k => k.trim().toLowerCase()).filter(Boolean);
  const body = { keywords, answer, category: $("qaCategory").value, order: parseInt($("qaOrder").value) || 0, isActive: $("qaActive").checked };
  try {
    if (editingQAId) { await api("/api/admin/chatbot/qa/" + editingQAId, { method: "PUT", body: JSON.stringify(body) }); toast("success", "Updated", ""); }
    else { await api("/api/admin/chatbot/qa", { method: "POST", body: JSON.stringify(body) }); toast("success", "Created", ""); }
    closeQAModal(); loadAdminQA(); loadChatbotQA();
  } catch (e) { toast("danger", "Error", e.message); }
}
async function deleteQA(id) {
  if (!confirm("Delete this answer?")) return;
  try { await api("/api/admin/chatbot/qa/" + id, { method: "DELETE" }); toast("", "Deleted", ""); loadAdminQA(); loadChatbotQA(); }
  catch (e) { toast("danger", "Error", e.message); }
}
async function toggleQA(id, isActive) {
  try { await api("/api/admin/chatbot/qa/" + id, { method: "PUT", body: JSON.stringify({ isActive }) }); loadAdminQA(); loadChatbotQA(); }
  catch (e) { toast("danger", "Error", e.message); }
}

async function loadChatbotQA() {
  try { SPH_KB = (await api("/api/chatbot/qa")).qa || []; }
  catch { SPH_KB = []; }
}
function sphMatch(question) {
  const q = String(question || "").toLowerCase().trim();
  if (!q || !SPH_KB.length) return null;
  let best = null, bestScore = 0;
  for (const entry of SPH_KB) {
    let score = 0;
    for (const kw of (entry.keywords || [])) if (q.includes(kw.toLowerCase())) score += kw.split(" ").length;
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  return bestScore > 0 ? best.answer : null;
}
function sphFormat(text) { return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>"); }
function sphAppendMessage(text, sender) {
  const box = $("sphChatMessages"); if (!box) return;
  const wrap = document.createElement("div");
  wrap.className = "sph-msg " + (sender === "user" ? "sph-msg-user" : "sph-msg-bot");
  const bubble = document.createElement("div");
  bubble.className = "sph-msg-bubble";
  bubble.innerHTML = sphFormat(text);
  wrap.appendChild(bubble);
  box.appendChild(wrap);
  box.scrollTop = box.scrollHeight;
}
function sphShowTyping() {
  const box = $("sphChatMessages"); if (!box) return;
  const el = document.createElement("div");
  el.className = "sph-msg sph-msg-bot"; el.id = "sphTypingIndicator";
  el.innerHTML = `<div class="sph-typing"><span></span><span></span><span></span></div>`;
  box.appendChild(el); box.scrollTop = box.scrollHeight;
}
function sphHideTyping() { $("sphTypingIndicator")?.remove(); }
function sphSendMessage() {
  const input = $("sphChatInput"); if (!input) return;
  const text = input.value.trim(); if (!text) return;
  input.value = ""; $("sphChatSuggestions")?.remove();
  sphAppendMessage(text, "user"); sphShowTyping();
  setTimeout(() => {
    sphHideTyping();
    const answer = sphMatch(text);
    sphAppendMessage(answer || "Sorry, I don't have an answer for that yet. 😅\n\nTry asking about:\n• Signing up or logging in\n• Joining or creating projects\n• Submissions or grades\n• Chat, friends, or classes\n• Class announcements\n• System updates\n• Password reset via Telegram", "bot");
  }, 500);
}
function sphQuickAsk(question) {
  $("sphChatSuggestions")?.remove();
  sphAppendMessage(question, "user"); sphShowTyping();
  setTimeout(() => { sphHideTyping(); sphAppendMessage(sphMatch(question) || "Sorry, I don't have an answer for that.", "bot"); }, 500);
}
async function toggleSphChat() {
  const win = $("sphChatWindow"); if (!win) return;
  win.classList.toggle("open");
  $("sphChatUnread")?.classList.add("hidden");
  if (win.classList.contains("open")) { await loadChatbotQA(); setTimeout(() => $("sphChatInput")?.focus(), 200); }
}

document.addEventListener("click", (e) => {
  if (e.target.id === "aboutBackdrop") closeAbout();
  if (e.target.id === "teamBackdrop") closeTeamModal();
  if (e.target.id === "mediaBackdrop") closeMediaModal();
  if (e.target.id === "inviteBackdrop") closeInviteModal();
  if (e.target.id === "forgotBackdrop") closeForgotPassword();
  if (e.target.id === "applyBackdrop") closeApplyModal();
  if (e.target.id === "classBackdrop") closeClassModal();
  if (e.target.id === "qaBackdrop") closeQAModal();
  if (e.target.id === "courseBackdrop") closeCourseModal();
  if (e.target.id === "gradeSubmissionBackdrop") closeGradeSubmissionModal();
  if (e.target.id === "enrollBackdrop") closeEnrollModal();
  if (e.target.id === "userBackdrop") closeUserModal();
  if (e.target.id === "annBackdrop") closeAnnouncementModal();
});

(async () => {
  try {
    const r = await fetch("/api/subjects");
    if (r.ok) { const d = await r.json(); ALL_SUBJECTS = d.subjects; renderSubjectCheckboxes("subjectCheckboxes", []); }
  } catch {}
  if (token && user) initApp();
})();
