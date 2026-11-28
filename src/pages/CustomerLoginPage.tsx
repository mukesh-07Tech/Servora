import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Lock,
  Phone,
  ShieldCheck,
  Sparkles,
  Utensils,
  Smartphone,
  ChevronRight,
  AlertCircle,
  User
} from 'lucide-react';
import { requestCustomerOtp, verifyCustomerOtp, saveCustomerSession } from '../lib/data';

export function CustomerLoginPage({
  setNotice
}: {
  setNotice?: (n: any) => void;
}) {
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [otp, setOtp] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Ask the server for a verification code
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const res = await requestCustomerOtp(cleanPhone);
      setGeneratedOtp(res.test_otp || '');
      // Auto-fill the customer name if the server found a previous order with this phone
      if (res.name && !customerName.trim()) {
        setCustomerName(res.name);
      }
      setOtp('');
      setStep('otp');
      setNotice?.({
        text: res.test_otp ? `Test verification code: ${res.test_otp}` : `Verification code sent to +91 ${cleanPhone.slice(-10)}.`,
        kind: 'info'
      });
    } catch (err: any) {
      setError(err.message || 'Failed to send the verification code.');
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerateOtp = async () => {
    const cleanPhone = phone.replace(/\D/g, '');
    setError('');
    try {
      const res = await requestCustomerOtp(cleanPhone);
      setGeneratedOtp(res.test_otp || '');
      setOtp('');
      setNotice?.({ text: res.test_otp ? `New test verification code: ${res.test_otp}` : 'A new verification code has been sent.', kind: 'info' });
    } catch (err: any) {
      setError(err.message || 'Could not send a new code.');
    }
  };

  // The server checks the code and opens the session
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (otp.trim().length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    setBusy(true);
    try {
      const res = await verifyCustomerOtp(cleanPhone, otp.trim());
      if (!res.ok || !res.token) {
        setError(res.error || 'Invalid verification code.');
        return;
      }
      const finalName = customerName.trim() || res.name || 'Valued Diner';
      saveCustomerSession({ phone: cleanPhone, name: finalName, token: res.token });
      setNotice?.({ text: `Welcome, ${finalName}! Signed in successfully.`, kind: 'success' });
      nav('/customer-dashboard');
    } catch (err: any) {
      setError(err.message || 'Could not verify the code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="portal-login-screen"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #fdf8f4 0%, #f7ede4 50%, #fef5ee 100%)',
        position: 'relative',
        overflow: 'hidden',
        padding: '76px 16px 36px'
      }}
    >
      {/* Decorative Warm Cream & Gopuram Ambient Glows */}
      <div
        style={{
          position: 'absolute',
          top: '-10%',
          right: '-5%',
          width: '450px',
          height: '450px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(234, 88, 12, 0.12) 0%, rgba(234, 88, 12, 0) 70%)',
          pointerEvents: 'none'
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-10%',
          left: '-5%',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(194, 65, 12, 0.08) 0%, rgba(194, 65, 12, 0) 70%)',
          pointerEvents: 'none'
        }}
      />

      {/* Top back navigation */}
      <header style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 20 }}>
        <Link
          to="/order"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '24px',
            background: '#ffffff',
            border: '1.5px solid #ebd9c8',
            color: '#422116',
            fontSize: '13px',
            fontWeight: 700,
            textDecoration: 'none',
            boxShadow: '0 4px 14px rgba(66, 33, 22, 0.08)',
            transition: 'transform 0.15s ease'
          }}
        >
          <ArrowLeft size={16} color="#ea580c" />
          <span>Back to Dine-In Menu</span>
        </Link>
      </header>

      <div style={{ width: '100%', maxWidth: '440px', zIndex: 10 }}>
        <div
          className="customer-portal-login-card"
          style={{
            background: '#ffffff',
            borderRadius: '24px',
            border: '1.5px solid #fed7aa',
            boxShadow: '0 20px 50px rgba(66, 33, 22, 0.12), 0 4px 16px rgba(234, 88, 12, 0.08)',
            color: '#1c100a',
            boxSizing: 'border-box'
          }}
        >
          {/* Brand Logo Header */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '18px',
                background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(234, 88, 12, 0.35)',
                marginBottom: '14px'
              }}
            >
              <Smartphone size={32} color="#ffffff" />
            </div>

            <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: '#1c100a', letterSpacing: '-0.3px' }}>
              Customer Order &amp; Dining Portal
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#7c5841', lineHeight: 1.4 }}>
              Track live order progress, view past visits &amp; digital tax bills
            </p>
            <div
              style={{
                width: '40px',
                height: '3px',
                background: '#ea580c',
                borderRadius: '2px',
                margin: '12px auto 0'
              }}
            />
          </div>

          {error && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                color: '#b91c1c',
                fontSize: '13px',
                fontWeight: 600,
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {step === 'phone' ? (
            /* STEP 1: Enter Mobile Number */
            <form onSubmit={handleSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#422116', marginBottom: '6px' }}>
                  Mobile Number
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: '#fffaf5',
                    border: '1.5px solid #ebd9c8',
                    borderRadius: '14px',
                    padding: '0 14px',
                    overflow: 'hidden',
                    boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.03)'
                  }}
                >
                  <span style={{ color: '#ea580c', fontWeight: 800, fontSize: '14px', marginRight: '10px' }}>
                    +91
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="Enter 10-digit mobile number"
                    maxLength={14}
                    required
                    style={{
                      flex: 1,
                      padding: '14px 0',
                      background: 'none',
                      border: 'none',
                      color: '#1c100a',
                      fontSize: '15px',
                      fontWeight: 700,
                      outline: 'none'
                    }}
                    autoFocus
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                style={{
                  marginTop: '6px',
                  padding: '14px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '15px',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 16px rgba(234, 88, 12, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'transform 0.15s ease'
                }}
              >
                <span>{busy ? 'Sending OTP…' : 'Send Verification OTP'}</span>
              </button>

              <div style={{ textAlign: 'center', marginTop: '10px' }}>
                <Link to="/login" style={{ color: '#7c5841', fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}>
                  Looking for Restaurant Staff Login? <span style={{ color: '#ea580c', textDecoration: 'underline' }}>Click here</span>
                </Link>
              </div>
            </form>
          ) : (
            /* STEP 2: Enter OTP */
            <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '12px',
                  background: '#fff7ed',
                  border: '1px solid #fed7aa',
                  fontSize: '13px',
                  color: '#7c5841',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span>Sent to: <b style={{ color: '#1c100a' }}>+91 {phone.replace(/\D/g, '').slice(-10)}</b></span>
                <button
                  type="button"
                  onClick={() => setStep('phone')}
                  style={{ background: 'none', border: 'none', color: '#ea580c', cursor: 'pointer', fontWeight: 700, fontSize: '12px', textDecoration: 'underline' }}
                >
                  Change
                </button>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#422116', marginBottom: '6px' }}>
                  Your Name {customerName ? '(Registered Diner)' : ''}
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: '#fffaf5',
                    border: '1.5px solid #ebd9c8',
                    borderRadius: '14px',
                    padding: '0 14px'
                  }}
                >
                  <User size={18} color="#ea580c" style={{ marginRight: '10px' }} />
                  <input
                    type="text"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="Your name (optional)"
                    style={{
                      flex: 1,
                      padding: '13px 0',
                      background: 'none',
                      border: 'none',
                      color: '#1c100a',
                      fontSize: '15px',
                      fontWeight: 700,
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#422116', marginBottom: '6px' }}>
                  6-Digit Verification Code
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: '#fffaf5',
                    border: '1.5px solid #ebd9c8',
                    borderRadius: '14px',
                    padding: '0 14px'
                  }}
                >
                  <Lock size={18} color="#ea580c" style={{ marginRight: '10px' }} />
                  <input
                    type="text"
                    value={otp}
                    onChange={e => setOtp(e.target.value)}
                    placeholder="Enter 6-digit OTP"
                    maxLength={6}
                    required
                    style={{
                      flex: 1,
                      padding: '14px 0',
                      background: 'none',
                      border: 'none',
                      color: '#1c100a',
                      fontSize: '18px',
                      fontWeight: 800,
                      letterSpacing: '4px',
                      outline: 'none'
                    }}
                    autoFocus
                  />
                </div>

                {generatedOtp ? (
                <div
                  style={{
                    marginTop: '10px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: '#fff7ed',
                    border: '1.5px dashed #ea580c',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <Sparkles size={16} color="#ea580c" />
                    <span style={{ fontSize: '13px', color: '#7c5841', fontWeight: 600 }}>
                      Generated OTP:
                    </span>
                    <span
                      style={{
                        fontSize: '17px',
                        fontWeight: 900,
                        color: '#c2410c',
                        letterSpacing: '3px',
                        background: '#ffffff',
                        padding: '3px 10px',
                        borderRadius: '8px',
                        border: '1.5px solid #fed7aa',
                        boxShadow: '0 2px 6px rgba(234, 88, 12, 0.1)'
                      }}
                    >
                      {generatedOtp}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setOtp(generatedOtp)}
                      style={{
                        background: '#ea580c',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '5px 12px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(234, 88, 12, 0.25)'
                      }}
                    >
                      Auto-Fill
                    </button>
                    <button
                      type="button"
                      onClick={handleRegenerateOtp}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ea580c',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        textDecoration: 'underline'
                      }}
                      title="Generate a brand new OTP"
                    >
                      New OTP
                    </button>
                  </div>
                </div>
                ) : (
                  <p style={{ marginTop: '10px', fontSize: '13px', color: '#7c5841' }}>Enter the 6-digit code we sent to your mobile number.</p>
                )}
              </div>

              <button
                type="submit"
                style={{
                  marginTop: '8px',
                  padding: '14px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '15px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(234, 88, 12, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <CheckCircle2 size={18} />
                <span>Verify &amp; Open Order Dashboard</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
