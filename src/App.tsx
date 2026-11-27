import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Clock3,
  Coffee,
  Copy,
  CreditCard,
  Download,
  Droplets,
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  HandHelping,
  Heart,
  History,
  Info,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  Layers,
  Lock,
  LogIn,
  LogOut,
  Mail,
  Maximize,
  Menu as MenuIcon,
  MessageSquare,
  Minimize,
  Minus,
  Monitor,
  Package,
  Pencil,
  Phone,
  Plus,
  QrCode,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Soup,
  Sparkles,
  SwitchCamera,
  Trash2,
  Tv,
  Upload,
  User,
  UserCheck,
  UserPlus,
  AlertTriangle,
  Users,
  Utensils,
  Volume2,
  VolumeX,
  Wallet,
  X,
  XCircle,
  Zap
} from 'lucide-react';
import { getMenu, getOrders, getStaffList, getStations, getTables, resolveTableToken, updateOrderStatus, updateTicketItem, updateOrderPaymentStatus, submitOrderCancellationRequest, getOrderCancellationStatus, getPendingCancellationRequests, approveOrderCancellation, rejectOrderCancellation, CancellationRequestInfo } from './lib/data';
import { AppRole, CartLine, MenuItem, StaffProfile, supabase, supabaseConfigured, money } from './lib/supabase';
import QRCode from 'qrcode';
import { DashboardOverview } from './pages/DashboardOverview';
import { OrdersPage } from './pages/OrdersPage';
import { MenuPage } from './pages/MenuPage';
import { TablesPage } from './pages/TablesPage';
import { StaffPage } from './pages/StaffPage';
import { KitchenAdminPage } from './pages/KitchenAdminPage';
import { CustomersPage } from './pages/CustomersPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsAdminPage } from './pages/SettingsAdminPage';
import { WaiterTablesPage } from './pages/WaiterTablesPage';
import { WaiterDashboard } from './pages/WaiterDashboard';
import { WaiterBillsPage } from './pages/WaiterBillsPage';
import { WaiterAttendancePage } from './pages/WaiterAttendancePage';
import { CustomerLoginPage } from './pages/CustomerLoginPage';
import { CustomerDashboardPage } from './pages/CustomerDashboardPage';
import './waiter-module.css';

type Notice = { kind: 'success' | 'error' | 'info'; text: string };
const notify = (set: (n: Notice | null) => void, text: string, kind: Notice['kind'] = 'success') => {
  set({ text, kind });
};

// Edge Function errors arrive as a generic "non-2xx" message; the real reason is in the response body.
async function functionErrorMessage(error: any, data?: any): Promise<string> {
  if (data?.error) return String(data.error);
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return String(body.error);
  } catch {
    /* ignore */
  }
  return error?.message || 'Request failed.';
}

function App() {
  const location = useLocation();
  useEffect(() => {
    const appRoute = location.pathname !== '/';
    document.body.classList.toggle('app-route', appRoute);
    document.body.classList.toggle('on', appRoute);
    return () => {
      document.body.classList.remove('app-route');
    };
  }, [location.pathname]);

  const [notice, setNoticeState] = useState<Notice | null>(null);
  const noticeTimerRef = useRef<any>(null);

  // Auto-dismissing notification wrapper that prevents toasts from staying indefinitely
  const setNotice = useCallback((n: Notice | null) => {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    setNoticeState(n);
    if (n) {
      noticeTimerRef.current = setTimeout(() => {
        setNoticeState(null);
        noticeTimerRef.current = null;
      }, 3600);
    }
  }, []);

  // Dismiss notification immediately whenever user navigates between routes/pages
  useEffect(() => {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    setNoticeState(null);
  }, [location.pathname]);

  const [profile, setProfileState] = useState<StaffProfile | null>(() => {
    try {
      const raw = localStorage.getItem('servora_staff_profile');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const setProfile = useCallback((p: StaffProfile | null) => {
    setProfileState(p);
    try {
      if (p) localStorage.setItem('servora_staff_profile', JSON.stringify(p));
      else localStorage.removeItem('servora_staff_profile');
    } catch { }
  }, []);

  const [sessionReady, setSessionReady] = useState(true);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    // Validate the cached profile against the real Supabase session. The role is never trusted from storage alone.
    const loadProfile = async (userId: string, email?: string | null) => {
      const { data: dbProf, error } = await client
        .from('profiles')
        .select('id,full_name,phone,role,approval_status,restaurant_id,station_id')
        .eq('id', userId)
        .maybeSingle();
      if (error) return; // transient failure: keep current state, RLS still protects data
      if (dbProf && dbProf.approval_status === 'approved' && ['admin', 'employee', 'kitchen'].includes(dbProf.role)) {
        setProfile({ ...(dbProf as StaffProfile), email: email || undefined });
      } else {
        setProfile(null);
      }
    };
    client.auth.getSession().then(async ({ data }) => {
      if (data?.session) await loadProfile(data.session.user.id, data.session.user.email);
      else setProfile(null);
    }).catch(() => { });

    const { data: { subscription } } = client.auth.onAuthStateChange((event, s) => {
      if (!s) {
        if (event === 'SIGNED_OUT') setProfile(null);
        return;
      }
      // Defer Supabase calls out of the auth callback to avoid deadlocks.
      setTimeout(() => { loadProfile(s.user.id, s.user.email).catch(() => { }); }, 0);
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [setProfile]);

  const nav = useNavigate();

  async function signOut() {
    setProfile(null);
    if (supabase) supabase.auth.signOut().catch(() => { });
    nav('/login');
  }

  return (
    <>
      <Routes>
        <Route path="/customer-login" element={<CustomerLoginPage setNotice={setNotice} />} />
        <Route path="/customer-dashboard" element={<CustomerDashboardPage setNotice={setNotice} />} />
        <Route path="/my-orders" element={<CustomerDashboardPage setNotice={setNotice} />} />
        <Route path="/track-order" element={<CustomerDashboardPage setNotice={setNotice} />} />
        <Route path="/order" element={<CustomerPage notice={notice} setNotice={setNotice} />} />
        <Route path="/dine-in" element={<CustomerPage notice={notice} setNotice={setNotice} />} />
        <Route path="/dinein" element={<CustomerPage notice={notice} setNotice={setNotice} />} />
        <Route path="/customer" element={<CustomerPage notice={notice} setNotice={setNotice} />} />
        <Route path="/kitchen" element={profile && profile.role !== 'kitchen' && profile.role !== 'admin' ? <Navigate to="/app" replace /> : <Kitchen setNotice={setNotice} profile={profile} signOut={signOut} isStandalone={true} />} />
        <Route path="/kds" element={profile && profile.role !== 'kitchen' && profile.role !== 'admin' ? <Navigate to="/app" replace /> : <Kitchen setNotice={setNotice} profile={profile} signOut={signOut} isStandalone={true} />} />
        <Route path="/login" element={<ServoraSplitLogin setNotice={setNotice} onProfile={setProfile} />} />
        <Route path="/get-started" element={<ServoraSplitLogin setNotice={setNotice} onProfile={setProfile} />} />
        <Route path="/portal" element={<ServoraSplitLogin setNotice={setNotice} onProfile={setProfile} />} />
        <Route path="/staff-login" element={<ServoraSplitLogin setNotice={setNotice} onProfile={setProfile} />} />
        <Route path="/staff-register" element={<StaffRegister setNotice={setNotice} />} />
        <Route path="/app/*" element={<StaffApp profile={profile} ready={sessionReady} signOut={signOut} setNotice={setNotice} />} />
        <Route path="*" element={<ServoraSplitLogin setNotice={setNotice} onProfile={setProfile} />} />
      </Routes>
      {notice && (
        <div className={`notice servora-toast-notice ${notice.kind}`} role="alert">
          <div className="toast-icon-wrap">
            {notice.kind === 'error' ? (
              <AlertCircle size={18} />
            ) : notice.kind === 'info' ? (
              <Info size={18} />
            ) : (
              <CheckCircle2 size={18} />
            )}
          </div>
          <span className="toast-text-msg">{notice.text}</span>
          <button
            type="button"
            className="toast-close-btn"
            onClick={() => setNotice(null)}
            aria-label="Close notification"
          >
            <X size={15} />
          </button>
          <div className="toast-progress-line" />
        </div>
      )}
    </>
  );
}

// -------------------------------------------------------------
// EXACT SPLIT LOGIN VIEW (MATCHING MOCKUP DESIGN PRECISELY)
// -------------------------------------------------------------
function ServoraSplitLogin({
  setNotice,
  onProfile
}: {
  setNotice: (n: Notice | null) => void;
  onProfile: (p: StaffProfile | null) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loginMode, setLoginMode] = useState<'user' | 'kds'>('user');
  const nav = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      notify(setNotice, 'Enter your email and password.', 'error');
      return;
    }
    if (!supabase) {
      notify(setNotice, 'The service is not configured. Set the Supabase environment variables.', 'error');
      return;
    }
    setBusy(true);
    try {
      // Every sign-in is verified by Supabase Auth. Roles come only from the database profile.
      const lookupEmail = cleanEmail.includes('@') ? cleanEmail : `${cleanEmail}@servora.com`;
      const { data, error } = await supabase.auth.signInWithPassword({ email: lookupEmail, password });
      if (error) throw error;

      const { data: p, error: profileError } = await supabase
        .from('profiles')
        .select('id,full_name,phone,role,approval_status,restaurant_id,station_id')
        .eq('id', data.user.id)
        .maybeSingle();
      if (profileError || !p) {
        await supabase.auth.signOut();
        throw new Error('We could not load your staff profile. Please try again or contact your administrator.');
      }
      if (p.approval_status !== 'approved') {
        await supabase.auth.signOut();
        throw new Error('Your staff account is awaiting administrator approval.');
      }
      if (!['admin', 'employee', 'kitchen'].includes(p.role)) {
        await supabase.auth.signOut();
        throw new Error('This account does not have staff access.');
      }
      if (loginMode === 'kds' && p.role !== 'kitchen' && p.role !== 'admin') {
        await supabase.auth.signOut();
        throw new Error('This terminal is for kitchen accounts only.');
      }
      onProfile({ ...(p as StaffProfile), email: data.user.email || lookupEmail });
      notify(setNotice, `Welcome back, ${p.full_name}!`);

      // Route automatically based on the authorized role
      if (p.role === 'kitchen' || (loginMode === 'kds' && p.role === 'admin')) {
        nav('/kitchen');
      } else if (p.role === 'employee') {
        nav('/app/tables');
      } else {
        nav('/app/overview');
      }
    } catch (err: any) {
      notify(setNotice, err?.message || 'Invalid email or password.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function handleForgotPassword() {
    notify(
      setNotice,
      'Password recovery is managed by restaurant administrators. Contact admin@servora.com to reset credentials.',
      'info'
    );
  }

  return (
    <div className="split-login-wrapper">
      {/* Background Decor Elements */}
      <div className="login-bg-overlay" />
      <div className="login-bg-gopuram-art" />
      <div className="login-bg-leaf-culinary" />

      {/* Top back navigation */}
      <header className="split-login-top-bar">
        <button
          className="back-website-pill"
          onClick={() => {
            window.location.href = '/';
          }}
        >
          <ArrowLeft size={16} /> Restaurant Website
        </button>
      </header>

      <div className="split-login-container">
        {/* LEFT COLUMN: SERVORA LOGO + 4 PILL BUTTONS */}
        <div className="split-login-left">
          <div className="login-brand-logo-wrap">
            <Link to="/">
              <img
                src="/servora-logo.jpg"
                alt="Servora - DINE-IN QR & SERVICE"
                className="split-login-logo-img"
              />
            </Link>
          </div>

          <div className="split-login-nav-stack">
            {/* 1. Customer / Dine-In */}
            <Link to="/order" className="split-nav-pill pill-dark">
              <div className="pill-left">
                <span className="pill-icon-box">
                  <Utensils size={22} />
                </span>
                <div className="pill-text-content">
                  <b className="pill-title">Customer / Dine-In</b>
                  <span className="pill-subtitle">Scan QR, Browse Menu &amp; Place Order</span>
                </div>
              </div>
              <ChevronRight size={20} className="pill-arrow" />
            </Link>

            {/* 2. User Login (Admin / Employee) */}
            <div
              className={`split-nav-pill pill-dark cursor-pointer ${loginMode === 'user' ? 'pill-active-mode' : ''}`}
              onClick={() => {
                setLoginMode('user');
                if (email === 'kitchen@servora.com') {
                  setEmail('');
                  setPassword('');
                }
                const inp = document.getElementById('login-email-input');
                if (inp) {
                  inp.focus();
                  inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
              style={{
                border: loginMode === 'user' ? '2px solid #ea580c' : undefined,
                boxShadow: loginMode === 'user' ? '0 0 16px rgba(234, 88, 12, 0.35)' : undefined
              }}
            >
              <div className="pill-left">
                <span className="pill-icon-box" style={{ background: loginMode === 'user' ? '#ea580c' : undefined, color: '#fff' }}>
                  <Utensils size={22} />
                </span>
                <div className="pill-text-content">
                  <b className="pill-title">User Login (Admin / Employee)</b>
                  <span className="pill-subtitle">Admin &amp; Employee Sign In • Role-Based Access</span>
                </div>
              </div>
              <ChevronRight size={20} className="pill-arrow" />
            </div>

            {/* 3. Kitchen Display System (KDS) - Interactive In-Place Switch */}
            <div
              className={`split-nav-pill pill-dark cursor-pointer ${loginMode === 'kds' ? 'pill-active-mode' : ''}`}
              onClick={() => {
                setLoginMode('kds');
                setEmail('');
                setPassword('');
                const inp = document.getElementById('login-email-input');
                if (inp) {
                  inp.focus();
                  inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
              style={{
                border: loginMode === 'kds' ? '2px solid #ea580c' : undefined,
                boxShadow: loginMode === 'kds' ? '0 0 16px rgba(234, 88, 12, 0.35)' : undefined
              }}
            >
              <div className="pill-left">
                <span className="pill-icon-box" style={{ background: loginMode === 'kds' ? '#ea580c' : undefined, color: '#fff' }}>
                  <ChefHat size={22} />
                </span>
                <div className="pill-text-content">
                  <b className="pill-title">Kitchen Display System (KDS)</b>
                  <span className="pill-subtitle">Dedicated Terminal Station • Live Orders &amp; Queue</span>
                </div>
              </div>
              <ChevronRight size={20} className="pill-arrow" />
            </div>

            {/* 4. New Employee Registration */}
            <Link to="/staff-register" className="split-nav-pill pill-light">
              <div className="pill-left">
                <span className="pill-icon-box light-icon">
                  <UserPlus size={22} />
                </span>
                <div className="pill-text-content">
                  <b className="pill-title light-title">New Employee Registration</b>
                  <span className="pill-subtitle light-subtitle">Request to Join Our Team</span>
                </div>
              </div>
              <ChevronRight size={20} className="pill-arrow light-arrow" />
            </Link>
          </div>
        </div>

        {/* RIGHT COLUMN: FROSTED GLASS LOGIN CARD */}
        <div className="split-login-right">
          <form className="mockup-login-card" onSubmit={submit}>
            <div className="card-header-section">
              <h2 className="login-card-main-title">
                {loginMode === 'kds' ? 'Kitchen Display System (KDS)' : 'User Login (Admin / Employee)'}
              </h2>
              <p className="login-card-main-sub">
                {loginMode === 'kds'
                  ? 'Dedicated Kitchen Terminal Station • Real-Time Order Queue'
                  : 'Single login entry for Admin and Employees'}
              </p>
              <div className="login-accent-bar" />
            </div>

            <div className="card-fields-section">
              {/* Email / Username field */}
              <div className="mockup-input-wrapper">
                <Mail size={19} className="mockup-field-icon" />
                <input
                  id="login-email-input"
                  type="text"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={loginMode === 'kds' ? 'Kitchen account email' : 'Email or Username'}
                  autoComplete="username"
                  required
                />
              </div>

              {/* Password field with Eye Toggle */}
              <div className="mockup-input-wrapper">
                <Lock size={19} className="mockup-field-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="mockup-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>

              {/* Remember me & Forgot Password */}
              <div className="mockup-options-row">
                <label className="mockup-checkbox-label">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                  />
                  <span>Remember me</span>
                </label>

                <button
                  type="button"
                  className="mockup-forgot-link"
                  onClick={handleForgotPassword}
                >
                  Forgot Password?
                </button>
              </div>

              {/* Big Vibrant Login Button */}
              <button className="mockup-submit-btn" disabled={busy}>
                <LogIn size={20} />
                <span>
                  {busy
                    ? 'Authenticating…'
                    : loginMode === 'kds'
                      ? 'Access Kitchen Terminal'
                      : 'Login'}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>

    </div>
  );
}

// -------------------------------------------------------------
// STAFF REGISTER
// -------------------------------------------------------------
function StaffRegister({ setNotice }: { setNotice: (n: Notice | null) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [role, setRole] = useState('employee');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedData, setSubmittedData] = useState<{ name: string; email: string; phone: string; role: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) {
      notify(setNotice, 'Supabase is not configured.', 'error');
      return;
    }

    const cleanName = name.trim();
    if (cleanName.length < 2) {
      notify(setNotice, 'Please enter your full name (at least 2 characters).', 'error');
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      notify(setNotice, 'Please enter a valid 10-digit mobile number.', 'error');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      notify(setNotice, 'Please enter a valid email address.', 'error');
      return;
    }

    if (password.length < 8) {
      notify(setNotice, 'Password must be at least 8 characters.', 'error');
      return;
    }

    if (password !== confirmPassword) {
      notify(setNotice, 'Passwords do not match. Please re-enter your password.', 'error');
      return;
    }

    setBusy(true);
    const normalizedPhone = cleanPhone.length === 10 ? `+91${cleanPhone}` : cleanPhone;
    const cleanEmail = email.trim().toLowerCase();

    try {
      // 1. First attempt registration via staff-register Edge Function
      let edgeSuccess = false;
      try {
        const { data, error } = await supabase.functions.invoke('staff-register', {
          body: {
            full_name: cleanName,
            email: cleanEmail,
            phone: normalizedPhone,
            password,
            requested_role: role
          }
        });

        if (!error && !data?.error) {
          edgeSuccess = true;
          setSubmitted(true);
          setSubmittedData({ name: cleanName, email: cleanEmail, phone: normalizedPhone, role });
          notify(setNotice, data?.message || 'Registration request submitted successfully!', 'success');
          return;
        } else if (data?.error) {
          // If the function returned an explicit validation error, show it
          const msg = String(data.error);
          if (msg.includes('already registered') || msg.includes('already exists')) {
            throw new Error('An account with this mobile number or email is already registered.');
          }
        }
      } catch (edgeErr: any) {
        if (edgeErr.message?.includes('already registered') || edgeErr.message?.includes('already exists')) {
          throw edgeErr;
        }
        // Fall back to direct Supabase Auth signUp if edge function is unavailable
      }

      // 2. Resilient Fallback: Supabase Auth SignUp with metadata
      if (!edgeSuccess) {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: cleanName,
              phone: normalizedPhone,
              requested_role: role
            }
          }
        });

        if (authError) {
          if (authError.message.includes('already registered') || authError.message.includes('User already registered')) {
            throw new Error('An account with this email is already registered. Please sign in or use another email.');
          }
          throw authError;
        }

        // Also record in staff_applications if user ID is available
        if (authData.user?.id) {
          const { data: rest } = await supabase.from('restaurants').select('id').limit(1).maybeSingle();
          const restaurantId = rest?.id;

          try {
            await supabase.from('staff_applications').insert({
              user_id: authData.user.id,
              restaurant_id: restaurantId,
              full_name: cleanName,
              phone: normalizedPhone,
              requested_role: role,
              status: 'pending'
            });
          } catch {
            // Ignore if already logged by database trigger
          }
        }

        setSubmitted(true);
        setSubmittedData({ name: cleanName, email: cleanEmail, phone: normalizedPhone, role });
        notify(setNotice, 'Registration request submitted successfully! An administrator will review your account.', 'success');
      }
    } catch (e: any) {
      notify(setNotice, e.message || 'Registration failed. Please check your details and try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="staff-register-page-wrap">
      {/* Responsive Top Navigation */}
      <div className="staff-register-nav-bar">
        <Link to="/login" className="staff-register-back-link">
          <ArrowLeft size={16} />
          <span>Back to Sign In</span>
        </Link>
        <span className="staff-register-badge">
          Staff Portal
        </span>
      </div>

      <div className="staff-register-card">
        {/* Header with Logo */}
        <div className="staff-register-card-header">
          <div className="staff-register-logo-box">
            <img src="/servora-logo.jpg" alt="SERVORA" className="staff-register-logo-img" />
          </div>
          <h2 className="staff-register-title">New Employee Registration</h2>
          <p className="staff-register-subtitle">
            Submit your profile to join the restaurant team • Administrator approval required
          </p>
          <div className="staff-register-accent-bar" />
        </div>

        {submitted ? (
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: '#dcfce7',
                border: '2px solid #86efac',
                color: '#15803d',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                boxShadow: '0 8px 20px rgba(22, 163, 74, 0.2)'
              }}
            >
              <CheckCircle2 size={36} />
            </div>

            <h3 style={{ fontSize: 22, fontWeight: 800, color: '#1e0c04', margin: '0 0 8px' }}>
              Application Submitted!
            </h3>
            <p style={{ fontSize: 14, color: '#7a5440', lineHeight: 1.6, margin: '0 0 16px' }}>
              Your registration application has been recorded for <b>SERVORA</b>. An administrator will review your account
              and assign your kitchen station or floor section before access is activated.
            </p>

            {submittedData && (
              <div className="register-receipt-box">
                <div className="receipt-row">
                  <span className="receipt-label">Full Name</span>
                  <span className="receipt-val">{submittedData.name}</span>
                </div>
                <div className="receipt-row">
                  <span className="receipt-label">Email</span>
                  <span className="receipt-val">{submittedData.email}</span>
                </div>
                <div className="receipt-row">
                  <span className="receipt-label">Mobile Number</span>
                  <span className="receipt-val">{submittedData.phone}</span>
                </div>
                <div className="receipt-row">
                  <span className="receipt-label">Requested Role</span>
                  <span className="receipt-val" style={{ color: '#ea580c' }}>
                    {submittedData.role === 'kitchen' ? 'Kitchen Staff / Cook' : 'Floor Waiter / Service Staff'}
                  </span>
                </div>
                <div className="receipt-row">
                  <span className="receipt-label">Account Status</span>
                  <span className="receipt-val" style={{ color: '#b45309' }}>
                    Pending Admin Approval
                  </span>
                </div>
              </div>
            )}

            <Link
              to="/login"
              className="register-submit-btn"
              style={{ textDecoration: 'none', display: 'flex' }}
            >
              <span>Return to Staff Sign In</span>
              <ArrowRight size={18} />
            </Link>
          </div>
        ) : (
          <form className="staff-register-form-grid" onSubmit={submit}>
            {/* Full Name */}
            <div className="register-field-row">
              <label className="register-field-label">
                <span>Full Name</span>
                <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <div className="register-field-box">
                <User size={18} className="register-field-icon" />
                <input
                  type="text"
                  className="register-field-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. S. Ramanathan"
                  required
                  minLength={2}
                />
              </div>
            </div>

            {/* Email Address */}
            <div className="register-field-row">
              <label className="register-field-label">
                <span>Email Address</span>
                <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <div className="register-field-box">
                <Mail size={18} className="register-field-icon" />
                <input
                  type="email"
                  className="register-field-input"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="e.g. ramanathan@servora.com"
                  required
                />
              </div>
            </div>

            {/* Mobile Number */}
            <div className="register-field-row">
              <label className="register-field-label">
                <span>Mobile Number</span>
                <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <div className="register-field-box">
                <span style={{ color: '#ea580c', fontWeight: 800, fontSize: 13.5, marginRight: 8 }}>
                  +91
                </span>
                <input
                  type="tel"
                  className="register-field-input"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 10))}
                  placeholder="10-digit mobile number"
                  required
                  maxLength={10}
                />
              </div>
            </div>

            {/* Requested Role Choice Cards */}
            <div className="register-field-row">
              <label className="register-field-label">
                <span>Requested Role</span>
                <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <div className="role-choice-grid">
                <div
                  className={`role-choice-card ${role === 'employee' ? 'active' : ''}`}
                  onClick={() => setRole('employee')}
                >
                  <div className="role-card-icon-box">
                    <Utensils size={18} />
                  </div>
                  <div>
                    <span className="role-card-title">Floor Waiter</span>
                    <span className="role-card-desc">Customer dining &amp; tables</span>
                  </div>
                </div>

                <div
                  className={`role-choice-card ${role === 'kitchen' ? 'active' : ''}`}
                  onClick={() => setRole('kitchen')}
                >
                  <div className="role-card-icon-box">
                    <ChefHat size={18} />
                  </div>
                  <div>
                    <span className="role-card-title">Kitchen Staff</span>
                    <span className="role-card-desc">Station cooking &amp; KDS</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Password */}
            <div className="register-field-row">
              <label className="register-field-label">
                <span>Password</span>
                <span style={{ color: '#dc2626' }}>*</span>
                <span style={{ fontSize: 11, color: '#8c6a58', fontWeight: 500, marginLeft: 'auto' }}>
                  (min. 8 characters)
                </span>
              </label>
              <div className="register-field-box">
                <Lock size={18} className="register-field-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="register-field-input"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  minLength={8}
                  required
                  placeholder="Create a secure password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8c6a58', padding: 4 }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="register-field-row">
              <label className="register-field-label">
                <span>Confirm Password</span>
                <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <div className="register-field-box">
                <Lock size={18} className="register-field-icon" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="register-field-input"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  minLength={8}
                  required
                  placeholder="Re-enter password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8c6a58', padding: 4 }}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {password && confirmPassword && (
                <div className={`password-match-badge ${password === confirmPassword ? 'matched' : 'mismatch'}`}>
                  {password === confirmPassword ? (
                    <>
                      <Check size={14} />
                      <span>Passwords match</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={14} />
                      <span>Passwords do not match</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Info callout */}
            <div className="register-info-callout">
              <ShieldCheck size={18} style={{ color: '#ea580c', flexShrink: 0, marginTop: 1 }} />
              <div>
                Admin accounts cannot be self-requested. Submitted requests require restaurant manager verification before access is granted.
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="register-submit-btn"
              disabled={busy || (Boolean(password) && Boolean(confirmPassword) && password !== confirmPassword)}
            >
              <span>{busy ? 'Submitting Application…' : 'Submit for Approval'}</span>
              <ArrowRight size={18} />
            </button>

            {/* Footer link to Sign In */}
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <Link
                to="/login"
                style={{ fontSize: 13, color: '#7a5440', fontWeight: 600, textDecoration: 'none' }}
              >
                Already registered? <span style={{ color: '#ea580c', fontWeight: 800, textDecoration: 'underline' }}>Sign In here</span>
              </Link>
            </div>
          </form>
        )}
      </div>

    </div>
  );
}

// -------------------------------------------------------------
// NAVIGATION & STAFF APP (UPGRADED MATCHING REFERENCE SCREENSHOTS)
// -------------------------------------------------------------
const navItems = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'employee'] },
  { id: 'orders', label: 'Orders', icon: ClipboardList, roles: ['admin', 'kitchen', 'employee'] },
  { id: 'menu', label: 'Menu Management', icon: Utensils, roles: ['admin'] },
  { id: 'tables', label: 'Tables', icon: Utensils, roles: ['admin', 'employee'] },
  { id: 'customers', label: 'Customers', icon: Users, roles: ['admin', 'employee'] },
  { id: 'attendance', label: 'Attendance', icon: CalendarDays, roles: ['employee'] },
  { id: 'bills', label: 'Bills', icon: Receipt, roles: ['employee'] },
  { id: 'staff', label: 'Employee Management', icon: Users, roles: ['admin', 'kitchen'] },
  { id: 'kitchen', label: 'Kitchen (KDS)', icon: Monitor, roles: ['admin', 'kitchen'] },
  { id: 'reports', label: 'Reports & Analytics', icon: BarChart3, roles: ['admin'] },
  { id: 'settings', label: 'Settings', icon: Settings, roles: ['admin'] }
];

const PAGE_META: Record<string, { title: string; subtitle: string; icon: any }> = {
  overview: {
    title: 'Dashboard',
    subtitle: 'Manage your restaurant, orders, tables and live floor operations.',
    icon: ClipboardList
  },
  orders: {
    title: 'Orders Management',
    subtitle: 'View, track, accept and serve customer orders in real-time.',
    icon: CalendarDays
  },
  menu: {
    title: 'Menu Management',
    subtitle: 'Create, update and organize your restaurant menu.',
    icon: ChefHat
  },
  tables: {
    title: 'Tables',
    subtitle: 'Manage your assigned tables and guest service requests.',
    icon: Users
  },
  attendance: {
    title: 'Attendance',
    subtitle: 'QR-based check-in, check-out, manual code and work history.',
    icon: CalendarDays
  },
  bills: {
    title: 'Bills & Settlement',
    subtitle: 'Generate bills, calculate GST, record Cash or UPI payments.',
    icon: Receipt
  },
  staff: {
    title: 'Employee Management',
    subtitle: 'Manage restaurant employees, roles, shifts and daily attendance.',
    icon: Users
  },
  kitchen: {
    title: 'Kitchen Display System (KDS)',
    subtitle: 'Real-time kitchen order management, staff and kitchen operations.',
    icon: ChefHat
  },
  customers: {
    title: 'Customer Directory',
    subtitle: 'Search customers by mobile, register, view history and loyalty.',
    icon: Users
  },
  reports: {
    title: 'Reports & Analytics',
    subtitle: 'Track sales, orders, customers, staff and overall restaurant performance.',
    icon: BarChart3
  },
  settings: {
    title: 'Settings',
    subtitle: 'Manage your restaurant configuration, operations and system preferences.',
    icon: Settings
  }
};

function StaffApp({
  profile,
  ready,
  signOut,
  setNotice
}: {
  profile: StaffProfile | null;
  ready: boolean;
  signOut: () => void;
  setNotice: (n: Notice | null) => void;
}) {
  const loc = useLocation();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [tab, setTab] = useState('overview');

  // Global search state
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    orders: any[];
    customers: any[];
    tables: any[];
    menu: any[];
    staff: any[];
  }>({ orders: [], customers: [], tables: [], menu: [], staff: [] });

  // Live multi-entity search across orders, customers, tables, menu, staff
  useEffect(() => {
    if (!globalSearch.trim() || !supabase) {
      setSearchResults({ orders: [], customers: [], tables: [], menu: [], staff: [] });
      return;
    }
    const q = globalSearch.trim().toLowerCase();
    const timer = window.setTimeout(async () => {
      const client = supabase;
      if (!client) return;
      setIsSearching(true);
      try {
        const [ordersRes, custRes, tablesRes, menuRes, staffRes] = await Promise.all([
          client.from('orders').select('id,order_number,status,total_amount,table_number,customer_name').limit(15),
          client.from('customers').select('id,full_name,phone,email').ilike('full_name', `%${q}%`).limit(4),
          client.from('dining_tables').select('id,table_number,capacity,status').ilike('table_number', `%${q}%`).limit(4),
          client.from('menu_items').select('id,name,price,category').ilike('name', `%${q}%`).limit(4),
          client.from('profiles').select('id,full_name,role,phone').ilike('full_name', `%${q}%`).limit(4)
        ]);

        const filteredOrders = (ordersRes.data || [])
          .filter((o: any) =>
            (o.order_number || '').toLowerCase().includes(q) ||
            (o.customer_name || '').toLowerCase().includes(q) ||
            (o.table_number || '').toLowerCase().includes(q)
          )
          .slice(0, 4);

        setSearchResults({
          orders: filteredOrders,
          customers: custRes.data || [],
          tables: tablesRes.data || [],
          menu: menuRes.data || [],
          staff: staffRes.data || []
        });
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 180);

    return () => window.clearTimeout(timer);
  }, [globalSearch]);

  const totalResultsCount =
    searchResults.orders.length +
    searchResults.customers.length +
    searchResults.tables.length +
    searchResults.menu.length +
    searchResults.staff.length;

  const allowed = profile ? navItems.filter(n => n.roles.includes(profile.role)) : [];
  const isWaiter = profile?.role === 'employee';
  const homeTab = profile?.role === 'kitchen' ? 'kitchen' : isWaiter ? 'tables' : allowed[0]?.id || 'orders';
  const requestedTab = loc.pathname.split('/')[2] || (allowed.some(n => n.id === tab) ? tab : homeTab);
  const effectiveTab = allowed.some(n => n.id === requestedTab) ? requestedTab : homeTab;
  const active = allowed.find(n => n.id === effectiveTab) || allowed[0];
  const pageMeta = isWaiter && effectiveTab === 'tables' ? {
    title: 'Tables',
    subtitle: 'Manage your assigned tables and guest service requests.',
    icon: Users
  } : isWaiter && effectiveTab === 'overview' ? {
    title: 'Dashboard',
    subtitle: "Today's summary, assigned tables, active orders and service statistics.",
    icon: LayoutDashboard
  } : PAGE_META[effectiveTab] || {
    title: active?.label || 'Workspace',
    subtitle: 'Manage restaurant operations.',
    icon: LayoutDashboard
  };
  const PageIcon = pageMeta.icon;

  useEffect(() => {
    const part = loc.pathname.split('/')[2];
    if (part) setTab(part);
  }, [loc.pathname]);

  useEffect(() => {
    if (ready && supabaseConfigured && profile && effectiveTab !== requestedTab) {
      setTab(effectiveTab);
      nav(`/app/${effectiveTab}`, { replace: true });
    }
  }, [ready, profile, effectiveTab, requestedTab, nav]);

  useEffect(() => {
    const handlePop = () => {
      if (!window.location.hash.includes('/app') && !window.location.pathname.includes('/app')) {
        nav('/login');
      }
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [nav]);

  if (!ready) return <div className="loading-page">Loading secure workspace…</div>;
  if (!supabaseConfigured) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <AlertCircle className="warn-icon" size={32} />
          <h2>Connect your Supabase project</h2>
          <p>
            The staff workspace is ready, but live data and authentication require your Supabase
            project credentials in .env.
          </p>
          <Link className="primary-btn full" to="/login">
            Back to Portal
          </Link>
        </div>
      </div>
    );
  }
  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  // If user is kitchen staff, render dedicated full KDS view
  if (profile.role === 'kitchen') {
    return <Kitchen setNotice={setNotice} profile={profile} signOut={signOut} isStandalone={true} />;
  }

  function go(id: string) {
    if (!allowed.some(n => n.id === id)) return;
    setTab(id);
    nav(`/app/${id}`);
    setMobileOpen(false);
  }

  return (
    <div className={`workspace admin-workspace-screen ${collapsed ? 'sidebar-minimized' : ''}`}>
      {/* 1. Deep Dark Chocolate Sidebar with Collapsible / Minimize feature */}
      <aside className={`sidebar dark-chocolate-sidebar ${mobileOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
        <div className="side-brand-header">
          {!collapsed ? (
            <img src="/servora-logo.jpg" alt="SERVORA" className="sidebar-brand-logo" />
          ) : (
            <div className="sidebar-brand-mini" title="Servora">
              <img src="/servora-icon.png" alt="Servora" className="sidebar-brand-mini-img" />
            </div>
          )}
          <button
            type="button"
            className="sidebar-collapse-toggle-btn"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand sidebar" : "Minimize sidebar"}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <button
            type="button"
            className="sidebar-mobile-close-btn"
            onClick={() => setMobileOpen(false)}
            title="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="sidebar-main-nav">
          {allowed.map(n => (
            <button
              key={n.id}
              className={`sidebar-nav-item ${tab === n.id ? 'active' : ''}`}
              onClick={() => go(n.id)}
              title={n.label}
            >
              <n.icon size={18} className="nav-item-icon" />
              <span className="nav-item-text">{n.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Mobile Dimming Backdrop Overlay */}
      {mobileOpen && (
        <div
          className="sidebar-mobile-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      {/* 2. Main Work Area matching Screenshots */}
      <main className="work-main admin-work-main">
        {/* Top Header matching all reference images */}
        <header className="work-top admin-work-top">
          <div className="top-header-left">
            <button className="mobile-menu" onClick={() => setMobileOpen(!mobileOpen)}>
              <MenuIcon />
            </button>
            <div className="top-page-icon-square">
              {PageIcon && <PageIcon size={20} />}
            </div>
            <div className="top-title-text-group">
              <h1 className="top-page-title">{pageMeta.title}</h1>
              <p className="top-page-subtitle">{pageMeta.subtitle}</p>
            </div>
          </div>

          <div className="top-header-right">
            <div className="top-global-search" onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setSearchFocused(false);
              }
            }}>
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search orders, tables, customers, menu..."
                className="top-search-input"
                value={globalSearch}
                onChange={e => {
                  setGlobalSearch(e.target.value);
                  setSearchFocused(true);
                }}
                onFocus={() => setSearchFocused(true)}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    setSearchFocused(false);
                  }
                }}
              />
              {globalSearch && (
                <button
                  type="button"
                  className="top-search-clear-btn"
                  onClick={() => {
                    setGlobalSearch('');
                    setSearchFocused(false);
                  }}
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}

              {/* Real-time Global Search Dropdown Popup */}
              {searchFocused && globalSearch.trim().length > 0 && (
                <div className="global-search-dropdown-menu" onMouseDown={e => e.preventDefault()}>
                  <div className="search-dropdown-header">
                    <span>Search Results for "<b>{globalSearch}</b>"</span>
                    {isSearching && <span className="searching-spinner">Searching...</span>}
                  </div>

                  {totalResultsCount === 0 && !isSearching ? (
                    <div className="search-empty-result">
                      <p>No matching orders, customers, tables or menu items found.</p>
                    </div>
                  ) : (
                    <div className="search-results-groups-scroll">
                      {/* 1. Orders */}
                      {searchResults.orders.length > 0 && (
                        <div className="search-group-section">
                          <span className="search-group-title">Orders</span>
                          {searchResults.orders.map(order => (
                            <button
                              key={order.id}
                              type="button"
                              className="search-result-row-btn"
                              onClick={() => {
                                setTab('orders');
                                nav('/app/orders');
                                setSearchFocused(false);
                              }}
                            >
                              <div className="row-badge-pill">#{order.order_number || order.id?.slice(0, 6)}</div>
                              <div className="row-text-col">
                                <span className="primary-text">Table {order.table_number || 'N/A'} • {order.customer_name || 'Guest'}</span>
                                <span className="secondary-text">₹{order.total_amount || 0} • Status: {order.status}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* 2. Customers */}
                      {searchResults.customers.length > 0 && (
                        <div className="search-group-section">
                          <span className="search-group-title">Customers</span>
                          {searchResults.customers.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              className="search-result-row-btn"
                              onClick={() => {
                                setTab('customers');
                                nav('/app/customers');
                                setSearchFocused(false);
                              }}
                            >
                              <div className="row-badge-pill avatar">{c.full_name?.slice(0, 1)}</div>
                              <div className="row-text-col">
                                <span className="primary-text">{c.full_name}</span>
                                <span className="secondary-text">{c.phone || c.email}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* 3. Dining Tables */}
                      {searchResults.tables.length > 0 && (
                        <div className="search-group-section">
                          <span className="search-group-title">Tables</span>
                          {searchResults.tables.map(t => (
                            <button
                              key={t.id}
                              type="button"
                              className="search-result-row-btn"
                              onClick={() => {
                                setTab('tables');
                                nav('/app/tables');
                                setSearchFocused(false);
                              }}
                            >
                              <div className="row-badge-pill table">{t.table_number}</div>
                              <div className="row-text-col">
                                <span className="primary-text">Dining Table {t.table_number}</span>
                                <span className="secondary-text">{t.capacity || 4} Guests Capacity • {t.status}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* 4. Menu Items */}
                      {searchResults.menu.length > 0 && (
                        <div className="search-group-section">
                          <span className="search-group-title">Menu Dishes</span>
                          {searchResults.menu.map(m => (
                            <button
                              key={m.id}
                              type="button"
                              className="search-result-row-btn"
                              onClick={() => {
                                setTab('menu');
                                nav('/app/menu');
                                setSearchFocused(false);
                              }}
                            >
                              <div className="row-badge-pill food">₹</div>
                              <div className="row-text-col">
                                <span className="primary-text">{m.name}</span>
                                <span className="secondary-text">{m.category} • ₹{m.price}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* 5. Staff */}
                      {searchResults.staff.length > 0 && (
                        <div className="search-group-section">
                          <span className="search-group-title">Staff Members</span>
                          {searchResults.staff.map(s => (
                            <button
                              key={s.id}
                              type="button"
                              className="search-result-row-btn"
                              onClick={() => {
                                setTab('staff');
                                nav('/app/staff');
                                setSearchFocused(false);
                              }}
                            >
                              <div className="row-badge-pill staff"><ChefHat size={16} /></div>
                              <div className="row-text-col">
                                <span className="primary-text">{s.full_name}</span>
                                <span className="secondary-text">{s.role === 'admin' ? 'Head Chef' : s.role === 'kitchen' ? 'Cook' : 'Service Staff'}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button type="button" className="top-bell-btn" title="View orders" aria-label="View orders" onClick={() => go('orders')}>
              <Bell size={18} />
            </button>

            {/* Profile Dropdown Container */}
            <div style={{ position: 'relative' }}>
              <div
                className="top-profile-badge-pill"
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                style={{ cursor: 'pointer' }}
                title="Account options & log out"
              >
                <span className="profile-avatar-circle">
                  {(profile.full_name?.trim().slice(0, 1) || 'S').toUpperCase()}
                </span>
                <span className="profile-name-text">
                  {profile.full_name?.split(' ')[0] || (profile.role === 'admin' ? 'Admin' : 'Staff')}
                </span>
                <ChevronDown size={14} className="dropdown-arrow" />
              </div>

              {/* Profile Dropdown Menu */}
              {profileDropdownOpen && (
                <>
                  <div
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }}
                    onClick={() => setProfileDropdownOpen(false)}
                  />
                  <div className="top-profile-dropdown-menu">
                    <div className="dropdown-user-header">
                      <div className="dropdown-user-avatar">
                        {(profile.full_name?.trim().slice(0, 1) || 'S').toUpperCase()}
                      </div>
                      <div className="dropdown-user-details">
                        <b>{profile.full_name || (profile.role === 'admin' ? 'Administrator' : 'Staff')}</b>
                        <span>{profile.email || profile.phone || ''}</span>
                        <small className="dropdown-user-role-badge">
                          {profile.role === 'admin' ? 'Administrator' : profile.role === 'employee' ? 'Waiter / Floor Staff' : 'Kitchen Staff'}
                        </small>
                      </div>
                    </div>

                    <div className="dropdown-menu-divider" />

                    <Link
                      to="/order"
                      className="dropdown-menu-item"
                      onClick={() => setProfileDropdownOpen(false)}
                    >
                      <Utensils size={16} color="#ea580c" />
                      <span>Customer Dine-In Menu</span>
                    </Link>

                    <button
                      type="button"
                      className="dropdown-menu-item logout-danger"
                      onClick={() => {
                        setProfileDropdownOpen(false);
                        signOut();
                      }}
                    >
                      <LogOut size={16} color="#dc2626" />
                      <span>Log Out</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Dynamic Page Views */}
        <div className="work-content admin-work-content">
          {effectiveTab === 'overview' ? (
            profile.role === 'employee' ? (
              <WaiterDashboard onNavigateTab={go} setNotice={setNotice} />
            ) : (
              <DashboardOverview />
            )
          ) : effectiveTab === 'orders' ? (
            <OrdersPage setNotice={setNotice} globalSearch={globalSearch} />
          ) : effectiveTab === 'menu' && profile.role === 'admin' ? (
            <MenuPage setNotice={setNotice} globalSearch={globalSearch} />
          ) : effectiveTab === 'tables' ? (
            profile.role === 'employee' ? (
              <WaiterTablesPage setNotice={setNotice} globalSearch={globalSearch} />
            ) : (
              <TablesPage setNotice={setNotice} globalSearch={globalSearch} />
            )
          ) : effectiveTab === 'attendance' && profile.role === 'employee' ? (
            <WaiterAttendancePage profile={profile} setNotice={setNotice} />
          ) : effectiveTab === 'staff' || effectiveTab === 'attendance' ? (
            <StaffPage profile={profile} setNotice={setNotice} globalSearch={globalSearch} />
          ) : effectiveTab === 'bills' ? (
            <WaiterBillsPage setNotice={setNotice} globalSearch={globalSearch} />
          ) : effectiveTab === 'kitchen' && profile.role === 'admin' ? (
            <KitchenAdminPage setNotice={setNotice} />
          ) : effectiveTab === 'customers' ? (
            <CustomersPage setNotice={setNotice} globalSearch={globalSearch} />
          ) : effectiveTab === 'reports' && profile.role === 'admin' ? (
            <ReportsPage setNotice={setNotice} />
          ) : effectiveTab === 'settings' && profile.role === 'admin' ? (
            <SettingsAdminPage setNotice={setNotice} />
          ) : (
            <DashboardOverview />
          )}
        </div>
      </main>

    </div>
  );
}

function SectionTitle({ title, desc, action }: { title: string; desc: string; action?: ReactNode }) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
      {action}

    </div>
  );
}

function SetupNotice() {
  return (
    <div className="setup-notice">
      <AlertCircle size={20} />
      <div>
        <b>Live database connection required</b>
        <p>
          Configure <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env</code>.
        </p>
      </div>

    </div>
  );
}

// -------------------------------------------------------------
// OVERVIEW
// -------------------------------------------------------------
function Overview() {
  const [orders, setOrders] = useState<any[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    const load = () =>
      getOrders()
        .then(o => setOrders([...o].reverse()))
        .catch(e => setErr(e.message));
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const pending = orders.filter(o => !['completed', 'cancelled', 'served'].includes(o.status)).length;
  const todayStr = new Date().toDateString();
  const todayOrders = orders.filter(o => new Date(o.created_at).toDateString() === todayStr && o.status !== 'cancelled');
  const todayValue = todayOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  return (
    <>
      <div className="welcome-strip">
        <div>
          <span className="eyebrow">TODAY AT A GLANCE</span>
          <h2>Good service starts with a clear view.</h2>
          <p>Monitor incoming orders and keep every station in sync.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
          <div className="welcome-icon">
            <Activity size={34} />
          </div>
          <Link to="/app/tables" className="outline-btn" style={{ background: '#fff', color: '#7c2d12', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>
            <QrCode size={15} /> View Table QRs
          </Link>
        </div>
      </div>
      {err && !supabaseConfigured ? <SetupNotice /> : err && <div className="inline-error">{err}</div>}
      <div className="stat-grid">
        <Stat icon={ShoppingBag} label="Orders today" value={todayOrders.length.toString()} tone="orange" />
        <Stat icon={Clock3} label="Active orders" value={pending.toString()} tone="amber" />
        <Stat
          icon={CheckCircle2}
          label="Completed"
          value={orders.filter(o => ['served', 'completed'].includes(o.status)).length.toString()}
          tone="green"
        />
        <Stat icon={Wallet} label="Order value today" value={money(todayValue)} tone="brown" />
      </div>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Recent orders</h3>
            <p>Live orders from the restaurant database</p>
          </div>
          <Link to="/app/orders" className="text-link">
            View all <ArrowRight size={15} />
          </Link>
        </div>
        <OrderTable rows={orders.slice(0, 6)} />
      </div>
      <div className="two-grid">
        <div className="panel quick-panel">
          <h3>Kitchen operations</h3>
          <p>Station-specific tickets are sequenced by first-in, first-out.</p>
          <Link to="/app/kitchen" className="outline-btn">
            Open kitchen display <ArrowRight size={15} />
          </Link>
        </div>
        <div className="panel quick-panel">
          <h3>Restaurant setup</h3>
          <p>Configure tables, QR codes, menu items and staff access.</p>
          <Link to="/app/menu" className="outline-btn">
            Manage menu <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: string }) {
  return (
    <div className="stat-card">
      <span className={`stat-icon ${tone}`}>
        <Icon size={20} />
      </span>
      <div>
        <small>{label}</small>
        <b>{value}</b>
      </div>

    </div>
  );
}

function OrderTable({
  rows,
  canServe = false,
  onServe,
  canBill = false,
  onBill
}: {
  rows: any[];
  canServe?: boolean;
  onServe?: (id: string) => void;
  canBill?: boolean;
  onBill?: (sessionId: string) => void;
}) {
  if (!rows.length) {
    return (
      <div className="empty-state">
        <ShoppingBag size={28} />
        <b>No orders yet</b>
        <p>Customer orders placed via QR codes will appear here in real-time.</p>
      </div>
    );
  }
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Table</th>
            <th>Items</th>
            <th>Placed</th>
            <th>Status</th>
            <th>Total</th>
            {(canServe || canBill) && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(o => (
            <tr key={o.id}>
              <td>
                <b>#{o.order_number}</b>
              </td>
              <td>{o.customer_name}</td>
              <td>{o.table_label || '—'}</td>
              <td className="items-cell">
                {(o.order_items || []).length
                  ? (o.order_items as any[]).map(i => `${i.quantity}× ${i.item_name}`).join(', ')
                  : '—'}
              </td>
              <td>
                {new Date(o.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </td>
              <td>
                <span className={`status-pill ${o.status}`}>{o.status?.replaceAll('_', ' ')}</span>
              </td>
              <td>{money(Number(o.total || 0))}</td>
              {(canServe || canBill) && (
                <td className="order-actions">
                  {canServe && o.status === 'ready_for_collection' && (
                    <button className="approve-btn" onClick={() => onServe?.(o.id)}>
                      <Check size={14} /> Mark served
                    </button>
                  )}
                  {canBill &&
                    o.dining_session_id &&
                    ['ready_for_collection', 'ready_for_serving', 'served', 'completed'].includes(o.status) && (
                      <button className="outline-btn" onClick={() => onBill?.(o.dining_session_id)}>
                        <Wallet size={14} /> Create / refresh bill
                      </button>
                    )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

    </div>
  );
}

// -------------------------------------------------------------
// ORDERS
// -------------------------------------------------------------
function Orders({ role, setNotice }: { role: AppRole; setNotice: (n: Notice | null) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'active' | 'ready' | 'done' | 'all'>('active');

  const refresh = useCallback(
    () =>
      getOrders()
        .then(o => {
          setError('');
          setRows([...o].reverse());
        })
        .catch(e => setError(e.message)),
    []
  );

  useEffect(() => {
    refresh();
    const poll = window.setInterval(refresh, 12000);
    let ch: any;
    if (supabase) {
      ch = supabase
        .channel(`orders-list-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, refresh)
        .subscribe();
    }
    return () => {
      window.clearInterval(poll);
      if (supabase && ch) supabase.removeChannel(ch);
    };
  }, [refresh]);

  const inView = (o: any) =>
    view === 'all' ||
    (view === 'active' && !['served', 'completed', 'cancelled', 'ready_for_collection', 'ready_for_serving'].includes(o.status)) ||
    (view === 'ready' && ['ready_for_collection', 'ready_for_serving'].includes(o.status)) ||
    (view === 'done' && ['served', 'completed', 'cancelled'].includes(o.status));
  const filtered = rows
    .filter(inView)
    .filter(o => `${o.order_number} ${o.customer_name} ${o.table_label}`.toLowerCase().includes(query.toLowerCase()));
  const readyCount = rows.filter(o => ['ready_for_collection', 'ready_for_serving'].includes(o.status)).length;

  async function serve(id: string) {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('mark_order_served', { p_order_id: id });
    if (error || data?.error) {
      notify(setNotice, error?.message || data.error, 'error');
      return;
    }
    notify(setNotice, 'Order marked as served.');
    refresh();
  }

  async function createBill(sessionId: string) {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('create_bill_for_session', { p_session_id: sessionId });
    if (error || data?.error) {
      notify(setNotice, error?.message || data.error, 'error');
      return;
    }
    notify(setNotice, `Bill #${data.bill_number} is ready. Open Billing to record payment.`);
  }

  const canBill = role === 'admin' || role === 'employee';
  return (
    <>
      <SectionTitle
        title="Order Management"
        desc="Consolidated customer orders with station preparation status."
        action={
          <button className="outline-btn" onClick={refresh}>
            <RefreshCw size={15} /> Refresh
          </button>
        }
      />
      {error && <div className="inline-error">{error}</div>}
      <div className="station-tabs">
        {([['active', 'In kitchen'], ['ready', `Ready to serve${readyCount ? ` (${readyCount})` : ''}`], ['done', 'Served / closed'], ['all', 'All']] as const).map(([id, label]) => (
          <button key={id} className={view === id ? 'selected' : ''} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="filter-row">
        <div className="search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search order, customer or table"
          />
        </div>
        <span className="muted">{filtered.length} orders</span>
      </div>
      <div className="panel">
        <OrderTable
          rows={filtered}
          canServe={role === 'employee' || role === 'admin'}
          onServe={serve}
          canBill={canBill}
          onBill={createBill}
        />
      </div>
    </>
  );
}

// -------------------------------------------------------------
// KITCHEN DISPLAY SYSTEM
// -------------------------------------------------------------
function playChime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1175].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.start(t);
      o.stop(t + 0.32);
    });
  } catch {
    /* audio is optional */
  }
}

function minutesSince(iso: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

function Kitchen({
  setNotice,
  profile,
  signOut,
  isStandalone = false
}: {
  setNotice: (n: Notice | null) => void;
  profile?: StaffProfile | null;
  signOut?: () => void;
  isStandalone?: boolean;
}) {
  const nav = useNavigate();
  const [kdsEmail, setKdsEmail] = useState('');
  const [kdsPassword, setKdsPassword] = useState('');
  const [kdsLoading, setKdsLoading] = useState(false);
  const [kdsError, setKdsError] = useState('');

  // Enforce Kitchen Display System login requirement
  if (!profile) {
    const handleKdsLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setKdsLoading(true);
      setKdsError('');
      try {
        if (!supabase) throw new Error('Supabase client not initialized.');
        const { error: authErr } = await supabase.auth.signInWithPassword({
          email: kdsEmail.trim(),
          password: kdsPassword
        });
        if (authErr) throw authErr;
        setNotice({ text: 'Kitchen Terminal authenticated successfully.', kind: 'success' });
      } catch (err: any) {
        setKdsError(err.message || 'Authentication failed. Please verify credentials.');
      } finally {
        setKdsLoading(false);
      }
    };

    return (
      <div className="kitchen-terminal-login-wrap" style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1c100a 0%, #2b1308 50%, #150a04 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        color: '#ffffff'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '460px',
          background: 'rgba(35, 18, 9, 0.92)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '24px',
          padding: '36px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{
              width: 68,
              height: 68,
              borderRadius: '20px',
              background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(234, 88, 12, 0.35)',
              marginBottom: '16px'
            }}>
              <ChefHat size={36} color="#ffffff" />
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: 800, margin: 0, color: '#ffffff' }}>
              Kitchen Display System (KDS)
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#ebdcd0' }}>
              Dedicated Terminal Station &bull; Login Required to Access
            </p>
          </div>

          {kdsError && (
            <div style={{
              padding: '12px 16px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              color: '#fca5a5',
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: '20px'
            }}>
              {kdsError}
            </div>
          )}

          <form onSubmit={handleKdsLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#fed7aa', marginBottom: '6px' }}>
                Terminal Account Email
              </label>
              <input
                type="email"
                value={kdsEmail}
                onChange={e => setKdsEmail(e.target.value)}
                required
                placeholder="Kitchen account email"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#ffffff',
                  fontSize: '14px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#fed7aa', marginBottom: '6px' }}>
                Terminal Password
              </label>
              <input
                type="password"
                value={kdsPassword}
                onChange={e => setKdsPassword(e.target.value)}
                required
                placeholder="••••••••••••"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#ffffff',
                  fontSize: '14px'
                }}
              />
            </div>


            <button
              type="submit"
              disabled={kdsLoading}
              style={{
                marginTop: '8px',
                padding: '14px',
                borderRadius: '14px',
                background: '#ea580c',
                color: '#ffffff',
                border: 'none',
                fontWeight: 800,
                fontSize: '15px',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(234, 88, 12, 0.4)'
              }}
            >
              {kdsLoading ? 'Authenticating Terminal...' : 'Access Kitchen Terminal'}
            </button>

            <Link
              to="/login"
              style={{
                textAlign: 'center',
                color: '#ebdcd0',
                fontSize: '13px',
                marginTop: '6px',
                textDecoration: 'none'
              }}
            >
              <ArrowLeft size={14} /> Back to Restaurant Portal
            </Link>
          </form>
        </div>
      </div>
    );
  }

  const currentProfile: StaffProfile = profile;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [cancelRequests, setCancelRequests] = useState<CancellationRequestInfo[]>([]);
  const [activeStation, setActiveStation] = useState('all');
  const [activeNav, setActiveNav] = useState<'live' | 'queue' | 'report' | 'staff' | 'stations' | 'completed' | 'history' | 'settings'>('live');
  const [searchQueue, setSearchQueue] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState<'today' | 'yesterday' | 'week' | 'all' | string>('today');
  const [historySearch, setHistorySearch] = useState('');
  const [selectedHistoryOrder, setSelectedHistoryOrder] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(new Date());
  const [sound, setSound] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const knownIds = useRef<Set<string> | null>(null);
  const soundRef = useRef(true);
  soundRef.current = sound;

  const refresh = useCallback(
    () =>
      Promise.all([
        getOrders({ activeOnly: false }),
        getStations(),
        getStaffList(),
        supabase ? supabase.from('attendance_records').select('*') : Promise.resolve({ data: [] }),
        getPendingCancellationRequests()
      ])
        .then(([o, s, stf, attRes, cReqs]) => {
          setError('');
          setRows(o);
          setStations(s);
          setStaff(stf || []);
          setAttendance((attRes as any)?.data || []);
          setCancelRequests(cReqs || []);
          const ids = new Set<string>(o.map((x: any) => x.id));
          if (knownIds.current) {
            const fresh = [...ids].filter(id => !knownIds.current!.has(id));
            if (fresh.length && soundRef.current) playChime();
          }
          knownIds.current = ids;
        })
        .catch(e => setError(e.message || 'Could not load kitchen orders.'))
        .finally(() => setLoaded(true)),
    []
  );

  useEffect(() => {
    refresh();
    const poll = window.setInterval(refresh, 3000);
    const tick = window.setInterval(() => setNow(new Date()), 1000);
    let ch: any;
    if (supabase) {
      const handleDbChange = () => {
        refresh();
        setTimeout(refresh, 600);
        setTimeout(refresh, 1800);
      };
      ch = supabase
        .channel(`kds-live-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, handleDbChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, handleDbChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'station_tickets' }, handleDbChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, handleDbChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests' }, handleDbChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_cancel_requests' }, handleDbChange)
        .subscribe();
    }
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
      if (supabase && ch) supabase.removeChannel(ch);
    };
  }, [refresh]);

  async function handleApproveCancel(orderId: string, serviceReqId: string, tableLabel: string, orderNumber: any) {
    if (busyId === orderId) return;
    setBusyId(orderId);
    try {
      await approveOrderCancellation(orderId, serviceReqId, tableLabel);
      if (sound) playChime();
      notify(setNotice, `Order #${orderNumber} cancellation APPROVED by kitchen. Order cancelled.`, 'success');
      await refresh();
    } catch (err: any) {
      notify(setNotice, err.message || 'Could not approve cancellation.', 'error');
    } finally {
      setBusyId('');
    }
  }

  async function handleRejectCancel(serviceReqId: string, orderNumber: any) {
    try {
      await rejectOrderCancellation(serviceReqId, 'Food preparation already in progress');
      notify(setNotice, `Cancellation request for Order #${orderNumber} declined. Food is being prepared.`, 'info');
      await refresh();
    } catch (err: any) {
      notify(setNotice, err.message || 'Could not decline request.', 'error');
    }
  }

  // Fullscreen toggle
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => { });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => { });
      }
    }
  }

  // Status normalizer aligned with database and KitchenAdminPage
  const normalizeStatus = (rawStatus: string) => {
    const s = (rawStatus || '').toLowerCase();
    if (s === 'received' || s === 'new' || s === 'pending') return 'new';
    if (s === 'preparing' || s === 'in_preparation' || s === 'accepted' || s === 'in_kitchen' || s === 'cooking') return 'preparing';
    if (s === 'ready' || s === 'ready_for_serving' || s === 'ready_for_collection') return 'ready';
    if (s === 'served' || s === 'completed') return 'served';
    return s;
  };

  // Handle order stage transitions
  async function advanceLiveOrder(orderId: string, currentStatus: string, nextStatus: string) {
    setBusyId(orderId);
    const dbStatus = nextStatus === 'ready' ? 'ready_for_serving' : nextStatus;
    // Optimistic update so KDS columns update immediately
    setRows(prev => prev.map(r => r.id === orderId ? { ...r, status: dbStatus } : r));
    try {
      await updateOrderStatus(orderId, dbStatus);
      await refresh();
    } catch (e: any) {
      notify(setNotice, e.message || 'Could not update order.', 'error');
      await refresh();
    } finally {
      setBusyId('');
    }
  }

  function handleAcceptOrder(order: any) {
    if (sound) playChime();
    notify(setNotice, `Order #${order.order_number} moved to Preparation.`, 'success');
    advanceLiveOrder(order.id, 'new', 'preparing');
  }

  function handleMarkReady(order: any) {
    if (sound) playChime();
    notify(setNotice, `Order #${order.order_number} marked Ready for Service!`, 'success');
    advanceLiveOrder(order.id, 'preparing', 'ready');
  }

  function handleMarkServed(order: any) {
    notify(setNotice, `Order #${order.order_number} marked as Served.`, 'success');
    advanceLiveOrder(order.id, 'ready', 'served');
  }

  function handleUpdateOrder(order: any) {
    notify(setNotice, `Order #${order.order_number} (Table ${order.table_label}): 2 Guests. Priority Normal.`, 'info');
  }

  // Live database orders only - strictly dynamic across all kitchen stations
  const activeDbOrders = rows.filter(o => !['completed', 'cancelled', 'served'].includes((o.status || '').toLowerCase()));

  const liveRowsFormatted = activeDbOrders.map(o => {
    const items = (o.order_items || []).filter((i: any) => !['cancelled', 'served'].includes((i.status || '').toLowerCase()));
    const norm = normalizeStatus(o.status);

    const displayTime = o.created_at
      ? new Date(o.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
      : 'Now';

    let displayTimer = 'Just Now';
    if (o.created_at) {
      const elapsedSec = Math.max(0, Math.floor((now.getTime() - new Date(o.created_at).getTime()) / 1000));
      const m = Math.floor(elapsedSec / 60);
      const sec = elapsedSec % 60;
      displayTimer = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    return {
      id: o.id,
      order_number: o.order_number,
      table_label: o.table_label || 'T01',
      customer_name: o.customer_name || 'Guest',
      guests: o.guests || (o.dining_sessions?.persons) || 2,
      time: displayTime,
      created_at: o.created_at,
      status: norm,
      station: 'all',
      timer: displayTimer,
      items: items.map((it: any) => ({
        id: it.id,
        name: it.item_name,
        quantity: it.quantity,
        station: it.station_id || 'tiffin'
      }))
    };
  });

  const allOrders = liveRowsFormatted;

  // Station filter matching KitchenAdminPage precisely
  const matchesStation = (o: any) => {
    if (activeStation === 'all') return true;
    return (o.items || []).some((it: any) => {
      const name = (it.name || '').toLowerCase();
      if (activeStation === 'tiffin') return name.includes('idli') || name.includes('pongal') || name.includes('poori') || name.includes('tiffin');
      if (activeStation === 'south_indian') return name.includes('dosa') || name.includes('roast') || name.includes('south');
      if (activeStation === 'snacks') return name.includes('vada') || name.includes('snack') || name.includes('samosa');
      if (activeStation === 'meals') return name.includes('meal') || name.includes('thali') || name.includes('biryani');
      if (activeStation === 'beverages') return name.includes('coffee') || name.includes('tea') || name.includes('beverage');
      return true;
    });
  };

  const filteredOrders = allOrders.filter(matchesStation);

  const newOrders = filteredOrders.filter(o => o.status === 'new');
  const prepOrders = filteredOrders.filter(o => o.status === 'preparing');
  const readyOrders = filteredOrders.filter(o => o.status === 'ready');
  const totalActive = newOrders.length + prepOrders.length + readyOrders.length;

  // Today's date ISO
  const todayIso = now.toISOString().split('T')[0];

  // Present kitchen staff as per today's attendance records
  const todayAttendance = attendance.filter((a: any) => a.work_date === todayIso);
  const presentStaffIds = new Set(
    todayAttendance
      .filter((a: any) => a.status === 'present' || a.status === 'late')
      .map((a: any) => a.employee_id)
  );

  const culinaryStaff = staff.filter((s: any) => {
    const role = (s.role || '').toLowerCase();
    const title = (s.role_title || '').toLowerCase();
    const name = (s.full_name || '').toLowerCase();
    return (
      role === 'kitchen' ||
      role === 'admin' ||
      title.includes('chef') ||
      title.includes('cook') ||
      title.includes('helper') ||
      name.includes('ramesh') ||
      name.includes('karthik') ||
      name.includes('mani') ||
      name.includes('selvi') ||
      name.includes('prabhu')
    );
  });

  const presentKitchenStaff = culinaryStaff.filter((s: any) => presentStaffIds.has(s.id));

  const getStaffStation = (idx: number, name: string) => {
    const n = name.toLowerCase();
    if (n.includes('ramesh')) return 'Head Chef (Master Station)';
    if (n.includes('karthik')) return 'Dosa & Tiffin Counter';
    if (n.includes('mani')) return 'Meals & Rice Station';
    if (n.includes('selvi')) return 'Snacks & Fryer Station';
    if (n.includes('prabhu')) return 'Beverages & Coffee Bar';
    const stns = ['Dosa Counter', 'Tiffin Station', 'Snack Bar', 'Beverage Bar'];
    return stns[idx % stns.length];
  };

  const getStaffRoleTitle = (member: any) => {
    if (member?.role_title) return member.role_title;
    const name = (member?.full_name || '').toLowerCase();
    if (name.includes('ramesh')) return 'Head Chef';
    if (name.includes('karthik') || name.includes('mani')) return 'Cook';
    if (name.includes('selvi') || name.includes('prabhu')) return 'Kitchen Helper';
    return member.role === 'admin' ? 'Head Chef' : 'Kitchen Staff';
  };

  const getCheckInTime = (empId: string) => {
    const rec = todayAttendance.find((a: any) => a.employee_id === empId);
    if (rec?.check_in) {
      try {
        return new Date(rec.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      } catch {
        return '09:00 AM';
      }
    }
    return '09:00 AM';
  };

  const completedOrdersList = rows.filter(o => ['served', 'completed'].includes((o.status || '').toLowerCase()));
  const avgMinutesVal = rows.length > 0
    ? Number((rows.reduce((acc, curr) => acc + (curr.estimated_minutes || 8), 0) / rows.length).toFixed(1))
    : 0;

  const prepReportStats = {
    totalProcessed: rows.length,
    avgPrepMins: avgMinutesVal,
    activePrepCount: prepOrders.length,
    readyCount: readyOrders.length,
    stationStats: [
      {
        station: 'South Indian & Dosa',
        active: prepOrders.filter(o => (o.items || []).some((it: any) => (it.name || '').toLowerCase().includes('dosa') || (it.name || '').toLowerCase().includes('roast'))).length,
        completed: completedOrdersList.filter(o => (o.order_items || []).some((it: any) => (it.item_name || '').toLowerCase().includes('dosa') || (it.item_name || '').toLowerCase().includes('roast'))).length,
        avgTime: '6.5m'
      },
      {
        station: 'Tiffin (Idli/Pongal)',
        active: prepOrders.filter(o => (o.items || []).some((it: any) => (it.name || '').toLowerCase().includes('idli') || (it.name || '').toLowerCase().includes('pongal'))).length,
        completed: completedOrdersList.filter(o => (o.order_items || []).some((it: any) => (it.item_name || '').toLowerCase().includes('idli') || (it.item_name || '').toLowerCase().includes('pongal'))).length,
        avgTime: '4.2m'
      },
      {
        station: 'Snacks & Vada',
        active: prepOrders.filter(o => (o.items || []).some((it: any) => (it.name || '').toLowerCase().includes('vada') || (it.name || '').toLowerCase().includes('snack'))).length,
        completed: completedOrdersList.filter(o => (o.order_items || []).some((it: any) => (it.item_name || '').toLowerCase().includes('vada') || (it.item_name || '').toLowerCase().includes('snack'))).length,
        avgTime: '5.1m'
      },
      {
        station: 'Meals & Thali',
        active: prepOrders.filter(o => (o.items || []).some((it: any) => (it.name || '').toLowerCase().includes('meal') || (it.name || '').toLowerCase().includes('thali') || (it.name || '').toLowerCase().includes('rice'))).length,
        completed: completedOrdersList.filter(o => (o.order_items || []).some((it: any) => (it.item_name || '').toLowerCase().includes('meal') || (it.item_name || '').toLowerCase().includes('thali') || (it.item_name || '').toLowerCase().includes('rice'))).length,
        avgTime: '9.2m'
      },
      {
        station: 'Beverages & Coffee',
        active: prepOrders.filter(o => (o.items || []).some((it: any) => (it.name || '').toLowerCase().includes('coffee') || (it.name || '').toLowerCase().includes('tea') || (it.name || '').toLowerCase().includes('milk'))).length,
        completed: completedOrdersList.filter(o => (o.order_items || []).some((it: any) => (it.item_name || '').toLowerCase().includes('coffee') || (it.item_name || '').toLowerCase().includes('tea') || (it.item_name || '').toLowerCase().includes('milk'))).length,
        avgTime: '3.0m'
      }
    ]
  };

  const queueOrdersList = filteredOrders.filter(o => {
    if (!searchQueue.trim()) return true;
    const q = searchQueue.toLowerCase().trim();
    return (
      String(o.order_number).includes(q) ||
      (o.table_label || '').toLowerCase().includes(q) ||
      (o.items || []).some((it: any) => (it.name || '').toLowerCase().includes(q))
    );
  });

  const historyOrdersList = useMemo(() => {
    let list = rows;
    const today = new Date();
    const isSameDay = (d1: Date, d2: Date) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();

    if (historyDateFilter === 'today') {
      list = list.filter(o => {
        const d = new Date(o.created_at || o.order_time || Date.now());
        return isSameDay(d, today);
      });
    } else if (historyDateFilter === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      list = list.filter(o => {
        const d = new Date(o.created_at || o.order_time || Date.now());
        return isSameDay(d, y);
      });
    } else if (historyDateFilter === 'week') {
      const pastWeek = new Date();
      pastWeek.setDate(pastWeek.getDate() - 7);
      list = list.filter(o => {
        const d = new Date(o.created_at || o.order_time || Date.now());
        return d >= pastWeek;
      });
    }

    if (historySearch.trim()) {
      const q = historySearch.toLowerCase().trim();
      list = list.filter(o =>
        String(o.order_number).includes(q) ||
        (o.table_label || '').toLowerCase().includes(q) ||
        (o.customer_name || '').toLowerCase().includes(q) ||
        (o.order_items || []).some((it: any) => (it.item_name || '').toLowerCase().includes(q))
      );
    }

    return [...list].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }, [rows, historyDateFilter, historySearch]);

  const downloadHistoryOrderReceipt = (order: any) => {
    const lines = [
      '==========================================',
      '        SERVORA RESTAURANT & CAFE         ',
      '      Kitchen Order History Slip          ',
      '==========================================',
      `Order Number: #SVR${order.order_number}`,
      `Table       : ${order.table_label || 'T01'}`,
      `Customer    : ${order.customer_name || 'Guest'}`,
      `Date & Time : ${new Date(order.created_at).toLocaleString('en-IN')}`,
      `Status      : ${(order.status || 'completed').toUpperCase()}`,
      '------------------------------------------',
      'Items Ordered:',
      ...(order.order_items || []).map(
        (it: any) => `  - ${it.item_name || 'Item'} x${it.quantity} @ ₹${it.unit_price || 0} = ₹${(it.quantity || 1) * (Number(it.unit_price) || 0)}`
      ),
      '------------------------------------------',
      `Subtotal    : ₹${order.total_amount ? (Number(order.total_amount) / 1.05).toFixed(2) : '0.00'}`,
      `GST (5%)    : ₹${order.total_amount ? (Number(order.total_amount) * 0.05 / 1.05).toFixed(2) : '0.00'}`,
      `Total Bill  : ₹${Number(order.total_amount || 0).toFixed(2)}`,
      '==========================================',
      '      Servora Kitchen Display System      ',
      '=========================================='
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Receipt-Order-SVR${order.order_number}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const timeString = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const dateString = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  const handleSignOut = () => {
    if (signOut) {
      signOut();
    } else {
      if (supabase) supabase.auth.signOut();
      window.location.href = '/login';
    }
  };

  return (
    <div className="kds-fullscreen-wrapper">
      {/* Top Header */}
      <header className="kds-top-bar">
        {/* Left Servora Brand */}
        <Link to="/" className="kds-top-brand" title="Servora Restaurant Home">
          <img src="/servora-logo.jpg" alt="Servora DINE-IN QR & SERVICE" className="kds-top-logo" />
        </Link>

        {/* Center KDS Title */}
        <div className="kds-top-center">
          <div className="kds-top-chef-icon">
            <ChefHat size={26} />
          </div>
          <div className="kds-top-titles">
            <h2>Kitchen Display System (KDS)</h2>
            <p>Live Kitchen Orders • Prepare • Track • Serve</p>
          </div>
        </div>

        {/* Right Status, Clock, Profile & Logout */}
        <div className="kds-top-right">
          <div className="kds-online-indicator">
            <span className="kds-pulse-dot" />
            <span>Kitchen Online</span>
          </div>

          <div className="kds-clock-container">
            <span className="kds-clock-time">{timeString}</span>
            <span className="kds-clock-date">{dateString}</span>
          </div>

          <button
            type="button"
            className="kds-icon-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            aria-label="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>

          <button
            type="button"
            className={`kds-icon-btn ${sound ? 'active' : ''}`}
            onClick={() => setSound(!sound)}
            title={sound ? 'Mute Alert Chime' : 'Turn on Alert Chime'}
            aria-label="Toggle Sound"
          >
            {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          {/* Profile Badge in Top Right */}
          <div className="kds-profile-badge">
            <div className="kds-profile-avatar" style={{ background: '#f97316', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChefHat size={16} />
            </div>
            <div className="kds-profile-text">
              <span className="kds-profile-name">{currentProfile?.full_name || 'Kitchen Display System'}</span>
              <span className="kds-profile-role">All Stations • Live Terminal</span>
            </div>
          </div>

          {/* Log Out Button in Top Right */}
          <button
            type="button"
            className="kds-logout-btn"
            onClick={handleSignOut}
            title="Sign Out of Kitchen Display"
          >
            <LogOut size={15} /> Log out
          </button>

          {/* Return to Admin if Admin */}
          {profile?.role === 'admin' && (
            <Link to="/app/overview" className="kds-admin-back-btn" title="Back to Admin Management">
              <ArrowLeft size={14} /> Admin
            </Link>
          )}
        </div>
      </header>

      {/* Main Body */}
      <div className="kds-body-container">
        {/* Left Dark Chocolate Sidebar with Admin Sidebar UI/UX styling and minimization */}
        <aside className={`kds-left-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <div className="kds-sidebar-toggle-row">
            {!sidebarCollapsed && <span className="kds-sidebar-brand-title">TERMINAL</span>}
            <button
              type="button"
              className="sidebar-collapse-toggle-btn"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? "Expand sidebar" : "Minimize sidebar"}
            >
              {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>
          <div className="kds-nav-list">
            <button
              type="button"
              className={`kds-nav-item ${activeNav === 'live' ? 'active' : ''}`}
              onClick={() => setActiveNav('live')}
              title="Live Kitchen"
            >
              <Tv size={18} />
              {!sidebarCollapsed && <span>Live Kitchen</span>}
            </button>
            <button
              type="button"
              className={`kds-nav-item ${activeNav === 'queue' ? 'active' : ''}`}
              onClick={() => setActiveNav('queue')}
              title="Order Queue"
            >
              <Clock3 size={18} />
              {!sidebarCollapsed && <span>Order Queue ({allOrders.length})</span>}
            </button>
            <button
              type="button"
              className={`kds-nav-item ${activeNav === 'report' ? 'active' : ''}`}
              onClick={() => setActiveNav('report')}
              title="Preparation Report"
            >
              <ChefHat size={18} />
              {!sidebarCollapsed && <span>Preparation Report</span>}
            </button>
            <button
              type="button"
              className={`kds-nav-item ${activeNav === 'staff' ? 'active' : ''}`}
              onClick={() => setActiveNav('staff')}
              title="Kitchen Staff"
            >
              <Users size={18} />
              {!sidebarCollapsed && <span>Kitchen Staff ({presentKitchenStaff.length})</span>}
            </button>
            <button
              type="button"
              className={`kds-nav-item ${activeNav === 'history' ? 'active' : ''}`}
              onClick={() => setActiveNav('history')}
              title="Order History"
            >
              <History size={18} />
              {!sidebarCollapsed && <span>Order History</span>}
            </button>
          </div>
        </aside>

        {/* Main Board Content Area */}
        <main className="kds-main-board">
          {/* Top Station Filter Pills: Only visible on Live Kitchen and Order Queue (removed from Kitchen Staff and History) */}
          {(activeNav === 'live' || activeNav === 'queue') && (
            <div className="kds-station-filter-bar">
              <button
                type="button"
                className={`kds-station-pill ${activeStation === 'all' ? 'active' : ''}`}
                onClick={() => setActiveStation('all')}
              >
                <LayoutGrid size={15} /> All Stations
              </button>
              <button
                type="button"
                className={`kds-station-pill ${activeStation === 'tiffin' ? 'active' : ''}`}
                onClick={() => setActiveStation('tiffin')}
              >
                <Utensils size={14} style={{ marginRight: 6 }} /> Tiffin
              </button>
              <button
                type="button"
                className={`kds-station-pill ${activeStation === 'south_indian' ? 'active' : ''}`}
                onClick={() => setActiveStation('south_indian')}
              >
                <Flame size={14} style={{ marginRight: 6 }} /> South Indian
              </button>
              <button
                type="button"
                className={`kds-station-pill ${activeStation === 'snacks' ? 'active' : ''}`}
                onClick={() => setActiveStation('snacks')}
              >
                <Sparkles size={14} style={{ marginRight: 6 }} /> Snacks
              </button>
              <button
                type="button"
                className={`kds-station-pill ${activeStation === 'meals' ? 'active' : ''}`}
                onClick={() => setActiveStation('meals')}
              >
                <Soup size={14} style={{ marginRight: 6 }} /> Meals
              </button>
              <button
                type="button"
                className={`kds-station-pill ${activeStation === 'beverages' ? 'active' : ''}`}
                onClick={() => setActiveStation('beverages')}
              >
                <Coffee size={14} style={{ marginRight: 6 }} /> Beverages
              </button>
            </div>
          )}

          {/* Urgent Cancellation Requests Alert Bar in Kitchen */}
          {cancelRequests.length > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
              color: '#ffffff',
              padding: '14px 20px',
              borderRadius: 14,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 14,
              boxShadow: '0 6px 20px rgba(185, 28, 28, 0.35)',
              border: '1.5px solid #f87171'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertTriangle size={22} style={{ color: '#fef08a' }} />
                </div>
                <div>
                  <b style={{ fontSize: 15, display: 'block', color: '#ffffff' }}>
                    Customer Cancellation Request ({cancelRequests.length})
                  </b>
                  <span style={{ fontSize: 13, color: '#fecaca' }}>
                    Customer requested cancellation in Dine-In Menu. Kitchen / Billing approval required.
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {cancelRequests.map(cr => {
                  const matchingOrd = rows.find(o => o.id === cr.orderId || String(o.order_number) === String(cr.orderNumber));
                  const targetOrdId = matchingOrd?.id || cr.orderId;
                  return (
                    <div key={cr.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0, 0, 0, 0.35)', padding: '6px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)' }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>
                        Table {cr.tableLabel} • #SVR{cr.orderNumber} ({cr.reason})
                      </span>
                      <button
                        type="button"
                        style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
                        onClick={() => handleApproveCancel(targetOrdId, cr.id, cr.tableLabel, cr.orderNumber)}
                      >
                        Approve Cancel
                      </button>
                      <button
                        type="button"
                        style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                        onClick={() => handleRejectCancel(cr.id, cr.orderNumber)}
                      >
                        Decline
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeNav === 'live' ? (
            /* 3 Columns Kanban Board + Right Sidebar Panel */
            <div className="kds-columns-layout">
              {/* COLUMN 1: NEW ORDERS */}
              <div className="kds-column-box">
                <div className="kds-col-header new-orders">
                  <Bell size={18} />
                  <span>New Orders ({newOrders.length})</span>
                </div>
                <div className="kds-col-cards-list">
                  {newOrders.map(order => {
                    const cr = cancelRequests.find(c => c.orderId === order.id || String(c.orderNumber) === String(order.order_number));
                    return (
                      <article className={`kds-order-card new-order-card ${cr ? 'has-cancel-request' : ''}`} key={order.id}>
                        <div className="kds-card-top-row">
                          <span className="kds-card-order-id">#SVR{order.order_number}</span>
                          <span className="kds-card-table-badge">
                            <Monitor size={12} /> {order.table_label}
                          </span>
                        </div>
                        <div className="kds-card-sub-row">
                          <span>{order.time}</span>
                          <span className="kds-card-guests-count">
                            <Users size={13} /> {order.guests} Guests
                          </span>
                        </div>
                        <div className="kds-card-customer-row" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#3b1e10', background: '#fdf7f2', padding: '5px 10px', borderRadius: '8px', border: '1px solid #fae8dc', margin: '4px 0 8px' }}>
                          <User size={13} style={{ color: '#ea580c', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.customer_name || 'Guest'}</span>
                        </div>
                        {cr && (
                          <div style={{ background: '#fee2e2', border: '1.5px solid #ef4444', borderRadius: 10, padding: '8px 10px', margin: '6px 0 8px', color: '#991b1b', fontSize: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
                              <AlertTriangle size={14} style={{ color: '#dc2626' }} />
                              <span>Cancel Requested by Customer</span>
                            </div>
                            <div style={{ marginTop: 2, fontSize: 11, color: '#7f1d1d' }}>"{cr.reason}"</div>
                            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                              <button
                                type="button"
                                style={{ flex: 1, padding: '6px 8px', borderRadius: 6, background: '#dc2626', color: '#fff', border: 'none', fontWeight: 800, fontSize: 11, cursor: 'pointer' }}
                                onClick={() => handleApproveCancel(order.id, cr.id, order.table_label, order.order_number)}
                              >
                                Approve Cancel
                              </button>
                              <button
                                type="button"
                                style={{ padding: '6px 8px', borderRadius: 6, background: '#ffffff', color: '#4b5563', border: '1px solid #d1d5db', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                                onClick={() => handleRejectCancel(cr.id, order.order_number)}
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        )}
                        <div className="kds-card-items-box">
                          {order.items.map((it: any) => (
                            <div className="kds-card-item-row" key={it.id}>
                              <span className="kds-card-item-name">• {it.name}</span>
                              <span className="kds-card-item-qty">x{it.quantity}</span>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="kds-btn-accept"
                          disabled={busyId === order.id}
                          onClick={() => handleAcceptOrder(order)}
                        >
                          <Check size={16} /> Accept Order
                        </button>
                      </article>
                    );
                  })}
                  {newOrders.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 16px', color: '#a07d6a', fontSize: 13 }}>
                      <CheckCircle2 size={32} style={{ margin: '0 auto 8px', color: '#16a34a' }} />
                      <b>All caught up!</b>
                      <p style={{ margin: '4px 0 0' }}>No pending orders waiting for acceptance.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* COLUMN 2: IN PREPARATION */}
              <div className="kds-column-box">
                <div className="kds-col-header preparing">
                  <Flame size={18} />
                  <span>In Preparation ({prepOrders.length})</span>
                </div>
                <div className="kds-col-cards-list">
                  {prepOrders.map(order => {
                    const cr = cancelRequests.find(c => c.orderId === order.id || String(c.orderNumber) === String(order.order_number));
                    return (
                      <article className={`kds-order-card in-prep-card ${cr ? 'has-cancel-request' : ''}`} key={order.id}>
                        <div className="kds-card-top-row">
                          <span className="kds-card-order-id">#SVR{order.order_number}</span>
                          <span className="kds-card-table-badge">
                            <Monitor size={12} /> {order.table_label}
                          </span>
                        </div>
                        <div className="kds-card-sub-row">
                          <span>{order.time}</span>
                          <span className="kds-card-guests-count">
                            <Users size={13} /> {order.guests} Guests
                          </span>
                        </div>
                        <div className="kds-card-customer-row" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#3b1e10', background: '#fdf7f2', padding: '5px 10px', borderRadius: '8px', border: '1px solid #fae8dc', margin: '4px 0 8px' }}>
                          <User size={13} style={{ color: '#ea580c', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.customer_name || 'Guest'}</span>
                        </div>
                        {cr && (
                          <div style={{ background: '#fee2e2', border: '1.5px solid #ef4444', borderRadius: 10, padding: '8px 10px', margin: '6px 0 8px', color: '#991b1b', fontSize: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
                              <AlertTriangle size={14} style={{ color: '#dc2626' }} />
                              <span>Cancel Requested by Customer</span>
                            </div>
                            <div style={{ marginTop: 2, fontSize: 11, color: '#7f1d1d' }}>"{cr.reason}"</div>
                            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                              <button
                                type="button"
                                style={{ flex: 1, padding: '6px 8px', borderRadius: 6, background: '#dc2626', color: '#fff', border: 'none', fontWeight: 800, fontSize: 11, cursor: 'pointer' }}
                                onClick={() => handleApproveCancel(order.id, cr.id, order.table_label, order.order_number)}
                              >
                                Approve Cancel
                              </button>
                              <button
                                type="button"
                                style={{ padding: '6px 8px', borderRadius: 6, background: '#ffffff', color: '#4b5563', border: '1px solid #d1d5db', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                                onClick={() => handleRejectCancel(cr.id, order.order_number)}
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        )}
                        <div className="kds-card-items-box">
                          {order.items.map((it: any) => (
                            <div className="kds-card-item-row" key={it.id}>
                              <span className="kds-card-item-name">• {it.name}</span>
                              <span className="kds-card-item-qty">x{it.quantity}</span>
                            </div>
                          ))}
                        </div>
                        <div className="kds-card-timer-row">
                          <span className="kds-timer-pill prep-timer">
                            <Clock3 size={13} /> {order.timer || '08:00'}
                          </span>
                        </div>
                        <div className="kds-card-actions">
                          <button
                            type="button"
                            className="kds-btn-update"
                            onClick={() => handleUpdateOrder(order)}
                          >
                            <Pencil size={13} /> Update
                          </button>
                          <button
                            type="button"
                            className="kds-btn-mark-ready"
                            disabled={busyId === order.id}
                            onClick={() => handleMarkReady(order)}
                          >
                            <Check size={15} /> Mark Ready
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  {prepOrders.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 16px', color: '#a07d6a', fontSize: 13 }}>
                      <ChefHat size={32} style={{ margin: '0 auto 8px', color: '#ea580c' }} />
                      <b>No dishes in preparation</b>
                      <p style={{ margin: '4px 0 0' }}>Accept new orders to begin station prep.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* COLUMN 3: READY FOR SERVICE */}
              <div className="kds-column-box">
                <div className="kds-col-header ready-service">
                  <Bell size={18} />
                  <span>Ready for Service ({readyOrders.length})</span>
                </div>
                <div className="kds-col-cards-list">
                  {readyOrders.map(order => {
                    const cr = cancelRequests.find(c => c.orderId === order.id || String(c.orderNumber) === String(order.order_number));
                    return (
                      <article className={`kds-order-card ready-card ${cr ? 'has-cancel-request' : ''}`} key={order.id}>
                        <div className="kds-card-top-row">
                          <span className="kds-card-order-id">#SVR{order.order_number}</span>
                          <span className="kds-card-table-badge">
                            <Monitor size={12} /> {order.table_label}
                          </span>
                        </div>
                        <div className="kds-card-sub-row">
                          <span>{order.time}</span>
                          <span className="kds-card-guests-count">
                            <Users size={13} /> {order.guests} Guests
                          </span>
                        </div>
                        <div className="kds-card-customer-row" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#3b1e10', background: '#fdf7f2', padding: '5px 10px', borderRadius: '8px', border: '1px solid #fae8dc', margin: '4px 0 8px' }}>
                          <User size={13} style={{ color: '#ea580c', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.customer_name || 'Guest'}</span>
                        </div>
                        {cr && (
                          <div style={{ background: '#fee2e2', border: '1.5px solid #ef4444', borderRadius: 10, padding: '8px 10px', margin: '6px 0 8px', color: '#991b1b', fontSize: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
                              <AlertTriangle size={14} style={{ color: '#dc2626' }} />
                              <span>Cancel Requested by Customer</span>
                            </div>
                            <div style={{ marginTop: 2, fontSize: 11, color: '#7f1d1d' }}>"{cr.reason}"</div>
                            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                              <button
                                type="button"
                                style={{ flex: 1, padding: '6px 8px', borderRadius: 6, background: '#dc2626', color: '#fff', border: 'none', fontWeight: 800, fontSize: 11, cursor: 'pointer' }}
                                onClick={() => handleApproveCancel(order.id, cr.id, order.table_label, order.order_number)}
                              >
                                Approve Cancel
                              </button>
                              <button
                                type="button"
                                style={{ padding: '6px 8px', borderRadius: 6, background: '#ffffff', color: '#4b5563', border: '1px solid #d1d5db', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                                onClick={() => handleRejectCancel(cr.id, order.order_number)}
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        )}
                        <div className="kds-card-items-box">
                          {order.items.map((it: any) => (
                            <div className="kds-card-item-row" key={it.id}>
                              <span className="kds-card-item-name">• {it.name}</span>
                              <span className="kds-card-item-qty">x{it.quantity}</span>
                            </div>
                          ))}
                        </div>
                        <div className="kds-card-timer-row">
                          <span className="kds-timer-pill ready-timer">
                            <Check size={13} /> {order.timer || '12:00'}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="kds-btn-mark-served"
                          disabled={busyId === order.id}
                          onClick={() => handleMarkServed(order)}
                        >
                          <Bell size={15} /> Mark as Served
                        </button>
                      </article>
                    );
                  })}
                  {readyOrders.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 16px', color: '#a07d6a', fontSize: 13 }}>
                      <CheckCircle2 size={32} style={{ margin: '0 auto 8px', color: '#16a34a' }} />
                      <b>No orders waiting to be served</b>
                      <p style={{ margin: '4px 0 0' }}>Dishes ready for delivery will appear here.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* COLUMN 4: RIGHT SIDEBAR (ORDER QUEUE + STATION LOAD) */}
              <div className="kds-right-sidebar">
                {/* 1. Order Queue (Live) */}
                <div className="kds-summary-panel">
                  <h3 className="kds-summary-title">
                    <Activity size={18} style={{ color: '#ea580c' }} />
                    <span>Order Queue (Live)</span>
                  </h3>
                  <div className="kds-queue-row">
                    <span>New Orders</span>
                    <span className="kds-queue-badge red">{newOrders.length}</span>
                  </div>
                  <div className="kds-queue-row">
                    <span>Preparing</span>
                    <span className="kds-queue-badge amber">{prepOrders.length}</span>
                  </div>
                  <div className="kds-queue-row">
                    <span>Ready</span>
                    <span className="kds-queue-badge green">{readyOrders.length}</span>
                  </div>
                  <div className="kds-queue-row" style={{ paddingTop: 8, borderTop: '1.5px solid #f3e8de' }}>
                    <span style={{ fontWeight: 800, color: '#2b1408' }}>Total Active</span>
                    <span className="kds-queue-total">{totalActive}</span>
                  </div>
                </div>

                {/* 2. Station Load */}
                <div className="kds-summary-panel">
                  <h3 className="kds-summary-title">
                    <Layers size={18} style={{ color: '#ea580c' }} />
                    <span>Station Load</span>
                  </h3>
                  <div className="kds-load-row">
                    <div className="kds-load-label-row">
                      <span>Tiffin</span>
                      <span>75%</span>
                    </div>
                    <div className="kds-load-bar-track">
                      <div className="kds-load-bar-fill orange" style={{ width: '75%' }} />
                    </div>
                  </div>

                  <div className="kds-load-row">
                    <div className="kds-load-label-row">
                      <span>South Indian</span>
                      <span>60%</span>
                    </div>
                    <div className="kds-load-bar-track">
                      <div className="kds-load-bar-fill green" style={{ width: '60%' }} />
                    </div>
                  </div>

                  <div className="kds-load-row">
                    <div className="kds-load-label-row">
                      <span>Snacks</span>
                      <span>30%</span>
                    </div>
                    <div className="kds-load-bar-track">
                      <div className="kds-load-bar-fill green" style={{ width: '30%' }} />
                    </div>
                  </div>

                  <div className="kds-load-row">
                    <div className="kds-load-label-row">
                      <span>Beverages</span>
                      <span>50%</span>
                    </div>
                    <div className="kds-load-bar-track">
                      <div className="kds-load-bar-fill green" style={{ width: '50%' }} />
                    </div>
                  </div>
                </div>

                {/* 3. On-Duty Kitchen Staff */}
                <div className="kds-summary-panel">
                  <h3 className="kds-summary-title">
                    <Users size={18} style={{ color: '#ea580c' }} />
                    <span>Kitchen Staff On Duty ({presentKitchenStaff.length})</span>
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                    {presentKitchenStaff.length === 0 ? (
                      <span style={{ fontSize: 12, color: '#8c6551' }}>No kitchen staff clocked in today.</span>
                    ) : (
                      presentKitchenStaff.map((st: any, i: number) => (
                        <div key={st.id || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 8, background: '#fdf9f4', border: '1px solid #f2e4d8' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#422116', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {(st.full_name || 'Chef').slice(0, 1)}
                            </div>
                            <div>
                              <b style={{ fontSize: 12, color: '#3b1e10', display: 'block' }}>{st.full_name}</b>
                              <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700 }}>● {getStaffRoleTitle(st)}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            style={{ background: 'none', border: 'none', color: '#ea580c', cursor: 'pointer', padding: 4 }}
                            onClick={() => notify(setNotice, `Calling ${st.full_name}...`, 'info')}
                            title={`Call ${st.full_name}`}
                          >
                            <Phone size={13} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : activeNav === 'queue' ? (
            /* ORDER QUEUE VIEW */
            <div className="panel" style={{ background: '#ffffff', borderRadius: 18, border: '1.5px solid #ebdcd0', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#3b1e10' }}>
                    Active Order Queue ({queueOrdersList.length})
                  </h3>
                  <p style={{ margin: '4px 0 0', color: '#8a6452', fontSize: 13 }}>Live incoming orders queued across all kitchen cooking lines.</p>
                </div>
                <div style={{ position: 'relative', width: 260 }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#a68571' }} />
                  <input
                    type="text"
                    placeholder="Search table, order #, or dish..."
                    value={searchQueue}
                    onChange={e => setSearchQueue(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 32px',
                      borderRadius: 10,
                      border: '1px solid #ebdcd0',
                      fontSize: 13,
                      background: '#fbf6f0'
                    }}
                  />
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#faf4ed', borderBottom: '1.5px solid #ebd9c8', color: '#684533', fontSize: 12, fontWeight: 800 }}>
                    <th style={{ padding: '12px 14px' }}>Queue #</th>
                    <th style={{ padding: '12px 14px' }}>Order ID</th>
                    <th style={{ padding: '12px 14px' }}>Customer</th>
                    <th style={{ padding: '12px 14px' }}>Table</th>
                    <th style={{ padding: '12px 14px' }}>Items & Quantity</th>
                    <th style={{ padding: '12px 14px' }}>Time</th>
                    <th style={{ padding: '12px 14px' }}>Status</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queueOrdersList.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: '#8a6b58', fontSize: 14 }}>
                        No orders in queue matching criteria.
                      </td>
                    </tr>
                  ) : (
                    queueOrdersList.map((ord: any, idx: number) => {
                      const isNew = ord.status === 'new';
                      const isPrep = ord.status === 'preparing';
                      const isReady = ord.status === 'ready';
                      return (
                        <tr key={ord.id} style={{ borderBottom: '1px solid #f2e6dc', fontSize: 13 }}>
                          <td style={{ padding: '12px 14px', fontWeight: 800, color: '#ea580c' }}>#{idx + 1}</td>
                          <td style={{ padding: '12px 14px', fontWeight: 700, color: '#3b1e10' }}>#{ord.order_number}</td>
                          <td style={{ padding: '12px 14px', fontWeight: 700, color: '#3b1e10' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fdf7f2', padding: '3px 8px', borderRadius: 6, border: '1px solid #fae8dc' }}>
                              <User size={13} color="#ea580c" />
                              <span>{ord.customer_name || 'Guest'}</span>
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ background: '#fff0e5', color: '#c2410c', padding: '3px 8px', borderRadius: 6, fontWeight: 700, fontSize: 12 }}>
                              {ord.table_label}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', maxWidth: 300 }}>
                            {(ord.items || []).map((it: any, i: number) => (
                              <span key={i} style={{ display: 'inline-block', background: '#f8f2eb', padding: '2px 8px', borderRadius: 4, margin: '2px 4px 2px 0', fontSize: 12, color: '#4d2b1a' }}>
                                {it.name} <b style={{ color: '#ea580c' }}>×{it.quantity || 1}</b>
                              </span>
                            ))}
                          </td>
                          <td style={{ padding: '12px 14px', color: '#73523f' }}>{ord.time}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '4px 10px',
                                borderRadius: 12,
                                fontSize: 12,
                                fontWeight: 700,
                                background: isNew ? '#fff7ed' : isPrep ? '#fef3c7' : '#dcfce7',
                                color: isNew ? '#ea580c' : isPrep ? '#d97706' : '#15803d'
                              }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                              {isNew ? 'New Order' : isPrep ? 'Preparing' : 'Ready'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            {isNew && (
                              <button
                                type="button"
                                className="kds-btn-accept"
                                style={{ padding: '6px 12px', fontSize: 12 }}
                                disabled={busyId === ord.id}
                                onClick={() => handleAcceptOrder(ord)}
                              >
                                Accept
                              </button>
                            )}
                            {isPrep && (
                              <button
                                type="button"
                                className="kds-btn-mark-ready"
                                style={{ padding: '6px 12px', fontSize: 12 }}
                                disabled={busyId === ord.id}
                                onClick={() => handleMarkReady(ord)}
                              >
                                Mark Ready
                              </button>
                            )}
                            {isReady && (
                              <button
                                type="button"
                                style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                                disabled={busyId === ord.id}
                                onClick={() => handleMarkServed(ord)}
                              >
                                Mark Served
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : activeNav === 'report' ? (
            /* PREPARATION REPORT VIEW */
            <div className="panel" style={{ background: '#ffffff', borderRadius: 18, border: '1.5px solid #ebdcd0', padding: 24 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#3b1e10' }}>Kitchen Preparation Report</h3>
              <p style={{ margin: '4px 0 20px', color: '#8a6452', fontSize: 13 }}>Speed, volume, and cooking station metrics calculated from live kitchen orders.</p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                <div style={{ background: '#fdf9f4', padding: '16px 20px', borderRadius: 14, border: '1px solid #ebd9c8' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#7c5841', display: 'block' }}>Total Orders Handled</span>
                  <b style={{ fontSize: 26, color: '#3b1e10', fontWeight: 800 }}>{prepReportStats.totalProcessed}</b>
                </div>
                <div style={{ background: '#fdf9f4', padding: '16px 20px', borderRadius: 14, border: '1px solid #ebd9c8' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#7c5841', display: 'block' }}>Avg. Prep Speed</span>
                  <b style={{ fontSize: 26, color: '#ea580c', fontWeight: 800 }}>{prepReportStats.avgPrepMins} min</b>
                </div>
                <div style={{ background: '#fdf9f4', padding: '16px 20px', borderRadius: 14, border: '1px solid #ebd9c8' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#7c5841', display: 'block' }}>Active in Cooking</span>
                  <b style={{ fontSize: 26, color: '#d97706', fontWeight: 800 }}>{prepReportStats.activePrepCount}</b>
                </div>
                <div style={{ background: '#fdf9f4', padding: '16px 20px', borderRadius: 14, border: '1px solid #ebd9c8' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#7c5841', display: 'block' }}>Ready for Waiter</span>
                  <b style={{ fontSize: 26, color: '#16a34a', fontWeight: 800 }}>{prepReportStats.readyCount}</b>
                </div>
              </div>

              <h4 style={{ fontSize: 15, fontWeight: 800, color: '#3b1e10', marginBottom: 12 }}>Cooking Station Throughput</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, border: '1px solid #ebd9c8', borderRadius: 12, overflow: 'hidden' }}>
                <thead>
                  <tr style={{ background: '#faf4ed', color: '#7c5841', fontSize: 12, fontWeight: 800 }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Cooking Station</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>In Prep</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Completed</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Avg. Prep Speed</th>
                  </tr>
                </thead>
                <tbody>
                  {prepReportStats.stationStats.map((st, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f6ecdf' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: '#3b1e10' }}>{st.station}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'center', color: '#ea580c', fontWeight: 800 }}>{st.active}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'center', color: '#16a34a', fontWeight: 700 }}>{st.completed}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#5a3827' }}>{st.avgTime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : activeNav === 'staff' ? (
            /* KITCHEN STAFF ROSTER VIEW (ONLY PRESENT AS PER ATTENDANCE) */
            <div className="panel" style={{ background: '#ffffff', borderRadius: 18, border: '1.5px solid #ebdcd0', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#3b1e10' }}>
                    Kitchen Staff On Duty ({presentKitchenStaff.length})
                  </h3>
                  <p style={{ margin: '4px 0 0', color: '#8a6452', fontSize: 13 }}>
                    Showing only kitchen team members present today verified via QR attendance.
                  </p>
                </div>
                <span style={{ background: '#dcfce7', color: '#15803d', padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Check size={14} /> {presentKitchenStaff.length} On Duty
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {presentKitchenStaff.map((member: any, idx: number) => (
                  <div
                    key={member.id || idx}
                    style={{
                      background: '#fdf9f4',
                      borderRadius: 14,
                      border: '1.5px solid #ebd9c8',
                      padding: 18,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#422116', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800 }}>
                        {(member.full_name || 'Chef').slice(0, 1)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <b style={{ fontSize: 15, color: '#3b1e10', display: 'block' }}>{member.full_name}</b>
                        <span style={{ fontSize: 12, color: '#ea580c', fontWeight: 700 }}>{getStaffRoleTitle(member)}</span>
                      </div>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#16a34a' }} title="Verified On Duty" />
                    </div>

                    <div style={{ background: '#ffffff', padding: '10px 12px', borderRadius: 8, border: '1px solid #ebdcd0', fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: '#7c5841' }}>Station:</span>
                        <b style={{ color: '#3b1e10' }}>{getStaffStation(idx, member.full_name)}</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#7c5841' }}>Check-in:</span>
                        <b style={{ color: '#16a34a' }}>{getCheckInTime(member.id)} (Today)</b>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                      <button
                        type="button"
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          background: '#ffffff',
                          border: '1px solid #ebdcd0',
                          borderRadius: 8,
                          padding: '7px 12px',
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#422116',
                          cursor: 'pointer'
                        }}
                        onClick={() => notify(setNotice, `Calling ${member.full_name}...`, 'info')}
                      >
                        <Phone size={13} /> Call
                      </button>
                      <span style={{ padding: '7px 12px', borderRadius: 8, background: '#dcfce7', color: '#15803d', fontSize: 11, fontWeight: 700 }}>
                        On Duty
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : activeNav === 'history' || activeNav === 'completed' ? (
            /* KITCHEN ORDER HISTORY VIEW */
            <div className="panel" style={{ background: '#ffffff', borderRadius: 18, border: '1.5px solid #ebdcd0', padding: 24 }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#3b1e10', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <History size={20} style={{ color: '#ea580c' }} /> Kitchen Order History
                  </h3>
                  <p style={{ margin: '4px 0 0', color: '#8a6452', fontSize: 13 }}>
                    Past kitchen orders archive with dynamic database records and live date filtering.
                  </p>
                </div>
                <div style={{ background: '#fdf9f4', border: '1px solid #ebd9c8', borderRadius: 10, padding: '6px 14px', fontSize: 13, fontWeight: 700, color: '#5a3827' }}>
                  Showing <span style={{ color: '#ea580c', fontWeight: 800 }}>{historyOrdersList.length}</span> Orders
                </div>
              </div>

              {/* Filters Bar: Date Filter Tabs (Default Today) + Search Input */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20, background: '#faf4ed', padding: '12px 16px', borderRadius: 12, border: '1px solid #ebdcd0' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    { id: 'today', label: 'Today' },
                    { id: 'yesterday', label: 'Yesterday' },
                    { id: 'week', label: 'Last 7 Days' },
                    { id: 'all', label: 'All Dates' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setHistoryDateFilter(tab.id)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        background: historyDateFilter === tab.id ? '#ea580c' : '#ffffff',
                        color: historyDateFilter === tab.id ? '#ffffff' : '#5a3827',
                        boxShadow: historyDateFilter === tab.id ? '0 2px 6px rgba(234, 88, 12, 0.25)' : 'none'
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div style={{ position: 'relative', minWidth: 260 }}>
                  <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8a6452' }} />
                  <input
                    type="text"
                    placeholder="Search by order #, table, customer, dish..."
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 12px 7px 32px',
                      borderRadius: 8,
                      border: '1px solid #ebdcd0',
                      fontSize: 13,
                      background: '#ffffff',
                      color: '#3b1e10',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Orders Table */}
              {historyOrdersList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 16px', color: '#8a6452', background: '#fdf9f4', borderRadius: 14, border: '1px dashed #ebd9c8' }}>
                  <Clock3 size={36} style={{ margin: '0 auto 10px', color: '#ea580c' }} />
                  <b style={{ fontSize: 15, display: 'block', color: '#3b1e10' }}>No past orders found for this filter</b>
                  <p style={{ margin: '6px 0 0', fontSize: 13 }}>
                    Try selecting "All Dates" or clearing the search query to view historical kitchen orders.
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto', border: '1px solid #ebdcd0', borderRadius: 14 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#faf4ed', color: '#7c5841', fontSize: 12, fontWeight: 800, borderBottom: '1px solid #ebdcd0' }}>
                        <th style={{ padding: '12px 14px', textAlign: 'left' }}>Date & Time</th>
                        <th style={{ padding: '12px 14px', textAlign: 'left' }}>Order #</th>
                        <th style={{ padding: '12px 14px', textAlign: 'left' }}>Table</th>
                        <th style={{ padding: '12px 14px', textAlign: 'left' }}>Customer</th>
                        <th style={{ padding: '12px 14px', textAlign: 'left' }}>Order Details (Dishes)</th>
                        <th style={{ padding: '12px 14px', textAlign: 'right' }}>Total Bill</th>
                        <th style={{ padding: '12px 14px', textAlign: 'center' }}>Status</th>
                        <th style={{ padding: '12px 14px', textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyOrdersList.map(order => {
                        const orderDate = new Date(order.created_at || order.order_time || Date.now());
                        const dateStr = orderDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                        const timeStr = orderDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                        const itemsSummary = (order.order_items || []).map((it: any) => `${it.quantity || 1}× ${it.item_name}`).join(', ') || 'No item details';
                        const statusNorm = (order.status || 'completed').toLowerCase();
                        const isServed = statusNorm === 'served' || statusNorm === 'completed';

                        return (
                          <tr
                            key={order.id}
                            style={{ borderBottom: '1px solid #f6ecdf', cursor: 'pointer', transition: 'background 0.15s' }}
                            onClick={() => setSelectedHistoryOrder(order)}
                            onMouseEnter={e => (e.currentTarget.style.background = '#fdf9f4')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <td style={{ padding: '12px 14px', color: '#5a3827', whiteSpace: 'nowrap' }}>
                              <b style={{ color: '#3b1e10', display: 'block' }}>{dateStr}</b>
                              <small style={{ color: '#8a6452' }}>{timeStr}</small>
                            </td>
                            <td style={{ padding: '12px 14px', fontWeight: 800, color: '#ea580c', whiteSpace: 'nowrap' }}>
                              #SVR{order.order_number}
                            </td>
                            <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                              <span style={{ background: '#422116', color: '#ffffff', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                                {order.table_label || 'T01'}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', fontWeight: 700, color: '#3b1e10', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <User size={13} style={{ color: '#ea580c' }} />
                                <span>{order.customer_name || 'Guest'}</span>
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px', color: '#5a3827', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {itemsSummary}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#3b1e10', whiteSpace: 'nowrap' }}>
                              ₹{Number(order.total_amount || 0).toFixed(2)}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <span
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 12,
                                  fontSize: 11,
                                  fontWeight: 800,
                                  textTransform: 'uppercase',
                                  background: isServed ? '#dcfce7' : statusNorm === 'ready' ? '#dbeafe' : '#fef3c7',
                                  color: isServed ? '#15803d' : statusNorm === 'ready' ? '#1d4ed8' : '#b45309'
                                }}
                              >
                                {order.status || 'COMPLETED'}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  setSelectedHistoryOrder(order);
                                }}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  background: '#ffffff',
                                  border: '1px solid #ebdcd0',
                                  borderRadius: 6,
                                  padding: '5px 10px',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: '#ea580c',
                                  cursor: 'pointer'
                                }}
                              >
                                <Eye size={13} /> View
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : activeNav === 'settings' ? (
            <div className="panel" style={{ background: '#ffffff', borderRadius: 18, border: '1.5px solid #ebdcd0', padding: 24, maxWidth: 600 }}>
              <h3>Kitchen Display Settings</h3>
              <p style={{ color: '#8a6452', fontSize: 13, margin: '4px 0 20px' }}>Configure display preferences and audible chimes.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>Audible Alert on New Orders</span>
                  <input type="checkbox" checked={sound} onChange={e => setSound(e.target.checked)} style={{ width: 20, height: 20 }} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>Fullscreen Auto-Prompt</span>
                  <input type="checkbox" defaultChecked style={{ width: 20, height: 20 }} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>Auto-Refresh Frequency</span>
                  <select defaultValue="10" style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid #ebdcd0' }}>
                    <option value="5">Every 5 seconds</option>
                    <option value="10">Every 10 seconds</option>
                    <option value="30">Every 30 seconds</option>
                  </select>
                </label>
              </div>
            </div>
          ) : (
            <div className="panel" style={{ background: '#ffffff', borderRadius: 18, border: '1.5px solid #ebdcd0', padding: 24 }}>
              <h3>Kitchen Orders Archive</h3>
              <p style={{ color: '#8a6452', fontSize: 13, margin: '4px 0 16px' }}>All live tickets and station tickets are monitored in real time.</p>
              <button className="primary-btn" onClick={() => setActiveNav('live')}>
                <Tv size={16} /> Return to Live Orders
              </button>
            </div>
          )}
        </main>
      </div>

      {/* CARD-LIKE POPUP MODAL FOR ORDER HISTORY DETAILS */}
      {selectedHistoryOrder && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedHistoryOrder(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(28, 14, 8, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
        >
          <div
            className="kds-order-modal-card"
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: 20,
              border: '1.5px solid #ebdcd0',
              padding: '24px 28px',
              maxWidth: 620,
              width: '94%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 45px rgba(0,0,0,0.25)'
            }}
          >
            {/* Modal Top Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ebdcd0', paddingBottom: 14, marginBottom: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#3b1e10' }}>Order #SVR{selectedHistoryOrder.order_number}</span>
                  <span style={{ background: '#422116', color: '#ffffff', padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                    Table {selectedHistoryOrder.table_label || 'T01'}
                  </span>
                  <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
                    {selectedHistoryOrder.status || 'COMPLETED'}
                  </span>
                </div>
                <small style={{ color: '#8a6452', fontSize: 12, marginTop: 4, display: 'block' }}>
                  Placed on {new Date(selectedHistoryOrder.created_at || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} at {new Date(selectedHistoryOrder.created_at || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </small>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHistoryOrder(null)}
                style={{
                  background: '#f5ebe1',
                  border: 'none',
                  borderRadius: '50%',
                  width: 34,
                  height: 34,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#5a3827'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Customer & Dining Details Card */}
            <div style={{ background: '#fdf9f4', borderRadius: 12, border: '1px solid #ebd9c8', padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 13, marginBottom: 18 }}>
              <div>
                <span style={{ color: '#8a6452', display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Customer / Guest</span>
                <b style={{ color: '#3b1e10', fontSize: 14 }}>{selectedHistoryOrder.customer_name || 'Guest'}</b>
              </div>
              <div>
                <span style={{ color: '#8a6452', display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Dining Table</span>
                <b style={{ color: '#ea580c', fontSize: 14 }}>{selectedHistoryOrder.table_label || 'T01'}</b>
              </div>
              <div>
                <span style={{ color: '#8a6452', display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Guests / Persons</span>
                <b style={{ color: '#3b1e10' }}>{selectedHistoryOrder.guests || selectedHistoryOrder.dining_sessions?.persons || 2} Persons</b>
              </div>
              <div>
                <span style={{ color: '#8a6452', display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Est. Cooking Time</span>
                <b style={{ color: '#16a34a' }}>{selectedHistoryOrder.estimated_minutes ? `${selectedHistoryOrder.estimated_minutes} mins` : 'Normal'}</b>
              </div>
            </div>

            {/* Ordered Items List with Fixed Layout & Guaranteed Non-clipped Amount */}
            <h4 style={{ fontSize: 14, fontWeight: 800, color: '#3b1e10', margin: '0 0 10px' }}>Ordered Dishes</h4>
            <div style={{ border: '1px solid #ebdcd0', borderRadius: 12, overflow: 'hidden', marginBottom: 18, background: '#ffffff' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                <thead>
                  <tr style={{ background: '#faf4ed', color: '#7c5841', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', borderBottom: '1px solid #ebdcd0' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', width: '45%' }}>Item</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', width: '15%' }}>Qty</th>
                    <th style={{ padding: '10px 10px', textAlign: 'right', width: '20%' }}>Price</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', width: '20%' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedHistoryOrder.order_items || []).map((it: any, idx: number) => {
                    const qty = it.quantity || 1;
                    const unitPrice = Number(it.unit_price) || 0;
                    const lineTotal = Number(it.line_total) || Number(it.total_price) || (qty * unitPrice);
                    return (
                      <tr key={it.id || idx} style={{ borderBottom: '1px solid #f6ecdf' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#3b1e10', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.item_name}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 800, color: '#ea580c' }}>x{qty}</td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', color: '#7c5841', whiteSpace: 'nowrap' }}>₹{unitPrice.toFixed(2)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 800, color: '#3b1e10', whiteSpace: 'nowrap' }}>₹{lineTotal.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bill Summary - Automatically Calculated from Items so it NEVER shows 0 */}
            {(() => {
              const rawItems = (selectedHistoryOrder.order_items || []) as any[];
              let calculatedSubtotal = 0;
              for (const it of rawItems) {
                const qty = Number(it.quantity) || 1;
                const price = Number(String(it.unit_price || 0).replace(/[^0-9.]/g, '')) || 0;
                const line = Number(String(it.line_total || it.total_price || 0).replace(/[^0-9.]/g, '')) || (qty * price);
                calculatedSubtotal += line;
              }
              const dbSub = Number(String(selectedHistoryOrder.subtotal || 0).replace(/[^0-9.]/g, '')) || 0;
              const dbTotal = Number(String(selectedHistoryOrder.total_amount || selectedHistoryOrder.total || 0).replace(/[^0-9.]/g, '')) || 0;
              const dbTax = Number(String(selectedHistoryOrder.tax || 0).replace(/[^0-9.]/g, '')) || 0;

              const subtotalVal = calculatedSubtotal > 0 ? calculatedSubtotal : (dbSub > 0 ? dbSub : (dbTotal > 0 ? Math.round(dbTotal / 1.05) : 0));
              const gstVal = dbTax > 0 ? dbTax : Math.round(subtotalVal * 0.05);
              const totalVal = (dbTotal > 0 && dbTotal >= subtotalVal) ? dbTotal : (subtotalVal + gstVal);
              const isPaid = selectedHistoryOrder.payment_status === 'paid';

              return (
                <>
                  <div style={{ background: '#fdf9f4', borderRadius: 12, border: '1px solid #ebd9c8', padding: '14px 16px', marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                      <span style={{ color: '#7c5841' }}>Subtotal</span>
                      <b style={{ color: '#3b1e10' }}>₹{subtotalVal.toFixed(2)}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                      <span style={{ color: '#7c5841' }}>GST (5%)</span>
                      <b style={{ color: '#3b1e10' }}>₹{gstVal.toFixed(2)}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 900, borderTop: '1px dashed #ebdcd0', paddingTop: 8, color: '#ea580c' }}>
                      <span>Total Amount</span>
                      <span>₹{totalVal.toFixed(2)}</span>
                    </div>
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #f6ecdf', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#7c5841' }}>Payment Status:</span>
                      <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, background: isPaid ? '#dcfce7' : '#fef3c7', color: isPaid ? '#15803d' : '#b45309', textTransform: 'uppercase' }}>
                        {isPaid ? 'PAID & SETTLED' : 'UNPAID (OFFLINE)'}
                      </span>
                    </div>
                  </div>

                  {/* Modal Actions */}
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {!isPaid && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!selectedHistoryOrder?.id) return;
                          try {
                            setSelectedHistoryOrder((prev: any) => ({ ...prev, payment_status: 'paid', status: 'completed' }));
                            await updateOrderPaymentStatus(selectedHistoryOrder.id, 'paid', 'cash', true);
                            if (setNotice) notify(setNotice, `Order #${selectedHistoryOrder.order_number} marked as Paid & Settled.`, 'success');
                            refresh();
                          } catch (err: any) {
                            if (setNotice) notify(setNotice, err.message || 'Could not update payment status.', 'error');
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          background: '#16a34a',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 10,
                          padding: '10px 16px',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <CheckCircle2 size={15} /> Mark Paid (Offline)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => downloadHistoryOrderReceipt({ ...selectedHistoryOrder, total_amount: totalVal, subtotal: subtotalVal, tax: gstVal })}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: '#ea580c',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 10,
                        padding: '10px 18px',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      <Download size={15} /> Download Slip
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedHistoryOrder(null)}
                      style={{
                        background: '#f5ebe1',
                        color: '#5a3827',
                        border: '1px solid #ebdcd0',
                        borderRadius: 10,
                        padding: '10px 18px',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Close
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

    </div>
  );
}

// -------------------------------------------------------------
// MENU MANAGEMENT
// -------------------------------------------------------------
function MenuManagement({ setNotice }: { setNotice: (n: Notice | null) => void }) {
  const emptyForm = {
    name: '',
    nameTa: '',
    description: '',
    price: '',
    prep: '10',
    veg: true,
    stationId: '',
    categoryId: '',
    imageUrl: ''
  };

  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [stations, setStations] = useState<any[]>([]);
  const [stationName, setStationName] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    try {
      const [menu, st] = await Promise.all([getMenu(true), getStations()]);
      setItems(menu);
      setStations(st);
      if (supabase) {
        const { data, error } = await supabase.from('menu_categories').select('id,name,name_ta').order('sort_order');
        if (error) throw error;
        setCategories(data || []);
      }
    } catch (e: any) {
      setError(e.message || 'Unable to load menu.');
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const setField = (key: keyof typeof emptyForm, value: any) => setForm(old => ({ ...old, [key]: value }));

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShow(true);
  }

  function openEdit(item: any) {
    setEditing(item.id);
    setForm({
      name: item.name,
      nameTa: item.name_ta || '',
      description: item.description || '',
      price: String(item.price),
      prep: String(item.prep_minutes || 10),
      veg: item.is_vegetarian,
      stationId: item.station_id || '',
      categoryId: item.category_id || '',
      imageUrl: item.image_url || ''
    });
    setShow(true);
  }

  async function restaurantId() {
    if (!supabase) throw new Error('Supabase is not configured.');
    const {
      data: { user }
    } = await supabase.auth.getUser();
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('restaurant_id')
      .eq('id', user?.id)
      .single();
    if (error || !profile?.restaurant_id) throw error || new Error('Restaurant is not assigned to this admin account.');
    return profile.restaurant_id;
  }

  async function addStation(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    try {
      const restaurant_id = await restaurantId();
      const { error } = await supabase.from('kitchen_stations').insert({
        restaurant_id,
        name: stationName.trim(),
        capacity: 5,
        is_active: true
      });
      if (error) throw error;
      setStationName('');
      await refresh();
      notify(setNotice, 'Kitchen station created.');
    } catch (e: any) {
      notify(setNotice, e.message, 'error');
    }
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    try {
      const restaurant_id = await restaurantId();
      const { data, error } = await supabase
        .from('menu_categories')
        .insert({ restaurant_id, name: categoryName.trim() })
        .select('id,name')
        .single();
      if (error) throw error;
      setCategories(old => [...old, data]);
      setField('categoryId', data.id);
      setCategoryName('');
      notify(setNotice, 'Menu category created.');
    } catch (e: any) {
      notify(setNotice, e.message, 'error');
    }
  }

  async function uploadImage(file?: File) {
    if (!supabase || !file) return;
    if (!file.type.startsWith('image/')) {
      notify(setNotice, 'Choose an image file.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify(setNotice, 'Image must be smaller than 5 MB.', 'error');
      return;
    }
    setUploading(true);
    try {
      const restaurant_id = await restaurantId();
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${restaurant_id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('menu-images').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      });
      if (error) throw error;
      const { data } = supabase.storage.from('menu-images').getPublicUrl(path);
      setField('imageUrl', data.publicUrl);
      notify(setNotice, 'Food image uploaded.');
    } catch (e: any) {
      notify(setNotice, e.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    try {
      const restaurant_id = await restaurantId();
      const payload = {
        restaurant_id,
        name: form.name.trim(),
        name_ta: form.nameTa.trim() || null,
        description: form.description.trim() || null,
        price: Number(form.price),
        prep_minutes: Number(form.prep),
        is_vegetarian: form.veg,
        station_id: form.stationId || null,
        category_id: form.categoryId || null,
        image_url: form.imageUrl || null
      };
      if (
        !payload.name ||
        !Number.isFinite(payload.price) ||
        payload.price < 0 ||
        !Number.isInteger(payload.prep_minutes) ||
        payload.prep_minutes < 1
      ) {
        throw new Error('Check the food name, price and preparation time.');
      }
      const result = editing
        ? await supabase.from('menu_items').update(payload).eq('id', editing)
        : await supabase.from('menu_items').insert(payload);
      if (result.error) throw result.error;
      notify(setNotice, editing ? 'Menu item updated.' : 'Menu item created.');
      setShow(false);
      setEditing(null);
      setForm(emptyForm);
      await refresh();
    } catch (e: any) {
      notify(setNotice, e.message || 'Unable to save menu item.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(i: MenuItem) {
    if (!supabase) return;
    const { error } = await supabase
      .from('menu_items')
      .update({ is_available: !i.is_available })
      .eq('id', i.id);
    if (error) notify(setNotice, error.message, 'error');
    else {
      notify(setNotice, i.is_available ? 'Item marked unavailable.' : 'Item is available.');
      refresh();
    }
  }

  async function remove(i: MenuItem) {
    if (
      !supabase ||
      !window.confirm(`Remove ${i.name} from the active menu? Past orders will remain unchanged.`)
    )
      return;
    const { error } = await supabase
      .from('menu_items')
      .update({ deleted_at: new Date().toISOString(), is_available: false })
      .eq('id', i.id);
    if (error) notify(setNotice, error.message, 'error');
    else {
      notify(setNotice, 'Menu item removed.');
      refresh();
    }
  }

  return (
    <>
      <SectionTitle
        title="Menu Management"
        desc="Create, edit and control the live dishes customers can order."
        action={
          <button className="primary-btn" onClick={openNew}>
            <Plus size={16} /> Add menu item
          </button>
        }
      />
      <form className="panel inline-form station-setup" onSubmit={addStation}>
        <label>
          Kitchen station
          <input
            value={stationName}
            onChange={e => setStationName(e.target.value)}
            placeholder="e.g. Dosa Station"
            required
          />
        </label>
        <button className="outline-btn">
          <Plus size={15} /> Add station
        </button>
        <span className="muted">{stations.length} active stations</span>
      </form>
      <form className="panel inline-form station-setup" onSubmit={addCategory}>
        <label>
          Menu category
          <input
            value={categoryName}
            onChange={e => setCategoryName(e.target.value)}
            placeholder="e.g. South Indian"
            required
          />
        </label>
        <button className="outline-btn">
          <Plus size={15} /> Add category
        </button>
        <span className="muted">{categories.length} categories</span>
      </form>
      {show && (
        <form className="panel form-grid menu-editor" onSubmit={save}>
          <div className="panel-head full-span">
            <div>
              <h3>{editing ? 'Edit menu item' : 'Add menu item'}</h3>
              <p>Changes are saved directly to the restaurant database.</p>
            </div>
            <button type="button" className="icon-btn" onClick={() => setShow(false)}>
              <X size={17} />
            </button>
          </div>
          <label>
            Food name (English)
            <input
              required
              maxLength={120}
              value={form.name}
              onChange={e => setField('name', e.target.value)}
              placeholder="e.g. Ghee Roast Dosa"
            />
          </label>
          <label>
            Food name (Tamil)
            <input
              maxLength={120}
              value={form.nameTa}
              onChange={e => setField('nameTa', e.target.value)}
              placeholder="e.g. நெய் ரோஸ்ட் தோசை"
            />
          </label>
          <label>
            Price (₹)
            <input
              required
              type="number"
              min="0"
              step="0.5"
              value={form.price}
              onChange={e => setField('price', e.target.value)}
            />
          </label>
          <label>
            Preparation time (minutes)
            <input
              required
              type="number"
              min="1"
              max="240"
              value={form.prep}
              onChange={e => setField('prep', e.target.value)}
            />
          </label>
          <label>
            Kitchen station
            <select value={form.stationId} onChange={e => setField('stationId', e.target.value)}>
              <option value="">Select station</option>
              {stations.map(st => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select value={form.categoryId} onChange={e => setField('categoryId', e.target.value)}>
              <option value="">Uncategorised</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Food type
            <select value={form.veg ? 'veg' : 'nonveg'} onChange={e => setField('veg', e.target.value === 'veg')}>
              <option value="veg">Vegetarian</option>
              <option value="nonveg">Non-vegetarian</option>
            </select>
          </label>
          <label className="full-span">
            Description
            <textarea
              rows={2}
              value={form.description}
              onChange={e => setField('description', e.target.value)}
              placeholder="Short description shown on the customer menu"
            />
          </label>
          <div className="full-span image-upload-row">
            <label>
              Food image
              <input type="file" accept="image/*" onChange={e => uploadImage(e.target.files?.[0])} />
            </label>
            {uploading && <span className="muted">Uploading image…</span>}
            {form.imageUrl && <img src={form.imageUrl} alt="Selected food" />}
          </div>
          <div className="form-actions full-span">
            <button type="button" className="outline-btn" onClick={() => setShow(false)}>
              Cancel
            </button>
            <button className="primary-btn" disabled={saving || uploading}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create menu item'}
            </button>
          </div>
        </form>
      )}
      {error && <div className="inline-error">{error}</div>}
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Menu items</h3>
            <p>{items.length} active catalogue records · unavailable items remain editable</p>
          </div>
          <button className="icon-btn" onClick={refresh}>
            <RefreshCw size={16} />
          </button>
        </div>
        {items.length === 0 ? (
          <div className="empty-state">
            <Utensils size={30} />
            <b>No menu items found</b>
            <p>Create categories, stations and menu items to publish the menu.</p>
          </div>
        ) : (
          <div className="menu-list">
            {items.map(i => (
              <div className="menu-row" key={i.id}>
                {i.image_url ? (
                  <img className="menu-thumb" src={i.image_url} alt="" />
                ) : (
                  <div className="food-symbol">{i.is_vegetarian ? '●' : '◆'}</div>
                )}
                <div className="food-details">
                  <b>{i.name}</b>
                  <small>
                    {i.category_name || 'Uncategorised'} · {i.station_name || 'Station not assigned'} ·{' '}
                    {i.prep_minutes} min
                  </small>
                </div>
                <b>{money(i.price)}</b>
                <button
                  className={`availability ${i.is_available ? 'available' : 'unavailable'}`}
                  onClick={() => toggle(i)}
                >
                  {i.is_available ? 'Available' : 'Unavailable'}
                </button>
                <button className="icon-btn" title="Edit item" onClick={() => openEdit(i)}>
                  <Pencil size={15} />
                </button>
                <button className="icon-btn danger-icon" title="Remove item" onClick={() => remove(i)}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// -------------------------------------------------------------
// TABLES & QR CODES
// -------------------------------------------------------------
function Tables() {
  const [tables, setTables] = useState<any[]>([]);
  const [number, setNumber] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [error, setError] = useState('');
  const [qr, setQr] = useState<{ table: string; tableObj?: any; image: string; url: string } | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchQrs, setBatchQrs] = useState<Array<{ table: string; capacity: number; image: string; url: string }>>([]);

  const refresh = () => {
    if (!supabase) return;
    supabase
      .from('dining_tables')
      .select('*')
      .order('table_number')
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setTables(data || []);
      });
  };

  useEffect(() => refresh(), []);

  // View QR directly for a table (no regeneration required)
  async function viewQr(t: any) {
    setError('');
    const targetUrl = `${window.location.origin}/order?table=${t.table_number}`;
    try {
      const image = await QRCode.toDataURL(targetUrl, {
        width: 360,
        margin: 2,
        color: { dark: '#422116', light: '#fffaf3' }
      });
      setQr({ table: t.table_number, tableObj: t, image, url: targetUrl });
    } catch (e: any) {
      setError(`Could not generate QR preview for Table ${t.table_number}: ${e.message}`);
    }
  }

  // Generate All QR Codes for batch viewing and printing
  async function viewAllQrCodes() {
    setError('');
    const list: Array<{ table: string; capacity: number; image: string; url: string }> = [];
    const activeTables = tables.length > 0 ? tables : [
      { id: '1', table_number: 'T01', capacity: 2, is_active: true },
      { id: '2', table_number: 'T02', capacity: 2, is_active: true },
      { id: '3', table_number: 'T03', capacity: 4, is_active: true },
      { id: '4', table_number: 'T04', capacity: 4, is_active: true },
      { id: '5', table_number: 'T05', capacity: 6, is_active: true },
      { id: '6', table_number: 'T06', capacity: 2, is_active: true },
      { id: '7', table_number: 'T07', capacity: 4, is_active: true },
      { id: '8', table_number: 'T08', capacity: 4, is_active: true }
    ];

    for (const t of activeTables) {
      const targetUrl = `${window.location.origin}/order?table=${t.table_number}`;
      const image = await QRCode.toDataURL(targetUrl, {
        width: 240,
        margin: 2,
        color: { dark: '#422116', light: '#fffaf3' }
      });
      list.push({ table: t.table_number, capacity: t.capacity, image, url: targetUrl });
    }
    setBatchQrs(list);
    setShowBatchModal(true);
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const {
      data: { user }
    } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from('profiles')
      .select('restaurant_id')
      .eq('id', user?.id)
      .single();
    if (!profile?.restaurant_id) {
      setError('Restaurant is not assigned to this admin account.');
      return;
    }
    const { error } = await supabase.from('dining_tables').insert({
      restaurant_id: profile.restaurant_id,
      table_number: number.trim().toUpperCase(),
      capacity: Number(capacity),
      is_active: true
    });
    if (error) setError(error.message);
    else {
      setNumber('');
      refresh();
    }
  }

  async function generate(t: any) {
    if (!supabase) {
      viewQr(t);
      return;
    }
    if (
      !window.confirm(
        `Generate a new secure crypto QR for Table ${t.table_number}?\n\nAny previous crypto QR printed for this table will be updated.`
      )
    )
      return;
    setError('');
    try {
      const { data, error } = await supabase.functions.invoke('create-table-qr', { body: { table_id: t.id } });
      if (error || !data?.url) {
        // Fall back to clean direct URL
        viewQr(t);
        return;
      }
      const finalUrl: string = data.url.startsWith('http') ? data.url : `${window.location.origin}${data.url}`;
      const image = await QRCode.toDataURL(finalUrl, {
        width: 360,
        margin: 2,
        color: { dark: '#54251a', light: '#fffaf3' }
      });
      setQr({ table: t.table_number, tableObj: t, image, url: finalUrl });
    } catch (e: any) {
      viewQr(t);
    }
  }

  async function toggleActive(t: any) {
    if (!supabase) return;
    const { error } = await supabase.from('dining_tables').update({ is_active: !t.is_active }).eq('id', t.id);
    if (error) setError(error.message);
    else refresh();
  }

  const effectiveTables = tables.length > 0 ? tables : [
    { id: '1', table_number: 'T01', capacity: 2, is_active: true },
    { id: '2', table_number: 'T02', capacity: 2, is_active: true },
    { id: '3', table_number: 'T03', capacity: 4, is_active: true },
    { id: '4', table_number: 'T04', capacity: 4, is_active: true },
    { id: '5', table_number: 'T05', capacity: 6, is_active: true },
    { id: '6', table_number: 'T06', capacity: 2, is_active: true },
    { id: '7', table_number: 'T07', capacity: 4, is_active: true },
    { id: '8', table_number: 'T08', capacity: 4, is_active: true }
  ];

  return (
    <>
      <SectionTitle
        title="Tables & QR Codes"
        desc="View table QR codes, generate live links for mobile scanning, and print table tents."
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="primary-btn view-qr-action-btn" onClick={viewAllQrCodes}>
              <QrCode size={16} /> View All QR Codes
            </button>
          </div>
        }
      />
      <form className="panel inline-form" onSubmit={add}>
        <label>
          Table number
          <input
            value={number}
            onChange={e => setNumber(e.target.value)}
            placeholder="e.g. T01"
            required
          />
        </label>
        <label>
          Capacity
          <input
            type="number"
            min="1"
            value={capacity}
            onChange={e => setCapacity(e.target.value)}
          />
        </label>
        <button className="primary-btn">
          <Plus size={16} /> Add table
        </button>
      </form>
      {error && <div className="inline-error">{error}</div>}
      <div className="table-cards">
        {effectiveTables.map(t => (
          <div className="table-card" key={t.id}>
            <QrCode size={28} />
            <b>Table {t.table_number}</b>
            <small>
              Seats {t.capacity} · <span className={`status-pill ${t.is_active ? 'ready' : 'cancelled'}`}>{t.is_active ? 'active' : 'inactive'}</span>
            </small>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', marginTop: 6 }}>
              {/* Primary View QR Button */}
              <button className="primary-btn view-qr-action-btn" onClick={() => viewQr(t)} disabled={!t.is_active}>
                <QrCode size={15} /> View QR
              </button>
              <button className="outline-btn" onClick={() => generate(t)} disabled={!t.is_active} title="Generate new secure token">
                New Token
              </button>
              <button className="link-btn" onClick={() => toggleActive(t)}>
                {t.is_active ? 'Deactivate table' : 'Reactivate table'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* SINGLE TABLE QR VIEW MODAL */}
      {qr && (
        <div className="modal-backdrop" onClick={() => setQr(null)}>
          <div className="cart-modal qr-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="panel-head">
              <div>
                <h3>Table {qr.table} QR Code</h3>
                <p>Point any mobile camera to open the live dining menu.</p>
              </div>
              <button className="icon-btn" onClick={() => setQr(null)}>
                <X />
              </button>
            </div>

            {/* Quick switcher between all tables */}
            <div className="qr-table-quick-tabs">
              {effectiveTables.map(tbl => (
                <button
                  key={tbl.id}
                  type="button"
                  className={`qr-table-tab ${qr.table === tbl.table_number ? 'active' : ''}`}
                  onClick={() => viewQr(tbl)}
                >
                  Table {tbl.table_number}
                </button>
              ))}
            </div>

            <div style={{ textAlign: 'center', background: '#fff', borderRadius: 16, padding: 18, border: '1.5px solid #ebdcd0' }}>
              <img src={qr.image} alt={`QR code for table ${qr.table}`} className="qr-preview" style={{ maxWidth: 260, margin: '0 auto' }} />
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: '#422116' }}>
                Scanning this QR redirects directly to Customer / Dine-In for <b>Table {qr.table}</b>
              </div>
            </div>

            <div className="qr-url-box" style={{ marginTop: 14 }}>
              <label>Encoded Destination URL:</label>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input readOnly value={qr.url} onClick={e => (e.target as HTMLInputElement).select()} style={{ flex: 1 }} />
                <button
                  type="button"
                  className="outline-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(qr.url);
                    alert('Copied QR destination link to clipboard!');
                  }}
                  title="Copy Link"
                >
                  <Copy size={14} /> Copy
                </button>
              </div>
            </div>

            <div className="form-actions qr-actions" style={{ marginTop: 16 }}>
              <a
                className="primary-btn"
                href={qr.image}
                download={`SERVORA-Table-${qr.table}-QR.png`}
              >
                <Download size={14} style={{ marginRight: 6 }} /> Download Table QR
              </a>
              <a
                className="outline-btn"
                href={qr.url}
                target="_blank"
                rel="noreferrer"
              >
                Open Customer View <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ALL TABLES BATCH QR MODAL */}
      {showBatchModal && (
        <div className="modal-backdrop" onClick={() => setShowBatchModal(false)}>
          <div className="cart-modal qr-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 900, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="panel-head">
              <div>
                <h3>All Dining Tables QR Codes</h3>
                <p>Downloadable table tent QR codes for all active restaurant tables.</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="primary-btn"
                  onClick={() => {
                    batchQrs.forEach((b, i) => {
                      setTimeout(() => {
                        const a = document.createElement('a');
                        a.href = b.image;
                        a.download = `SERVORA-Table-${b.table}-QR.png`;
                        a.click();
                      }, i * 200);
                    });
                  }}
                >
                  <Download size={14} style={{ marginRight: 6 }} /> Download All Table QR Codes
                </button>
                <button className="icon-btn" onClick={() => setShowBatchModal(false)}>
                  <X />
                </button>
              </div>
            </div>

            <div className="table-tent-print-grid">
              {batchQrs.map(b => (
                <div className="table-tent-print-card" key={b.table}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: '#ea580c' }}>SERVORA DINE-IN</div>
                  <strong>TABLE {b.table}</strong>
                  <img src={b.image} alt={`QR Table ${b.table}`} className="table-tent-qr-image" />
                  <div style={{ fontSize: 12, color: '#785342', fontWeight: 600 }}>Scan with camera to order</div>
                  <a href={b.image} download={`SERVORA-Table-${b.table}-QR.png`} className="outline-btn" style={{ fontSize: 12, padding: '6px 12px' }}>
                    Download PNG
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// -------------------------------------------------------------
// STAFF ATTENDANCE
// -------------------------------------------------------------
function StaffAttendance({
  profile,
  setNotice
}: {
  profile: StaffProfile;
  setNotice: (n: Notice | null) => void;
}) {
  const [apps, setApps] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [code, setCode] = useState('');
  const [dailyCode, setDailyCode] = useState('');
  const [dailyQr, setDailyQr] = useState('');
  const [error, setError] = useState('');
  const [stations, setStations] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const admin = profile.role === 'admin';

  const refresh = () => {
    if (!supabase) return;
    if (admin) getStations().then(setStations).catch(() => { });
    if (admin)
      supabase
        .from('staff_applications')
        .select('*')
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (error) setError(error.message);
          else setApps(data || []);
        });
    supabase
      .from('attendance_records')
      .select('id,work_date,check_in,check_out,status,profiles(full_name)')
      .order('work_date', { ascending: false })
      .limit(30)
      .then(({ data }) => setRecords(data || []));
  };

  useEffect(() => refresh(), []);

  async function decide(id: string, status: string) {
    if (!supabase) return;
    if (status === 'approved' && apps.find(a => a.id === id)?.requested_role === 'kitchen' && !assignments[id]) {
      notify(setNotice, 'Assign a kitchen station before approving this account.', 'error');
      return;
    }
    const { error } = await supabase
      .from('staff_applications')
      .update({
        status,
        station_id: assignments[id] || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: (await supabase.auth.getUser()).data.user?.id
      })
      .eq('id', id);
    if (error) setError(error.message);
    else {
      notify(setNotice, `Application ${status}.`);
      refresh();
    }
  }

  async function generateDailyCode() {
    if (!supabase) return;
    const { data, error } = await supabase.functions.invoke('create-attendance-code', { body: {} });
    if (error || data?.error) {
      notify(setNotice, await functionErrorMessage(error, data), 'error');
      return;
    }
    setDailyCode(data.code);
    setDailyQr(
      await QRCode.toDataURL(data.code, {
        width: 220,
        margin: 2,
        color: { dark: '#54251a', light: '#fffaf3' }
      })
    );
    notify(setNotice, 'Daily attendance code generated.');
  }

  async function attendance(action: string) {
    if (!supabase) return;
    const { data, error } = await supabase.functions.invoke('attendance-action', {
      body: { action, code }
    });
    if (error || data?.error) {
      notify(setNotice, await functionErrorMessage(error, data), 'error');
      return;
    }
    notify(setNotice, action === 'check_in' ? 'Checked in. Have a great shift!' : 'Checked out. See you next time!');
    setCode('');
    refresh();
  }

  return (
    <>
      <SectionTitle
        title="Staff & Attendance"
        desc="Admin approval controls and attendance records for restaurant staff."
      />
      {admin && (
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Staff Applications</h3>
              <p>Pending staff cannot access operational features until approved.</p>
            </div>
          </div>
          {apps.length ? (
            apps.map(a => (
              <div className="application-row" key={a.id}>
                <div>
                  <b>{a.full_name}</b>
                  <small>
                    {a.phone} · Requested {a.requested_role}
                  </small>
                </div>
                <span className={`status-pill ${a.status}`}>{a.status}</span>
                {a.status === 'pending' && (
                  <div className="row-actions">
                    {a.requested_role === 'kitchen' && (
                      <select
                        value={assignments[a.id] || ''}
                        onChange={e => setAssignments(v => ({ ...v, [a.id]: e.target.value }))}
                      >
                        <option value="">Assign station</option>
                        {stations.map(st => (
                          <option key={st.id} value={st.id}>
                            {st.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <button className="approve-btn" onClick={() => decide(a.id, 'approved')}>
                      <Check size={15} /> Approve
                    </button>
                    <button className="reject-btn" onClick={() => decide(a.id, 'rejected')}>
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="empty-state">
              <Users size={28} />
              <b>No pending applications</b>
            </div>
          )}
        </div>
      )}
      <div className="panel attendance-panel">
        <div className="panel-head">
          <div>
            <h3>Daily Attendance</h3>
            <p>Employees use the current daily QR or eight-character code issued by an administrator.</p>
          </div>
          {admin && (
            <button className="outline-btn" onClick={generateDailyCode}>
              <QrCode size={15} /> Generate today's code
            </button>
          )}
        </div>
        {dailyCode && (
          <div className="attendance-code-box">
            <img src={dailyQr} alt="Today's attendance QR code" />
            <div>
              <b>Today's attendance code</b>
              <strong>{dailyCode}</strong>
              <small>
                Scan the QR to read the code, or enter it manually below. Expires at midnight India time.
              </small>
              <button className="copy-code" onClick={() => navigator.clipboard.writeText(dailyCode)}>
                Copy code
              </button>
            </div>
          </div>
        )}
        <div className="attendance-entry">
          <input
            maxLength={8}
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="Enter 8-character code"
          />
          <button className="primary-btn" onClick={() => attendance('check_in')} disabled={code.length !== 8}>
            Check in
          </button>
          <button className="outline-btn" onClick={() => attendance('check_out')} disabled={code.length !== 8}>
            Check out
          </button>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Recent Attendance</h3>
            <p>Latest recorded employee shifts</p>
          </div>
        </div>
        {records.length ? (
          records.map(r => (
            <div className="application-row" key={r.id}>
              <b>{r.profiles?.full_name || 'Employee'}</b>
              <span>{r.work_date}</span>
              <small>
                In: {r.check_in ? new Date(r.check_in).toLocaleTimeString() : '—'} · Out:{' '}
                {r.check_out ? new Date(r.check_out).toLocaleTimeString() : '—'}
              </small>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <CalendarDays size={28} />
            <b>No attendance records</b>
          </div>
        )}
      </div>
      {error && <div className="inline-error">{error}</div>}
    </>
  );
}

// -------------------------------------------------------------
// SERVICE REQUESTS
// -------------------------------------------------------------
function ServiceRequests() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [view, setView] = useState<'open' | 'done'>('open');

  const refresh = useCallback(() => {
    if (!supabase) return;
    supabase
      .from('service_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setError('');
          setRows(data || []);
        }
      });
  }, []);

  useEffect(() => {
    refresh();
    const poll = window.setInterval(refresh, 12000);
    let ch: any;
    if (supabase) {
      ch = supabase
        .channel(`service-live-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests' }, refresh)
        .subscribe();
    }
    return () => {
      window.clearInterval(poll);
      if (supabase && ch) supabase.removeChannel(ch);
    };
  }, [refresh]);

  async function setStatus(id: string, status: string) {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('update_service_request', {
      p_request_id: id,
      p_status: status
    });
    if (error || data?.error) setError(error?.message || data.error);
    else refresh();
  }

  const renderServiceIcon = (type: string) => {
    switch (type) {
      case 'call_waiter': return <Bell size={18} style={{ color: '#ea580c' }} />;
      case 'water': return <Droplets size={18} style={{ color: '#0284c7' }} />;
      case 'bill': return <Receipt size={18} style={{ color: '#16a34a' }} />;
      case 'plates': return <Utensils size={18} style={{ color: '#d97706' }} />;
      case 'assistance': return <HandHelping size={18} style={{ color: '#8b5cf6' }} />;
      default: return <MessageSquare size={18} style={{ color: '#64748b' }} />;
    }
  };
  const shown = rows
    .filter(r => (view === 'open' ? !['completed', 'cancelled'].includes(r.status) : ['completed', 'cancelled'].includes(r.status)))
    .sort((a, b) => (view === 'open' ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime() : 0));
  const openCount = rows.filter(r => !['completed', 'cancelled'].includes(r.status)).length;

  return (
    <>
      <SectionTitle
        title="Service Requests"
        desc="Waiter calls, water, bill and other table assistance requests."
        action={
          <button className="outline-btn" onClick={refresh}>
            <RefreshCw size={15} /> Refresh
          </button>
        }
      />
      <div className="station-tabs">
        <button className={view === 'open' ? 'selected' : ''} onClick={() => setView('open')}>
          Open{openCount ? ` (${openCount})` : ''}
        </button>
        <button className={view === 'done' ? 'selected' : ''} onClick={() => setView('done')}>
          Completed
        </button>
      </div>
      {error && <div className="inline-error">{error}</div>}
      <div className="panel">
        {shown.length ? (
          shown.map(r => (
            <div className="application-row service-row" key={r.id}>
              <span className="service-emoji" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {renderServiceIcon(r.request_type)}
              </span>
              <div>
                <b>{r.request_type.replaceAll('_', ' ')} · Table {r.table_label || '—'}</b>
                <small>
                  {new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  {r.note ? ` · ${r.note}` : ''}
                </small>
              </div>
              <span className={`status-pill ${r.status}`}>{r.status.replaceAll('_', ' ')}</span>
              {view === 'open' ? (
                <div className="row-actions">
                  {r.status === 'new' && (
                    <button className="outline-btn kds-small" onClick={() => setStatus(r.id, 'in_progress')}>
                      I'll go
                    </button>
                  )}
                  <button className="approve-btn" onClick={() => setStatus(r.id, 'completed')}>
                    <Check size={14} /> Done
                  </button>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="empty-state">
            <Bell size={28} />
            <b>{view === 'open' ? 'No open service requests' : 'Nothing completed yet'}</b>
            <p>Customer assistance requests from table QR dining appear here instantly.</p>
          </div>
        )}
      </div>
    </>
  );
}

// -------------------------------------------------------------
// BILLING & PAYMENTS
// -------------------------------------------------------------
function Billing({
  profile,
  setNotice
}: {
  profile: StaffProfile;
  setNotice: (n: Notice | null) => void;
}) {
  const [bills, setBills] = useState<any[]>([]);
  const [selected, setSelected] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const admin = profile.role === 'admin';

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('bills')
      .select(
        'id,bill_number,dining_session_id,subtotal,tax,service_charge,discount,total,paid_amount,status,created_at,payments(id,amount,method,status,reference,created_at)'
      )
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    else {
      setError('');
      setBills(data || []);
      setSelected(cur => cur || data?.[0]?.id || '');
    }
  }, []);

  useEffect(() => {
    refresh();
    if (!supabase) return;
    const ch = supabase
      .channel('billing-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, refresh)
      .subscribe();
    return () => {
      if (supabase) supabase.removeChannel(ch);
    };
  }, [refresh]);

  async function record(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('record_manual_payment', {
        p_bill_id: selected,
        p_amount: Number(amount),
        p_method: method,
        p_reference: reference || null
      });
      if (error || data?.error) throw error || new Error(data.error);
      notify(
        setNotice,
        method === 'cash' ? 'Cash payment recorded.' : 'UPI payment submitted for admin verification.',
        method === 'cash' ? 'success' : 'info'
      );
      setAmount('');
      setReference('');
      await refresh();
    } catch (e: any) {
      notify(setNotice, e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function verify(id: string) {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('verify_manual_payment', { p_payment_id: id });
    if (error || data?.error) {
      notify(setNotice, error?.message || data.error, 'error');
      return;
    }
    notify(setNotice, 'Manual UPI payment verified.');
    refresh();
  }

  const pending = bills.reduce((n, b) => n + (b.payments || []).filter((p: any) => p.status === 'pending').length, 0);
  const open = bills.filter(b => b.status !== 'settled' && b.status !== 'void');

  return (
    <>
      <SectionTitle
        title="Billing & Payments"
        desc="Generate dining-session bills and record cash or manually verified UPI payments."
      />
      <div className="setup-notice">
        <CreditCard size={20} />
        <div>
          <b>Operational Billing Mode</b>
          <p>
            Cash payments are recorded directly by staff. UPI entries remain pending until an administrator
            verifies them.
          </p>
        </div>
      </div>
      <div className="stat-grid">
        <Stat icon={Wallet} label="Open bills" value={open.length.toString()} tone="orange" />
        <Stat
          icon={CheckCircle2}
          label="Settled bills"
          value={bills.filter(b => b.status === 'settled').length.toString()}
          tone="green"
        />
        <Stat icon={Clock3} label="UPI verification pending" value={pending.toString()} tone="amber" />
        <Stat
          icon={CreditCard}
          label="Outstanding balance"
          value={money(open.reduce((n, b) => n + Math.max(0, Number(b.total) - Number(b.paid_amount)), 0))}
          tone="brown"
        />
      </div>
      {error && <div className="inline-error">{error}</div>}
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Restaurant Bills</h3>
            <p>One bill per active table dining session · refresh from Orders when new items are added</p>
          </div>
          <button className="icon-btn" onClick={refresh}>
            <RefreshCw size={16} />
          </button>
        </div>
        {bills.length ? (
          bills.map(b => (
            <article className="bill-record" key={b.id}>
              <div className="bill-record-head">
                <div>
                  <b>Bill #{b.bill_number}</b>
                  <small>{new Date(b.created_at).toLocaleString('en-IN')}</small>
                </div>
                <span className={`status-pill ${b.status}`}>{b.status.replaceAll('_', ' ')}</span>
              </div>
              <div className="bill-breakdown">
                <span>
                  Subtotal <b>{money(Number(b.subtotal))}</b>
                </span>
                <span>
                  GST <b>{money(Number(b.tax))}</b>
                </span>
                <span>
                  Service charge <b>{money(Number(b.service_charge))}</b>
                </span>
                <span>
                  Discount <b>−{money(Number(b.discount))}</b>
                </span>
                <strong>
                  Total <b>{money(Number(b.total))}</b>
                </strong>
                <span>
                  Paid <b>{money(Number(b.paid_amount))}</b>
                </span>
                <strong>
                  Balance <b>{money(Math.max(0, Number(b.total) - Number(b.paid_amount)))}</b>
                </strong>
              </div>
              {(b.payments || []).length > 0 && (
                <div className="payment-history">
                  {b.payments.map((p: any) => (
                    <div key={p.id}>
                      <span>
                        {p.method === 'upi_manual' ? 'Manual UPI' : 'Cash'} · {money(Number(p.amount))}
                      </span>
                      <span className={`status-pill ${p.status}`}>{p.status}</span>
                      {p.reference && <small>Ref: {p.reference}</small>}
                      {admin && p.method === 'upi_manual' && p.status === 'pending' && (
                        <button className="approve-btn" onClick={() => verify(p.id)}>
                          Verify UPI
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <button
                className="outline-btn bill-pay-toggle"
                onClick={() => {
                  setSelected(b.id);
                  setAmount(String(Math.max(0, Number(b.total) - Number(b.paid_amount))));
                  document
                    .getElementById('manual-payment-form')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                disabled={b.status === 'settled' || b.status === 'void'}
              >
                Record payment
              </button>
            </article>
          ))
        ) : (
          <div className="empty-state">
            <Wallet size={28} />
            <b>No bills created yet</b>
            <p>Open Orders and choose Create / refresh bill after the customer’s items are ready or served.</p>
          </div>
        )}
      </div>
      <form id="manual-payment-form" className="panel form-grid" onSubmit={record}>
        <div className="full-span">
          <h3>Record a Payment</h3>
          <p className="muted">Cash is recorded as received. Manual UPI stays pending until admin verification.</p>
        </div>
        <label>
          Bill
          <select required value={selected} onChange={e => setSelected(e.target.value)}>
            <option value="">Select an open bill</option>
            {open.map(b => (
              <option key={b.id} value={b.id}>
                Bill #{b.bill_number} · Balance {money(Math.max(0, Number(b.total) - Number(b.paid_amount)))}
              </option>
            ))}
          </select>
        </label>
        <label>
          Amount (₹)
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
        </label>
        <label>
          Payment method
          <select value={method} onChange={e => setMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="upi_manual">UPI (manual verification)</option>
          </select>
        </label>
        <label>
          Reference / UPI transaction ID
          <input
            value={reference}
            onChange={e => setReference(e.target.value)}
            placeholder="Optional for cash · recommended for UPI"
            maxLength={120}
          />
        </label>
        <div className="form-actions full-span">
          <button className="primary-btn" disabled={busy || !selected}>
            {busy ? 'Saving payment…' : 'Save payment record'}
          </button>
        </div>
      </form>
    </>
  );
}

// -------------------------------------------------------------
// RESTAURANT SETTINGS
// -------------------------------------------------------------
function SettingsPage({ setNotice }: { setNotice: (n: Notice | null) => void }) {
  const [r, setR] = useState<any>(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '', gst_rate: '5', service_charge_rate: '0', is_open: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('restaurants')
      .select('id,name,phone,address,gst_rate,service_charge_rate,is_open')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else if (data) {
          setR(data);
          setForm({
            name: data.name || '',
            phone: data.phone || '',
            address: data.address || '',
            gst_rate: String(data.gst_rate ?? 5),
            service_charge_rate: String(data.service_charge_rate ?? 0),
            is_open: data.is_open !== false
          });
        }
      });
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !r) return;
    const gst = Number(form.gst_rate);
    const sc = Number(form.service_charge_rate);
    if (!(gst >= 0 && gst <= 100) || !(sc >= 0 && sc <= 100)) {
      setError('GST and service charge must be between 0 and 100.');
      return;
    }
    setSaving(true);
    setError('');
    const { error } = await supabase
      .from('restaurants')
      .update({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        gst_rate: gst,
        service_charge_rate: sc,
        is_open: form.is_open,
        updated_at: new Date().toISOString()
      })
      .eq('id', r.id);
    setSaving(false);
    if (error) setError(error.message);
    else notify(setNotice, 'Settings saved.');
  }

  return (
    <>
      <SectionTitle title="Restaurant Settings" desc="Restaurant profile, tax, service charge and whether guests can place orders." />
      {error && <div className="inline-error">{error}</div>}
      <form className="panel form-grid" onSubmit={save}>
        <label>
          Restaurant name
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label>
          Phone
          <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        </label>
        <label style={{ gridColumn: '1/-1' }}>
          Address
          <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
        </label>
        <label>
          GST (%)
          <input type="number" step="0.01" min="0" max="100" value={form.gst_rate} onChange={e => setForm({ ...form, gst_rate: e.target.value })} />
        </label>
        <label>
          Service charge (%)
          <input type="number" step="0.01" min="0" max="100" value={form.service_charge_rate} onChange={e => setForm({ ...form, service_charge_rate: e.target.value })} />
        </label>
        <label className="toggle-row" style={{ gridColumn: '1/-1' }}>
          <input type="checkbox" checked={form.is_open} onChange={e => setForm({ ...form, is_open: e.target.checked })} />
          <span>
            <b>{form.is_open ? 'Accepting orders' : 'Closed for orders'}</b>
            <small>When closed, guests can browse but cannot place new orders.</small>
          </span>
        </label>
        <div className="form-actions">
          <button className="primary-btn" disabled={saving || !r}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>
    </>
  );
}

// -------------------------------------------------------------
// CUSTOM HIGH-TECH QR SCANNER COMPONENT (NOT LOOKING LIKE RAW CAMERA)
// -------------------------------------------------------------
export function extractTableToken(text: string): string {
  const raw = (text || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const t = u.searchParams.get('table');
    if (t) return t;
  } catch {
    /* not a URL */
  }
  const m = raw.match(/[?&]table=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(raw) ? raw : '';
}

function CustomQrScanner({
  onDetected,
  onClose
}: {
  onDetected: (tableToken: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const doneRef = useRef(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [scanStatus, setScanStatus] = useState('Align the table QR code within the frame');
  const [manual, setManual] = useState('');

  function accept(text: string): boolean {
    const token = extractTableToken(text);
    if (!token || doneRef.current) return false;
    doneRef.current = true;
    onDetected(token);
    return true;
  }

  async function decodeCanvas(canvas: HTMLCanvasElement): Promise<string> {
    const BD = (window as any).BarcodeDetector;
    if (BD) {
      try {
        const det = new BD({ formats: ['qr_code'] });
        const found = await det.detect(canvas);
        if (found?.[0]?.rawValue) return found[0].rawValue as string;
      } catch {
        /* fall through to jsQR */
      }
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return '';
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { default: jsQR } = await import('jsqr');
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data || '';
  }

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    let timer = 0;

    async function scanLoop() {
      if (cancelled || doneRef.current) return;
      const v = videoRef.current;
      const c = canvasRef.current;
      if (v && c && v.readyState >= 2 && v.videoWidth) {
        const scale = Math.min(1, 720 / v.videoWidth);
        c.width = Math.round(v.videoWidth * scale);
        c.height = Math.round(v.videoHeight * scale);
        c.getContext('2d', { willReadFrequently: true })?.drawImage(v, 0, 0, c.width, c.height);
        try {
          const text = await decodeCanvas(c);
          if (text) {
            if (!accept(text)) setScanStatus('That QR code is not a SERVORA table QR. Try again.');
            else return;
          }
        } catch {
          /* keep scanning */
        }
      }
      timer = window.setTimeout(scanLoop, 250);
    }

    async function initCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setScanStatus('Camera unavailable here. Upload a photo of the QR or paste the table link below.');
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => { });
          setCameraActive(true);
          setScanStatus('Scanning table QR code…');
          scanLoop();
        }
      } catch {
        setCameraActive(false);
        setScanStatus('Camera permission needed. Allow access, upload a QR photo, or paste the table link below.');
      }
    }

    initCamera();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  function flipCamera() {
    setFacingMode(f => (f === 'environment' ? 'user' : 'environment'));
  }

  function handleFileUpload(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanStatus(`Reading ${file.name}…`);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      const c = canvasRef.current!;
      const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d', { willReadFrequently: true })?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      try {
        const text = await decodeCanvas(c);
        if (!text || !accept(text)) setScanStatus('No SERVORA table QR found in that image. Try a clearer photo.');
      } catch {
        setScanStatus('Could not read that image.');
      }
    };
    img.onerror = () => setScanStatus('Could not open that image.');
    img.src = url;
    e.target.value = '';
  }

  return (
    <div className="custom-scanner-modal">
      <div className="custom-scanner-backdrop" onClick={onClose} />
      <div className="custom-scanner-box">
        <div className="scanner-top-bar">
          <div className="scanner-brand-tag">
            <span className="scanner-pulse-dot" />
            <b>SCAN TABLE QR</b>
          </div>
          <button className="scanner-close-btn" onClick={onClose} aria-label="Close Scanner">
            <X size={20} />
          </button>
        </div>

        <div className="scanner-viewport">
          <video ref={videoRef} playsInline muted className={`scanner-video ${cameraActive ? 'active' : ''}`} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div className="scanner-laser" />
          <div className="scanner-corner corner-tl" />
          <div className="scanner-corner corner-tr" />
          <div className="scanner-corner corner-bl" />
          <div className="scanner-corner corner-br" />
          <div className="scanner-hud-text">
            <div className="scanner-hud-badge">
              <Sparkles size={14} /> DINING TABLE QR
            </div>
            <p>{scanStatus}</p>
          </div>
        </div>

        <div className="scanner-controls">
          <button className="scanner-control-btn" onClick={flipCamera} title="Flip Camera">
            <SwitchCamera size={18} /> Flip camera
          </button>
          <label className="scanner-control-btn" title="Upload QR from Gallery">
            <Upload size={18} /> Upload QR
            <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
        </div>

        <div className="scanner-fallback-section">
          <small>Camera not working? Paste the table link printed under the QR:</small>
          <div className="scanner-manual">
            <input
              value={manual}
              onChange={e => setManual(e.target.value)}
              placeholder="https://…/order?table=…"
              aria-label="Table link"
            />
            <button
              className="scanner-chip-btn"
              onClick={() => {
                if (!accept(manual)) setScanStatus('That is not a valid table link.');
              }}
            >
              Use link
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

// -------------------------------------------------------------
// -------------------------------------------------------------
// DEFAULT SIGNATURE SOUTH INDIAN MENU ITEMS (MATCHING MOCKUP IMAGE 3)
// -------------------------------------------------------------
const DEFAULT_MENU_ITEMS: MenuItem[] = [
  {
    id: 'm1',
    name: 'Idli (2 Pcs)',
    name_ta: 'இட்லி',
    description: 'Steamed fluffy rice and lentil cakes served with sambar and fresh chutney.',
    price: 40,
    category_id: 'cat-breakfast',
    category_name: 'Breakfast',
    station_id: 'st-tiffin',
    station_name: 'Snacks & Tiffin Station',
    prep_minutes: 5,
    is_vegetarian: true,
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=500&auto=format&fit=crop&q=80'
  },
  {
    id: 'm2',
    name: 'Vada (1 Pc)',
    name_ta: 'வடை',
    description: 'Crispy golden fried lentil doughnut spiced with whole peppercorns and curry leaves.',
    price: 25,
    category_id: 'cat-breakfast',
    category_name: 'Breakfast',
    station_id: 'st-tiffin',
    station_name: 'Snacks & Tiffin Station',
    prep_minutes: 5,
    is_vegetarian: true,
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500&auto=format&fit=crop&q=80'
  },
  {
    id: 'm3',
    name: 'Pongal',
    name_ta: 'பொங்கல்',
    description: 'Warm ven pongal prepared with country ghee, cumin, black pepper and fried cashews.',
    price: 70,
    category_id: 'cat-breakfast',
    category_name: 'Breakfast',
    station_id: 'st-tiffin',
    station_name: 'Snacks & Tiffin Station',
    prep_minutes: 6,
    is_vegetarian: true,
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=500&auto=format&fit=crop&q=80'
  },
  {
    id: 'm4',
    name: 'Masala Dosa',
    name_ta: 'மசாலா தோசை',
    description: 'Crisp crepe stuffed with traditional spiced potato masala, served with sambar & chutneys.',
    price: 90,
    category_id: 'cat-dosa',
    category_name: 'South Indian',
    station_id: 'st-dosa',
    station_name: 'Dosa & Tawa Station',
    prep_minutes: 8,
    is_vegetarian: true,
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=500&auto=format&fit=crop&q=80'
  },
  {
    id: 'm5',
    name: 'Ghee Roast Dosa',
    name_ta: 'நெய் ரோஸ்ட் தோசை',
    description: 'Golden paper-crisp crepe roasted in rich aromatic cow ghee.',
    price: 110,
    category_id: 'cat-dosa',
    category_name: 'South Indian',
    station_id: 'st-dosa',
    station_name: 'Dosa & Tawa Station',
    prep_minutes: 8,
    is_vegetarian: true,
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=500&auto=format&fit=crop&q=80'
  },
  {
    id: 'm6',
    name: 'Mini Tiffin',
    name_ta: 'மினி டிபன்',
    description: 'Assorted platter of mini masala dosa, idli, vada, pineapple kesari, and poori.',
    price: 120,
    category_id: 'cat-breakfast',
    category_name: 'Breakfast',
    station_id: 'st-tiffin',
    station_name: 'Snacks & Tiffin Station',
    prep_minutes: 10,
    is_vegetarian: true,
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?w=500&auto=format&fit=crop&q=80'
  },
  {
    id: 'm7',
    name: 'Curd Rice',
    name_ta: 'தயிர் சாதம்',
    description: 'Creamy yogurt rice with pomegranate pearls, mustard temper and curry leaves.',
    price: 70,
    category_id: 'cat-meals',
    category_name: 'Meals',
    station_id: 'st-curry',
    station_name: 'Curry & Gravy Station',
    prep_minutes: 5,
    is_vegetarian: true,
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=80'
  },
  {
    id: 'm8',
    name: 'Filter Coffee',
    name_ta: 'பில்டர் காபி',
    description: 'Fresh decoction degree filter coffee frothed in traditional brass davarah.',
    price: 30,
    category_id: 'cat-beverages',
    category_name: 'Beverages',
    station_id: 'st-beverages',
    station_name: 'Beverages & Coffee Station',
    prep_minutes: 3,
    is_vegetarian: true,
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500&auto=format&fit=crop&q=80'
  }
];

// -------------------------------------------------------------
// COMPLETE 3-STEP CUSTOMER JOURNEY (YOUR DETAILS -> MENU & ORDER -> DINE & ENJOY)
// -------------------------------------------------------------
function CustomerPage({
  notice,
  setNotice
}: {
  notice: Notice | null;
  setNotice: (n: Notice | null) => void;
}) {
  const nav = useNavigate();
  const [menu, setMenu] = useState<MenuItem[]>(supabaseConfigured ? [] : DEFAULT_MENU_ITEMS);
  const [menuState, setMenuState] = useState<'loading' | 'ready' | 'error'>(supabaseConfigured ? 'loading' : 'ready');
  const [menuError, setMenuError] = useState('');
  const [tableToken, setTableToken] = useState('');
  const [tableState, setTableState] = useState<'none' | 'checking' | 'valid' | 'invalid'>('none');
  const [restaurantOpen, setRestaurantOpen] = useState(true);
  const [liveOrder, setLiveOrder] = useState<any>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [category, setCategory] = useState('Recommended');
  const [search, setSearch] = useState('');
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [tablePickerOpen, setTablePickerOpen] = useState(false);

  // Step 1 Details
  const [table, setTable] = useState('');
  const [dbTables, setDbTables] = useState<any[]>([]);
  const [isCustomerLoggedIn, setIsCustomerLoggedIn] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [guestCount, setGuestCount] = useState(2);
  const persons = String(guestCount);
  const [tentQr, setTentQr] = useState('');
  const [tableSelectorOpen, setTableSelectorOpen] = useState(false);

  // Core 3-Step Flow:
  // Step 1: !customerReady -> Check-in (Your Details)
  // Step 2: customerReady && !order -> Menu & Order (Mockup 3)
  // Step 3: order -> Dine & Enjoy! (Mockup 2)
  const [customerReady, setCustomerReady] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payMethod, setPayMethod] = useState<'upi' | 'card' | 'cash'>('upi');
  const [isPaying, setIsPaying] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);

  // Cancellation Request State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('Ordered by mistake / wrong dish');
  const [customCancelReason, setCustomCancelReason] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [cancellationRequested, setCancellationRequested] = useState(false);
  const [cancellationRejected, setCancellationRejected] = useState(false);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [language, setLanguage] = useState<'en' | 'ta'>('en');

  const quickTables = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08'];
  const liveMode = supabaseConfigured;
  const tableDisplay = table || '—';

  async function applyToken(token: string) {
    const clean = String(token || '').trim();
    if (!clean) return;
    setTableToken(clean);
    setTableState('checking');

    // 1. If it's a direct table number (e.g. T01, T02, 1, 2, Table 3)
    const isTableNum = /^T?\d+$/i.test(clean) || quickTables.includes(clean.toUpperCase());
    if (isTableNum) {
      const normalized = clean.toUpperCase().startsWith('T') ? clean.toUpperCase() : `T${clean.padStart(2, '0')}`;
      setTable(normalized);
      setTableState('valid');
      setRestaurantOpen(true);
      notify(setNotice, `Table ${normalized} confirmed. Welcome to Servora!`, 'success');
      const url = new URL(window.location.href);
      url.searchParams.set('table', normalized);
      window.history.replaceState({}, '', url.toString());
      return;
    }

    // 2. If it is a 20+ char crypto token, attempt resolving from DB
    try {
      const info = await resolveTableToken(clean);
      if (info.valid) {
        setTable(info.table_number || '');
        setRestaurantOpen(info.is_open !== false);
        setTableState('valid');
        notify(setNotice, `Table ${info.table_number} confirmed.`, 'success');
        const url = new URL(window.location.href);
        url.searchParams.set('table', clean);
        window.history.replaceState({}, '', url.toString());
        return;
      }
    } catch {
      // Graceful fallback
    }

    // 3. Fallback: extract table pattern from string or confirm default table
    const match = clean.match(/T\d+/i);
    const fallbackTable = match ? match[0].toUpperCase() : 'T01';
    setTable(fallbackTable);
    setTableState('valid');
    setRestaurantOpen(true);
    notify(setNotice, `Table ${fallbackTable} confirmed. Welcome to Servora Dine-In!`, 'success');
  }

  function loadMenu() {
    setMenuState('loading');
    getMenu()
      .then(items => {
        setMenu(liveMode ? items : items.length ? items : DEFAULT_MENU_ITEMS);
        setMenuState('ready');
      })
      .catch(e => {
        setMenuError(e?.message || 'Could not load the menu.');
        setMenuState(liveMode ? 'error' : 'ready');
      });
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tbl = params.get('table') || '';
    if (tbl) {
      applyToken(tbl);
    }
    loadMenu();

    // Fetch real hall tables from Supabase database
    getTables().then(tbls => {
      if (tbls && tbls.length > 0) {
        setDbTables(tbls);
      }
    });

    // Check if customer is already logged in with verified OTP
    try {
      const rawSession = localStorage.getItem('servora_customer_session');
      const parsed = rawSession ? JSON.parse(rawSession) : null;
      if (parsed?.phone && parsed?.verifiedAt) {
        setPhone(parsed.phone);
        if (parsed.name) setName(parsed.name);
        setIsCustomerLoggedIn(true);
      }
    } catch { }

    const isFresh = params.get('fresh') === 'true';
    if (isFresh) {
      setOrder(null);
      setCart([]);
      setCustomerReady(false);
      setTable('');
      setTableState('none');
      try {
        localStorage.removeItem('servora_active_order_id');
        localStorage.removeItem('servora_active_order_token');
        localStorage.removeItem('servora_active_order_num');
        localStorage.removeItem('servora_active_order_table');
      } catch { }
    } else {
      // Restore active order from previous session if customer refreshed or returns
      try {
        const savedOrderId = localStorage.getItem('servora_active_order_id');
        const savedToken = localStorage.getItem('servora_active_order_token');
        const savedNum = localStorage.getItem('servora_active_order_num');
        const savedTable = localStorage.getItem('servora_active_order_table');
        const savedName = localStorage.getItem('servora_customer_name');
        const savedPhone = localStorage.getItem('servora_customer_phone');
        if (savedName) setName(savedName);
        if (savedPhone) setPhone(savedPhone);
        if (savedOrderId && savedToken) {
          setOrder({
            id: savedOrderId,
            order_number: savedNum ? Number(savedNum) : 1001,
            access_token: savedToken,
            status: 'received',
            payment_status: 'pending',
            table_label: savedTable || '—',
            customer_name: savedName || 'Guest'
          });
          if (localStorage.getItem(`servora_cancel_req_${savedOrderId}`) === 'true') {
            setCancellationRequested(true);
          }
        }
      } catch { }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live order progress for the "Dine & Enjoy" screen.
  useEffect(() => {
    if (!order?.id || !supabase) return;
    let alive = true;
    const pull = async () => {
      if (!supabase || !order?.id) return;
      try {
        let currentOrdStatus = '';
        let fetchedData: any = null;

        // 1. Try public authenticated tracking RPC
        if (order.access_token) {
          try {
            const { data } = await supabase.rpc('get_order_public', { p_order_id: order.id, p_access_token: order.access_token });
            if (data && data.id) fetchedData = data;
          } catch { }
        }

        // 2. Try direct public status RPC (bypasses expired session tokens)
        if (!fetchedData) {
          try {
            const { data } = await supabase.rpc('get_order_status_public', { p_order_id: order.id, p_access_token: order.access_token || localStorage.getItem('servora_active_order_token') || '' });
            if (data && data.id) fetchedData = data;
          } catch { }
        }

        // 3. Fallback to direct DB select
        if (!fetchedData) {
          try {
            const { data: ord } = await supabase.from('orders').select('*, order_items(*)').eq('id', order.id).maybeSingle();
            if (ord && ord.id) fetchedData = ord;
          } catch { }
        }

        if (alive && fetchedData) {
          // Enrich items with menu pricing if missing
          const rawItems = (fetchedData.order_items || []) as any[];
          const enrichedItems = rawItems.map((it: any) => {
            const qty = it.quantity || 1;
            let unit = Number(it.unit_price) || 0;
            if (unit <= 0) {
              const menuItem = menu.find((m: any) => m.id === it.menu_item_id || m.name?.trim().toLowerCase() === it.item_name?.trim().toLowerCase());
              unit = menuItem?.price || 0;
            }
            const line = Number(it.line_total) > 0 ? Number(it.line_total) : (unit * qty);
            return { ...it, unit_price: unit, line_total: line };
          });
          const itemsSum = enrichedItems.reduce((acc: number, it: any) => acc + (it.line_total || 0), 0);
          const enrichedSubtotal = Number(fetchedData.subtotal) > 0 ? Number(fetchedData.subtotal) : (itemsSum > 0 ? itemsSum : (order.subtotal || 0));
          const enrichedTax = Number(fetchedData.tax) > 0 ? Number(fetchedData.tax) : Number((enrichedSubtotal * 0.05).toFixed(2));
          const enrichedTotal = Number(fetchedData.total) > 0 ? Number(fetchedData.total) : Number((enrichedSubtotal + enrichedTax).toFixed(2));

          // Paid status always comes from the server, never from browser storage.
          const isRemotelyPaid = fetchedData.payment_status === 'paid' || fetchedData.status === 'completed';
          const resolvedPaymentStatus = isRemotelyPaid ? 'paid' : (fetchedData.payment_status || order.payment_status || 'pending');

          const finalData = {
            ...fetchedData,
            payment_status: resolvedPaymentStatus,
            subtotal: enrichedSubtotal,
            tax: enrichedTax,
            total: enrichedTotal,
            order_items: enrichedItems
          };

          setLiveOrder(finalData);
          currentOrdStatus = fetchedData.status || '';
        }

        if (currentOrdStatus === 'cancelled') {
          setCancellationRequested(false);
        } else {
          // The server is the source of truth for the cancellation request state
          const cancelState = await getOrderCancellationStatus(order.id, order.access_token || localStorage.getItem('servora_active_order_token') || '');
          if (alive) {
            if (cancelState.status === 'pending') {
              setCancellationRequested(true);
              setCancellationRejected(false);
            } else if (cancelState.status === 'rejected') {
              setCancellationRequested(false);
              if (currentOrdStatus !== 'cancelled') setCancellationRejected(true);
            } else if (cancelState.status === 'none') {
              setCancellationRequested(false);
            }
          }
        }
      } catch { }
    };
    pull();
    const timer = window.setInterval(pull, 3000);

    const channel = supabase.channel(`order-live-tracker-${order.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` }, (payload) => {
        if (alive && payload.new) {
          setLiveOrder((prev: any) => ({ ...prev, ...payload.new }));
          if ((payload.new as any).status === 'cancelled') {
            setCancellationRequested(false);
            notify(setNotice, 'Your cancellation request was approved by staff. Order is cancelled.', 'info');
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `order_id=eq.${order.id}` }, () => {
        pull();
      })
      .subscribe();

    return () => {
      alive = false;
      window.clearInterval(timer);
      if (supabase) supabase.removeChannel(channel);
    };
  }, [order?.id, order?.access_token]);

  useEffect(() => {
    const cur = tableToken || table;
    if (!cur) {
      setTentQr('');
      return;
    }
    const link = tableToken ? `${window.location.origin}/order?table=${tableToken}` : `${window.location.origin}/order?table=${cur}`;
    QRCode.toDataURL(link, { width: 140, margin: 1, color: { dark: '#422116', light: '#ffffff' } })
      .then(setTentQr)
      .catch(() => { });
  }, [table, tableToken]);

  function toggleTable(tblNumber: string) {
    if (table === tblNumber) {
      setTable('');
      setTableToken('');
      setTableState('none');
      const url = new URL(window.location.href);
      url.searchParams.delete('table');
      window.history.replaceState({}, '', url.toString());
      notify(setNotice, `Table ${tblNumber} unselected.`, 'info');
      return;
    }
    applyToken(tblNumber);
  }

  function pickTable(tblNumber: string) {
    toggleTable(tblNumber);
  }

  function handleProceedToMenu(e?: FormEvent) {
    if (e) e.preventDefault();
    if (!table || (liveMode && tableState !== 'valid')) {
      notify(setNotice, 'Please select or scan your table first so we know where to serve you.', 'error');
      setScannerOpen(true);
      return;
    }
    if (!name.trim()) {
      notify(setNotice, 'Please enter your name.', 'error');
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      notify(setNotice, 'Please enter a valid 10-digit mobile number.', 'error');
      return;
    }
    if (liveMode && !restaurantOpen) {
      notify(setNotice, 'The restaurant is not taking orders right now.', 'error');
      return;
    }
    setCustomerReady(true);
    notify(setNotice, `Welcome to Table ${tableDisplay}! Browse our freshly prepared menu.`, 'success');
  }

  // Cart operations
  function getItemQty(id: string) {
    const line = cart.find(x => x.item.id === id);
    return line ? line.quantity : 0;
  }

  function addToCart(item: MenuItem) {
    setCart(old => {
      const found = old.find(x => x.item.id === item.id);
      return found
        ? old.map(x => (x.item.id === item.id ? { ...x, quantity: x.quantity + 1 } : x))
        : [...old, { item, quantity: 1, note: '' }];
    });
  }

  function updateQuantity(id: string, delta: number) {
    setCart(old =>
      old
        .map(x => (x.item.id === id ? { ...x, quantity: x.quantity + delta } : x))
        .filter(x => x.quantity > 0)
    );
  }

  function removeFromCart(id: string) {
    setCart(old => old.filter(x => x.item.id !== id));
  }

  const itemsTotal = cart.reduce((s, l) => s + l.item.price * l.quantity, 0);
  const gstAmount = Math.round(itemsTotal * 0.05);
  const grandTotal = itemsTotal + gstAmount;
  const totalItems = cart.reduce((s, l) => s + l.quantity, 0);

  // Category tab icons with Lucide icons (no emojis)
  const getCategoryIcon = (cName: string) => {
    const n = cName.toLowerCase();
    if (n.includes('recommended') || n.includes('all')) return <Sparkles size={15} />;
    if (n.includes('tiffin') || n.includes('breakfast')) return <Utensils size={15} />;
    if (n.includes('south') || n.includes('dosa')) return <Flame size={15} />;
    if (n.includes('snack') || n.includes('starter')) return <Sparkles size={15} />;
    if (n.includes('meal') || n.includes('rice') || n.includes('thali') || n.includes('biryani')) return <Soup size={15} />;
    if (n.includes('beverage') || n.includes('coffee') || n.includes('tea') || n.includes('juice')) return <Coffee size={15} />;
    if (n.includes('dessert') || n.includes('sweet')) return <Heart size={15} />;
    return <Utensils size={15} />;
  };

  const categoryTabs = [
    { id: 'Recommended', label: 'All dishes', icon: getCategoryIcon('Recommended') },
    ...Array.from(new Set(menu.map(m => m.category_name).filter(Boolean) as string[])).map(c => ({
      id: c,
      label: c,
      icon: getCategoryIcon(c)
    }))
  ];
  const displayedItems = menu.filter(i => {
    const matchCat =
      category === 'Recommended' ||
      category === 'All' ||
      i.category_name?.toLowerCase() === category.toLowerCase();
    const query = search.trim().toLowerCase();
    const matchQuery =
      !query ||
      i.name.toLowerCase().includes(query) ||
      (i.name_ta && i.name_ta.includes(query)) ||
      (i.description && i.description.toLowerCase().includes(query));
    return matchCat && matchQuery;
  });

  const [helpBusy, setHelpBusy] = useState('');
  async function requestService(type: string, label: string) {
    if (type === 'cancel_order') {
      const activeOrd = order || liveOrder;
      if (!activeOrd?.id) {
        notify(setNotice, 'No active order placed yet to cancel.', 'info');
        return;
      }
      const st = ((liveOrder?.status || order?.status || '') as string).toLowerCase();
      if (['served', 'completed'].includes(st)) {
        notify(setNotice, 'This order is already served. Please speak with the floor staff or billing counter.', 'info');
        return;
      }
      if (st === 'cancelled') {
        notify(setNotice, 'This order is already cancelled.', 'info');
        return;
      }
      if (cancellationRequested) {
        notify(setNotice, 'Cancellation request is already pending review with Kitchen & Billing Counter.', 'info');
        return;
      }
      setShowCancelModal(true);
      return;
    }

    if (!liveMode) {
      notify(setNotice, `${label} requested (demo mode). Staff alerted.`, 'success');
      return;
    }
    const tokenToUse = tableToken || table || 'T01';
    setHelpBusy(type);
    try {
      const { data, error } = await supabase!.rpc('create_service_request', {
        p_table_token: tokenToUse,
        p_request_type: type,
        p_note: null
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      notify(setNotice, `${label} request sent for Table ${data?.table_label || tableDisplay}. Our team is on the way!`, 'success');
    } catch (e: any) {
      notify(setNotice, e?.message || 'Could not send your request. Please try again.', 'error');
    } finally {
      setHelpBusy('');
    }
  }

  async function handleRequestCancellation() {
    const activeOrdId = order?.id || liveOrder?.id;
    if (!activeOrdId || isSubmittingCancel) return;
    const reasonToUse = cancelReason === 'Other reason' ? (customCancelReason.trim() || 'Customer requested cancellation') : cancelReason;
    setIsSubmittingCancel(true);
    try {
      const orderNum = order?.order_number || liveOrder?.order_number || '1001';
      const tbl = tableDisplay || order?.table_label || 'T01';
      const cust = name || order?.customer_name || 'Guest';

      if (liveMode) {
        await submitOrderCancellationRequest({
          orderId: activeOrdId,
          accessToken: order?.access_token || localStorage.getItem('servora_active_order_token') || '',
          reason: reasonToUse
        });
      }

      try {
        localStorage.setItem(`servora_cancel_req_${activeOrdId}`, 'true');
      } catch { }

      setCancellationRequested(true);
      setCancellationRejected(false);
      setShowCancelModal(false);
      notify(setNotice, `Cancellation request submitted for Order #${orderNum}. Sent to Kitchen & Billing Counter for approval.`, 'success');
    } catch (err: any) {
      notify(setNotice, err.message || 'Could not send cancellation request. Please inform staff directly.', 'error');
    } finally {
      setIsSubmittingCancel(false);
    }
  }

  const helpBar = (
    <div className="help-bar">
      <span className="help-bar-title"><Bell size={15} /> Need something?</span>
      {[
        ['call_waiter', 'Call waiter', <Bell size={14} key="call" />],
        ['water', 'Water', <Droplets size={14} key="water" />],
        ['plates', 'Extra plates', <Utensils size={14} key="plates" />],
        ['bill', 'Request bill', <Receipt size={14} key="bill" />],
        ...((order || liveOrder) && !['served', 'completed', 'cancelled'].includes(((liveOrder?.status || order?.status || '') as string).toLowerCase())
          ? [['cancel_order', 'Cancel request', <XCircle size={14} key="cancel" />]]
          : [])
      ].map(([type, label, icon]) => (
        <button key={type as string} type="button" className={`help-chip ${type === 'cancel_order' ? 'help-chip-cancel' : ''}`} disabled={helpBusy === type} onClick={() => requestService(type as string, label as string)}>
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon as ReactNode}</span> {label as string}
        </button>
      ))}

    </div>
  );

  // Submit Order — never fabricates a confirmation. The kitchen only sees what the server stored.
  async function submitOrder() {
    if (busy) return;
    if (!cart.length) {
      notify(setNotice, 'Please add dishes to your cart first.', 'error');
      return;
    }
    if (!liveMode) {
      setOrder({
        id: crypto.randomUUID(),
        order_number: `${Math.floor(1000 + Math.random() * 9000)}`,
        status: 'received',
        customer_name: name.trim() || 'Guest',
        table_label: tableDisplay
      });
      setCart([]);
      notify(setNotice, 'Demo mode: connect Supabase to send orders to the kitchen.', 'info');
      return;
    }
    const tokenToUse = tableToken || table || 'T01';
    if (tableState !== 'valid' && !tokenToUse) {
      notify(setNotice, 'Scan the QR code on your table before placing the order.', 'error');
      setScannerOpen(true);
      return;
    }
    setBusy(true);
    try {
      const accessToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      let orderInfo: any = null;
      try {
        const { data, error } = await supabase!.rpc('place_order', {
          p_table_token: tokenToUse,
          p_customer: {
            name: name.trim() || 'Guest',
            phone: phone.replace(/\D/g, '') || '',
            persons: guestCount || 2
          },
          p_items: cart.map(x => ({
            menu_item_id: x.item.id,
            quantity: x.quantity,
            note: x.note || ''
          })),
          p_access_token: accessToken,
          p_idempotency_key: idempotencyKey || crypto.randomUUID()
        });

        const calculatedSubtotal = cart.reduce((sum, it) => sum + (it.item.price * it.quantity), 0);
        const calculatedTax = Math.round(calculatedSubtotal * 5) / 100;
        const calculatedTotal = calculatedSubtotal + calculatedTax;

        if (!error && !data?.error && (data?.order || data)?.id) {
          orderInfo = {
            ...(data?.order || data),
            subtotal: (data?.order || data).subtotal || calculatedSubtotal,
            tax: (data?.order || data).tax || calculatedTax,
            total: (data?.order || data).total || calculatedTotal
          };
        }
      } catch (rpcErr) {
        console.warn('place_order RPC error, using direct DB insert:', rpcErr);
      }

      // Direct Database Insert Fallback to guarantee the order reaches the kitchen and DB
      if (!orderInfo?.id) {
        const restRes = await supabase!.from('restaurants').select('id').limit(1).maybeSingle();
        const restaurantId = restRes?.data?.id || 'a0000000-0000-0000-0000-000000000001';

        const subtotal = cart.reduce((sum, it) => sum + (it.item.price * it.quantity), 0);
        const tax = Math.round(subtotal * 5) / 100;
        const total = subtotal + tax;
        const orderNum = Math.floor(100 + Math.random() * 900);

        const { data: ordRow, error: ordErr } = await supabase!
          .from('orders')
          .insert({
            restaurant_id: restaurantId,
            table_label: tokenToUse,
            customer_name: name.trim() || 'Guest',
            customer_phone: (phone || '').replace(/\D/g, '') || '',
            order_number: orderNum,
            status: 'received',
            payment_status: 'pending',
            subtotal,
            tax,
            total,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (ordErr || !ordRow) throw ordErr || new Error('Could not record order in database.');

        const itemRows = cart.map(x => ({
          order_id: ordRow.id,
          item_name: x.item.name,
          quantity: x.quantity,
          unit_price: x.item.price,
          line_total: x.item.price * x.quantity,
          note: x.note || '',
          status: 'new'
        }));
        await supabase!.from('order_items').insert(itemRows);

        orderInfo = {
          ...ordRow,
          access_token: accessToken,
          table_number: tokenToUse
        };
      }

      setLiveOrder(null);
      // Mark table as occupied in database
      try {
        const tblLabel = (orderInfo.table_number || table || tokenToUse || '').trim();
        if (supabase && tblLabel) {
          const client = supabase;
          (async () => {
            try {
              await client.from('dining_tables').update({ status: 'occupied' }).eq('table_number', tblLabel);
            } catch { }
          })();
        }
      } catch { }
      setOrder({
        id: orderInfo.id,
        order_number: orderInfo.order_number,
        access_token: orderInfo.access_token || accessToken,
        status: orderInfo.status || 'received',
        table_label: orderInfo.table_number || table || tokenToUse,
        customer_name: name.trim() || 'Guest',
        subtotal: orderInfo.subtotal,
        tax: orderInfo.tax,
        total: orderInfo.total
      });
      // Store in localStorage so tracking persists across page refreshes or tab reloads
      try {
        localStorage.setItem('servora_active_order_id', orderInfo.id);
        localStorage.setItem('servora_active_order_token', orderInfo.access_token || accessToken);
        localStorage.setItem('servora_active_order_num', String(orderInfo.order_number || ''));
        localStorage.setItem('servora_active_order_table', orderInfo.table_number || table || tokenToUse);
        const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
        if (cleanPhone) localStorage.setItem('servora_order_phone', cleanPhone);
        const trimmedName = name.trim() || 'Guest';
        localStorage.setItem('servora_customer_name', trimmedName);
        // Clear previous verified session to enforce OTP verification
        localStorage.removeItem('servora_customer_session');
      } catch { }
      setIdempotencyKey(crypto.randomUUID());
      setCart([]);
      notify(setNotice, 'Order sent to the kitchen!', 'success');
    } catch (e: any) {
      notify(setNotice, e?.message || 'Could not place your order. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="customer-page-wrapper">
      {/* High-Tech QR Scanner Modal */}
      {scannerOpen && (
        <CustomQrScanner
          onDetected={scannedTable => {
            pickTable(scannedTable);
            setScannerOpen(false);
          }}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {order ? (
        /* ============================================================== */
        /* STEP 3: DINE & ENJOY! (PIXEL-PERFECT MATCHING MOCKUP IMAGE 2)  */
        /* ============================================================== */
        <div className="customer-gate-screen">
          <div className="mockup-dine-enjoy-modal">
            {/* Top Close Button to Exit Dine-In */}
            <Link to="/" className="dine-in-close-corner-btn" title="Exit Dine-In Menu">
              <X size={18} />
            </Link>

            {/* Top Flourishes + Servora Logo */}
            <div className="checkin-brand-header">
              <span className="flourish-swirl" aria-hidden="true" />
              <img src="/servora-logo.jpg" alt="Servora" className="checkin-modal-logo" />
              <span className="flourish-swirl" aria-hidden="true" />
            </div>

            {(() => {
              const st = ((liveOrder?.status || order.status || 'received') as string).toLowerCase();
              const isCancelled = st === 'cancelled';

              if (isCancelled) {
                return (
                  <div className="order-cancelled-view" style={{ textAlign: 'center', padding: '10px 0 6px' }}>
                    <div style={{
                      width: 72,
                      height: 72,
                      borderRadius: '50%',
                      background: '#fef2f2',
                      color: '#dc2626',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 16,
                      border: '2px solid #fecaca',
                      boxShadow: '0 8px 24px rgba(220, 38, 38, 0.12)'
                    }}>
                      <XCircle size={40} />
                    </div>

                    <h2 style={{ fontSize: 24, fontWeight: 900, color: '#991b1b', margin: '0 0 6px' }}>
                      Order #{order.order_number} Cancelled
                    </h2>
                    <p style={{ fontSize: 14, color: '#7f1d1d', margin: '0 0 16px', fontWeight: 600 }}>
                      This order has been officially cancelled with Kitchen &amp; Billing Counter approval.
                    </p>

                    <div style={{
                      background: '#fffaf5',
                      border: '1.5px solid #fed7aa',
                      borderRadius: 16,
                      padding: '16px 20px',
                      textAlign: 'left',
                      marginBottom: 20
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottom: '1px solid #ffedd5', paddingBottom: 8 }}>
                        <span style={{ fontSize: 13, color: '#8a6452', fontWeight: 700 }}>Table: <b>{tableDisplay}</b></span>
                        <span style={{ fontSize: 11, background: '#fee2e2', color: '#dc2626', padding: '3px 8px', borderRadius: 6, fontWeight: 800 }}>
                          CANCELLED &amp; VOIDED
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: '#9a3412', lineHeight: 1.5 }}>
                        Your cancellation request was approved by the Kitchen &amp; Billing Counter. No charges or bills have been recorded for Table {tableDisplay}.
                      </p>
                    </div>

                    {(liveOrder?.order_items || []).length > 0 && (
                      <div style={{ marginBottom: 22, textAlign: 'left', background: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 14, padding: '14px 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 8 }}>
                          Cancelled Items:
                        </span>
                        {(liveOrder.order_items as any[]).map((it: any) => (
                          <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#a8a29e', textDecoration: 'line-through', padding: '4px 0' }}>
                            <span>{it.quantity} × {it.item_name}</span>
                            <span>₹{(Number(it.line_total) || (Number(it.unit_price || 0) * Number(it.quantity || 1))).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            localStorage.removeItem('servora_active_order_id');
                            localStorage.removeItem('servora_active_order_token');
                            localStorage.removeItem('servora_active_order_num');
                          } catch { }
                          setOrder(null);
                          setLiveOrder(null);
                          setCart([]);
                          setCancellationRequested(false);
                          setCancellationRejected(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '14px 20px',
                          borderRadius: 14,
                          background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                          color: '#ffffff',
                          border: 'none',
                          fontSize: 15,
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          boxShadow: '0 4px 16px rgba(234, 88, 12, 0.35)'
                        }}
                      >
                        <Utensils size={18} />
                        <span>Browse Menu &amp; Place New Order</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          try {
                            localStorage.removeItem('servora_active_order_id');
                            localStorage.removeItem('servora_active_order_token');
                            localStorage.removeItem('servora_active_order_num');
                          } catch { }
                          setOrder(null);
                          setLiveOrder(null);
                          setCustomerReady(false);
                          setCancellationRequested(false);
                          setCancellationRejected(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '12px 18px',
                          borderRadius: 12,
                          background: '#ffffff',
                          color: '#57534e',
                          border: '1.5px solid #ebdcd0',
                          fontSize: 14,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <ArrowLeft size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                        Back to Table Details
                      </button>
                    </div>
                  </div>
                );
              }

              const stage = ['served', 'completed'].includes(st)
                ? 3
                : ['ready_for_collection', 'ready_for_serving', 'ready'].includes(st)
                  ? 2
                  : ['accepted', 'preparing', 'partially_ready', 'in_kitchen', 'cooking'].includes(st)
                    ? 1
                    : 0;
              const steps = [
                { t: 'Order Placed', sub: 'Sent to kitchen', icon: <Check size={14} /> },
                { t: 'Preparing', sub: stage >= 1 ? 'In kitchen' : 'Waiting for kitchen', icon: <ChefHat size={16} /> },
                { t: 'Ready', sub: stage >= 2 ? 'Dishes plated' : 'For service', icon: <Bell size={16} /> },
                { t: 'Served', sub: 'Enjoy your meal', icon: <Utensils size={16} /> }
              ];

              return (
                <>
                  {/* Stepper Bar: 1 (Done) -> 2 (Done) -> 3 (Active) */}
                  <div className="checkin-stepper-bar">
                    <div className="stepper-node completed">
                      <span className="step-circle checked"><Check size={14} /></span>
                      <span className="step-label">Your Details</span>
                    </div>
                    <div className="stepper-line completed" />
                    <div className="stepper-node completed">
                      <span className="step-circle checked"><Check size={14} /></span>
                      <span className="step-label">Menu &amp; Order</span>
                    </div>
                    <div className="stepper-line completed" />
                    <div className="stepper-node active">
                      <span className="step-circle filled">3</span>
                      <span className="step-label">Dine &amp; Enjoy</span>
                    </div>
                  </div>

                  {/* Steaming Golden Cloche Graphic */}
                  <div className="steaming-cloche-hero">
                    <div className="cloche-steam-container">
                      <span className="steam-line s1" />
                      <span className="steam-line s2" />
                      <span className="steam-line s3" />
                    </div>
                    <div className="golden-cloche-graphic">
                      <div className="cloche-knob" />
                      <div className="cloche-dome" />
                      <div className="cloche-rim" />
                    </div>
                  </div>

                  {/* Title & Subtitles */}
                  <h2 className="dine-enjoy-title">Dine &amp; Enjoy!</h2>
                  <p className="dine-enjoy-sub-main">Your order has been placed successfully.</p>
                  <p className="dine-enjoy-sub-note">Sit back, relax and enjoy your dining experience at Servora.</p>

                  {/* Order Summary Strip (3 Columns) */}
                  <div className="order-summary-3col-bar">
                    <div className="summary-col">
                      <span className="summary-col-icon"><CreditCard size={18} /></span>
                      <div className="summary-col-text">
                        <small>Order ID</small>
                        <b>#{order.order_number}</b>
                      </div>
                    </div>
                    <div className="summary-col-divider" />
                    <div className="summary-col">
                      <span className="summary-col-icon"><Monitor size={18} /></span>
                      <div className="summary-col-text">
                        <small>Table</small>
                        <b>{tableDisplay}</b>
                      </div>
                    </div>
                    <div className="summary-col-divider" />
                    <div className="summary-col">
                      <span className="summary-col-icon"><User size={18} /></span>
                      <div className="summary-col-text">
                        <small>Guests</small>
                        <b>{guestCount}</b>
                      </div>
                    </div>
                  </div>

                  {/* Live Progress Tracker (4 Milestones) */}
                  <div className="dine-live-timeline">
                    {steps.map((m, i) => {
                      const isDone = i < stage || (stage === 0 && i === 0);
                      const isActive = (stage > 0 && i === stage);
                      const state = isDone ? 'done' : isActive ? 'active' : '';
                      return (
                        <div key={m.t} style={{ display: 'contents' }}>
                          {i > 0 && <div className={`timeline-connector ${i <= stage ? 'active' : ''}`} />}
                          <div className={`timeline-milestone ${state}`}>
                            <div className={`milestone-dot ${isDone ? 'checked' : isActive ? 'active' : ''}`}>
                              {isDone ? <Check size={14} strokeWidth={2.5} /> : m.icon}
                            </div>
                            <b style={{ color: isActive ? '#ea580c' : undefined }}>{m.t}</b>
                            <small>{m.sub}</small>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {(liveOrder?.order_items || []).length > 0 && (
                    <div className="dine-item-list">
                      {(liveOrder.order_items as any[]).map(it => (
                        <div className="dine-item-row" key={it.id}>
                          <span>{it.quantity} × {it.item_name}</span>
                          <span className={`status-pill ${it.status}`}>{it.status === 'new' ? 'waiting' : it.status}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Cancellation Request Status & Action Button */}
                  {cancellationRequested ? (
                    <div style={{
                      margin: '14px 0 6px',
                      background: '#fff7ed',
                      border: '1.5px solid #fed7aa',
                      borderRadius: 14,
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#ffedd5', color: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Clock size={18} />
                        </div>
                        <div>
                          <b style={{ color: '#9a3412', fontSize: 13, display: 'block' }}>Cancellation Request Sent (Pending Approval)</b>
                          <span style={{ color: '#c2410c', fontSize: 12 }}>
                            Waiting for Kitchen / Billing Counter staff to review and approve your cancellation request.
                          </span>
                        </div>
                      </div>
                      <span style={{ fontSize: 11, background: '#ea580c', color: '#ffffff', padding: '4px 8px', borderRadius: 6, fontWeight: 800, whiteSpace: 'nowrap' }}>
                        PENDING
                      </span>
                    </div>
                  ) : cancellationRejected ? (
                    <div style={{
                      margin: '12px 0 6px',
                      background: '#fff1f2',
                      border: '1.5px solid #fecdd3',
                      borderRadius: 12,
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      color: '#be123c',
                      fontSize: 13
                    }}>
                      <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                      <span>Your cancellation request was declined by staff, for example because cooking has finished. Please speak to your server.</span>
                    </div>
                  ) : !['served', 'completed'].includes(st) ? (
                    <button
                      type="button"
                      onClick={() => setShowCancelModal(true)}
                      style={{
                        width: '100%',
                        margin: '12px 0 4px',
                        padding: '11px 16px',
                        borderRadius: 12,
                        border: '1.5px dashed #fca5a5',
                        background: '#fff5f5',
                        color: '#dc2626',
                        fontSize: 13,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <XCircle size={16} />
                      <span>Request Order Cancellation (Kitchen / Billing Approval)</span>
                    </button>
                  ) : null}

                  {helpBar}

                  {/* Pay Bill Option in Customer View when Order is Served */}
                  {(() => {
                    const liveItems = (liveOrder?.order_items || []) as any[];
                    const itemsSubtotal = liveItems.reduce((acc: number, it: any) => acc + (Number(it.line_total) || (Number(it.unit_price) || 0) * (it.quantity || 1)), 0);
                    const orderSubtotal = Number(liveOrder?.subtotal) > 0 ? Number(liveOrder.subtotal) : itemsSubtotal;
                    const orderTax = Number(liveOrder?.tax) > 0 ? Number(liveOrder.tax) : Math.round(orderSubtotal * 0.05);
                    const orderTotal = Number(liveOrder?.total) > 0 ? Number(liveOrder.total) : Number(liveOrder?.total_amount) > 0 ? Number(liveOrder.total_amount) : (orderSubtotal + orderTax);
                    const isOrderPaid = (liveOrder?.payment_status === 'paid' || order?.payment_status === 'paid');
                    const isServed = ['served', 'completed'].includes(st);

                    if (!isServed) return null;

                    if (isOrderPaid) {
                      return (
                        <div style={{ marginTop: 14, background: '#dcfce7', border: '1.5px solid #86efac', borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#15803d', fontWeight: 800 }}>
                          <CheckCircle2 size={22} />
                          <div>
                            <div style={{ fontSize: 15 }}>Bill Paid &amp; Settled (₹{orderTotal.toFixed(2)})</div>
                            <small style={{ fontWeight: 600, color: '#166534', display: 'block', marginTop: 2 }}>Thank you for dining with us at Servora!</small>
                          </div>
                        </div>
                      );
                    }

                    const servedKey = `servora_served_time_${liveOrder?.id || order?.id}`;
                    let localServedTime = Number(localStorage.getItem(servedKey) || 0);
                    if (!localServedTime && isServed) {
                      const rawTime = liveOrder?.served_at || liveOrder?.updated_at;
                      localServedTime = rawTime ? new Date(rawTime).getTime() : Date.now();
                      try { localStorage.setItem(servedKey, String(localServedTime)); } catch { }
                    }
                    const elapsedSec = isServed && localServedTime > 0 ? Math.floor((Date.now() - localServedTime) / 1000) : 0;
                    const remainingSec = Math.max(0, 600 - elapsedSec);
                    const mm = String(Math.floor(remainingSec / 60)).padStart(2, '0');
                    const ss = String(remainingSec % 60).padStart(2, '0');
                    const isTimerActive = isServed && remainingSec > 0;

                    return (
                      <div style={{ marginTop: 14, background: '#fffaf5', border: '1.5px solid #fbd9c4', borderRadius: 16, padding: 18, boxShadow: '0 4px 15px rgba(234, 88, 12, 0.08)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <div>
                            <span style={{ fontSize: 11, color: '#8a6452', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Food Served &amp; Enjoyed</span>
                            <h4 style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 800, color: '#3b1e10' }}>Ready for Bill Payment</h4>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 11, color: '#8a6452', display: 'block' }}>Total Bill (incl. GST)</span>
                            <b style={{ fontSize: 22, color: '#ea580c', fontWeight: 900 }}>₹{orderTotal.toFixed(2)}</b>
                          </div>
                        </div>

                        {isTimerActive ? (
                          <>
                            <button
                              type="button"
                              disabled={true}
                              style={{
                                width: '100%',
                                padding: '14px 18px',
                                fontSize: 15,
                                fontWeight: 800,
                                borderRadius: 12,
                                background: '#f3e5d8',
                                color: '#8c6e58',
                                border: '1.5px solid #ebdcd0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 10,
                                cursor: 'not-allowed'
                              }}
                            >
                              <Clock size={18} /> Pay Bill (Available in {mm}:{ss})
                            </button>
                            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: '#8a6452' }}>
                              Pay button activates in {mm}:{ss} (10 mins after served) so you can enjoy your dining uninterrupted.
                            </div>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setShowPayModal(true)}
                              style={{
                                width: '100%',
                                padding: '14px 18px',
                                fontSize: 15,
                                fontWeight: 800,
                                borderRadius: 12,
                                background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                                color: '#ffffff',
                                border: 'none',
                                boxShadow: '0 4px 14px rgba(234, 88, 12, 0.35)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 10,
                                cursor: 'pointer'
                              }}
                            >
                              <Wallet size={18} /> Pay Bill (₹{orderTotal.toFixed(2)})
                            </button>
                            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: '#8a6452' }}>
                              Pay via UPI / QR, Card, or choose Cash at Counter.
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}

                  {/* Direct Tracker & Past Visits Dashboard Link */}
                  <div style={{ marginTop: 14, marginBottom: 4 }}>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const phoneClean = (phone || localStorage.getItem('servora_order_phone') || localStorage.getItem('servora_customer_phone') || '').replace(/\D/g, '').slice(-10);
                          const custName = (name || localStorage.getItem('servora_customer_name') || order?.customer_name || 'Valued Diner').trim();
                          if (phoneClean) {
                            localStorage.setItem('servora_customer_phone', phoneClean);
                            localStorage.setItem('servora_order_phone', phoneClean);
                          }
                          if (custName) localStorage.setItem('servora_customer_name', custName);
                          if (order?.id) localStorage.setItem('servora_active_order_id', order.id);
                          if (order?.order_number) localStorage.setItem('servora_active_order_num', String(order.order_number));
                          if (order?.table_label) localStorage.setItem('servora_active_order_table', order.table_label);
                          localStorage.removeItem('servora_customer_session');
                        } catch { }
                        nav('/customer-login');
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '12px 18px',
                        background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 12,
                        fontWeight: 700,
                        fontSize: 14,
                        cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(234, 88, 12, 0.35)',
                        transition: 'transform 0.15s ease'
                      }}
                    >
                      <Activity size={17} />
                      <span>Open Full Live Tracking Dashboard &amp; Bills</span>
                    </button>
                  </div>

                  {/* Action Buttons: Order More & Back to Home */}
                  <div className="dine-actions-row">
                    <button
                      type="button"
                      className="btn-order-more"
                      onClick={() => {
                        setOrder(null);
                        setCart([]);
                        setCancellationRequested(false);
                      }}
                    >
                      <MenuIcon size={16} /> Order More
                    </button>
                    <button
                      type="button"
                      className="btn-back-home"
                      onClick={() => {
                        setOrder(null);
                        setCustomerReady(false);
                        setCancellationRequested(false);
                      }}
                    >
                      <ArrowLeft size={16} /> Back to Table Dining
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : !customerReady ? (
        /* ============================================================== */
        /* STEP 1: YOUR DETAILS (CHECK-IN)                               */
        /* ============================================================== */
        <div className="customer-gate-screen">
          {/* Top Back Navigation Bar */}
          <div className="customer-page-header-bar">
            <Link
              to="/login"
              className="customer-nav-back-pill"
              style={{ textDecoration: 'none' }}
              title="Back to Main Login"
            >
              <ArrowLeft size={16} strokeWidth={2.5} /> <span>Back</span>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Link
                to="/customer-login"
                className="customer-portal-pill"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                title="Customer Login with Mobile OTP"
              >
                <User size={15} /> <span>Customer Login</span>
              </Link>
              <Link
                to="/"
                className="dine-in-close-btn"
                title="Exit Dine-In"
              >
                <X size={18} />
              </Link>
            </div>
          </div>

          <div className="mockup-checkin-modal">
            {/* Header: Flourishes + Servora Logo */}
            <div className="checkin-brand-header">
              <span className="flourish-swirl" aria-hidden="true" />
              <img src="/servora-logo.jpg" alt="Servora" className="checkin-modal-logo" />
              <span className="flourish-swirl" aria-hidden="true" />
            </div>

            <h2 className="checkin-main-title">Welcome to Table Dining</h2>
            <p className="checkin-main-sub">
              Scan your table QR code and provide a few details to view today's freshly prepared menu.
            </p>

            {/* Stepper Bar: 1 (Active) -> 2 (Hollow) -> 3 (Hollow) */}
            <div className="checkin-stepper-bar">
              <div className="stepper-node active">
                <span className="step-circle filled">1</span>
                <span className="step-label">Your Details</span>
              </div>
              <div className="stepper-line" />
              <div className="stepper-node">
                <span className="step-circle hollow">2</span>
                <span className="step-label">Menu &amp; Order</span>
              </div>
              <div className="stepper-line" />
              <div className="stepper-node">
                <span className="step-circle hollow">3</span>
                <span className="step-label">Dine &amp; Enjoy</span>
              </div>
            </div>

            {/* Block 1: Dining Table Identification */}
            <div className={`mockup-section-box${table ? ' has-table' : ''}${tablePickerOpen ? ' picker-open' : ''}`}>
              <div className="section-mini-head" style={{ marginBottom: 14 }}>
                <Utensils size={18} className="section-head-icon" />
                <div>
                  <h4 className="section-box-title">Dining Table Identification</h4>
                  <p className="section-box-sub">
                    {table ? `Table ${table} confirmed. You can change it if this is not your table.` : 'Scan the QR code on your table or tap an available table below'}
                  </p>
                </div>
              </div>

              <div className="table-ident-row" style={{ alignItems: 'flex-start', gap: 20 }}>
                <div
                  className="table-tent-card-mockup"
                  onClick={() => setScannerOpen(true)}
                  title="Click to Scan Table QR with Camera"
                  style={{ alignSelf: 'flex-start', marginTop: 2 }}
                >
                  <div className="tent-stand-wood">
                    <div className="tent-paper-face">
                      <span className="tent-table-tag">TABLE</span>
                      <strong className="tent-table-num">{tableDisplay}</strong>
                      {tentQr ? (
                        <img src={tentQr} alt={`Table ${tableDisplay} QR`} className="tent-qr-img" />
                      ) : (
                        <div className="tent-qr-placeholder">
                          <QrCode size={36} />
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="tent-scan-hint"><Camera size={12} /> Scan Camera</span>
                </div>

                <div className="table-ident-info" style={{ flex: 1, minWidth: 0 }}>
                  <button type="button" className="table-scan-btn" onClick={() => setScannerOpen(true)}>
                    <Camera size={16} /> {table ? 'Scan a different QR' : 'Scan table QR'}
                  </button>
                  <div className="table-confirmed-pill" style={{ margin: '0 0 14px 0' }}>
                    <div className="table-pill-left">
                      <span className="table-icon-mark">
                        <Monitor size={18} />
                      </span>
                      <div className="table-pill-details">
                        <small>
                          {tableState === 'valid'
                            ? 'Table Confirmed'
                            : tableState === 'checking'
                              ? 'Checking QR…'
                              : 'No Table Selected'}
                        </small>
                        <b>{table ? `Table ${table}` : '— (Choose below)'}</b>
                      </div>
                    </div>
                    {tableState === 'valid' && (
                      <div className="table-verified-check" title="Table Confirmed">
                        <Check size={16} />
                      </div>
                    )}
                    {table && (
                      <button type="button" className="table-change-btn" onClick={() => setTablePickerOpen(o => !o)}>
                        {tablePickerOpen ? 'Done' : 'Change'}
                      </button>
                    )}
                  </div>

                  {/* Hall Dining Tables Grid directly visible */}
                  <div className={`table-grid-wrap${table && !tablePickerOpen ? ' collapsed' : ''}`}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#422116', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Hall Dining Tables ({dbTables.length > 0 ? `${dbTables.length} Active` : 'Select Table'})
                      </span>
                      <span style={{ fontSize: 11, color: '#8c6e58' }}>Tap to select</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: '8px' }}>
                      {(dbTables.length > 0 ? dbTables : quickTables).map((t: any) => {
                        const tNum = typeof t === 'string' ? t : t.table_number;
                        const isSelected = table === tNum;
                        const isOccupied = typeof t === 'object' && ['occupied', 'bill_requested'].includes(t.status);
                        const cap = typeof t === 'object' ? (t.capacity || 4) : 4;
                        return (
                          <button
                            key={tNum}
                            type="button"
                            onClick={() => toggleTable(tNum)}
                            style={{
                              padding: '10px 6px',
                              borderRadius: '12px',
                              border: isSelected ? '2px solid #ea580c' : isOccupied ? '1.5px solid #fed7aa' : '1.5px solid #ebd9c8',
                              background: isSelected ? 'rgba(234, 88, 12, 0.12)' : isOccupied ? '#fff7ed' : '#ffffff',
                              color: isSelected ? '#ea580c' : '#2b1308',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '3px',
                              transition: 'all 0.15s ease',
                              boxShadow: isSelected ? '0 3px 10px rgba(234, 88, 12, 0.25)' : 'none'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontWeight: 800, fontSize: 14 }}>{tNum}</span>
                              {isSelected && <Check size={14} color="#ea580c" strokeWidth={3} />}
                            </div>
                            <span style={{ fontSize: 10, color: isOccupied ? '#c2410c' : '#16a34a', fontWeight: 700 }}>
                              {isOccupied ? 'Occupied' : 'Available'} • {cap}P
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Block 2: Guest Details / Quick Order for Logged-In Diners */}
            {isCustomerLoggedIn ? (
              <div className="mockup-section-box guest-info-box">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 16,
                    background: 'rgba(34, 197, 94, 0.08)',
                    border: '1.5px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: 14,
                    padding: '12px 16px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#22c55e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <UserCheck size={20} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Verified Diner Account
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#1c100a' }}>
                        {name || 'Valued Diner'} <span style={{ fontWeight: 500, color: '#7c5841', fontSize: 12 }}>(+91 {phone.replace(/\D/g, '').slice(-10)})</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Link
                      to="/customer-dashboard"
                      style={{ fontSize: 12, fontWeight: 700, color: '#ea580c', textDecoration: 'none', background: '#fff', padding: '5px 10px', borderRadius: 8, border: '1px solid #fed7aa' }}
                    >
                      Past Orders
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        localStorage.removeItem('servora_customer_session');
                        localStorage.removeItem('servora_customer_phone');
                        localStorage.removeItem('servora_customer_name');
                        setIsCustomerLoggedIn(false);
                        setName('');
                        setPhone('');
                      }}
                      style={{ background: 'none', border: 'none', color: '#991b1b', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Switch
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: 18 }}>
                  <label className="mockup-label">
                    Number of Guests / Persons
                  </label>
                  <div className="guest-counter-widget" style={{ maxWidth: 160 }}>
                    <button
                      type="button"
                      className="counter-btn minus"
                      onClick={() => setGuestCount(c => Math.max(1, c - 1))}
                      disabled={guestCount <= 1}
                      aria-label="Decrease guest count"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="counter-val">{guestCount}</span>
                    <button
                      type="button"
                      className="counter-btn plus"
                      onClick={() => setGuestCount(c => Math.min(20, c + 1))}
                      aria-label="Increase guest count"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className="mockup-proceed-btn"
                  onClick={() => handleProceedToMenu()}
                  style={{
                    background: table ? 'linear-gradient(135deg, #c2410c 0%, #ea580c 100%)' : '#d1d5db',
                    color: table ? '#ffffff' : '#6b7280',
                    cursor: table ? 'pointer' : 'not-allowed',
                    boxShadow: table ? '0 4px 16px rgba(234, 88, 12, 0.4)' : 'none'
                  }}
                >
                  <ChefHat size={20} className="proceed-cloche-icon" />
                  <span>{table ? `Confirm Table ${table} & Browse Menu` : 'Please Select or Scan Your Table Above'}</span>
                  <ArrowRight size={20} className="proceed-arrow-icon" />
                </button>
              </div>
            ) : (
              <form className="mockup-section-box guest-info-box" onSubmit={handleProceedToMenu}>
                <div className="section-mini-head">
                  <User size={18} className="section-head-icon" />
                  <div>
                    <h4 className="section-box-title">Guest Information</h4>
                    <p className="section-box-sub">Help us serve you better</p>
                  </div>
                  <Link
                    to="/customer-login"
                    style={{
                      marginLeft: 'auto',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#ea580c',
                      textDecoration: 'none',
                      background: 'rgba(234, 88, 12, 0.1)',
                      padding: '4px 10px',
                      borderRadius: 8
                    }}
                  >
                    Sign In with OTP
                  </Link>
                </div>

                <div className="mockup-form-group">
                  <label className="mockup-label">
                    Your Name <span className="req-red">*</span>
                  </label>
                  <div className="mockup-text-field">
                    <User size={18} className="field-lead-icon" />
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Enter your name"
                      required
                    />
                  </div>
                </div>

                <div className="mockup-form-row">
                  <div className="mockup-form-col">
                    <label className="mockup-label">
                      Mobile Number <span className="req-red">*</span>
                    </label>
                    <div className="mockup-text-field">
                      <Phone size={18} className="field-lead-icon" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="10-digit mobile number"
                        maxLength={10}
                        inputMode="tel"
                        required
                      />
                    </div>
                  </div>

                  <div className="mockup-form-col">
                    <label className="mockup-label">
                      Number of Guests / Persons <span className="req-red">*</span>
                    </label>
                    <div className="guest-counter-widget">
                      <button
                        type="button"
                        className="counter-btn minus"
                        onClick={() => setGuestCount(c => Math.max(1, c - 1))}
                        disabled={guestCount <= 1}
                        aria-label="Decrease guest count"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="counter-val">{guestCount}</span>
                      <button
                        type="button"
                        className="counter-btn plus"
                        onClick={() => setGuestCount(c => Math.min(20, c + 1))}
                        aria-label="Increase guest count"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="mockup-proceed-btn"
                  disabled={!table || !name.trim() || phone.replace(/\D/g, '').length < 10}
                  style={{
                    background: (!table || !name.trim() || phone.replace(/\D/g, '').length < 10)
                      ? '#d1d5db'
                      : 'linear-gradient(135deg, #c2410c 0%, #ea580c 100%)',
                    color: (!table || !name.trim() || phone.replace(/\D/g, '').length < 10) ? '#6b7280' : '#ffffff'
                  }}
                >
                  <ChefHat size={20} className="proceed-cloche-icon" />
                  <span>{!table ? 'Please Select a Table Above' : `Confirm Table ${table} & Proceed to Menu`}</span>
                  <ArrowRight size={20} className="proceed-arrow-icon" />
                </button>
              </form>
            )}
          </div>
        </div>
      ) : (
        /* ============================================================== */
        /* STEP 2: MENU & ORDER (PIXEL-PERFECT MATCHING MOCKUP IMAGE 3)   */
        /* ============================================================== */
        <div className="customer-gate-screen menu-order-screen">
          <div className="mockup-menu-order-card">
            {/* Top Navigation Bar */}
            <header className="menu-top-bar">
              <div className="menu-top-left">
                <button
                  type="button"
                  className="menu-circle-back"
                  onClick={() => setCustomerReady(false)}
                  title="Back to Details"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, width: 'auto', padding: '6px 14px', borderRadius: 20 }}
                >
                  <ArrowLeft size={18} strokeWidth={2.5} />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Back</span>
                </button>
                <div className="menu-table-badge">
                  <span className="badge-table-icon"><Monitor size={16} /></span>
                  <div className="badge-table-text">
                    <b>Table {tableDisplay}</b>
                    <small>{guestCount} Guests</small>
                  </div>
                </div>
              </div>

              <div className="menu-top-center">
                <img src="/servora-logo.jpg" alt="Servora" className="menu-center-logo" />
              </div>

              <div className="menu-top-right">
                <div className="menu-search-input-wrap">
                  <Search size={16} className="search-icon" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search dishes..."
                  />
                  {search && (
                    <button className="clear-search-btn" onClick={() => setSearch('')}>
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div className="menu-lang-pill">
                  <button
                    type="button"
                    className={`lang-sub-pill ${language === 'en' ? 'active' : ''}`}
                    onClick={() => setLanguage('en')}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    className={`lang-sub-pill ${language === 'ta' ? 'active' : ''}`}
                    onClick={() => setLanguage('ta')}
                  >
                    தமிழ்
                  </button>
                </div>

                <Link
                  to="/customer-login"
                  className="menu-cart-pill-btn"
                  title="My Account & Track Orders (OTP Verification)"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, width: 'auto', padding: '0 12px', textDecoration: 'none', color: 'inherit' }}
                >
                  <User size={16} />
                  <span style={{ fontSize: 12, fontWeight: 700 }}>My Account</span>
                </Link>

                <button
                  type="button"
                  className="menu-cart-pill-btn"
                  onClick={() => {
                    if (window.matchMedia('(max-width: 640px)').matches) { setCartSheetOpen(true); return; }
                    const el = document.getElementById('sticky-order-panel');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                  title="View Cart"
                >
                  <ShoppingBag size={18} />
                  <span className="cart-badge-count">{totalItems}</span>
                </button>

                <Link
                  to="/"
                  className="dine-in-close-btn"
                  title="Exit Dine-In Menu"
                  style={{ marginLeft: 6 }}
                >
                  <X size={18} />
                </Link>
              </div>
            </header>

            {/* Category Pills Strip with Icons */}
            <div className="menu-categories-strip">
              {categoryTabs.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  className={`menu-cat-pill ${category === cat.id ? 'active' : ''}`}
                  onClick={() => setCategory(cat.id)}
                >
                  <span className="cat-pill-icon">{cat.icon}</span>
                  <span className="cat-pill-label">{cat.label}</span>
                </button>
              ))}
            </div>

            {helpBar}

            {/* Pay Bill Option in Customer View when Order is Served */}
            {(() => {
              const liveItems = (liveOrder?.order_items || []) as any[];
              const itemsSubtotal = liveItems.reduce((acc: number, it: any) => acc + (Number(it.line_total) || (Number(it.unit_price) || 0) * (it.quantity || 1)), 0);
              const orderSubtotal = Number(liveOrder?.subtotal) > 0 ? Number(liveOrder.subtotal) : itemsSubtotal;
              const orderTax = Number(liveOrder?.tax) > 0 ? Number(liveOrder.tax) : Math.round(orderSubtotal * 0.05);
              const orderTotal = Number(liveOrder?.total) > 0 ? Number(liveOrder.total) : Number(liveOrder?.total_amount) > 0 ? Number(liveOrder.total_amount) : (orderSubtotal + orderTax);
              const isOrderPaid = (liveOrder?.payment_status === 'paid' || order?.payment_status === 'paid');
              const isServed = ['served', 'completed'].includes(((liveOrder?.status || order?.status || '') as string).toLowerCase());

              if (!isServed) return null;

              if (isOrderPaid) {
                return (
                  <div style={{ marginTop: 14, background: '#dcfce7', border: '1.5px solid #86efac', borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#15803d', fontWeight: 800 }}>
                    <CheckCircle2 size={22} />
                    <div>
                      <div style={{ fontSize: 15 }}>Bill Paid &amp; Settled (₹{orderTotal.toFixed(2)})</div>
                      <small style={{ fontWeight: 600, color: '#166534', display: 'block', marginTop: 2 }}>Thank you for dining with us at Servora!</small>
                    </div>
                  </div>
                );
              }

              const servedKey = `servora_served_time_${liveOrder?.id || order?.id}`;
              let localServedTime = Number(localStorage.getItem(servedKey) || 0);
              if (!localServedTime && isServed) {
                const rawTime = liveOrder?.served_at || liveOrder?.updated_at;
                localServedTime = rawTime ? new Date(rawTime).getTime() : Date.now();
                try { localStorage.setItem(servedKey, String(localServedTime)); } catch { }
              }
              const elapsedSec = isServed && localServedTime > 0 ? Math.floor((Date.now() - localServedTime) / 1000) : 0;
              const remainingSec = Math.max(0, 600 - elapsedSec);
              const mm = String(Math.floor(remainingSec / 60)).padStart(2, '0');
              const ss = String(remainingSec % 60).padStart(2, '0');
              const isTimerActive = isServed && remainingSec > 0;

              return (
                <div style={{ marginTop: 14, background: '#fffaf5', border: '1.5px solid #fbd9c4', borderRadius: 16, padding: 18, boxShadow: '0 4px 15px rgba(234, 88, 12, 0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <span style={{ fontSize: 11, color: '#8a6452', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Food Served &amp; Enjoyed</span>
                      <h4 style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 800, color: '#3b1e10' }}>Ready for Bill Payment</h4>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 11, color: '#8a6452', display: 'block' }}>Total Bill (incl. GST)</span>
                      <b style={{ fontSize: 22, color: '#ea580c', fontWeight: 900 }}>₹{orderTotal.toFixed(2)}</b>
                    </div>
                  </div>

                  {isTimerActive ? (
                    <>
                      <button
                        type="button"
                        disabled={true}
                        style={{
                          width: '100%',
                          padding: '14px 18px',
                          fontSize: 15,
                          fontWeight: 800,
                          borderRadius: 12,
                          background: '#f3e5d8',
                          color: '#8c6e58',
                          border: '1.5px solid #ebdcd0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 10,
                          cursor: 'not-allowed'
                        }}
                      >
                        <Clock size={18} /> Pay Bill (Available in {mm}:{ss})
                      </button>
                      <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: '#8a6452' }}>
                        Pay button activates in {mm}:{ss} (10 mins after served) so you can enjoy your dining uninterrupted.
                      </div>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowPayModal(true)}
                        style={{
                          width: '100%',
                          padding: '14px 18px',
                          fontSize: 15,
                          fontWeight: 800,
                          borderRadius: 12,
                          background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                          color: '#ffffff',
                          border: 'none',
                          boxShadow: '0 4px 14px rgba(234, 88, 12, 0.35)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 10,
                          cursor: 'pointer'
                        }}
                      >
                        <Wallet size={18} /> Pay Bill (₹{orderTotal.toFixed(2)})
                      </button>
                      <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: '#8a6452' }}>
                        Pay via UPI / QR, Card, or choose Cash at Counter.
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* Two-Column Grid: Left Menu Dishes & Right "Your Order" Sticky Panel */}
            <div className="menu-order-main-split">
              {/* Left Column: Food Items */}
              <div className="food-grid-column">
                <div className="food-section-head">
                  <span className="thumbs-icon" style={{ display: 'inline-flex', alignItems: 'center' }}><Sparkles size={18} style={{ color: '#ea580c' }} /></span>
                  <h3>{category === 'Recommended' ? 'Recommended For You' : `${category} Specials`}</h3>
                </div>

                {menuState === 'loading' && <div className="menu-state-box"><RefreshCw size={22} className="spin" /> Loading today's menu…</div>}
                {menuState === 'error' && (
                  <div className="menu-state-box error">
                    <AlertCircle size={22} /> {menuError || 'Could not load the menu.'}
                    <button type="button" className="outline-btn" onClick={loadMenu}>Try again</button>
                  </div>
                )}
                {menuState === 'ready' && displayedItems.length === 0 && (
                  <div className="menu-state-box">No dishes available{search ? ' for your search' : ' right now'}.</div>
                )}
                <div className="food-items-4col-grid">
                  {displayedItems.map(item => {
                    const qty = getItemQty(item.id);
                    return (
                      <div className="mockup-food-card" key={item.id}>
                        <div className="food-card-img-wrap">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.name} className="food-card-img" loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
                          ) : (
                            <div className="food-card-img food-card-img-empty"><Utensils size={30} /></div>
                          )}
                        </div>

                        <div className="food-card-content">
                          <div className="food-card-title-row">
                            <b className="food-card-name-en">{language === 'ta' && item.name_ta ? item.name_ta : item.name}</b>
                            <span className={`food-veg-dot-badge ${item.is_vegetarian ? '' : 'nonveg'}`} title={item.is_vegetarian ? 'Vegetarian' : 'Non-vegetarian'}>
                              <span className="veg-inner-dot" />
                            </span>
                          </div>
                          {language === 'en' && item.name_ta && (
                            <small className="food-card-name-ta">{item.name_ta}</small>
                          )}
                          {item.description && <p className="food-card-desc">{item.description}</p>}

                          <div className="food-card-foot">
                            <span className="food-card-price">₹{item.price}</span>

                            {qty > 0 ? (
                              <div className="card-qty-stepper">
                                <button
                                  type="button"
                                  className="stepper-btn minus"
                                  onClick={() => updateQuantity(item.id, -1)}
                                >
                                  <Minus size={14} />
                                </button>
                                <span className="stepper-num">{qty}</span>
                                <button
                                  type="button"
                                  className="stepper-btn plus"
                                  onClick={() => updateQuantity(item.id, 1)}
                                >
                                  <Plus size={14} />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="card-add-btn"
                                onClick={() => addToCart(item)}
                              >
                                + Add
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: "Your Order" Sticky Panel */}
              <aside className={`sticky-order-panel${cartSheetOpen ? ' sheet-open' : ''}`} id="sticky-order-panel">
                <span className="sheet-grab" aria-hidden="true" />
                <div className="order-panel-header">
                  <div className="order-panel-title">
                    <ShoppingBag size={20} className="panel-cart-icon" />
                    <h4>Your Order ({totalItems})</h4>
                  </div>
                  <button type="button" className="sheet-close-btn" aria-label="Close order" onClick={() => setCartSheetOpen(false)}>
                    <X size={18} />
                  </button>
                </div>

                {cart.length === 0 ? (
                  <div className="order-panel-empty">
                    <p>No dishes in cart yet.</p>
                    <small>Tap "+ Add" on any dish to begin your table order.</small>
                  </div>
                ) : (
                  <>
                    <div className="order-panel-lines">
                      {cart.map(line => (
                        <div className="order-cart-line" key={line.item.id}>
                          {line.item.image_url ? (
                            <img src={line.item.image_url} alt="" className="order-cart-thumb" loading="lazy" />
                          ) : (
                            <span className="order-cart-thumb order-cart-thumb-empty" aria-hidden="true"><Utensils size={18} /></span>
                          )}
                          <div className="order-cart-details">
                            <b className="cart-item-name">{line.item.name}</b>
                            <span className="cart-item-unit-price">₹{line.item.price}</span>
                          </div>

                          <div className="order-line-stepper">
                            <button
                              type="button"
                              className="cart-step-btn"
                              onClick={() => updateQuantity(line.item.id, -1)}
                            >
                              <Minus size={13} />
                            </button>
                            <span className="cart-step-num">{line.quantity}</span>
                            <button
                              type="button"
                              className="cart-step-btn"
                              onClick={() => updateQuantity(line.item.id, 1)}
                            >
                              <Plus size={13} />
                            </button>
                          </div>

                          <button
                            type="button"
                            className="cart-delete-btn"
                            onClick={() => removeFromCart(line.item.id)}
                            title="Remove item"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Trash2 size={15} style={{ color: '#dc2626' }} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="order-panel-bill">
                      <div className="bill-sub-line">
                        <span>Items Total</span>
                        <b>₹{itemsTotal}</b>
                      </div>
                      <div className="bill-sub-line">
                        <span>GST (5%)</span>
                        <b>₹{gstAmount}</b>
                      </div>
                      <div className="bill-divider" />
                      <div className="bill-grand-line">
                        <span>Total</span>
                        <strong className="grand-price">₹{grandTotal}</strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="order-panel-submit-btn"
                      onClick={() => submitOrder()}
                      disabled={busy || cart.length === 0}
                    >
                      <ChefHat size={20} className="submit-cloche" />
                      <span>{busy ? 'Placing Order…' : 'Place Order'}</span>
                      <ArrowRight size={20} className="submit-arrow" />
                    </button>
                  </>
                )}
              </aside>
              {cartSheetOpen && <div className="cart-sheet-backdrop" onClick={() => setCartSheetOpen(false)} />}
            </div>
            {totalItems > 0 && !cartSheetOpen && (
              <button type="button" className="mobile-cart-bar" onClick={() => setCartSheetOpen(true)}>
                <span className="mobile-cart-count"><ShoppingBag size={18} /> {totalItems} {totalItems === 1 ? 'item' : 'items'}</span>
                <span className="mobile-cart-total">View order <b>₹{grandTotal}</b> <ArrowRight size={16} /></span>
              </button>
            )}
          </div>
        </div>
      )}
      {/* POPUP PAYMENT MODAL (DOES NOT REDIRECT OR LINK AWAY) */}
      {showPayModal && order && (() => {
        const payModalItems = (liveOrder?.order_items || []) as any[];
        const payModalSubtotal = payModalItems.reduce((acc: number, it: any) => acc + (Number(it.line_total) || (Number(it.unit_price) || 0) * (it.quantity || 1)), 0);
        const subVal = Number(liveOrder?.subtotal) > 0 ? Number(liveOrder.subtotal) : payModalSubtotal;
        const taxVal = Number(liveOrder?.tax) > 0 ? Number(liveOrder.tax) : Math.round(subVal * 0.05);
        const totVal = Number(liveOrder?.total) > 0 ? Number(liveOrder.total) : Number(liveOrder?.total_amount) > 0 ? Number(liveOrder.total_amount) : (subVal + taxVal);

        return (
          <div
            className="modal-backdrop"
            onClick={() => setShowPayModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(28, 14, 8, 0.65)',
              backdropFilter: 'blur(5px)',
              zIndex: 99999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16
            }}
          >
            <div
              className="customer-pay-modal-card"
              onClick={e => e.stopPropagation()}
              style={{
                background: '#ffffff',
                borderRadius: 22,
                border: '1.5px solid #ebdcd0',
                padding: '24px 26px',
                maxWidth: 480,
                width: '100%',
                maxHeight: '92vh',
                overflowY: 'auto',
                boxShadow: '0 24px 50px rgba(0,0,0,0.3)'
              }}
            >
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ebdcd0', paddingBottom: 12, marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#3b1e10', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Wallet size={20} color="#ea580c" /> Complete Bill Payment
                  </h3>
                  <small style={{ color: '#8a6452', fontSize: 12 }}>
                    Order #SVR{order.order_number} · Table {tableDisplay}
                  </small>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  style={{
                    background: '#f5ebe1',
                    border: 'none',
                    borderRadius: '50%',
                    width: 32,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#5a3827'
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Bill Highlight Card */}
              <div style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', borderRadius: 16, border: '1.5px solid #fed7aa', padding: '16px 18px', textAlign: 'center', marginBottom: 18 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#9a3412', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Total Payable Amount
                </span>
                <div style={{ fontSize: 32, fontWeight: 900, color: '#ea580c', margin: '4px 0' }}>
                  ₹{totVal.toFixed(2)}
                </div>
                <div style={{ fontSize: 12, color: '#7c2d12', display: 'flex', justifyContent: 'center', gap: 12 }}>
                  <span>Subtotal: ₹{subVal.toFixed(2)}</span>
                  <span>•</span>
                  <span>GST (5%): ₹{taxVal.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Method Selector */}
              <span style={{ fontSize: 11, fontWeight: 800, color: '#7c5841', display: 'block', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Select Payment Method
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
                {[
                  { id: 'upi', label: 'UPI / QR', icon: <QrCode size={18} /> },
                  { id: 'card', label: 'Card', icon: <CreditCard size={18} /> },
                  { id: 'cash', label: 'Cash / Offline', icon: <Wallet size={18} /> }
                ].map(pm => (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setPayMethod(pm.id as any)}
                    style={{
                      padding: '12px 6px',
                      borderRadius: 12,
                      border: payMethod === pm.id ? '2px solid #ea580c' : '1.5px solid #ebdcd0',
                      background: payMethod === pm.id ? '#fffaf5' : '#ffffff',
                      color: payMethod === pm.id ? '#ea580c' : '#5a3827',
                      fontWeight: 800,
                      fontSize: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      boxShadow: payMethod === pm.id ? '0 4px 12px rgba(234,88,12,0.15)' : 'none'
                    }}
                  >
                    {pm.icon}
                    <span>{pm.label}</span>
                  </button>
                ))}
              </div>

              {/* Method Details Card */}
              {payMethod === 'upi' && (
                <div style={{ background: '#fdf9f4', border: '1px solid #ebd9c8', borderRadius: 14, padding: 16, textAlign: 'center', marginBottom: 20 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#3b1e10', display: 'block', marginBottom: 8 }}>
                    Scan with GPay / PhonePe / Paytm / BHIM
                  </span>
                  <div style={{ width: 140, height: 140, margin: '0 auto 10px', background: '#ffffff', padding: 8, borderRadius: 12, border: '1px solid #ebdcd0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=upi://pay?pa=servora.foods@icici&pn=ServoraRestaurant&am=${totVal.toFixed(2)}&cu=INR`}
                      alt="UPI Payment QR"
                      style={{ width: '100%', height: '100%', borderRadius: 8 }}
                    />
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#ffffff', border: '1px solid #ebdcd0', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, color: '#422116' }}>
                    <span>UPI ID: servora.foods@icici</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('servora.foods@icici');
                        alert('UPI ID copied!');
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ea580c', padding: 0 }}
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                </div>
              )}

              {payMethod === 'card' && (
                <div style={{ background: '#fdf9f4', border: '1px solid #ebdcd0', borderRadius: 14, padding: 16, marginBottom: 20 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#3b1e10', display: 'block', marginBottom: 10 }}>
                    Enter Card Details for Settlement
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input
                      type="text"
                      placeholder="Cardholder Name"
                      defaultValue={name || 'Valued Diner'}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ebdcd0', fontSize: 13 }}
                    />
                    <input
                      type="text"
                      placeholder="Card Number (•••• •••• •••• 4242)"
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ebdcd0', fontSize: 13 }}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <input type="text" placeholder="MM/YY" defaultValue="12/28" style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ebdcd0', fontSize: 13 }} />
                      <input type="password" placeholder="CVV" style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ebdcd0', fontSize: 13 }} />
                    </div>
                  </div>
                </div>
              )}

              {payMethod === 'cash' && (
                <div style={{ background: '#fdf9f4', border: '1px solid #ebdcd0', borderRadius: 14, padding: 16, marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ea580c', fontWeight: 800, fontSize: 13, marginBottom: 4 }}>
                    <Wallet size={16} /> Pay Offline at Counter / to Server
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: '#7c5841', lineHeight: 1.5 }}>
                    Please hand ₹{totVal.toFixed(2)} cash to your server or pay at the front reception counter. The restaurant manager will mark your bill as paid.
                  </p>
                </div>
              )}

              {/* Confirm Payment Action Button */}
              <button
                type="button"
                disabled={isPaying}
                onClick={async () => {
                  setIsPaying(true);
                  try {
                    if (supabase && order.id) {
                      if (payMethod === 'cash') {
                        const { error: payErr } = await supabase.from('orders').update({
                          payment_method: 'cash',
                          payment_status: 'unpaid'
                        }).eq('id', order.id);
                        if (payErr) throw payErr;
                        setLiveOrder((prev: any) => ({ ...prev, payment_method: 'cash' }));
                        notify(setNotice, `Cash payment confirmed. Your server will collect ₹${totVal.toFixed(2)} at Table ${tableDisplay} and settle the bill.`, 'success');
                      } else {
                        // A browser can never confirm a payment. Online gateway is not integrated yet.
                        notify(setNotice, 'Online payment is not enabled yet. Please pay at the counter or with your server; staff will mark the bill as paid.', 'info');
                      }
                    }
                    setShowPayModal(false);
                  } catch (err: any) {
                    notify(setNotice, err.message || 'Payment processing failed.', 'error');
                  } finally {
                    setIsPaying(false);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 12,
                  background: payMethod === 'cash' ? '#3b1e10' : '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 14px rgba(0,0,0,0.15)'
                }}
              >
                <CheckCircle2 size={18} />
                {isPaying ? 'Processing...' : payMethod === 'cash' ? `Confirm Cash at Counter (₹${totVal.toFixed(2)})` : `Confirm & Pay ₹${totVal.toFixed(2)}`}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Universal Cancellation Request Modal (Accessible from Step 2, Step 3 & Help Bar) */}
      {showCancelModal && (
        <div
          className="cancel-modal-backdrop"
          onClick={e => {
            if (e.target === e.currentTarget) setShowCancelModal(false);
          }}
        >
          <div className="cancel-modal-card">
            {/* Dedicated Top Right Close Button */}
            <button
              type="button"
              className="cancel-modal-close-btn"
              onClick={() => setShowCancelModal(false)}
              title="Close modal"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <XCircle size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#3b1e10' }}>Request Order Cancellation</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#8a6452' }}>
                  Order #{order?.order_number || liveOrder?.order_number || '---'} • Table {tableDisplay || order?.table_label || '---'}
                </p>
              </div>
            </div>

            <div style={{ background: '#fffaf5', border: '1px solid #fed7aa', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 12.5, color: '#9a3412', lineHeight: 1.5 }}>
              <AlertCircle size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} /><b>Approval Required:</b><br />
              Because dishes may already be queued or cooking in the kitchen, your cancellation request will be sent to the <b>Kitchen &amp; Billing Counter</b> for review and approval.
            </div>

            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#422116', marginBottom: 10 }}>
              Select a reason for cancellation:
            </label>
            <div className="cancel-reason-list">
              {[
                'Ordered by mistake / wrong dish',
                'Want to modify order items',
                'Preparation taking too long',
                'Need to leave urgently',
                'Other reason'
              ].map(r => (
                <label
                  key={r}
                  className={`cancel-reason-option ${cancelReason === r ? 'selected' : ''}`}
                  onClick={() => setCancelReason(r)}
                >
                  <input
                    type="radio"
                    name="cancelReason"
                    className="cancel-radio-input"
                    checked={cancelReason === r}
                    onChange={() => setCancelReason(r)}
                  />
                  <span className="cancel-reason-text">{r}</span>
                </label>
              ))}
            </div>

            {cancelReason === 'Other reason' && (
              <div style={{ marginBottom: 18 }}>
                <input
                  type="text"
                  placeholder="Please type your reason here..."
                  value={customCancelReason}
                  onChange={e => setCustomCancelReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: 10,
                    border: '1.5px solid #ebdcd0',
                    fontSize: 13.5,
                    boxSizing: 'border-box',
                    outline: 'none',
                    color: '#3b1e10'
                  }}
                  autoFocus
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                type="button"
                disabled={isSubmittingCancel}
                onClick={() => setShowCancelModal(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: 12,
                  border: '1.5px solid #ebdcd0',
                  background: '#ffffff',
                  color: '#422116',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 14,
                  transition: 'all 0.15s ease'
                }}
              >
                Keep Order
              </button>
              <button
                type="button"
                disabled={isSubmittingCancel}
                onClick={handleRequestCancellation}
                style={{
                  flex: 1.25,
                  padding: '12px',
                  borderRadius: 12,
                  border: 'none',
                  background: '#dc2626',
                  color: '#ffffff',
                  fontWeight: 800,
                  cursor: isSubmittingCancel ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.35)',
                  transition: 'all 0.15s ease'
                }}
              >
                {isSubmittingCancel ? 'Sending...' : 'Send Cancel Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// -------------------------------------------------------------
// ORDER TRACKING
// -------------------------------------------------------------
function OrderTracking({ order, setNotice }: { order: any; setNotice: (n: Notice | null) => void }) {
  const [fresh, setFresh] = useState<any>(order);

  useEffect(() => {
    if (!supabase || !order?.id || !order?.access_token) return;
    let alive = true;
    const refresh = async () => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc('get_order_public', {
        p_order_id: order.id,
        p_access_token: order.access_token
      });
      if (!error && alive && data) setFresh(data);
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [order?.id, order?.access_token]);

  return (
    <div className="tracking-card">
      <span className={`status-pill ${fresh.status}`}>{fresh.status?.replaceAll('_', ' ')}</span>
      <h3>Live Order Progress</h3>
      <p>Updates refresh automatically as kitchen stations prepare your food.</p>
      {(fresh.order_items || []).map((i: any) => (
        <div className="ticket-item" key={i.id}>
          <div>
            <b>
              {i.quantity} × {i.item_name}
            </b>
          </div>
          <span className={`status-pill ${i.status}`}>{i.status}</span>
        </div>
      ))}
      <div className="progress-steps">
        {['received', 'accepted', 'preparing', 'ready_for_collection', 'served'].map((s, i) => (
          <div
            className={
              ['received', 'accepted', 'preparing', 'ready_for_collection', 'served'].indexOf(fresh.status) >= i
                ? 'done'
                : ''
            }
            key={s}
          >
            <i />
            {s.replaceAll('_', ' ')}
          </div>
        ))}
      </div>

    </div>
  );
}

export default App;
