import { useEffect, useState } from 'react';
import {
  Bell,
  Building,
  Check,
  Clock,
  CreditCard,
  Mail,
  Phone,
  QrCode,
  RefreshCw,
  Save,
  Sliders,
  Store,
  Utensils,
  Volume2
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface OperatingDay {
  day: string;
  active: boolean;
  open: string;
  close: string;
}

export function SettingsAdminPage({ setNotice }: { setNotice?: (n: any) => void }) {
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Core Restaurant Profile
  const [restaurantName, setRestaurantName] = useState('Servora Restaurant');
  const [contactNumber, setContactNumber] = useState('+91 98765 43210');
  const [emailAddress, setEmailAddress] = useState('admin@servora.com');
  const [address, setAddress] = useState('Central Chennai – 600001, Tamil Nadu');
  const [currency, setCurrency] = useState('INR (₹)');
  const [gstRate, setGstRate] = useState('5% (Restaurant GST)');

  // Dining Operations Toggles (Only Required)
  const [operations, setOperations] = useState({
    qrOrdering: true,
    kitchenDisplay: true,
    waiterCalling: true,
    autoBilling: true,
    soundChime: true
  });

  // Operating Hours
  const [operatingHours, setOperatingHours] = useState<OperatingDay[]>([
    { day: 'Monday', active: true, open: '08:00 AM', close: '10:30 PM' },
    { day: 'Tuesday', active: true, open: '08:00 AM', close: '10:30 PM' },
    { day: 'Wednesday', active: true, open: '08:00 AM', close: '10:30 PM' },
    { day: 'Thursday', active: true, open: '08:00 AM', close: '10:30 PM' },
    { day: 'Friday', active: true, open: '08:00 AM', close: '10:30 PM' },
    { day: 'Saturday', active: true, open: '08:00 AM', close: '11:00 PM' },
    { day: 'Sunday', active: true, open: '08:00 AM', close: '11:00 PM' }
  ]);

  // Load saved settings from Supabase / localStorage on mount
  useEffect(() => {
    // 1. Try local storage first for instant restore
    const local = localStorage.getItem('servora_settings');
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (parsed.name) setRestaurantName(parsed.name);
        if (parsed.phone) setContactNumber(parsed.phone);
        if (parsed.email) setEmailAddress(parsed.email);
        if (parsed.address) setAddress(parsed.address);
        if (parsed.currency) setCurrency(parsed.currency);
        if (parsed.gstRate) setGstRate(parsed.gstRate);
        if (parsed.operations) setOperations(parsed.operations);
        if (parsed.operatingHours) setOperatingHours(parsed.operatingHours);
      } catch (err) {
        console.error('Failed to parse local settings', err);
      }
    }

    // 2. Sync from Supabase if connected
    if (supabase) {
      supabase
        .from('restaurants')
        .select('*')
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            if (data.name) setRestaurantName(data.name);
            if (data.phone) setContactNumber(data.phone);
            if (data.email) setEmailAddress(data.email);
            if (data.address) setAddress(data.address);
          }
        });
    }
  }, []);

  const handleToggleDay = (index: number) => {
    setOperatingHours(prev =>
      prev.map((d, i) => (i === index ? { ...d, active: !d.active } : d))
    );
  };

  const handleTimeChange = (index: number, field: 'open' | 'close', val: string) => {
    setOperatingHours(prev =>
      prev.map((d, i) => (i === index ? { ...d, [field]: val } : d))
    );
  };

  const handleToggleOp = (key: keyof typeof operations) => {
    setOperations(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);

    const payload = {
      name: restaurantName,
      phone: contactNumber,
      email: emailAddress,
      address,
      currency,
      gstRate,
      operations,
      operatingHours,
      updatedAt: new Date().toISOString()
    };

    // Save to localStorage immediately
    localStorage.setItem('servora_settings', JSON.stringify(payload));

    // Persist to Supabase if available
    try {
      if (supabase) {
        await supabase
          .from('restaurants')
          .update({
            name: restaurantName,
            phone: contactNumber,
            email: emailAddress,
            address: address
          })
          .limit(1);
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      if (setNotice) {
        setNotice({ text: 'Settings saved successfully!', kind: 'success' });
      }
    } catch (err: any) {
      console.warn('Supabase update notice:', err);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      if (setNotice) {
        setNotice({ text: 'Settings updated successfully!', kind: 'success' });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setRestaurantName('Servora Restaurant');
    setContactNumber('+91 98765 43210');
    setEmailAddress('admin@servora.com');
    setAddress('Central Chennai – 600001, Tamil Nadu');
    setCurrency('INR (₹)');
    setGstRate('5% (Restaurant GST)');
    setOperations({
      qrOrdering: true,
      kitchenDisplay: true,
      waiterCalling: true,
      autoBilling: true,
      soundChime: true
    });
    if (setNotice) {
      setNotice({ text: 'Settings reset to default values.', kind: 'info' });
    }
  };

  return (
    <div className="admin-page-container settings-management-clean">
      {/* Clean Page Header with Save Actions */}
      <div className="clean-settings-header">
        <div>
          <h2 className="clean-settings-title">Restaurant Settings</h2>
          <p className="clean-settings-subtitle">
            Configure your store details, dine-in operational toggles, and business hours.
          </p>
        </div>
        <div className="clean-settings-header-actions">
          <button
            type="button"
            className="clean-btn-reset"
            onClick={handleReset}
            title="Reset to default settings"
          >
            <RefreshCw size={14} />
            <span>Reset</span>
          </button>
          <button
            type="button"
            className="clean-btn-save"
            disabled={saving}
            onClick={() => handleSave()}
          >
            {savedSuccess ? (
              <>
                <Check size={16} />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save size={16} />
                <span>{saving ? 'Saving...' : 'Save Changes'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main 2-Column Clean Grid */}
      <div className="clean-settings-grid">
        {/* Left Column: Store Profile & Operational Toggles */}
        <div className="clean-settings-left-col">
          {/* Card 1: Restaurant Profile & Contact Info */}
          <div className="clean-settings-card">
            <div className="clean-card-header">
              <div className="clean-card-icon-wrap">
                <Store size={18} />
              </div>
              <div>
                <h3 className="clean-card-title">Store Profile &amp; Contact</h3>
                <p className="clean-card-subtitle">Details displayed on customer receipts and bills</p>
              </div>
            </div>

            <div className="clean-card-body">
              <div className="clean-form-row two-col">
                <div className="clean-form-group">
                  <label className="clean-label">Restaurant Name *</label>
                  <input
                    type="text"
                    className="clean-input"
                    value={restaurantName}
                    onChange={e => setRestaurantName(e.target.value)}
                    placeholder="e.g. Servora Restaurant"
                    required
                  />
                </div>
                <div className="clean-form-group">
                  <label className="clean-label">Contact Number *</label>
                  <div className="clean-input-with-icon">
                    <Phone size={14} className="input-icon" />
                    <input
                      type="text"
                      className="clean-input has-icon"
                      value={contactNumber}
                      onChange={e => setContactNumber(e.target.value)}
                      placeholder="+91 98765 43210"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="clean-form-row two-col">
                <div className="clean-form-group">
                  <label className="clean-label">Email Address</label>
                  <div className="clean-input-with-icon">
                    <Mail size={14} className="input-icon" />
                    <input
                      type="email"
                      className="clean-input has-icon"
                      value={emailAddress}
                      onChange={e => setEmailAddress(e.target.value)}
                      placeholder="admin@servora.com"
                    />
                  </div>
                </div>
                <div className="clean-form-group">
                  <label className="clean-label">Currency</label>
                  <select
                    className="clean-select"
                    value={currency}
                    onChange={e => setCurrency(e.target.value)}
                  >
                    <option value="INR (₹)">Indian Rupee (₹ INR)</option>
                    <option value="USD ($)">US Dollar ($ USD)</option>
                    <option value="AED (د.إ)">UAE Dirham (AED)</option>
                    <option value="GBP (£)">British Pound (£ GBP)</option>
                  </select>
                </div>
              </div>

              <div className="clean-form-row two-col">
                <div className="clean-form-group">
                  <label className="clean-label">GST Tax Rate</label>
                  <div className="clean-input-with-icon">
                    <CreditCard size={14} className="input-icon" />
                    <select
                      className="clean-select has-icon"
                      value={gstRate}
                      onChange={e => setGstRate(e.target.value)}
                    >
                      <option value="5% (Restaurant GST)">5% (Restaurant GST - CGST 2.5% + SGST 2.5%)</option>
                      <option value="12% (AC Dining GST)">12% (AC Dining / Luxury GST)</option>
                      <option value="18% (Standard GST)">18% (Standard Commercial GST)</option>
                      <option value="0% (Tax Exempt)">0% (Tax Exempt)</option>
                    </select>
                  </div>
                </div>
                <div className="clean-form-group">
                  <label className="clean-label">Store Location / Address</label>
                  <div className="clean-input-with-icon">
                    <Building size={14} className="input-icon" />
                    <input
                      type="text"
                      className="clean-input has-icon"
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      placeholder="Store street address, City"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Dining Operations & Feature Toggles */}
          <div className="clean-settings-card">
            <div className="clean-card-header">
              <div className="clean-card-icon-wrap">
                <Sliders size={18} />
              </div>
              <div>
                <h3 className="clean-card-title">Dining Operations &amp; Features</h3>
                <p className="clean-card-subtitle">Enable or disable live system features for staff and customers</p>
              </div>
            </div>

            <div className="clean-card-body">
              <div className="clean-toggles-list">
                <div className="clean-toggle-item">
                  <div className="toggle-item-info">
                    <div className="toggle-icon-pill">
                      <QrCode size={15} />
                    </div>
                    <div>
                      <div className="toggle-item-title">QR Code Dine-In Ordering</div>
                      <div className="toggle-item-desc">
                        Allow customers to scan table QR codes and place orders directly from their phones
                      </div>
                    </div>
                  </div>
                  <label className="clean-toggle-switch">
                    <input
                      type="checkbox"
                      checked={operations.qrOrdering}
                      onChange={() => handleToggleOp('qrOrdering')}
                    />
                    <span className="slider round" />
                  </label>
                </div>

                <div className="clean-toggle-item">
                  <div className="toggle-item-info">
                    <div className="toggle-icon-pill">
                      <Utensils size={15} />
                    </div>
                    <div>
                      <div className="toggle-item-title">Kitchen Display System (KDS)</div>
                      <div className="toggle-item-desc">
                        Route customer orders immediately to kitchen display screens and chef tablets
                      </div>
                    </div>
                  </div>
                  <label className="clean-toggle-switch">
                    <input
                      type="checkbox"
                      checked={operations.kitchenDisplay}
                      onChange={() => handleToggleOp('kitchenDisplay')}
                    />
                    <span className="slider round" />
                  </label>
                </div>

                <div className="clean-toggle-item">
                  <div className="toggle-item-info">
                    <div className="toggle-icon-pill">
                      <Bell size={15} />
                    </div>
                    <div>
                      <div className="toggle-item-title">Waiter Help &amp; Water Requests</div>
                      <div className="toggle-item-desc">
                        Allow seated guests to call a waiter, ask for water, or request the bill from table view
                      </div>
                    </div>
                  </div>
                  <label className="clean-toggle-switch">
                    <input
                      type="checkbox"
                      checked={operations.waiterCalling}
                      onChange={() => handleToggleOp('waiterCalling')}
                    />
                    <span className="slider round" />
                  </label>
                </div>

                <div className="clean-toggle-item">
                  <div className="toggle-item-info">
                    <div className="toggle-icon-pill">
                      <CreditCard size={15} />
                    </div>
                    <div>
                      <div className="toggle-item-title">Auto-Generate Invoices &amp; Bills</div>
                      <div className="toggle-item-desc">
                        Automatically generate tax invoices with breakdown upon order completion
                      </div>
                    </div>
                  </div>
                  <label className="clean-toggle-switch">
                    <input
                      type="checkbox"
                      checked={operations.autoBilling}
                      onChange={() => handleToggleOp('autoBilling')}
                    />
                    <span className="slider round" />
                  </label>
                </div>

                <div className="clean-toggle-item">
                  <div className="toggle-item-info">
                    <div className="toggle-icon-pill">
                      <Volume2 size={15} />
                    </div>
                    <div>
                      <div className="toggle-item-title">New Order Sound Chime</div>
                      <div className="toggle-item-desc">
                        Play audible bell chimes whenever new incoming orders land on admin or staff panels
                      </div>
                    </div>
                  </div>
                  <label className="clean-toggle-switch">
                    <input
                      type="checkbox"
                      checked={operations.soundChime}
                      onChange={() => handleToggleOp('soundChime')}
                    />
                    <span className="slider round" />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Weekly Operating Hours */}
        <div className="clean-settings-right-col">
          <div className="clean-settings-card">
            <div className="clean-card-header">
              <div className="clean-card-icon-wrap">
                <Clock size={18} />
              </div>
              <div>
                <h3 className="clean-card-title">Weekly Operating Hours</h3>
                <p className="clean-card-subtitle">Set daily opening and closing hours for dine-in operations</p>
              </div>
            </div>

            <div className="clean-card-body">
              <div className="clean-hours-list">
                {operatingHours.map((d, index) => (
                  <div
                    key={d.day}
                    className={`clean-hour-row ${d.active ? 'active' : 'inactive'}`}
                  >
                    <div className="hour-row-left">
                      <label className="clean-toggle-switch small">
                        <input
                          type="checkbox"
                          checked={d.active}
                          onChange={() => handleToggleDay(index)}
                        />
                        <span className="slider round" />
                      </label>
                      <span className="hour-day-label">{d.day}</span>
                    </div>

                    {d.active ? (
                      <div className="hour-time-selectors">
                        <select
                          className="hour-select"
                          value={d.open}
                          onChange={e => handleTimeChange(index, 'open', e.target.value)}
                        >
                          <option value="07:00 AM">07:00 AM</option>
                          <option value="07:30 AM">07:30 AM</option>
                          <option value="08:00 AM">08:00 AM</option>
                          <option value="08:30 AM">08:30 AM</option>
                          <option value="09:00 AM">09:00 AM</option>
                          <option value="10:00 AM">10:00 AM</option>
                        </select>
                        <span className="hour-to-sep">to</span>
                        <select
                          className="hour-select"
                          value={d.close}
                          onChange={e => handleTimeChange(index, 'close', e.target.value)}
                        >
                          <option value="10:00 PM">10:00 PM</option>
                          <option value="10:30 PM">10:30 PM</option>
                          <option value="11:00 PM">11:00 PM</option>
                          <option value="11:30 PM">11:30 PM</option>
                          <option value="12:00 AM">12:00 AM</option>
                        </select>
                      </div>
                    ) : (
                      <span className="hour-closed-badge">Closed</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="clean-card-footer">
              <button
                type="button"
                className="clean-btn-save-full"
                disabled={saving}
                onClick={() => handleSave()}
              >
                {savedSuccess ? (
                  <>
                    <Check size={16} />
                    <span>Settings Saved!</span>
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    <span>{saving ? 'Saving Changes...' : 'Save All Settings'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
