const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.length === 0) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
  credentials: false
}));

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());
app.use(morgan("tiny"));
app.use(express.json({ limit: "25mb" }));
app.use(express.static(path.join(__dirname, "public")));

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in 10 minutes." }
});
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many signup attempts. Try again later." }
});
const forgotLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many reset requests. Try again in 10 minutes." }
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests." }
});
app.use("/api/", apiLimiter);

const MONGO_URL = process.env.MONGODB_URI;
if (!MONGO_URL) { console.error("❌ MONGODB_URI missing"); process.exit(1); }
mongoose.connect(MONGO_URL)
  .then(async () => {
    console.log("✅ DB Connected:", mongoose.connection.name);
    await seedAdmin();
    await seedChatbotQA();
    await backfillClassIds();
    startCleanupTimers();
  })
  .catch(err => { console.error("❌ Mongo error:", err.message); process.exit(1); });

const SUBJECTS = [
  "Life and Works of Rizal",
  "Information Management (Including Fundamentals of Database System)",
  "Object Oriented Programming",
  "Data Structures and Algorithms",
  "Science, Technology and Society",
  "IT Project Management",
  "Networking 1",
  "Student Success Program 1"
];

let globalMaintenance = false;

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["student", "teacher", "admin"], required: true },
  bio: { type: String, default: "" },
  avatar: { type: String, default: null },
  banner: { type: String, default: null },
  subjects: [{ type: String }],
  course: { type: String, default: "" },
  yearLevel: { type: String, default: "" },
  section: { type: String, default: "" },
  studentId: { type: String, default: "" },
  school: { type: String, default: "" },
  birthday: { type: String, default: "" },
  gender: { type: String, default: "" },
  address: { type: String, default: "" },
  contactNumber: { type: String, default: "" },
  phone: { type: String, default: "" },
  guardianName: { type: String, default: "" },
  guardianContact: { type: String, default: "" },
  hobbies: [{ type: String }],
  skills: [{ type: String }],
  telegramChatId: { type: String, default: "" },
  isActive: { type: Boolean, default: true },
  isEnrolled: { type: Boolean, default: false },
  classIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Class" }],
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  enrolledAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: "" },
  subject: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  pendingMembers: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
    requestedAt: { type: Date, default: Date.now }
  }],
  classes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Class" }],
  isOpen: { type: Boolean, default: true },
  status: { type: String, enum: ["planning", "in_progress", "review", "completed", "graded", "returned"], default: "planning" },
  deadline: { type: String, default: "" },
  moduleTitle: { type: String, default: "" },
  moduleImage: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const submissionSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  fileName: { type: String, required: true },
  fileSize: { type: Number, default: 0 },
  fileType: { type: String, default: "" },
  mediaKind: { type: String, enum: ["file", "image", "video"], default: "file" },
  dataUrl: { type: String, required: true },
  note: { type: String, default: "" },
  version: { type: Number, default: 1 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  grade: { type: Number, default: null, min: 0, max: 100 },
  feedback: { type: String, default: "" },
  gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  gradedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

const commentSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const teamMemberSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, required: true },
  badge: { type: String, enum: ["developer", "student", "teacher", "admin", ""], default: "" },
  desc: { type: String, default: "" },
  photo: { type: String, default: null },
  facebook: { type: String, default: "" },
  github: { type: String, default: "" },
  email: { type: String, default: "" },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, default: "" },
  image: { type: String, default: null },
  read: { type: Boolean, default: false },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

const courseChatSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, default: "" },
  image: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, required: true },
  text: { type: String, required: true },
  link: { type: String, default: "" },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const classSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  course: { type: String, default: "" },
  yearLevel: { type: String, default: "" },
  section: { type: String, default: "" },
  description: { type: String, default: "" },
  teacherIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now }
});

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  body: { type: String, required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  pinned: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const chatbotQASchema = new mongoose.Schema({
  keywords: [{ type: String, required: true }],
  answer: { type: String, required: true },
  category: { type: String, default: "General" },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
const Course = mongoose.model("Course", courseSchema);
const Submission = mongoose.model("Submission", submissionSchema);
const Comment = mongoose.model("Comment", commentSchema);
const TeamMember = mongoose.model("TeamMember", teamMemberSchema);
const Message = mongoose.model("Message", messageSchema);
const CourseChat = mongoose.model("CourseChat", courseChatSchema);
const Notification = mongoose.model("Notification", notificationSchema);
const ClassModel = mongoose.model("Class", classSchema);
const Announcement = mongoose.model("Announcement", announcementSchema);
const ChatbotQA = mongoose.model("ChatbotQA", chatbotQASchema);

const resetOtpStore = new Map();
const resetRateLimit = new Map();

function startCleanupTimers() {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of resetOtpStore) if (v.expiresAt < now) resetOtpStore.delete(k);
    for (const [k, v] of resetRateLimit) if (v.resetAt < now) resetRateLimit.delete(k);
  }, 5 * 60 * 1000).unref();
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(String(id));
}

function safeStr(v, fallback = "") {
  return typeof v === "string" ? v : fallback;
}

async function sendTelegram(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return { ok: false, error: "Telegram not configured" };
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.description || "Telegram error" };
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

function normalizePhone(p) { return String(p || "").replace(/[\s\-()]/g, ""); }

async function seedAdmin() {
  try {
    const email = process.env.ADMIN_EMAIL;
    const pass = process.env.ADMIN_PASSWORD;
    if (!email || !pass) return;
    const exists = await User.findOne({ email });
    if (exists) {
      let changed = false;
      if (!exists.telegramChatId && process.env.TELEGRAM_ADMIN_CHAT_ID) {
        exists.telegramChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
        changed = true;
      }
      if (exists.role !== "admin") { exists.role = "admin"; changed = true; }
      if (!exists.isEnrolled) { exists.isEnrolled = true; changed = true; }
      if (changed) await exists.save();
      return;
    }
    const passwordHash = await bcrypt.hash(pass, 10);
    await User.create({
      fullName: "System Administrator",
      email, passwordHash, role: "admin",
      subjects: SUBJECTS,
      isEnrolled: true,
      telegramChatId: process.env.TELEGRAM_ADMIN_CHAT_ID || ""
    });
    console.log("👑 Admin seeded:", email);
  } catch (e) { console.error("Admin seed error:", e.message); }
}

async function syncClassMembers(classId) {
  try {
    const cls = await ClassModel.findById(classId);
    if (!cls) return;
    const memberIds = [...cls.teacherIds, ...cls.studentIds].map(x => x.toString());
    await User.updateMany({ classIds: classId, _id: { $nin: memberIds } }, { $pull: { classIds: classId } });
    if (memberIds.length) {
      await User.updateMany({ _id: { $in: memberIds } }, { $addToSet: { classIds: classId } });
    }
  } catch (e) { console.error("syncClassMembers error:", e.message); }
}

async function backfillClassIds() {
  try {
    const classes = await ClassModel.find();
    for (const cls of classes) await syncClassMembers(cls._id);
    if (classes.length) console.log(`🔄 Backfilled classIds for ${classes.length} class(es)`);
  } catch (e) { console.error("Backfill error:", e.message); }
}

async function seedChatbotQA() {
  try {
    const defaults = [
      { keywords: ["what is", "about student project hub", "this app", "this site", "tell me about"], answer: "Student Project Hub is a collaborative academic platform where teachers create projects, students enroll and submit work, and admins manage everything — all in one place.", category: "General", order: 1 },
      { keywords: ["who created", "who made", "creator", "developer", "who built", "archie"], answer: "Student Project Hub was created by Archie Jhon Gregorio — the lead developer who architected and built the entire platform. You can reach him at archiejohn990@gmail.com.", category: "About", order: 2 },
      { keywords: ["sign up", "signup", "register", "create account", "new account"], answer: "To sign up:\n1. Open the login page\n2. Click 'Sign Up'\n3. Fill in your full name, email, password (6+ characters), and phone number\n4. Select Student or Teacher\n5. Check 'I'm not a robot'\n6. Click 'Create Account'\n\nNote: Students must be pre-enrolled by the admin first — use the Student ID given to you.", category: "Auth", order: 3 },
      { keywords: ["login", "log in", "sign in", "cant login", "can't login"], answer: "To log in:\n1. Enter your email and password\n2. Check 'I'm not a robot'\n3. Click Login\n\nIf you forgot your password, click 'Forgot password?' to reset it via Telegram.\n\nAdmins: use the Admin button at the top-right to open the Admin Portal.", category: "Auth", order: 4 },
      { keywords: ["admin login", "admin portal", "admin tab", "admin button"], answer: "Admins log in using the separate 'Admin' button at the top-right of the login page. Click it to open the red Admin Portal. Admin accounts cannot log in through the student/teacher login.", category: "Auth", order: 5 },
      { keywords: ["forgot password", "reset password", "forgot my password", "cant login forgot"], answer: "To reset your password:\n1. On the login page, click 'Forgot password?'\n2. Enter your email AND phone number\n3. Click 'Send Code to Telegram'\n4. Check Telegram for a 6-digit code\n5. Enter the code + new password\n6. Log in with your new password", category: "Auth", order: 6 },
      { keywords: ["telegram", "link telegram", "no telegram", "telegram chat id", "chat id"], answer: "To link Telegram (needed for password reset):\n1. On Telegram, message @userinfobot — it replies with your Chat ID\n2. Search @StudentProjectHubBot and press START\n3. Log in → Profile → Telegram Recovery\n4. Paste your Chat ID → Save\n5. Click 'Send Test Message' to verify", category: "Auth", order: 7 },
      { keywords: ["join project", "how to join", "apply to join", "application", "apply"], answer: "To join a project (Students):\n• Your teacher may auto-enroll you, OR\n• Go to 'Browse Open' in the sidebar\n• Click any open project → 'Apply to Join'\n• Wait for the teacher to accept your application", category: "Projects", order: 8 },
      { keywords: ["create project", "new project", "make project", "add project"], answer: "Only teachers can create projects:\n1. Go to 'My Projects' in the sidebar\n2. Click 'New Project'\n3. Fill in title, description, subject, deadline\n4. Select which classes get auto-enrolled\n5. Click Save\n\nAll students in those classes are added automatically.", category: "Projects", order: 9 },
      { keywords: ["submit", "submission", "upload", "file", "submit project"], answer: "To submit a file:\n1. Open the project\n2. Click the 'Files' tab\n3. Click 'New Submission'\n4. Choose Photo, Video, or File (max 15 MB)\n5. Add an optional note\n6. Click Upload\n\nOnly you and the teacher can see your submission.", category: "Projects", order: 10 },
      { keywords: ["deadline", "due date", "late submission", "cannot submit"], answer: "Each project has a deadline. Once it passes, students can no longer submit files. Teachers can still view submissions for grading.", category: "Projects", order: 11 },
      { keywords: ["module", "module picture", "module image", "module title"], answer: "Teachers can attach a module picture and module title to each project. It appears at the top of the project page so students can see the learning module right away.", category: "Projects", order: 12 },
      { keywords: ["chat", "message", "talk to", "send message"], answer: "You can chat:\n• With friends (add them first)\n• With teachers of your subjects\n• In project group chat (members only)\n\nYou can send text, photos, and delete your own messages.", category: "Chat", order: 13 },
      { keywords: ["friend", "friends", "add friend", "unfriend", "friend request"], answer: "To add a friend:\n1. Go to 'People' in the sidebar\n2. Search by name\n3. Click 'Add' on their card\n4. Wait for them to accept\n\nOr go to Friends → enter their email directly.", category: "Friends", order: 14 },
      { keywords: ["profile", "edit profile", "my info", "bio", "photo", "avatar", "banner"], answer: "In your Profile you can:\n• Change your photo and banner\n• Edit bio, course, year, section\n• Add hobbies and skills\n• Save your phone number (for password reset)\n• Change your password\n\nClick 'Save Profile' when done.", category: "Profile", order: 15 },
      { keywords: ["class", "classes", "my class", "section"], answer: "Classes group students and teachers together (e.g., BSIT-3A).\n• Admins create classes and assign students + teachers\n• Teachers see only their own class's students\n• Students see all their classes", category: "Classes", order: 16 },
      { keywords: ["announcement", "announce", "notice", "class notice"], answer: "Teachers can post announcements to any class they teach. Go to Classes → click a class → New Announcement. Students in that class will get notified and see it on their dashboard.", category: "Classes", order: 17 },
      { keywords: ["grade", "graded", "grading", "score", "marks"], answer: "Teachers grade each submission individually (0-100) with written feedback. You'll only see YOUR grade — your classmates can't see it, and you can't see theirs.", category: "Projects", order: 18 },
      { keywords: ["who submitted", "submitted", "progress", "who done", "completed"], answer: "Teachers can see submission progress in the project's Members tab. Each student shows either 'Submitted' (with a count) or 'Not yet submitted', plus their latest grade and date.", category: "Projects", order: 19 },
      { keywords: ["notification", "notifications", "bell"], answer: "You get notified about:\n• Project invites and acceptances\n• Submissions and grades\n• Friend requests\n• New messages\n• Class announcements\n\nClick the bell icon at the top-right to see them.", category: "General", order: 20 },
      { keywords: ["admin", "admin panel", "manage users", "delete user", "add user"], answer: "Admins can:\n• Add / edit / delete users\n• Enroll students (with an editable enrolled date)\n• Create and manage classes\n• Monitor all projects (read-only)\n• Manage team members (About page)\n• Manage chatbot answers\n• Turn on 'Maintenance Mode' to lock out non-admins\n• Use 'View As' to preview the app as Teacher or Student", category: "Admin", order: 21 },
      { keywords: ["view as", "view as teacher", "view as student", "preview"], answer: "Admins can use the 'View As' dropdown in the topbar to preview the app as a Teacher or Student. This only changes the UI — you stay logged in as admin.", category: "Admin", order: 22 },
      { keywords: ["maintenance", "maintenance mode", "under maintenance"], answer: "Admins can enable Maintenance Mode from the Admin Panel. When ON, only admins can access the app — students and teachers see a 'We'll Be Right Back' screen. Turn it off to let everyone back in.", category: "Admin", order: 23 },
      { keywords: ["enroll", "enroll student", "enrolled", "enrollment"], answer: "Admins enroll students via Admin Panel → 'Enroll Student'. The admin enters the student's name, email, Student ID, and can set/edit the enrolled date. Students then sign up using that Student ID + email to claim the account.", category: "Admin", order: 24 },
      { keywords: ["teacher", "teachers", "mentor", "professor"], answer: "Teachers create projects, review submissions, grade each student individually, announce to their classes, and track who has submitted. They only see projects in subjects they teach.", category: "General", order: 25 },
      { keywords: ["student", "students"], answer: "Students join projects (auto-enrolled or by applying), submit files, chat with classmates and teachers, view their own grades, and read class announcements.", category: "General", order: 26 },
      { keywords: ["delete account", "close account", "remove account"], answer: "I don't handle account deletion. Please contact your admin directly for account removal.", category: "General", order: 27 },
      { keywords: ["change password", "new password"], answer: "To change your password (while logged in):\n1. Go to Profile\n2. Scroll to 'Change Password'\n3. Enter current password + new password (6+ characters)\n4. Click Save", category: "Auth", order: 28 },
      { keywords: ["browse", "browse open", "open project"], answer: "'Browse Open' shows projects created by teachers that are accepting new members. Click a project to see details, then click 'Apply to Join'.", category: "Projects", order: 29 },
      { keywords: ["phone", "phone number", "mobile"], answer: "Your phone number is required for password reset via Telegram. It must match exactly what you enter in the reset form. Format: +639171234567\n\nAdd it in Profile → Phone Number → Save.", category: "Profile", order: 30 },
      { keywords: ["help", "support", "contact", "cant find", "can't find"], answer: "I can help with most questions about Student Project Hub. Try asking about:\n• Signing up or logging in\n• Joining or creating projects\n• Submissions or grades\n• Chat, friends, or classes\n• Class announcements\n• Password reset via Telegram\n• Enrolling students (admins)\n\nIf I can't answer, contact your admin.", category: "General", order: 31 },
      { keywords: ["thank", "thanks", "ty", "salamat"], answer: "You're welcome! 😊 Ask me anything else about Student Project Hub.", category: "General", order: 32 },
      { keywords: ["hi", "hello", "hey", "kumusta", "kamusta"], answer: "Hi there! 👋 How can I help you with Student Project Hub today?", category: "General", order: 33 }
    ];
    let added = 0;
    for (const d of defaults) {
      const exists = await ChatbotQA.findOne({ keywords: d.keywords[0] });
      if (!exists) { await ChatbotQA.create(d); added++; }
    }
    if (added) console.log(`🤖 Seeded ${added} new chatbot answers`);
  } catch (e) { console.error("Chatbot seed error:", e.message); }
}

const auth = async (req, res, next) => {
  const h = req.headers["authorization"];
  const token = h && h.startsWith("Bearer ") ? h.split(" ")[1] : null;
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    const u = await User.findById(req.userId).populate("classIds", "name");
    if (!u || !u.isActive) return res.status(403).json({ error: "Account inactive" });
    req.user = u;
    next();
  } catch { res.status(403).json({ error: "Invalid token" }); }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Access denied" });
  next();
};

const validId = (param) => (req, res, next) => {
  if (!isValidObjectId(req.params[param])) return res.status(400).json({ error: "Invalid id" });
  next();
};

async function canAccessCourse(user, courseId) {
  const course = await Course.findById(courseId);
  if (!course) return { ok: false, course: null, reason: "Not found" };
  if (user.role === "admin") return { ok: true, course, relation: "admin" };

  if (user.role === "teacher") {
    if (course.owner.toString() === user._id.toString()) return { ok: true, course, relation: "owner" };
    const classesAsTeacher = await ClassModel.find({
      _id: { $in: course.classes || [] }, teacherIds: user._id
    }).select("_id");
    if (classesAsTeacher.length > 0) return { ok: true, course, relation: "teacher" };
  }

  if (user.role === "student") {
    const isMember = course.members.map(m => m.toString()).includes(user._id.toString());
    if (isMember) return { ok: true, course, relation: "member" };
    if (course.isOpen) {
      const myClasses = (user.classIds || []).map(c => (c._id || c).toString());
      const projectClasses = (course.classes || []).map(c => c.toString());
      if (projectClasses.length === 0 || projectClasses.some(c => myClasses.includes(c))) {
        return { ok: true, course, relation: "applicant" };
      }
    }
  }
  return { ok: false, course, reason: "Access denied" };
}

async function notify(userId, type, text, link = "") {
  try { await Notification.create({ user: userId, type, text, link }); } catch (e) {}
}

app.get("/api/maintenance/status", (req, res) => res.json({ success: true, maintenance: globalMaintenance }));
app.post("/api/admin/maintenance", auth, requireRole("admin"), (req, res) => {
  globalMaintenance = !!req.body.maintenance;
  console.log(`🛠️ Maintenance mode: ${globalMaintenance ? "ON" : "OFF"}`);
  res.json({ success: true, maintenance: globalMaintenance });
});

app.post("/api/signup", signupLimiter, async (req, res) => {
  try {
    const { fullName, password, role } = req.body;
    const email = safeStr(req.body.email).toLowerCase();
    const subjects = Array.isArray(req.body.subjects) ? req.body.subjects : [];
    const course = safeStr(req.body.course);
    const yearLevel = safeStr(req.body.yearLevel);
    const phone = safeStr(req.body.phone);
    const studentId = safeStr(req.body.studentId).trim();

    if (!fullName || !email || !password || !role) return res.status(400).json({ error: "All fields required" });
    if (!["student", "teacher"].includes(role)) return res.status(400).json({ error: "Invalid role" });
    if (typeof password !== "string" || password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
    if (phone && !/^\+?[0-9]{10,15}$/.test(phone)) return res.status(400).json({ error: "Invalid phone format. Use +639171234567" });
    if (role === "teacher" && (!subjects.length || subjects.some(s => !SUBJECTS.includes(s)))) {
      return res.status(400).json({ error: "Invalid subjects" });
    }

    if (role === "student") {
      if (!studentId) return res.status(400).json({ error: "Student ID is required", needsStudentId: true });
      const enrolled = await User.findOne({ role: "student", studentId, email });
      if (!enrolled) return res.status(400).json({ error: "You are not enrolled. Please contact the admin to enroll you first.", notEnrolled: true });
      if (enrolled.isEnrolled) return res.status(400).json({ error: "This account is already registered. Try logging in." });

      const passwordHash = await bcrypt.hash(password, 10);
      enrolled.fullName = fullName;
      enrolled.passwordHash = passwordHash;
      enrolled.phone = phone || enrolled.phone || "";
      enrolled.course = course || enrolled.course || "";
      enrolled.yearLevel = yearLevel || enrolled.yearLevel || "";
      enrolled.isEnrolled = true;
      enrolled.isActive = true;
      await enrolled.save();
      const token = jwt.sign({ userId: enrolled._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
      return res.json({ success: true, token, user: {
        id: enrolled._id, fullName: enrolled.fullName, email: enrolled.email, role: enrolled.role,
        subjects: enrolled.subjects, avatar: enrolled.avatar, phone: enrolled.phone,
        course: enrolled.course, yearLevel: enrolled.yearLevel, classIds: enrolled.classIds || []
      }});
    }

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: "Email already registered" });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      fullName, email, passwordHash, role,
      phone: phone || "",
      subjects: role === "teacher" ? subjects : [],
      course: course || "", yearLevel: yearLevel || "", isEnrolled: true
    });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user: {
      id: user._id, fullName, email: user.email, role: user.role,
      subjects: user.subjects, avatar: user.avatar, phone: user.phone,
      course: user.course, yearLevel: user.yearLevel, classIds: user.classIds || []
    }});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/login", loginLimiter, async (req, res) => {
  try {
    const email = safeStr(req.body.email).toLowerCase();
    const password = safeStr(req.body.password);
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const u = await User.findOne({ email }).populate("classIds", "name");
    if (!u) return res.status(401).json({ error: "Invalid credentials" });
    if (!u.isActive) return res.status(403).json({ error: "Account deactivated. Contact admin." });
    if (u.role === "student" && !u.isEnrolled) return res.status(403).json({ error: "Account not yet registered. Please complete signup with your Student ID." });
    const ok = await bcrypt.compare(password, u.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ userId: u._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user: {
      id: u._id, fullName: u.fullName, email: u.email, role: u.role,
      subjects: u.subjects, avatar: u.avatar, banner: u.banner,
      course: u.course, yearLevel: u.yearLevel, bio: u.bio,
      school: u.school, section: u.section, studentId: u.studentId,
      birthday: u.birthday, gender: u.gender,
      address: u.address, contactNumber: u.contactNumber, phone: u.phone,
      guardianName: u.guardianName, guardianContact: u.guardianContact,
      hobbies: u.hobbies, skills: u.skills, telegramChatId: u.telegramChatId,
      classIds: u.classIds || []
    }});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/me", auth, async (req, res) => {
  const u = await User.findById(req.userId).select("-passwordHash").populate("classIds", "name");
  res.json({ success: true, user: u });
});

app.put("/api/me", auth, async (req, res) => {
  try {
    const allowed = ["fullName","bio","avatar","banner","course","yearLevel","section","studentId","school","birthday","gender","address","contactNumber","phone","guardianName","guardianContact","hobbies","skills","telegramChatId"];
    const update = {};
    for (const key of allowed) if (req.body[key] !== undefined) update[key] = req.body[key];
    if (req.body.subjects !== undefined && req.user.role === "teacher") update.subjects = req.body.subjects;
    if (update.phone) {
      update.phone = String(update.phone).trim();
      if (update.phone && !/^\+?[0-9]{10,15}$/.test(update.phone)) return res.status(400).json({ error: "Invalid phone format. Use +639171234567" });
    }
    if (update.telegramChatId !== undefined) {
      const cleaned = String(update.telegramChatId || "").trim();
      if (cleaned && !/^-?\d+$/.test(cleaned)) return res.status(400).json({ error: "Telegram Chat ID must be a number" });
      update.telegramChatId = cleaned;
    }
    const u = await User.findByIdAndUpdate(req.userId, update, { new: true }).select("-passwordHash").populate("classIds", "name");
    res.json({ success: true, user: u });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/me/password", auth, async (req, res) => {
  try {
    const currentPassword = safeStr(req.body.currentPassword);
    const newPassword = safeStr(req.body.newPassword);
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "Min 6 characters" });
    const u = await User.findById(req.userId);
    const ok = await bcrypt.compare(currentPassword, u.passwordHash);
    if (!ok) return res.status(401).json({ error: "Current password incorrect" });
    u.passwordHash = await bcrypt.hash(newPassword, 10);
    await u.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/users/:id/profile", auth, validId("id"), async (req, res) => {
  try {
    const targetId = req.params.id;
    const isSelf = targetId === req.userId;
    const isAdmin = req.user.role === "admin";

    if (isSelf) {
      const me = await User.findById(req.userId).select("-passwordHash");
      const myCourses = await Course.find({ members: req.userId }).select("title subject status").limit(10);
      return res.json({ success: true, user: me, courses: myCourses, relation: "self",
        stats: { courses: myCourses.length, friends: (me.friends || []).length } });
    }

    const selectFields = isAdmin
      ? "fullName avatar banner role bio course yearLevel section school studentId birthday gender address hobbies skills email phone telegramChatId friends"
      : "fullName avatar banner role bio course yearLevel section school studentId birthday gender address hobbies skills friends";

    const target = await User.findById(targetId).select(selectFields);
    if (!target) return res.status(404).json({ error: "User not found" });

    const isFriend = (req.user.friends || []).map(f => f.toString()).includes(targetId);
    const courses = await Course.find({ members: target._id }).select("title subject status deadline").limit(10);

    const responseUser = {
      _id: target._id, fullName: target.fullName, avatar: target.avatar, banner: target.banner,
      role: target.role, bio: target.bio || "",
      school: target.school || "", course: target.course || "",
      yearLevel: target.yearLevel || "", section: target.section || "", studentId: target.studentId || "",
      birthday: target.birthday || "", gender: target.gender || "", address: target.address || "",
      hobbies: target.hobbies || [], skills: target.skills || [],
      ...(isAdmin ? { email: target.email, phone: target.phone, telegramChatId: target.telegramChatId } : {})
    };

    res.json({ success: true, user: responseUser, courses,
      relation: isFriend ? "friend" : "stranger",
      stats: { courses: courses.length, friends: (target.friends || []).length } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/me/test-telegram", auth, async (req, res) => {
  try {
    const chatId = safeStr(req.body.chatId).trim();
    if (!chatId) return res.status(400).json({ error: "Chat ID required" });
    const text = `👋 <b>Hello from Student Project Hub!</b>\n\n✅ Your Telegram is correctly linked to <b>${req.user.fullName}</b>.`;
    const result = await sendTelegram(chatId, text);
    if (!result.ok) return res.status(400).json({ error: result.error || "Failed to send" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/me/telegram", auth, async (req, res) => {
  try { await User.findByIdAndUpdate(req.userId, { telegramChatId: "" }); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/config", (req, res) => res.json({ success: true, botUsername: process.env.TELEGRAM_BOT_USERNAME || "" }));

app.post("/api/forgot/telegram/request", forgotLimiter, async (req, res) => {
  try {
    const email = safeStr(req.body.email).toLowerCase();
    const phone = safeStr(req.body.phone);
    if (!email || !phone) return res.status(400).json({ error: "Email and phone required" });
    const key = email;
    const now = Date.now();
    const rl = resetRateLimit.get(key) || { count: 0, resetAt: now + 10 * 60 * 1000 };
    if (now > rl.resetAt) { rl.count = 0; rl.resetAt = now + 10 * 60 * 1000; }
    if (rl.count >= 3) return res.status(429).json({ error: "Too many requests. Try again in 10 minutes." });
    rl.count++; resetRateLimit.set(key, rl);

    const u = await User.findOne({ email: key });
    if (!u) return res.status(404).json({ error: "No account found with this email" });
    if (!u.phone) return res.status(400).json({ error: "No phone number on your account.", noPhone: true });
    if (normalizePhone(u.phone) !== normalizePhone(phone)) return res.status(400).json({ error: "Phone number doesn't match our records.", phoneMismatch: true });
    if (!u.telegramChatId) return res.status(400).json({ error: "No Telegram linked.", noTelegram: true });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    resetOtpStore.set(key, { otp, expiresAt: Date.now() + 10 * 60 * 1000, userId: u._id.toString(), verified: false });
    const text = `🔐 <b>Student Project Hub</b>\n\nYour password reset code is:\n\n<code>${otp}</code>\n\nExpires in 10 minutes.`;
    const result = await sendTelegram(u.telegramChatId, text);
    if (!result.ok) return res.status(500).json({ error: "Failed to send Telegram: " + result.error });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/forgot/telegram/verify", async (req, res) => {
  try {
    const email = safeStr(req.body.email).toLowerCase();
    const otp = safeStr(req.body.otp).trim();
    const entry = resetOtpStore.get(email);
    if (!entry) return res.status(400).json({ error: "No reset requested" });
    if (Date.now() > entry.expiresAt) { resetOtpStore.delete(email); return res.status(400).json({ error: "Code expired" }); }
    if (entry.otp !== otp) return res.status(400).json({ error: "Invalid code" });
    entry.verified = true;
    resetOtpStore.set(email, entry);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/forgot/telegram/reset", async (req, res) => {
  try {
    const email = safeStr(req.body.email).toLowerCase();
    const otp = safeStr(req.body.otp).trim();
    const newPassword = safeStr(req.body.newPassword);
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "Min 6 characters" });
    const entry = resetOtpStore.get(email);
    if (!entry || !entry.verified) return res.status(400).json({ error: "Verify code first" });
    if (entry.otp !== otp) return res.status(400).json({ error: "Invalid code" });
    const u = await User.findById(entry.userId);
    if (!u) return res.status(404).json({ error: "User not found" });
    u.passwordHash = await bcrypt.hash(newPassword, 10);
    await u.save();
    resetOtpStore.delete(email);
    if (u.telegramChatId) await sendTelegram(u.telegramChatId, "✅ Your password was changed.");
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/subjects", (req, res) => res.json({ success: true, subjects: SUBJECTS }));

app.get("/api/chatbot/qa", auth, async (req, res) => {
  try { res.json({ success: true, qa: await ChatbotQA.find({ isActive: true }).sort({ order: 1, createdAt: 1 }) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/admin/chatbot/qa", auth, requireRole("admin"), async (req, res) => {
  try { res.json({ success: true, qa: await ChatbotQA.find().sort({ order: 1, createdAt: 1 }) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/admin/chatbot/qa", auth, requireRole("admin"), async (req, res) => {
  try {
    const keywords = Array.isArray(req.body.keywords) ? req.body.keywords : [];
    const answer = safeStr(req.body.answer);
    const category = safeStr(req.body.category, "General");
    const order = Number(req.body.order) || 0;
    const isActive = req.body.isActive !== false;
    if (!keywords.length) return res.status(400).json({ error: "At least one keyword required" });
    if (!answer) return res.status(400).json({ error: "Answer required" });
    const qa = await ChatbotQA.create({
      keywords: keywords.map(k => String(k).trim().toLowerCase()).filter(Boolean),
      answer, category, order, isActive
    });
    res.json({ success: true, qa });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/admin/chatbot/qa/:id", auth, requireRole("admin"), validId("id"), async (req, res) => {
  try {
    const update = { updatedAt: new Date() };
    if (req.body.keywords !== undefined) {
      const kw = Array.isArray(req.body.keywords) ? req.body.keywords : [];
      if (!kw.length) return res.status(400).json({ error: "At least one keyword required" });
      update.keywords = kw.map(k => String(k).trim().toLowerCase()).filter(Boolean);
    }
    if (req.body.answer !== undefined) update.answer = safeStr(req.body.answer);
    if (req.body.category !== undefined) update.category = safeStr(req.body.category, "General");
    if (req.body.order !== undefined) update.order = Number(req.body.order) || 0;
    if (req.body.isActive !== undefined) update.isActive = !!req.body.isActive;
    const qa = await ChatbotQA.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!qa) return res.status(404).json({ error: "Not found" });
    res.json({ success: true, qa });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/admin/chatbot/qa/:id", auth, requireRole("admin"), validId("id"), async (req, res) => {
  try { await ChatbotQA.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/courses", auth, async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === "student") filter = { $or: [{ members: req.userId }, { isOpen: true }] };
    else if (req.user.role === "teacher") {
      const myClasses = await ClassModel.find({ teacherIds: req.userId }).select("_id");
      const myClassIds = myClasses.map(c => c._id);
      filter = { $or: [
        { owner: req.userId },
        { classes: { $in: myClassIds } }
      ]};
    }
    const courses = await Course.find(filter)
      .populate("owner", "fullName avatar role")
      .populate("members", "fullName avatar course yearLevel")
      .populate("pendingMembers.user", "fullName avatar")
      .sort({ updatedAt: -1 });
    res.json({ success: true, courses });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/teacher/my-courses", auth, requireRole("teacher", "admin"), async (req, res) => {
  try {
    const courses = await Course.find({ owner: req.userId })
      .populate("owner", "fullName avatar")
      .populate("members", "fullName avatar")
      .sort({ updatedAt: -1 });
    res.json({ success: true, courses });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/courses/:id", auth, validId("id"), async (req, res) => {
  try {
    const access = await canAccessCourse(req.user, req.params.id);
    if (!access.ok) return res.status(403).json({ error: access.reason || "Access denied" });

    const course = await Course.findById(req.params.id)
      .populate("owner", "fullName avatar role")
      .populate("members", "fullName avatar course yearLevel")
      .populate("pendingMembers.user", "fullName avatar course yearLevel");

    let subFilter = { course: course._id };
    if (req.user.role === "student") subFilter.uploadedBy = req.userId;

    const submissions = await Submission.find(subFilter)
      .populate("uploadedBy", "fullName avatar")
      .populate("gradedBy", "fullName")
      .sort({ createdAt: -1 });

    const comments = await Comment.find({ course: course._id })
      .populate("user", "fullName avatar role")
      .sort({ createdAt: 1 });

    res.json({ success: true, course, submissions, comments, relation: access.relation });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/courses/:id/member-progress", auth, validId("id"), async (req, res) => {
  try {
    const access = await canAccessCourse(req.user, req.params.id);
    if (!access.ok) return res.status(403).json({ error: "Access denied" });
    if (req.user.role === "student") return res.status(403).json({ error: "Teachers only" });

    const course = await Course.findById(req.params.id).populate("members", "fullName avatar course yearLevel");
    if (!course) return res.status(404).json({ error: "Not found" });

    const submissions = await Submission.find({ course: course._id }).select("uploadedBy grade createdAt");

    const progress = (course.members || []).map(m => {
      const userSubs = submissions.filter(s => s.uploadedBy && s.uploadedBy.toString() === m._id.toString());
      const latest = userSubs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      return {
        _id: m._id,
        fullName: m.fullName,
        avatar: m.avatar,
        course: m.course || "",
        yearLevel: m.yearLevel || "",
        submissionsCount: userSubs.length,
        hasSubmitted: userSubs.length > 0,
        latestSubmissionAt: latest?.createdAt || null,
        latestGrade: latest?.grade ?? null
      };
    });

    res.json({ success: true, progress });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/courses", auth, requireRole("teacher", "admin"), async (req, res) => {
  try {
    const title = safeStr(req.body.title).trim();
    const description = safeStr(req.body.description);
    const subject = safeStr(req.body.subject);
    const deadline = safeStr(req.body.deadline);
    const isOpen = req.body.isOpen !== false;
    const classIds = Array.isArray(req.body.classIds) ? req.body.classIds : [];
    const moduleTitle = safeStr(req.body.moduleTitle);
    const moduleImage = req.body.moduleImage || null;

    if (!title || !subject) return res.status(400).json({ error: "Title and subject required" });
    if (!SUBJECTS.includes(subject)) return res.status(400).json({ error: "Invalid subject" });
    if (req.user.role === "teacher" && !req.user.subjects.includes(subject)) return res.status(403).json({ error: "You don't teach this subject" });

    let teacherClasses = [];
    if (req.user.role === "teacher") teacherClasses = await ClassModel.find({ teacherIds: req.userId }).select("_id");

    let targetClassIds = [];
    if (req.user.role === "admin") targetClassIds = classIds.filter(isValidObjectId);
    else {
      const own = teacherClasses.map(c => c._id.toString());
      const requested = classIds.map(c => String(c)).filter(isValidObjectId);
      targetClassIds = requested.length ? requested.filter(id => own.includes(id)) : own;
      if (!targetClassIds.length) return res.status(400).json({ error: "No classes assigned to you. Ask your admin to add you to a class." });
    }

    const course = await Course.create({
      title, description, subject,
      owner: req.userId, members: [], deadline,
      isOpen, classes: targetClassIds,
      moduleTitle, moduleImage
    });

    const students = await User.find({ role: "student", isActive: true, classIds: { $in: targetClassIds } }).select("_id");
    if (students.length) {
      const ids = students.map(s => s._id);
      course.members.push(...ids);
      await course.save();
      for (const sid of ids) await notify(sid, "course_assigned", `You were enrolled in "${course.title}"`, `/course/${course._id}`);
    }
    res.json({ success: true, course, autoAssigned: course.members.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/courses/:id", auth, validId("id"), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ error: "Not found" });
    if (course.owner.toString() !== req.userId && req.user.role !== "admin") return res.status(403).json({ error: "Not allowed" });
    const { title, description, subject, status, deadline, isOpen, moduleTitle, moduleImage } = req.body;
    if (title !== undefined) course.title = safeStr(title);
    if (description !== undefined) course.description = safeStr(description);
    if (subject !== undefined && SUBJECTS.includes(subject)) course.subject = subject;
    if (status !== undefined) course.status = status;
    if (deadline !== undefined) course.deadline = safeStr(deadline);
    if (isOpen !== undefined) course.isOpen = !!isOpen;
    if (moduleTitle !== undefined) course.moduleTitle = safeStr(moduleTitle);
    if (moduleImage !== undefined) course.moduleImage = moduleImage || null;
    course.updatedAt = new Date();
    await course.save();
    res.json({ success: true, course });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/courses/:id", auth, validId("id"), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ error: "Not found" });
    if (course.owner.toString() !== req.userId && req.user.role !== "admin") return res.status(403).json({ error: "Not allowed" });
    await Submission.deleteMany({ course: course._id });
    await Comment.deleteMany({ course: course._id });
    await CourseChat.deleteMany({ course: course._id });
    await course.deleteOne();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/courses/:id/apply", auth, requireRole("student"), validId("id"), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ error: "Not found" });
    if (!course.isOpen) return res.status(400).json({ error: "Not accepting applications" });
    if (course.members.map(m => m.toString()).includes(req.userId)) return res.status(400).json({ error: "Already a member" });
    if (course.pendingMembers.some(p => p.user.toString() === req.userId && p.status === "pending")) return res.status(400).json({ error: "Already applied" });
    course.pendingMembers.push({ user: req.userId });
    await course.save();
    await notify(course.owner, "course_apply", `${req.user.fullName} applied to "${course.title}"`, `/course/${course._id}`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/courses/:id/applicants/:userId/accept", auth, validId("id"), validId("userId"), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ error: "Not found" });
    if (course.owner.toString() !== req.userId && req.user.role !== "admin") return res.status(403).json({ error: "Not allowed" });
    const app = course.pendingMembers.find(p => p.user.toString() === req.params.userId);
    if (!app) return res.status(404).json({ error: "Applicant not found" });
    app.status = "accepted";
    if (!course.members.map(m => m.toString()).includes(req.params.userId)) course.members.push(req.params.userId);
    await course.save();
    await notify(req.params.userId, "course_accept", `You were accepted into "${course.title}"`, `/course/${course._id}`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/courses/:id/applicants/:userId/reject", auth, validId("id"), validId("userId"), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ error: "Not found" });
    if (course.owner.toString() !== req.userId && req.user.role !== "admin") return res.status(403).json({ error: "Not allowed" });
    const app = course.pendingMembers.find(p => p.user.toString() === req.params.userId);
    if (app) app.status = "rejected";
    await course.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/courses/:id/invite", auth, validId("id"), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ error: "Not found" });
    if (course.owner.toString() !== req.userId && req.user.role !== "admin") return res.status(403).json({ error: "Not allowed" });
    const email = safeStr(req.body.email).toLowerCase();
    const invitee = await User.findOne({ email, role: "student" });
    if (!invitee) return res.status(404).json({ error: "Student not found" });
    if (course.members.map(m => m.toString()).includes(invitee._id.toString())) return res.status(400).json({ error: "Already a member" });
    if (course.pendingMembers.some(p => p.user.toString() === invitee._id.toString() && p.status === "pending")) return res.status(400).json({ error: "Already invited" });
    course.pendingMembers.push({ user: invitee._id });
    await course.save();
    await notify(invitee._id, "course_invite", `${req.user.fullName} invited you to "${course.title}"`, `/course/${course._id}`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/courses/:id/remove-member", auth, validId("id"), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ error: "Not found" });
    if (course.owner.toString() !== req.userId && req.user.role !== "admin") return res.status(403).json({ error: "Not allowed" });
    course.members = course.members.filter(m => m.toString() !== req.body.userId);
    await course.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/courses/:id/chat", auth, validId("id"), async (req, res) => {
  try {
    const access = await canAccessCourse(req.user, req.params.id);
    if (!access.ok) return res.status(403).json({ error: "Access denied" });
    if (access.relation === "applicant") return res.json({ success: true, messages: [] });
    const msgs = await CourseChat.find({ course: req.params.id }).populate("user", "fullName avatar role").sort({ createdAt: 1 }).limit(200);
    res.json({ success: true, messages: msgs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/courses/:id/chat", auth, validId("id"), async (req, res) => {
  try {
    const access = await canAccessCourse(req.user, req.params.id);
    if (!access.ok) return res.status(403).json({ error: "Access denied" });
    if (access.relation === "applicant") return res.status(403).json({ error: "Only members can chat" });
    const text = safeStr(req.body.text).trim().slice(0, 1000);
    const image = req.body.image || null;
    if (!text && !image) return res.status(400).json({ error: "Empty message" });
    const msg = await CourseChat.create({ course: req.params.id, user: req.userId, text, image });
    const populated = await CourseChat.findById(msg._id).populate("user", "fullName avatar role");
    res.json({ success: true, message: populated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/courses/chat/messages/:id", auth, validId("id"), async (req, res) => {
  try {
    const msg = await CourseChat.findById(req.params.id);
    if (!msg) return res.status(404).json({ error: "Not found" });
    if (msg.user.toString() !== req.userId && req.user.role !== "admin") return res.status(403).json({ error: "Not yours" });
    await msg.deleteOne();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/chat/messages/:id", auth, validId("id"), async (req, res) => {
  try {
    const msg = await Message.findById(req.params.id);
    if (!msg) return res.status(404).json({ error: "Not found" });
    if (msg.from.toString() !== req.userId && req.user.role !== "admin") return res.status(403).json({ error: "Not yours" });
    await msg.deleteOne();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/courses/:id/submissions", auth, validId("id"), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ error: "Not found" });

    const isMember = course.members.map(m => m.toString()).includes(req.userId);
    const isOwner = course.owner.toString() === req.userId;
    const isAdmin = req.user.role === "admin";

    let isTeacherOfClass = false;
    if (req.user.role === "teacher" && !isOwner) {
      const classesAsTeacher = await ClassModel.find({
        _id: { $in: course.classes || [] }, teacherIds: req.userId
      }).select("_id");
      isTeacherOfClass = classesAsTeacher.length > 0;
    }

    if (!isMember && !isOwner && !isAdmin && !isTeacherOfClass) {
      return res.status(403).json({ error: "Not allowed" });
    }

    if (req.user.role === "student" && course.deadline) {
      const deadlineEnd = new Date(course.deadline);
      deadlineEnd.setHours(23, 59, 59, 999);
      if (Date.now() > deadlineEnd.getTime()) return res.status(403).json({ error: "Deadline has passed. Submissions are closed." });
    }

    const fileName = safeStr(req.body.fileName);
    const fileSize = Number(req.body.fileSize) || 0;
    const fileType = safeStr(req.body.fileType);
    const mediaKind = ["file", "image", "video"].includes(req.body.mediaKind) ? req.body.mediaKind : "file";
    const dataUrl = safeStr(req.body.dataUrl);
    const note = safeStr(req.body.note);
    if (!fileName || !dataUrl) return res.status(400).json({ error: "File required" });

    const count = await Submission.countDocuments({ course: course._id, uploadedBy: req.userId });
    const sub = await Submission.create({
      course: course._id, fileName, fileSize, fileType,
      mediaKind, dataUrl, note, version: count + 1, uploadedBy: req.userId
    });
    await notify(course.owner, "submission", `${req.user.fullName} submitted a file in "${course.title}"`, `/course/${course._id}`);
    res.json({ success: true, submission: sub });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/submissions/:id", auth, validId("id"), async (req, res) => {
  try {
    const sub = await Submission.findById(req.params.id);
    if (!sub) return res.status(404).json({ error: "Not found" });
    if (req.user.role === "student" && sub.uploadedBy.toString() !== req.userId) return res.status(403).json({ error: "Not allowed" });
    if (req.user.role === "teacher") {
      const course = await Course.findById(sub.course);
      if (!course || course.owner.toString() !== req.userId) return res.status(403).json({ error: "Not allowed" });
    }
    await sub.deleteOne();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/submissions/:id/grade", auth, requireRole("teacher", "admin"), validId("id"), async (req, res) => {
  try {
    const grade = Number(req.body.grade);
    const feedback = safeStr(req.body.feedback);
    if (isNaN(grade) || grade < 0 || grade > 100) return res.status(400).json({ error: "Grade must be 0-100" });
    const sub = await Submission.findById(req.params.id).populate("uploadedBy", "fullName");
    if (!sub) return res.status(404).json({ error: "Submission not found" });
    const course = await Course.findById(sub.course);
    if (!course) return res.status(404).json({ error: "Course not found" });

    if (req.user.role === "teacher" && course.owner.toString() !== req.userId) {
      const classesAsTeacher = await ClassModel.find({
        _id: { $in: course.classes || [] }, teacherIds: req.userId
      }).select("_id");
      if (!classesAsTeacher.length) return res.status(403).json({ error: "You don't own this project" });
    }

    sub.grade = grade;
    sub.feedback = feedback;
    sub.gradedBy = req.userId;
    sub.gradedAt = new Date();
    await sub.save();

    await notify(sub.uploadedBy._id, "graded", `Your submission in "${course.title}" was graded: ${grade}/100`, `/course/${course._id}`);
    res.json({ success: true, submission: sub });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/submissions/:id", auth, validId("id"), async (req, res) => {
  try {
    const sub = await Submission.findById(req.params.id).populate("uploadedBy", "fullName avatar").populate("gradedBy", "fullName");
    if (!sub) return res.status(404).json({ error: "Not found" });
    if (req.user.role === "student" && sub.uploadedBy._id.toString() !== req.userId) return res.status(403).json({ error: "Access denied" });
    res.json({ success: true, submission: sub });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/courses/:id/comments", auth, validId("id"), async (req, res) => {
  try {
    const access = await canAccessCourse(req.user, req.params.id);
    if (!access.ok) return res.status(403).json({ error: "Access denied" });
    if (access.relation === "applicant") return res.status(403).json({ error: "Only members can comment" });
    const text = safeStr(req.body.text).trim().slice(0, 800);
    if (!text) return res.status(400).json({ error: "Empty comment" });
    const c = await Comment.create({ course: req.params.id, user: req.userId, text });
    const populated = await Comment.findById(c._id).populate("user", "fullName avatar role");
    res.json({ success: true, comment: populated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/comments/:id", auth, validId("id"), async (req, res) => {
  try {
    const c = await Comment.findById(req.params.id);
    if (!c) return res.status(404).json({ error: "Not found" });
    if (c.user.toString() !== req.userId && req.user.role !== "admin") return res.status(403).json({ error: "Not yours" });
    await c.deleteOne();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/friends/request", auth, async (req, res) => {
  try {
    const email = safeStr(req.body.email).toLowerCase();
    if (!email) return res.status(400).json({ error: "Email required" });
    const target = await User.findOne({ email });
    if (!target) return res.status(404).json({ error: "User not found" });
    if (target._id.toString() === req.userId) return res.status(400).json({ error: "Cannot add yourself" });
    if (req.user.friends.map(f => f.toString()).includes(target._id.toString())) return res.status(400).json({ error: "Already friends" });
    if (target.friendRequests.map(f => f.toString()).includes(req.userId)) return res.status(400).json({ error: "Already sent" });
    await User.findByIdAndUpdate(target._id, { $addToSet: { friendRequests: req.userId } });
    await notify(target._id, "friend_request", `${req.user.fullName} sent you a friend request`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/friends/request-by-id", auth, async (req, res) => {
  try {
    const userId = safeStr(req.body.userId);
    if (!isValidObjectId(userId)) return res.status(400).json({ error: "Invalid user id" });
    const target = await User.findById(userId);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (target._id.toString() === req.userId) return res.status(400).json({ error: "Cannot add yourself" });
    if (req.user.friends.map(f => f.toString()).includes(target._id.toString())) return res.status(400).json({ error: "Already friends" });
    if (target.friendRequests.map(f => f.toString()).includes(req.userId)) return res.status(400).json({ error: "Already sent" });
    await User.findByIdAndUpdate(target._id, { $addToSet: { friendRequests: req.userId } });
    await notify(target._id, "friend_request", `${req.user.fullName} sent you a friend request`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/friends/requests", auth, async (req, res) => {
  try {
    const me = await User.findById(req.userId).populate("friendRequests", "fullName avatar role course yearLevel");
    res.json({ success: true, requests: me.friendRequests.map(r => ({
      id: r._id, name: r.fullName, avatar: r.avatar, role: r.role, course: r.course, yearLevel: r.yearLevel
    }))});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/friends/accept", auth, async (req, res) => {
  try {
    const id = safeStr(req.body.id);
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });
    const me = await User.findById(req.userId);
    if (!me.friendRequests.map(f => f.toString()).includes(id)) return res.status(400).json({ error: "No such request" });
    await User.findByIdAndUpdate(req.userId, { $pull: { friendRequests: id }, $addToSet: { friends: id } });
    await User.findByIdAndUpdate(id, { $addToSet: { friends: req.userId } });
    await notify(id, "friend_accept", `${req.user.fullName} accepted your friend request`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/friends/reject", auth, async (req, res) => {
  try {
    const id = safeStr(req.body.id);
    if (id && isValidObjectId(id)) await User.findByIdAndUpdate(req.userId, { $pull: { friendRequests: id } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/friends/unfriend", auth, async (req, res) => {
  try {
    const id = safeStr(req.body.id);
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });
    await User.findByIdAndUpdate(req.userId, { $pull: { friends: id } });
    await User.findByIdAndUpdate(id, { $pull: { friends: req.userId } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/friends/list", auth, async (req, res) => {
  try {
    const me = await User.findById(req.userId).populate("friends", "fullName avatar role course yearLevel section");
    res.json({ success: true, friends: me.friends.map(f => ({
      id: f._id, name: f.fullName, avatar: f.avatar, role: f.role, course: f.course, yearLevel: f.yearLevel, section: f.section
    }))});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/chat/contacts", auth, async (req, res) => {
  try {
    const me = await User.findById(req.userId).populate("friends", "fullName avatar role");
    const contacts = new Map();
    me.friends.forEach(f => contacts.set(f._id.toString(), { id: f._id, name: f.fullName, avatar: f.avatar, role: f.role, relation: "friend" }));
    if (me.role === "student") {
      const myCourses = await Course.find({ members: me._id }).select("subject owner").populate("owner", "fullName avatar role");
      const seen = new Set();
      myCourses.forEach(p => {
        const t = p.owner;
        if (t && !seen.has(t._id.toString()) && !contacts.has(t._id.toString())) {
          seen.add(t._id.toString());
          contacts.set(t._id.toString(), { id: t._id, name: t.fullName, avatar: t.avatar, role: t.role, relation: "teacher" });
        }
      });
    }
    if (me.role === "teacher") {
      const courses = await Course.find({ owner: me._id }).populate("members", "fullName avatar role");
      const seen = new Set();
      for (const p of courses) for (const u of (p.members || [])) {
        if (u && !seen.has(u._id.toString()) && !contacts.has(u._id.toString())) {
          seen.add(u._id.toString());
          contacts.set(u._id.toString(), { id: u._id, name: u.fullName, avatar: u.avatar, role: u.role, relation: "student" });
        }
      }
    }
    res.json({ success: true, contacts: Array.from(contacts.values()) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function canChatWith(me, otherId) {
  if (me._id.toString() === otherId.toString()) return false;
  const other = await User.findById(otherId);
  if (!other || !other.isActive) return false;
  if (me.role === "admin") return true;
  if (me.friends.map(f => f.toString()).includes(otherId.toString())) return true;
  if (me.role === "teacher" && other.role === "student") {
    if (await Course.countDocuments({ owner: me._id, members: other._id }) > 0) return true;
  }
  if (me.role === "student" && other.role === "teacher") {
    if (await Course.countDocuments({ owner: other._id, members: me._id }) > 0) return true;
  }
  return false;
}

app.get("/api/chat/:id", auth, validId("id"), async (req, res) => {
  try {
    if (!(await canChatWith(req.user, req.params.id))) return res.status(403).json({ error: "You can't chat with this user" });
    const msgs = await Message.find({
      $or: [{ from: req.userId, to: req.params.id }, { from: req.params.id, to: req.userId }]
    }).sort({ createdAt: 1 }).limit(200);
    await Message.updateMany({ from: req.params.id, to: req.userId, read: false }, { read: true, readAt: new Date() });
    res.json({ success: true, messages: msgs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/chat/:id", auth, validId("id"), async (req, res) => {
  try {
    if (!(await canChatWith(req.user, req.params.id))) return res.status(403).json({ error: "You can't chat with this user" });
    const text = safeStr(req.body.text).trim().slice(0, 1000);
    const image = req.body.image || null;
    if (!text && !image) return res.status(400).json({ error: "Empty message" });
    const msg = await Message.create({ from: req.userId, to: req.params.id, text, image });
    const preview = image ? "📷 Photo" : text.slice(0, 60);
    await notify(req.params.id, "message", `${req.user.fullName}: ${preview}`);
    res.json({ success: true, message: msg });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/chat/unread/count", auth, async (req, res) => {
  try { res.json({ success: true, count: await Message.countDocuments({ to: req.userId, read: false }) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/people/search", auth, async (req, res) => {
  try {
    const q = safeStr(req.query.q).trim();
    if (!q) return res.json({ success: true, users: [] });
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const users = await User.find({
      _id: { $ne: req.userId }, isActive: true, role: { $in: ["student", "teacher"] },
      $or: [{ fullName: regex }, { course: regex }]
    }).select("fullName role avatar course yearLevel section school bio").limit(20);
    res.json({ success: true, users });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/notifications", auth, async (req, res) => {
  try { res.json({ success: true, notifications: await Notification.find({ user: req.userId }).sort({ createdAt: -1 }).limit(30) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/notifications/unread/count", auth, async (req, res) => {
  try { res.json({ success: true, count: await Notification.countDocuments({ user: req.userId, read: false }) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/notifications/read-all", auth, async (req, res) => {
  try { await Notification.updateMany({ user: req.userId, read: false }, { read: true }); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/team", async (req, res) => {
  try { res.json({ success: true, members: await TeamMember.find().sort({ order: 1, createdAt: 1 }) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/team", auth, requireRole("admin"), async (req, res) => {
  try {
    const name = safeStr(req.body.name);
    const role = safeStr(req.body.role);
    if (!name || !role) return res.status(400).json({ error: "Name and role required" });
    const badge = safeStr(req.body.badge);
    const desc = safeStr(req.body.desc);
    const photo = req.body.photo || null;
    const facebook = safeStr(req.body.facebook);
    const github = safeStr(req.body.github);
    const email = safeStr(req.body.email);
    const order = Number(req.body.order) || 0;
    const m = await TeamMember.create({ name, role, badge, desc, photo, facebook, github, email, order });
    res.json({ success: true, member: m });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/team/:id", auth, requireRole("admin"), validId("id"), async (req, res) => {
  try {
    const allowed = ["name","role","badge","desc","photo","facebook","github","email","order"];
    const update = {};
    for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];
    const m = await TeamMember.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!m) return res.status(404).json({ error: "Not found" });
    res.json({ success: true, member: m });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/team/:id", auth, requireRole("admin"), validId("id"), async (req, res) => {
  try { await TeamMember.findByIdAndDelete(req.params.id); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/classes", auth, async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === "teacher") filter = { teacherIds: req.userId };
    if (req.user.role === "student") filter = { studentIds: req.userId };
    const classes = await ClassModel.find(filter)
      .populate("teacherIds", "fullName avatar")
      .populate("studentIds", "fullName avatar course yearLevel")
      .sort({ name: 1 });
    res.json({ success: true, classes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/classes/:id", auth, validId("id"), async (req, res) => {
  try {
    const cls = await ClassModel.findById(req.params.id)
      .populate("teacherIds", "fullName avatar role")
      .populate("studentIds", "fullName avatar role course yearLevel section");
    if (!cls) return res.status(404).json({ error: "Not found" });
    const isAdmin = req.user.role === "admin";
    const isTeacher = req.user.role === "teacher" && cls.teacherIds.some(t => t._id.toString() === req.userId);
    const isStudent = req.user.role === "student" && cls.studentIds.some(s => s._id.toString() === req.userId);
    if (!isAdmin && !isTeacher && !isStudent) return res.status(403).json({ error: "Access denied" });
    res.json({ success: true, class: cls });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/classes", auth, requireRole("admin"), async (req, res) => {
  try {
    const name = safeStr(req.body.name).trim();
    const course = safeStr(req.body.course);
    const yearLevel = safeStr(req.body.yearLevel);
    const section = safeStr(req.body.section);
    const description = safeStr(req.body.description);
    const teacherIds = Array.isArray(req.body.teacherIds) ? req.body.teacherIds.filter(isValidObjectId) : [];
    if (!name) return res.status(400).json({ error: "Class name required" });
    const exists = await ClassModel.findOne({ name });
    if (exists) return res.status(400).json({ error: "Class name already exists" });
    const cls = await ClassModel.create({ name, course, yearLevel, section, description, teacherIds, studentIds: [] });
    await syncClassMembers(cls._id);
    res.json({ success: true, class: cls });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/classes/:id", auth, requireRole("admin"), validId("id"), async (req, res) => {
  try {
    const update = {};
    if (req.body.name !== undefined) update.name = safeStr(req.body.name).trim();
    if (req.body.course !== undefined) update.course = safeStr(req.body.course);
    if (req.body.yearLevel !== undefined) update.yearLevel = safeStr(req.body.yearLevel);
    if (req.body.section !== undefined) update.section = safeStr(req.body.section);
    if (req.body.description !== undefined) update.description = safeStr(req.body.description);
    if (req.body.teacherIds !== undefined) update.teacherIds = (req.body.teacherIds || []).filter(isValidObjectId);
    if (req.body.studentIds !== undefined) update.studentIds = (req.body.studentIds || []).filter(isValidObjectId);
    const cls = await ClassModel.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate("teacherIds", "fullName avatar").populate("studentIds", "fullName avatar");
    if (!cls) return res.status(404).json({ error: "Not found" });
    await syncClassMembers(cls._id);
    res.json({ success: true, class: cls });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/classes/:id", auth, requireRole("admin"), validId("id"), async (req, res) => {
  try {
    const cls = await ClassModel.findById(req.params.id);
    if (!cls) return res.status(404).json({ error: "Not found" });
    await User.updateMany({ classIds: cls._id }, { $pull: { classIds: cls._id } });
    await Announcement.deleteMany({ classId: cls._id });
    await ClassModel.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===================== ANNOUNCEMENTS =====================
app.get("/api/classes/:id/announcements", auth, validId("id"), async (req, res) => {
  try {
    const cls = await ClassModel.findById(req.params.id);
    if (!cls) return res.status(404).json({ error: "Class not found" });
    const isAdmin = req.user.role === "admin";
    const isTeacher = req.user.role === "teacher" && cls.teacherIds.some(t => t.toString() === req.userId);
    const isStudent = req.user.role === "student" && cls.studentIds.some(s => s.toString() === req.userId);
    if (!isAdmin && !isTeacher && !isStudent) return res.status(403).json({ error: "Access denied" });

    const announcements = await Announcement.find({ classId: cls._id })
      .populate("author", "fullName avatar role")
      .sort({ pinned: -1, createdAt: -1 })
      .limit(100);
    res.json({ success: true, announcements, class: { _id: cls._id, name: cls.name } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/classes/:id/announcements", auth, requireRole("teacher", "admin"), validId("id"), async (req, res) => {
  try {
    const cls = await ClassModel.findById(req.params.id);
    if (!cls) return res.status(404).json({ error: "Class not found" });
    if (req.user.role === "teacher" && !cls.teacherIds.some(t => t.toString() === req.userId)) {
      return res.status(403).json({ error: "You're not assigned to this class" });
    }
    const title = safeStr(req.body.title).trim().slice(0, 120);
    const body = safeStr(req.body.body).trim().slice(0, 2000);
    const pinned = !!req.body.pinned;
    if (!title) return res.status(400).json({ error: "Title required" });
    if (!body) return res.status(400).json({ error: "Body required" });

    const ann = await Announcement.create({
      title, body, classId: cls._id, author: req.userId, pinned
    });

    for (const sid of cls.studentIds) {
      await notify(sid, "announcement", `📢 ${cls.name}: ${title}`, `/classes/${cls._id}`);
    }
    for (const tid of cls.teacherIds) {
      if (tid.toString() !== req.userId) {
        await notify(tid, "announcement", `📢 ${cls.name}: ${title}`, `/classes/${cls._id}`);
      }
    }

    const populated = await Announcement.findById(ann._id).populate("author", "fullName avatar role");
    res.json({ success: true, announcement: populated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/announcements/:id", auth, requireRole("teacher", "admin"), validId("id"), async (req, res) => {
  try {
    const ann = await Announcement.findById(req.params.id);
    if (!ann) return res.status(404).json({ error: "Not found" });
    if (req.user.role === "teacher" && ann.author.toString() !== req.userId) {
      const cls = await ClassModel.findById(ann.classId);
      const isClassTeacher = cls && cls.teacherIds.some(t => t.toString() === req.userId);
      if (!isClassTeacher) return res.status(403).json({ error: "Not allowed" });
    }
    if (req.body.title !== undefined) ann.title = safeStr(req.body.title).trim().slice(0, 120);
    if (req.body.body !== undefined) ann.body = safeStr(req.body.body).trim().slice(0, 2000);
    if (req.body.pinned !== undefined) ann.pinned = !!req.body.pinned;
    ann.updatedAt = new Date();
    await ann.save();
    const populated = await Announcement.findById(ann._id).populate("author", "fullName avatar role");
    res.json({ success: true, announcement: populated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/announcements/:id", auth, requireRole("teacher", "admin"), validId("id"), async (req, res) => {
  try {
    const ann = await Announcement.findById(req.params.id);
    if (!ann) return res.status(404).json({ error: "Not found" });
    if (req.user.role === "teacher" && ann.author.toString() !== req.userId) {
      const cls = await ClassModel.findById(ann.classId);
      const isClassTeacher = cls && cls.teacherIds.some(t => t.toString() === req.userId);
      if (!isClassTeacher) return res.status(403).json({ error: "Not allowed" });
    }
    await ann.deleteOne();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/announcements/feed", auth, async (req, res) => {
  try {
    let classIds = [];
    if (req.user.role === "admin") {
      classIds = (await ClassModel.find().select("_id")).map(c => c._id);
    } else if (req.user.role === "teacher") {
      classIds = (await ClassModel.find({ teacherIds: req.userId }).select("_id")).map(c => c._id);
    } else {
      classIds = (await ClassModel.find({ studentIds: req.userId }).select("_id")).map(c => c._id);
    }
    if (!classIds.length) return res.json({ success: true, announcements: [] });
    const announcements = await Announcement.find({ classId: { $in: classIds } })
      .populate("author", "fullName avatar role")
      .populate("classId", "name")
      .sort({ pinned: -1, createdAt: -1 })
      .limit(30);
    res.json({ success: true, announcements });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/admin/student-registrations", auth, requireRole("teacher", "admin"), async (req, res) => {
  try {
    let filter = { role: "student" };
    if (req.user.role === "teacher") {
      const myClasses = await ClassModel.find({ teacherIds: req.userId }).select("studentIds");
      const studentIds = myClasses.flatMap(c => c.studentIds.map(id => id.toString()));
      if (!studentIds.length) return res.json({ success: true, students: [] });
      filter._id = { $in: studentIds };
    }
    const students = await User.find(filter)
      .select("fullName email studentId course yearLevel section enrolledAt createdAt avatar classIds isEnrolled")
      .populate("classIds", "name").sort({ enrolledAt: -1 }).limit(200);

    const enriched = students.map(s => {
      const enrollDate = new Date(s.enrolledAt || s.createdAt);
      const now = new Date();
      const diffMs = now - enrollDate;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      let duration = "";
      if (diffDays < 1) duration = "Today";
      else if (diffDays < 30) duration = `${diffDays} day${diffDays === 1 ? "" : "s"}`;
      else if (diffDays < 365) { const months = Math.floor(diffDays / 30); duration = `${months} month${months === 1 ? "" : "s"}`; }
      else { const years = (diffDays / 365).toFixed(1); duration = `${years} year${years === "1.0" ? "" : "s"}`; }
      return {
        _id: s._id, fullName: s.fullName, email: s.email,
        studentId: s.studentId || "—", course: s.course || "—",
        yearLevel: s.yearLevel || "", section: s.section || "",
        avatar: s.avatar, isEnrolled: s.isEnrolled !== false,
        classes: (s.classIds || []).map(c => c.name).join(", ") || "—",
        enrolledAt: s.enrolledAt || s.createdAt,
        duration
      };
    });
    res.json({ success: true, students: enriched });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/admin/enroll-student", auth, requireRole("admin"), async (req, res) => {
  try {
    const fullName = safeStr(req.body.fullName).trim();
    const email = safeStr(req.body.email).toLowerCase();
    const studentId = safeStr(req.body.studentId).trim();
    const course = safeStr(req.body.course);
    const yearLevel = safeStr(req.body.yearLevel);
    const section = safeStr(req.body.section);
    const classId = req.body.classId && isValidObjectId(req.body.classId) ? req.body.classId : null;
    const enrolledAt = req.body.enrolledAt;

    if (!fullName || !email || !studentId) return res.status(400).json({ error: "Name, email, and Student ID required" });
    const exists = await User.findOne({ $or: [{ email }, { studentId }] });
    if (exists) return res.status(400).json({ error: "Email or Student ID already exists" });

    const placeholderHash = await bcrypt.hash("PENDING_" + Math.random().toString(36), 10);
    const student = await User.create({
      fullName, email, studentId,
      passwordHash: placeholderHash, role: "student",
      course, yearLevel, section,
      isActive: true, isEnrolled: false,
      classIds: classId ? [classId] : [],
      enrolledAt: enrolledAt ? new Date(enrolledAt) : new Date()
    });
    if (classId) {
      await ClassModel.findByIdAndUpdate(classId, { $addToSet: { studentIds: student._id } });
    }
    res.json({ success: true, student: { ...student.toObject(), passwordHash: undefined } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/dashboard", auth, async (req, res) => {
  try {
    if (req.user.role === "student") {
      const courses = await Course.find({ members: req.userId })
        .populate("owner", "fullName avatar role").populate("members", "fullName avatar");
      const openCourses = await Course.find({ isOpen: true, members: { $ne: req.userId } })
        .select("_id title subject owner").populate("owner", "fullName avatar");
      res.json({
        success: true,
        stats: { courses: courses.length, openCourses: openCourses.length },
        recentCourses: courses.slice(0, 5),
        openCourses: openCourses.slice(0, 6)
      });
    } else if (req.user.role === "teacher") {
      const courses = await Course.find({ owner: req.userId }).populate("owner", "fullName avatar").populate("members", "fullName avatar");
      let pendingApplications = 0;
      courses.forEach(p => { pendingApplications += (p.pendingMembers || []).filter(pm => pm.status === "pending").length; });
      const myClasses = await ClassModel.find({ teacherIds: req.userId }).select("name studentIds");
      const totalStudents = myClasses.reduce((sum, c) => sum + c.studentIds.length, 0);
      res.json({
        success: true,
        stats: { subjects: req.user.subjects.length, classes: myClasses.length, totalStudents, courses: courses.length, applications: pendingApplications },
        recentCourses: courses.slice(0, 5)
      });
    } else {
      const users = await User.countDocuments();
      const students = await User.countDocuments({ role: "student" });
      const teachers = await User.countDocuments({ role: "teacher" });
      const courses = await Course.countDocuments();
      res.json({
        success: true,
        stats: { users, students, teachers, courses },
        recentCourses: await Course.find().populate("owner", "fullName avatar").limit(5)
      });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/admin/users", auth, requireRole("admin"), async (req, res) => {
  try {
    const q = safeStr(req.query.q).trim();
    const role = safeStr(req.query.role);
    const filter = {};
    if (role) filter.role = role;
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ fullName: regex }, { email: regex }, { studentId: regex }];
    }
    const users = await User.find(filter).select("-passwordHash").populate("classIds", "name").sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/admin/users", auth, requireRole("admin"), async (req, res) => {
  try {
    const fullName = safeStr(req.body.fullName).trim();
    const email = safeStr(req.body.email).toLowerCase();
    const password = safeStr(req.body.password);
    const role = safeStr(req.body.role);
    const subjects = Array.isArray(req.body.subjects) ? req.body.subjects : [];
    const course = safeStr(req.body.course);
    const yearLevel = safeStr(req.body.yearLevel);
    const phone = safeStr(req.body.phone);
    const studentId = safeStr(req.body.studentId);
    const enrolledAt = req.body.enrolledAt;

    if (!fullName || !email || !password || !role) return res.status(400).json({ error: "Missing fields" });
    if (!["student", "teacher", "admin"].includes(role)) return res.status(400).json({ error: "Invalid role" });
    if (role === "teacher" && subjects.some(s => !SUBJECTS.includes(s))) return res.status(400).json({ error: "Invalid subjects" });
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: "Email already exists" });
    if (phone && !/^\+?[0-9]{10,15}$/.test(phone)) return res.status(400).json({ error: "Invalid phone format" });
    const passwordHash = await bcrypt.hash(password, 10);
    const u = await User.create({
      fullName, email, passwordHash, role,
      phone, subjects: role === "teacher" ? subjects : [],
      course, yearLevel, studentId, isEnrolled: true,
      enrolledAt: enrolledAt ? new Date(enrolledAt) : new Date()
    });
    res.json({ success: true, user: { ...u.toObject(), passwordHash: undefined } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/admin/users/:id", auth, requireRole("admin"), validId("id"), async (req, res) => {
  try {
    const { fullName, email, password, role, subjects, course, yearLevel, isActive, bio, phone, classIds, studentId, isEnrolled, enrolledAt } = req.body;
    const update = {};
    if (fullName !== undefined) update.fullName = safeStr(fullName);
    if (email !== undefined) update.email = safeStr(email).toLowerCase();
    if (role !== undefined) update.role = role;
    if (subjects !== undefined) update.subjects = Array.isArray(subjects) ? subjects.filter(s => SUBJECTS.includes(s)) : [];
    if (course !== undefined) update.course = safeStr(course);
    if (yearLevel !== undefined) update.yearLevel = safeStr(yearLevel);
    if (isActive !== undefined) update.isActive = !!isActive;
    if (bio !== undefined) update.bio = safeStr(bio);
    if (phone !== undefined) {
      const p = safeStr(phone);
      if (p && !/^\+?[0-9]{10,15}$/.test(p)) return res.status(400).json({ error: "Invalid phone format" });
      update.phone = p;
    }
    if (classIds !== undefined) update.classIds = (classIds || []).filter(isValidObjectId);
    if (studentId !== undefined) update.studentId = safeStr(studentId);
    if (isEnrolled !== undefined) update.isEnrolled = !!isEnrolled;
    if (enrolledAt !== undefined) update.enrolledAt = enrolledAt ? new Date(enrolledAt) : null;
    if (password) update.passwordHash = await bcrypt.hash(password, 10);
    const u = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select("-passwordHash");
    res.json({ success: true, user: u });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/admin/users/:id", auth, requireRole("admin"), validId("id"), async (req, res) => {
  try {
    if (req.params.id === req.userId) return res.status(400).json({ error: "Cannot delete yourself" });
    const owned = await Course.find({ owner: req.params.id });
    for (const p of owned) {
      await Submission.deleteMany({ course: p._id });
      await Comment.deleteMany({ course: p._id });
      await CourseChat.deleteMany({ course: p._id });
    }
    await Course.deleteMany({ owner: req.params.id });
    await Course.updateMany({}, { $pull: { members: req.params.id } });
    await Comment.deleteMany({ user: req.params.id });
    await Message.deleteMany({ $or: [{ from: req.params.id }, { to: req.params.id }] });
    await Notification.deleteMany({ user: req.params.id });
    await ClassModel.updateMany({ teacherIds: req.params.id }, { $pull: { teacherIds: req.params.id } });
    await ClassModel.updateMany({ studentIds: req.params.id }, { $pull: { studentIds: req.params.id } });
    await Announcement.deleteMany({ author: req.params.id });
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/admin/courses", auth, requireRole("admin"), async (req, res) => {
  try {
    const courses = await Course.find().populate("owner", "fullName email avatar").sort({ createdAt: -1 });
    const enriched = courses.map(p => ({
      _id: p._id, title: p.title, subject: p.subject, status: p.status,
      deadline: p.deadline, owner: p.owner, membersCount: (p.members || []).length,
      pendingApplications: (p.pendingMembers || []).filter(pm => pm.status === "pending").length,
      createdAt: p.createdAt
    }));
    res.json({ success: true, courses: enriched });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/admin/courses/:id", auth, requireRole("admin"), validId("id"), async (req, res) => {
  try {
    const p = await Course.findById(req.params.id);
    if (!p) return res.status(404).json({ error: "Not found" });
    await Submission.deleteMany({ course: p._id });
    await Comment.deleteMany({ course: p._id });
    await CourseChat.deleteMany({ course: p._id });
    await p.deleteOne();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Student Project Hub on port ${PORT}`));
