import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Award,
  Bell,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  ClipboardList,
  Clock,
  Copy,
  CreditCard,
  Download,
  Droplets,
  Heart,
  History,
  Layers,
  LogOut,
  Menu as MenuIcon,
  PhoneCall,
  QrCode,
  Receipt,
  RefreshCw,
  Search,
  Sparkles,
  User,
  Users,
  Utensils,
  Wallet,
  X,
  XCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getMyOrders, getMyOrderToken, rememberMyOrder, getCached, getOrderCancellationStatus, submitOrderCancellationRequest, lookupMenuItemPrice, updateOrderPaymentStatus } from '../lib/data';

export function CustomerDashboardPage({
  setNotice
}: {
  setNotice?: (n: any) => void;
}) {
  const nav = useNavigate();

  // Read stored customer session & active order data from localStorage
  const rawSession = localStorage.getItem('servora_customer_session');
  let parsedSession: any = null;
  try {
    parsedSession = rawSession ? JSON.parse(rawSession) : null;
  } catch {
    parsedSession = null;
  }
  const isVerified = Boolean(parsedSession?.verifiedAt && parsedSession?.phone);

  useEffect(() => {
    if (!isVerified) {
      nav('/customer-login', { replace: true });
    }
  }, [isVerified, nav]);

  const storedPhone = localStorage.getItem('servora_order_phone') || localStorage.getItem('servora_customer_phone') || '';
  const storedName = localStorage.getItem('servora_customer_name') || '';
  const storedOrderId = localStorage.getItem('servora_active_order_id') || '';

  const customerPhone = parsedSession?.phone || storedPhone || '';
  const customerName = parsedSession?.name || storedName || 'Valued Diner';

  const [activeTab, setActiveTab] = useState<'tracker' | 'orders' | 'bills' | 'loyalty'>('tracker');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Live order state - dynamic from database
  const [activeOrder, setActiveOrder] = useState<any | null>(null);
  const [activeOrderItems, setActiveOrderItems] = useState<any[]>([]);
  const [activeOrdersList, setActiveOrdersList] = useState<any[]>([]);
  // Explicit user-pinned order key (set ONLY when diner clicks an order button or card)
  const [userPinnedOrderKey, setUserPinnedOrderKey] = useState<string | null>(() => {
    return localStorage.getItem('servora_selected_order_id') || null;
  });
  const userPinnedOrderKeyRef = useRef<string | null>(localStorage.getItem('servora_selected_order_id') || null);

  // Historical data
  const [pastOrders, setPastOrders] = useState<any[]>([]);
  const [pastBills, setPastBills] = useState<any[]>([]);
  const [receiptModalOrder, setReceiptModalOrder] = useState<any | null>(null);

  // Customer Inline Pay Modal state
  const [showPayModal, setShowPayModal] = useState(false);
  const [payMethod, setPayMethod] = useState<'upi' | 'card' | 'cash'>('upi');
  const [isPaying, setIsPaying] = useState(false);
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const [isMergedPay, setIsMergedPay] = useState(false);
  const [, setNowTick] = useState<number>(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Request help busy state
  const [helpBusy, setHelpBusy] = useState<string | null>(null);

  // Cancellation states
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('Ordered by mistake / wrong dish');
  const [customCancelReason, setCustomCancelReason] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [cancellationRequested, setCancellationRequested] = useState(false);
  const [cancellationRejected, setCancellationRejected] = useState(false);

  // Helper to check if an order is paid
  const isOrderSettledPaid = (o: any) => {
    if (!o) return false;
    return o.payment_status === 'paid' || o.status === 'completed';
  };

  // 1. Load customer data from Supabase
  const loadCustomerData = async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      const userTargetKey = userPinnedOrderKeyRef.current || userPinnedOrderKey || localStorage.getItem('servora_selected_order_id');
      const storedActiveOrderId = localStorage.getItem('servora_active_order_id');
      const storedNum = localStorage.getItem('servora_active_order_num');
      const storedTable = localStorage.getItem('servora_active_order_table');
      const phoneDigits = customerPhone.replace(/\D/g, '').slice(-10);

      let foundOrder: any = null;
      let orderList: any[] = [];

      // 1. Load every order placed from this browser. Each order carries its own access token,
      //    so the server only returns orders this diner is entitled to see.
      let directStoredOrder: any = null;
      if (storedActiveOrderId && localStorage.getItem('servora_active_order_token')) {
        rememberMyOrder({
          id: storedActiveOrderId,
          token: localStorage.getItem('servora_active_order_token') || '',
          number: storedNum || undefined,
          table: storedTable || undefined
        });
      }
      const myOrders = await getMyOrders();
      for (const sOrder of myOrders) {
        if (!orderList.some(o => o.id === sOrder.id)) orderList.push(sOrder);
      }
      if (storedActiveOrderId) directStoredOrder = orderList.find(o => o.id === storedActiveOrderId) || null;
      void phoneDigits;

      // Always retain currently viewed activeOrder if present in state
      if (activeOrder && !orderList.some(o => o.id === activeOrder.id)) {
        orderList.push(activeOrder);
      }

      // ALWAYS sort orderList consistently by created_at descending, then order_number descending
      orderList.sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (timeB !== timeA) return timeB - timeA;
        return Number(b.order_number || 0) - Number(a.order_number || 0);
      });

      // All past orders history (including paid and completed)
      setPastOrders(orderList);

      // Active / Ongoing orders: MUST NOT be paid, MUST NOT be cancelled, and MUST NOT be completed
      const activeUnpaidOrders = orderList.filter(o => {
        const isPaid = isOrderSettledPaid(o);
        const st = String(o.status || '').toLowerCase();
        return !isPaid && st !== 'cancelled' && st !== 'completed';
      });

      // Sort activeUnpaidOrders stably
      activeUnpaidOrders.sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (timeB !== timeA) return timeB - timeA;
        return Number(b.order_number || 0) - Number(a.order_number || 0);
      });

      setActiveOrdersList(activeUnpaidOrders);

      // Select which active order to show in detail
      if (activeUnpaidOrders.length > 0) {
        // Priority 1: User explicitly pinned/selected order
        const userTarget = userPinnedOrderKeyRef.current || localStorage.getItem('servora_selected_order_id');
        let matchedOrder: any = null;

        if (userTarget) {
          const targetStr = String(userTarget).trim().toLowerCase();
          matchedOrder = activeUnpaidOrders.find(o => 
            (o.id && String(o.id).toLowerCase() === targetStr) ||
            (o.order_number && (
              String(o.order_number) === targetStr ||
              `svr${o.order_number}`.toLowerCase() === targetStr ||
              `#svr${o.order_number}`.toLowerCase() === targetStr
            ))
          );
        }

        // Priority 2: Keep currently active order if it is still in activeUnpaidOrders
        if (!matchedOrder && activeOrder) {
          matchedOrder = activeUnpaidOrders.find(o => o.id === activeOrder.id);
        }

        let chosen: any = null;
        if (matchedOrder) {
          chosen = matchedOrder;
        } else if (userTarget && activeOrder && !isOrderSettledPaid(activeOrder) && activeOrder.status !== 'completed' && activeOrder.status !== 'cancelled') {
          // Keep current active order in place rather than jumping to newest order!
          chosen = activeOrder;
        } else {
          // Only if no user pinned order or if pinned order is settled, fall back to first unpaid order
          chosen = activeUnpaidOrders[0];
        }

        // If user explicitly pinned an order, KEEP THAT PIN LOCKED!
        if (matchedOrder && userTarget) {
          const chosenKey = String(matchedOrder.order_number || matchedOrder.id || '');
          userPinnedOrderKeyRef.current = chosenKey;
          setUserPinnedOrderKey(chosenKey);
          try {
            localStorage.setItem('servora_selected_order_id', chosenKey);
            localStorage.setItem('servora_active_order_id', String(matchedOrder.id));
            if (matchedOrder.order_number) localStorage.setItem('servora_active_order_num', String(matchedOrder.order_number));
            if (matchedOrder.table_label) localStorage.setItem('servora_active_order_table', String(matchedOrder.table_label));
          } catch { }
        } else if (!userTarget) {
          // If no user target was ever pinned, we display chosen (first active) without locking a pin
          try {
            localStorage.setItem('servora_active_order_id', String(chosen.id));
            if (chosen.order_number) localStorage.setItem('servora_active_order_num', String(chosen.order_number));
          } catch { }
        }

        foundOrder = chosen;
        setActiveOrder(chosen);
        setActiveOrderItems(chosen.order_items || chosen.items || []);
      } else {
        // Only clear user pin if the pinned order has actually been paid or completed or cancelled in orderList
        const currentTarget = userPinnedOrderKeyRef.current || localStorage.getItem('servora_selected_order_id');
        const targetStr = currentTarget ? String(currentTarget).trim().toLowerCase() : '';
        const orderInHistory = targetStr ? orderList.find(o => 
          (o.id && String(o.id).toLowerCase() === targetStr) ||
          (o.order_number && (String(o.order_number) === targetStr || `svr${o.order_number}`.toLowerCase() === targetStr || `#svr${o.order_number}`.toLowerCase() === targetStr))
        ) : null;

        if (!currentTarget || (orderInHistory && (isOrderSettledPaid(orderInHistory) || orderInHistory.status === 'completed' || orderInHistory.status === 'cancelled'))) {
          userPinnedOrderKeyRef.current = null;
          setUserPinnedOrderKey(null);
          try { localStorage.removeItem('servora_selected_order_id'); } catch { }
          setActiveOrder(null);
          setActiveOrderItems([]);
        }
      }

      if (foundOrder) {
        if (foundOrder.status === 'cancelled') {
          setCancellationRequested(false);
        } else {
          const cancelState = await getOrderCancellationStatus(foundOrder.id, getMyOrderToken(foundOrder.id));
          if (cancelState.status === 'pending') {
            setCancellationRequested(true);
            setCancellationRejected(false);
          } else if (cancelState.status === 'rejected') {
            setCancellationRequested(false);
            if (foundOrder.status !== 'cancelled') setCancellationRejected(true);
          } else if (cancelState.status === 'none') {
            setCancellationRequested(false);
          }
        }
      }

      // Fetch bills matching customer orders
      const orderIds = orderList.map(o => o.id);
      if (orderIds.length > 0) {
        const { data: billsData } = await supabase
          .from('bills')
          .select('*')
          .in('order_id', orderIds)
          .order('created_at', { ascending: false });

        if (billsData) {
          setPastBills(billsData);
        }
      } else {
        setPastBills([]);
      }
    } catch (err) {
      console.error('Customer dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomerData();
    const pollInterval = setInterval(() => {
      loadCustomerData();
    }, 3500);

    // Supabase Realtime Subscription for live order updates
    if (!supabase) return () => clearInterval(pollInterval);
    const channel = supabase
      .channel('customer-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadCustomerData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        loadCustomerData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests' }, () => {
        loadCustomerData();
      })
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      if (supabase) supabase.removeChannel(channel);
    };
  }, [customerPhone]);

  // Request Service assistance (Call waiter, Water, Extra plates, Bill)
  const handleRequestService = async (type: string, label: string) => {
    if (!supabase || !activeOrder) return;
    setHelpBusy(type);

    try {
      const restRes = await supabase.from('restaurants').select('id').limit(1).maybeSingle();
      const restaurantId = restRes.data?.id || 'a0000000-0000-0000-0000-000000000001';

      const typeMap: Record<string, string> = {
        call_waiter: 'call_waiter',
        water: 'water',
        plates: 'plates',
        bill: 'bill'
      };

      const { error } = await supabase.from('service_requests').insert({
        restaurant_id: restaurantId,
        table_label: activeOrder.table_label || 'T01',
        request_type: typeMap[type] || 'call_waiter',
        status: 'new',
        note: `Guest ${customerName} requested ${label} for Table ${activeOrder.table_label || 'T01'}`
      });

      if (error) throw error;
      if (setNotice) {
        setNotice({
          text: `Request for "${label}" sent to your floor waiter. They will attend to Table ${activeOrder.table_label || 'T01'} shortly!`,
          kind: 'success'
        });
      }
    } catch (e: any) {
      if (setNotice) setNotice({ text: e.message || 'Could not send request.', kind: 'error' });
    } finally {
      setHelpBusy(null);
    }
  };

  const handleRequestCancellation = async () => {
    if (!activeOrder?.id || isSubmittingCancel) return;
    const reasonToUse = cancelReason === 'Other reason' ? (customCancelReason.trim() || 'Customer requested cancellation') : cancelReason;
    setIsSubmittingCancel(true);
    try {
      await submitOrderCancellationRequest({
        orderId: activeOrder.id,
        accessToken: getMyOrderToken(activeOrder.id),
        reason: reasonToUse
      });
      setCancellationRequested(true);
      setCancellationRejected(false);
      setShowCancelModal(false);
      if (setNotice) setNotice({ text: 'Cancellation request sent to Kitchen & Billing Counter for review.', kind: 'success' });
    } catch (err: any) {
      if (setNotice) setNotice({ text: err.message || 'Could not send cancellation request.', kind: 'error' });
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('servora_customer_session');
    localStorage.removeItem('servora_customer_phone');
    localStorage.removeItem('servora_customer_name');
    localStorage.removeItem('servora_active_order_id');
    localStorage.removeItem('servora_active_order_token');
    localStorage.removeItem('servora_active_order_num');
    localStorage.removeItem('servora_active_order_table');
    if (setNotice) setNotice({ text: 'You have signed out of your customer account.', kind: 'info' });
    window.location.href = '/customer-login';
  };

  // Helper to resolve dish item status badge
  const getItemStatusBadge = (itemStatus?: string, orderStatus?: string) => {
    const oSt = (orderStatus || '').toLowerCase();
    const iSt = (itemStatus || '').toLowerCase();

    if (['served', 'completed'].includes(oSt) || ['served', 'completed'].includes(iSt)) {
      return { label: 'Served at Table', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' };
    }
    if (['ready', 'ready_for_serving', 'ready_for_collection'].includes(oSt) || ['ready', 'ready_for_serving'].includes(iSt)) {
      return { label: 'Ready to Serve', color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' };
    }
    if (['preparing', 'cooking', 'accepted', 'in_kitchen'].includes(oSt) || ['preparing', 'cooking'].includes(iSt)) {
      return { label: 'Preparing', color: '#b45309', bg: '#fffbeb', border: '#fde68a' };
    }
    return { label: 'Order Received', color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' };
  };

  // Determine stage milestone (0: Placed, 1: Kitchen, 2: Ready, 3: Served)
  const st = (activeOrder?.status || 'received').toLowerCase();
  const currentStage = ['served', 'completed'].includes(st)
    ? 3
    : ['ready_for_serving', 'ready_for_collection', 'ready'].includes(st)
      ? 2
      : ['preparing', 'accepted', 'in_preparation', 'cooking'].includes(st)
        ? 1
        : 0;

  const milestones = [
    { title: 'Order Received', desc: 'Sent to Kitchen', icon: <Check size={16} /> },
    { title: 'In Kitchen', desc: 'Chefs are Cooking', icon: <ChefHat size={16} /> },
    { title: 'Ready for Service', desc: 'Dishes Plated', icon: <Bell size={16} /> },
    { title: 'Served at Table', desc: 'Enjoy your meal!', icon: <Utensils size={16} /> }
  ];

  if (!isVerified) {
    return null;
  }

  return (
    <div className="workspace admin-workspace-screen" style={{ minHeight: '100vh', background: '#faf5f0' }}>
      {/* 1. Deep Dark Chocolate Sidebar matching Admin Theme — hidden by default on mobile */}
      <aside className={`sidebar dark-chocolate-sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="side-brand-header">
          <Link to="/" onClick={() => setMobileOpen(false)}>
            <img src="/servora-logo.jpg" alt="SERVORA" className="sidebar-brand-logo" />
          </Link>
          <button
            type="button"
            className="sidebar-mobile-close-btn"
            onClick={() => setMobileOpen(false)}
            title="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '0 16px 12px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ fontSize: '11px', color: '#ea580c', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Customer Portal
          </div>
          <div style={{ fontSize: '15px', color: '#ffffff', fontWeight: 800, marginTop: '2px' }}>
            {customerName}
          </div>
          <div style={{ fontSize: '12px', color: '#fed7aa' }}>
            +91 {customerPhone.slice(-10)}
          </div>
        </div>

        <nav className="sidebar-main-nav">
          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'tracker' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('tracker');
              setMobileOpen(false);
            }}
          >
            <Activity size={18} className="nav-item-icon" />
            <span className="nav-item-text">
              Live Order Tracker {activeOrdersList.length > 0 ? `(${activeOrdersList.length})` : ''}
            </span>
            {activeOrdersList.length > 0 && (
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e', marginLeft: 'auto' }} />
            )}
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('orders');
              setMobileOpen(false);
            }}
          >
            <ClipboardList size={18} className="nav-item-icon" />
            <span className="nav-item-text">Past Orders ({pastOrders.length})</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'bills' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('bills');
              setMobileOpen(false);
            }}
          >
            <Receipt size={18} className="nav-item-icon" />
            <span className="nav-item-text">Visits &amp; Bills</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'loyalty' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('loyalty');
              setMobileOpen(false);
            }}
          >
            <Award size={18} className="nav-item-icon" />
            <span className="nav-item-text">Loyalty &amp; Rewards</span>
          </button>
        </nav>

        {/* Sidebar Footer with Sign Out */}
        <div style={{ marginTop: 'auto', padding: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fed7aa',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Dimming Backdrop Overlay */}
      {mobileOpen && (
        <div
          className="sidebar-mobile-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      {/* 2. Main Work Area matching Admin Theme */}
      <main className="work-main admin-work-main customer-dashboard-main">
        {/* Top Header */}
        <header className="work-top admin-work-top" style={{ marginBottom: '24px' }}>
          <div className="top-header-left">
            <button
              type="button"
              className="mobile-menu"
              onClick={() => setMobileOpen(!mobileOpen)}
              title="Toggle Menu"
            >
              <MenuIcon size={20} />
            </button>
            <div className="top-page-icon-square" style={{ background: '#ea580c' }}>
              {activeTab === 'tracker' ? <Activity size={20} color="#fff" /> : activeTab === 'orders' ? <ClipboardList size={20} color="#fff" /> : activeTab === 'bills' ? <Receipt size={20} color="#fff" /> : <Award size={20} color="#fff" />}
            </div>
            <div className="top-title-text-group">
              <h1 className="top-page-title">
                {activeTab === 'tracker' ? 'Live Order Tracker' : activeTab === 'orders' ? 'My Order History' : activeTab === 'bills' ? 'Dining Visits & Tax Bills' : 'Servora Loyalty Club'}
              </h1>
              <p className="top-page-subtitle">
                {activeTab === 'tracker'
                  ? 'Follow your order from kitchen to table'
                  : activeTab === 'orders'
                    ? 'Browse dishes ordered across your dining sessions'
                    : activeTab === 'bills'
                      ? 'View itemized tax invoices with 5% GST breakdown'
                      : 'Exclusive diner rewards and visit frequency milestones'}
              </p>
            </div>
          </div>

          <div className="top-header-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={loadCustomerData}
              className="desktop-only"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 16px',
                borderRadius: '12px',
                border: '1px solid #ebdcd0',
                background: '#ffffff',
                color: '#3b1e10',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} /> Refresh
            </button>

            <Link
              to="/order"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '12.5px',
                textDecoration: 'none',
                boxShadow: '0 4px 14px rgba(234, 88, 12, 0.35)',
                whiteSpace: 'nowrap'
              }}
              title="Order More Dishes"
            >
              <Utensils size={15} /> <span>Order More</span>
            </Link>

            <button
              type="button"
              onClick={handleSignOut}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px',
                borderRadius: '10px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#dc2626',
                cursor: 'pointer'
              }}
              title="Sign Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* ========================================================
            TAB 1: LIVE ORDER TRACKER
            ======================================================== */}
        {activeTab === 'tracker' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
            {/* Multiple Active Orders Switcher Strip */}
            {activeOrdersList.length > 1 && (
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  padding: '14px 18px',
                  border: '1.5px solid #fed7aa',
                  boxShadow: '0 2px 10px rgba(234, 88, 12, 0.06)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#3b1e10', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Active Orders In Progress ({activeOrdersList.length})
                    </span>
                  </div>
                  <small style={{ color: '#8a6452', fontSize: 12 }}>
                    Click an order below to track its live status
                  </small>
                </div>

                <div className="order-switcher-strip" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
                  {activeOrdersList.map(ord => {
                    const ordNumStr = String(ord.order_number || '');
                    const ordIdStr = String(ord.id || '');
                    const currentKey = userPinnedOrderKey || userPinnedOrderKeyRef.current || (activeOrder ? String(activeOrder.order_number || activeOrder.id || '') : '');
                    const isSelected = Boolean(
                      currentKey && (
                        (ordNumStr && currentKey === ordNumStr) ||
                        (ordIdStr && currentKey.toLowerCase() === ordIdStr.toLowerCase()) ||
                        `svr${ordNumStr}`.toLowerCase() === currentKey.toLowerCase() ||
                        `#svr${ordNumStr}`.toLowerCase() === currentKey.toLowerCase()
                      )
                    );
                    const st = String(ord.status || 'received').toLowerCase();
                    const statusLabel = st.replace(/_/g, ' ').toUpperCase();
                    return (
                      <button
                        key={ord.id || ord.order_number}
                        type="button"
                        onClick={() => {
                          const chosenKey = String(ord.order_number || ord.id || '');
                          userPinnedOrderKeyRef.current = chosenKey;
                          setUserPinnedOrderKey(chosenKey);
                          try {
                            localStorage.setItem('servora_selected_order_id', chosenKey);
                            localStorage.setItem('servora_active_order_id', String(ord.id || chosenKey));
                            if (ord.order_number) localStorage.setItem('servora_active_order_num', String(ord.order_number));
                            if (ord.table_label) localStorage.setItem('servora_active_order_table', String(ord.table_label));
                          } catch { }
                          setActiveOrder(ord);
                          setActiveOrderItems(ord.order_items || ord.items || []);
                        }}
                        style={{
                          flex: '0 0 auto',
                          padding: '10px 16px',
                          borderRadius: 12,
                          background: isSelected ? 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)' : '#fffaf5',
                          color: isSelected ? '#ffffff' : '#451a03',
                          border: isSelected ? '1.5px solid #ea580c' : '1.5px solid #fed7aa',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          boxShadow: isSelected ? '0 4px 12px rgba(234, 88, 12, 0.3)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontSize: 14, fontWeight: 800 }}>
                            Order #{ord.order_number ? `SVR${ord.order_number}` : String(ord.id).slice(-4).toUpperCase()}
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>
                            Table {ord.table_label || '—'} &bull; {ord.created_at ? new Date(ord.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase() : ''}
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: isSelected ? 'rgba(255,255,255,0.22)' : '#ffedd5',
                            color: isSelected ? '#ffffff' : '#c2410c',
                            textTransform: 'uppercase'
                          }}
                        >
                          {statusLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {!activeOrder ? (
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '24px',
                  padding: '50px 30px',
                  textAlign: 'center',
                  border: '1px solid #ebdcd0',
                  boxShadow: '0 4px 20px rgba(35, 18, 9, 0.05)'
                }}
              >
                <div
                  style={{
                    width: 70,
                    height: 70,
                    borderRadius: '20px',
                    background: '#fff7ed',
                    color: '#ea580c',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '16px'
                  }}
                >
                  <Utensils size={36} />
                </div>
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1e0c04', margin: 0 }}>
                  No Active Food Orders
                </h3>
                <p style={{ margin: '8px 0 20px', fontSize: '14px', color: '#8c6e58' }}>
                  You do not have any ongoing dine-in orders at this moment. Browse our freshly prepared menu to place an order!
                </p>
                <Link
                  to="/order"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 28px',
                    borderRadius: '14px',
                    background: '#ea580c',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '15px',
                    textDecoration: 'none',
                    boxShadow: '0 4px 16px rgba(234, 88, 12, 0.4)'
                  }}
                >
                  <Utensils size={18} /> View Menu &amp; Order Now
                </Link>
              </div>
            ) : String(activeOrder.status).toLowerCase() === 'cancelled' ? (
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '24px',
                  padding: '50px 30px',
                  textAlign: 'center',
                  border: '1.5px solid #fed7aa',
                  boxShadow: '0 4px 20px rgba(35, 18, 9, 0.05)'
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    background: '#fef2f2',
                    color: '#dc2626',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '16px',
                    border: '2px solid #fecaca'
                  }}
                >
                  <XCircle size={38} />
                </div>
                <h3 style={{ fontSize: '22px', fontWeight: 900, color: '#991b1b', margin: '0 0 6px' }}>
                  Order #{activeOrder.order_number ? `SVR${activeOrder.order_number}` : ''} Cancelled
                </h3>
                <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#7f1d1d', fontWeight: 600 }}>
                  This order has been officially cancelled with Kitchen &amp; Billing Counter approval.
                </p>
                <div style={{ maxWidth: 460, margin: '0 auto 24px', background: '#fffaf5', border: '1px solid #fed7aa', borderRadius: 14, padding: 14, fontSize: 13, color: '#9a3412', textAlign: 'left', lineHeight: 1.5 }}>
                  Table {activeOrder.table_label || 'T01'} was freed and all ordered items voided. No bills or charges have been incurred.
                </div>
                <Link
                  to="/order"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 28px',
                    borderRadius: '14px',
                    background: '#ea580c',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '15px',
                    textDecoration: 'none',
                    boxShadow: '0 4px 16px rgba(234, 88, 12, 0.4)'
                  }}
                >
                  <Utensils size={18} /> View Menu &amp; Place New Order
                </Link>
              </div>
            ) : (
              <>
                {/* 1. Order Info Strip (Matching Reference Image) */}
                <div className="tracker-order-info-strip">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                    <div className="tracker-table-badge">
                      TABLE {activeOrder.table_label || 'T01'}
                    </div>
                    <div className="tracker-order-id-block">
                      <span className="order-id-title">
                        Order #{activeOrder.order_number ? `SVR${activeOrder.order_number}` : (activeOrder.id ? `SVR${String(activeOrder.id).slice(-4).toUpperCase()}` : '')}
                      </span>
                      <span className="order-id-time">
                        Placed at {activeOrder.created_at ? new Date(activeOrder.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase() : 'Just now'}
                      </span>
                    </div>
                    <div className="tracker-info-vdivider desktop-only" />
                    <div className="tracker-guest-block">
                      Guest: <b>{activeOrder.customer_name || customerName || 'Valued Diner'}</b>
                    </div>
                  </div>

                  <div className={`tracker-status-pill ${st}`}>
                    {activeOrder.status ? activeOrder.status.replace(/_/g, ' ').toUpperCase() : 'RECEIVED'}
                  </div>
                </div>

                {/* 2. 4-Milestone Interactive Flow Card (Matching Reference Image) */}
                <div className="tracker-flow-card">
                  <div className="tracker-flow-steps-grid">
                    {/* Dynamic Milestone Flow Connecting Lines (Aligned directly through circle centers) */}
                    <div className="tracker-connecting-line-base" />
                    <div
                      className="tracker-connecting-line-active"
                      style={{
                        width:
                          currentStage === 0
                            ? '0%'
                            : currentStage === 1
                              ? '25%'
                              : currentStage === 2
                                ? '50%'
                                : '75%'
                      }}
                    />
                    {/* Step 1: Order Received */}
                    <div className="tracker-step-col">
                      <div className={`tracker-step-circle ${currentStage >= 0 ? 'done' : ''}`}>
                        <Check size={20} strokeWidth={3} />
                      </div>
                      <div className="tracker-step-card-box">
                        <span className="step-card-title">Order Received</span>
                        <span className="step-card-sub">Order sent to kitchen</span>
                        <span className="step-card-time">
                          <Clock size={12} /> {activeOrder.created_at ? new Date(activeOrder.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase() : '12:39 pm'}
                        </span>
                      </div>
                    </div>

                    {/* Step 2: In Kitchen */}
                    <div className="tracker-step-col">
                      <div className={`tracker-step-circle ${currentStage > 1 ? 'done' : currentStage === 1 ? 'active' : ''}`}>
                        {currentStage > 1 ? (
                          <Check size={20} strokeWidth={3} />
                        ) : (
                          <ChefHat size={22} color={currentStage === 1 ? '#ea580c' : '#8c6e58'} />
                        )}
                        {currentStage === 1 && <div className="tracker-circle-dot-badge" />}
                      </div>
                      <div className={`tracker-step-card-box ${currentStage === 1 ? 'active' : ''}`}>
                        <span className="step-card-title">
                          {currentStage === 1 && <span style={{ color: '#ea580c', marginRight: 4 }}>●</span>}
                          In Kitchen
                        </span>
                        <span className="step-card-sub">Chefs are preparing your food</span>
                        <span className="step-card-time">
                          <Clock size={12} /> {currentStage >= 1 ? 'Just now' : 'Upcoming'}
                        </span>
                      </div>
                    </div>

                    {/* Step 3: Ready for Service */}
                    <div className="tracker-step-col">
                      <div className={`tracker-step-circle ${currentStage > 2 ? 'done' : currentStage === 2 ? 'active' : ''}`}>
                        {currentStage > 2 ? (
                          <Check size={20} strokeWidth={3} />
                        ) : (
                          <Bell size={22} color={currentStage === 2 ? '#ea580c' : '#8c6e58'} />
                        )}
                        {currentStage === 2 && <div className="tracker-circle-dot-badge" />}
                      </div>
                      <div className={`tracker-step-card-box ${currentStage === 2 ? 'active' : ''}`}>
                        <span className="step-card-title">
                          {currentStage === 2 && <span style={{ color: '#ea580c', marginRight: 4 }}>●</span>}
                          Ready for Service
                        </span>
                        <span className="step-card-sub">Your dishes are being plated</span>
                      </div>
                    </div>

                    {/* Step 4: Served at Table */}
                    <div className="tracker-step-col">
                      <div className={`tracker-step-circle ${currentStage >= 3 ? 'done' : ''}`}>
                        {currentStage >= 3 ? (
                          <Check size={20} strokeWidth={3} />
                        ) : (
                          <Utensils size={22} color="#8c6e58" />
                        )}
                        {currentStage === 3 && <div className="tracker-circle-dot-badge" />}
                      </div>
                      <div className={`tracker-step-card-box ${currentStage === 3 ? 'active' : ''}`}>
                        <span className="step-card-title">
                          {currentStage === 3 && <span style={{ color: '#ea580c', marginRight: 4 }}>●</span>}
                          Served at Table
                        </span>
                        <span className="step-card-sub">Enjoy your meal!</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Order Updates Box (Matching Reference Image) */}
                <div className="tracker-updates-box">
                  <div className="tracker-updates-label-col">
                    <Bell size={18} color="#ea580c" />
                    <span>Order Updates</span>
                  </div>
                  <div className="tracker-updates-timeline-col">
                    {/* Event 1: Order received */}
                    <div className="tracker-update-row">
                      <div className="tracker-update-dot checked">
                        <Check size={11} strokeWidth={3} />
                      </div>
                      <div className="tracker-update-text-wrap">
                        <span className="update-headline">Order received</span>
                        <span className="update-desc">
                          {activeOrder.created_at ? new Date(activeOrder.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase() : '12:39 pm'} &bull; Your order was sent to the kitchen
                        </span>
                      </div>
                    </div>

                    {/* Vertical connecting bar */}
                    <div className="tracker-update-vbar" />

                    {/* Event 2: In Kitchen / Current Status */}
                    {currentStage >= 1 ? (
                      <div className="tracker-update-active-strip">
                        <div className="tracker-update-dot active-pulse" />
                        <div className="tracker-update-text-wrap">
                          <span className="update-headline">
                            {currentStage === 3 ? 'Order served at table' : currentStage === 2 ? 'Dishes ready for serving' : 'Kitchen started preparing'}
                          </span>
                          <span className="update-desc">
                            &bull; Just now &bull; {currentStage === 3 ? 'Enjoy your delicious meal at Servora!' : currentStage === 2 ? `Dishes are ready and being served to Table ${activeOrder.table_label || 'T01'}` : 'Our chefs are working on your dishes'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="tracker-update-row" style={{ opacity: 0.8 }}>
                        <div className="tracker-update-dot" style={{ background: '#e2d5cb', width: 14, height: 14, margin: '2px 2px' }} />
                        <div className="tracker-update-text-wrap">
                          <span className="update-headline">Kitchen queue</span>
                          <span className="update-desc">&bull; Chefs will start preparing your order shortly</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. Quick Service Requests Bar (Matching Reference Image) */}
                <div className="tracker-service-bar">
                  <div className="tracker-service-left">
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: '#fff4ec', color: '#ea580c', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <Bell size={18} />
                    </div>
                    <div className="tracker-service-left-text">
                      <div className="need-help-title">Need anything at Table {activeOrder.table_label || 'T01'}?</div>
                      <div className="need-help-sub">Tap an option and our team will assist you.</div>
                    </div>
                  </div>

                  <div className="tracker-service-btn-group">
                    <button
                      type="button"
                      className="tracker-service-btn"
                      disabled={Boolean(helpBusy)}
                      onClick={() => handleRequestService('call_waiter', 'Call Waiter')}
                    >
                      <PhoneCall size={14} color="#ea580c" /> Call Waiter
                    </button>
                    <button
                      type="button"
                      className="tracker-service-btn"
                      disabled={Boolean(helpBusy)}
                      onClick={() => handleRequestService('water', 'Drinking Water')}
                    >
                      <Droplets size={14} color="#0284c7" /> Request Water
                    </button>
                    <button
                      type="button"
                      className="tracker-service-btn"
                      disabled={Boolean(helpBusy)}
                      onClick={() => handleRequestService('plates', 'Extra Plates')}
                    >
                      <Utensils size={14} color="#d97706" /> Extra Plates
                    </button>
                    <button
                      type="button"
                      className="tracker-service-btn bill-btn"
                      disabled={Boolean(helpBusy)}
                      onClick={() => handleRequestService('bill', 'Request Bill')}
                    >
                      <Receipt size={14} color="#ea580c" /> Request Bill
                    </button>
                    {!['served', 'completed', 'cancelled'].includes(String(activeOrder.status).toLowerCase()) && !cancellationRequested && (
                      <button
                        type="button"
                        className="tracker-service-btn"
                        style={{ borderColor: '#fca5a5', color: '#dc2626', background: '#fff5f5' }}
                        onClick={() => setShowCancelModal(true)}
                      >
                        <XCircle size={14} color="#dc2626" /> Cancel Request
                      </button>
                    )}
                  </div>
                </div>

                {/* Cancellation Status Banners */}
                {cancellationRequested && (
                  <div style={{
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
                )}

                {cancellationRejected && activeOrder.status !== 'cancelled' && (
                  <div style={{
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
                )}

                {/* 2. Itemized Food Details & Bill Calculation */}
                <div className="customer-tracker-grid" style={{ display: 'grid', gap: '22px' }}>
                  {/* Left: Food Items Breakdown */}
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '20px',
                      padding: '24px',
                      border: '1px solid #ebdcd0',
                      boxShadow: '0 4px 20px rgba(35, 18, 9, 0.05)'
                    }}
                  >
                    <h4 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 800, color: '#1e0c04' }}>
                      Dishes Ordered ({activeOrderItems.length})
                    </h4>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {activeOrderItems.map((it: any, idx: number) => (
                        <div
                          className="dish-row"
                          key={it.id || idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 16px',
                            borderRadius: '14px',
                            background: '#fffbf7',
                            border: '1px solid #f3e5d8'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div
                              style={{
                                width: 16,
                                height: 16,
                                borderRadius: '4px',
                                border: '1.5px solid #16a34a',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
                            </div>
                            <div>
                              <b style={{ color: '#1e0c04', fontSize: '14px' }}>{it.item_name}</b>
                              <div style={{ fontSize: '12px', color: '#8c6e58', marginTop: '2px' }}>
                                ₹{it.unit_price} &times; <b>{it.quantity}</b>
                              </div>
                            </div>
                          </div>

                          <div className="dish-row-right" style={{ textAlign: 'right' }}>
                            <b style={{ color: '#ea580c', fontSize: '15px' }}>
                              ₹{Number(it.line_total || it.unit_price * it.quantity).toFixed(2)}
                            </b>
                            {(() => {
                              const badge = getItemStatusBadge(it.status, activeOrder.status);
                              return (
                                <div
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color: badge.color,
                                    background: badge.bg,
                                    border: `1px solid ${badge.border}`,
                                    borderRadius: '6px',
                                    padding: '2px 8px',
                                    display: 'inline-block',
                                    marginTop: '4px'
                                  }}
                                >
                                  {badge.label}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right: Bill Calculation */}
                  <div
                    style={{
                      background: '#ffffff',
                      borderRadius: '20px',
                      padding: '24px',
                      border: '1px solid #ebdcd0',
                      boxShadow: '0 4px 20px rgba(35, 18, 9, 0.05)',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    <h4 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 800, color: '#1e0c04' }}>
                      Payment &amp; Tax Bill
                    </h4>

                    {(() => {
                      const curItems = activeOrderItems || [];
                      const itemsSum = curItems.reduce((acc: number, it: any) => {
                        let unit = Number(it.unit_price) || 0;
                        if (unit <= 0) {
                          unit = lookupMenuItemPrice(it.menu_item_id) || lookupMenuItemPrice(it.item_name) || 0;
                        }
                        const line = Number(it.line_total) > 0 ? Number(it.line_total) : (unit * (it.quantity || 1));
                        return acc + line;
                      }, 0);
                      const subVal = Number(activeOrder.subtotal) > 0 ? Number(activeOrder.subtotal) : itemsSum;
                      const taxVal = Number(activeOrder.tax) > 0 ? Number(activeOrder.tax) : Number((subVal * 0.05).toFixed(2));
                      const totVal = Number(activeOrder.total) > 0 ? Number(activeOrder.total) : Number(activeOrder.total_amount) > 0 ? Number(activeOrder.total_amount) : Number((subVal + taxVal).toFixed(2));

                      const isOrderPaid = activeOrder.payment_status === 'paid';
                      if (isOrderPaid && activeOrder.payment_status !== 'paid') {
                        activeOrder.payment_status = 'paid';
                      }

                      return (
                        <>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#8c6e58' }}>Item Subtotal:</span>
                              <b>₹{subVal.toFixed(2)}</b>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#8c6e58' }}>Restaurant GST (5%):</span>
                              <b>₹{taxVal.toFixed(2)}</b>
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                justifyItems: 'space-between',
                                justifyContent: 'space-between',
                                borderTop: '1.5px dashed #ebdcd0',
                                paddingTop: '12px',
                                marginTop: '6px',
                                fontSize: '17px',
                                fontWeight: 900,
                                color: '#1e0c04'
                              }}
                            >
                              <span>Total Payable:</span>
                              <span style={{ color: '#ea580c' }}>₹{totVal.toFixed(2)}</span>
                            </div>

                            <div
                              style={{
                                marginTop: '12px',
                                padding: '10px 14px',
                                borderRadius: '12px',
                                background: isOrderPaid ? '#dcfce7' : '#fff7ed',
                                color: isOrderPaid ? '#16a34a' : '#ea580c',
                                fontWeight: 800,
                                textAlign: 'center',
                                fontSize: '13px'
                              }}
                            >
                              Payment Status: {isOrderPaid ? 'PAID & SETTLED' : 'UNPAID • Pay Cash / Online'}
                            </div>
                          </div>

                          {!isOrderPaid ? (() => {
                            const isServed = currentStage === 3 || ['served', 'completed'].includes(String(activeOrder.status || '').toLowerCase());
                            if (!isServed) {
                              return (
                                <div style={{ marginTop: '16px' }}>
                                  <button
                                    type="button"
                                    disabled={true}
                                    style={{
                                      width: '100%',
                                      padding: '13px 18px',
                                      borderRadius: '12px',
                                      background: '#f3e5d8',
                                      color: '#8c6e58',
                                      border: '1.5px solid #ebdcd0',
                                      fontWeight: 700,
                                      fontSize: '13.5px',
                                      cursor: 'not-allowed',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '8px'
                                    }}
                                  >
                                    <Clock size={16} /> Pay Bill (Available after Food is Served)
                                  </button>
                                  <div style={{ textAlign: 'center', marginTop: 6, fontSize: 11, color: '#8c6e58' }}>
                                    Your food is being prepared. Bill payment will be enabled once your order is served at the table.
                                  </div>
                                </div>
                              );
                            }

                            const servedKey = `servora_served_time_${activeOrder.id}`;
                            let localServedTime = Number(localStorage.getItem(servedKey) || 0);
                            if (!localServedTime && isServed) {
                              const rawTime = activeOrder.served_at || activeOrder.updated_at;
                              localServedTime = rawTime ? new Date(rawTime).getTime() : Date.now();
                              try { localStorage.setItem(servedKey, String(localServedTime)); } catch { }
                            }
                            const elapsedSec = isServed && localServedTime > 0 ? Math.floor((Date.now() - localServedTime) / 1000) : 0;
                            const remainingSec = Math.max(0, 600 - elapsedSec);
                            const mm = String(Math.floor(remainingSec / 60)).padStart(2, '0');
                            const ss = String(remainingSec % 60).padStart(2, '0');
                            const isTimerActive = isServed && remainingSec > 0;

                            if (isTimerActive) {
                              return (
                                <div style={{ marginTop: '16px' }}>
                                  <button
                                    type="button"
                                    disabled={true}
                                    style={{
                                      width: '100%',
                                      padding: '13px 18px',
                                      borderRadius: '12px',
                                      background: '#f3e5d8',
                                      color: '#8c6e58',
                                      border: '1.5px solid #ebdcd0',
                                      fontWeight: 700,
                                      fontSize: '13.5px',
                                      cursor: 'not-allowed',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '8px'
                                    }}
                                  >
                                    <Clock size={16} /> Pay Bill (Available in {mm}:{ss})
                                  </button>
                                  <div style={{ textAlign: 'center', marginTop: 6, fontSize: 11, color: '#8c6e58' }}>
                                    Pay button activates in {mm}:{ss} (10 mins after served) so you can enjoy your meal uninterrupted.
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsMergedPay(false);
                                  setShowPayModal(true);
                                }}
                                style={{
                                  marginTop: '16px',
                                  padding: '13px 18px',
                                  borderRadius: '12px',
                                  background: 'linear-gradient(135deg, #ea580c, #c2410c)',
                                  color: '#ffffff',
                                  border: 'none',
                                  fontWeight: 800,
                                  fontSize: '14px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '8px',
                                  boxShadow: '0 4px 14px rgba(234, 88, 12, 0.35)'
                                }}
                              >
                                <Wallet size={16} /> Pay Bill (₹{totVal.toFixed(2)})
                              </button>
                            );
                          })() : (
                            <div>
                              <div
                                style={{
                                  marginTop: '14px',
                                  padding: '10px 14px',
                                  borderRadius: '10px',
                                  background: '#dcfce7',
                                  color: '#16a34a',
                                  fontWeight: 800,
                                  fontSize: '13px',
                                  textAlign: 'center',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px'
                                }}
                              >
                                <CheckCircle2 size={16} /> Bill Paid &amp; Settled
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  try {
                                    localStorage.removeItem('servora_active_order_id');
                                    localStorage.removeItem('servora_active_order_token');
                                    localStorage.removeItem('servora_active_order_num');
                                    localStorage.removeItem('servora_active_order_table');
                                  } catch { }
                                  window.location.href = '/order';
                                }}
                                style={{
                                  marginTop: '8px',
                                  width: '100%',
                                  padding: '10px 14px',
                                  borderRadius: '10px',
                                  background: '#16a34a',
                                  color: '#fff',
                                  border: 'none',
                                  fontWeight: 800,
                                  fontSize: '13px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px',
                                  cursor: 'pointer'
                                }}
                              >
                                <Utensils size={15} /> Start Fresh Dine-In Order
                              </button>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => setReceiptModalOrder(activeOrder)}
                            style={{
                              marginTop: '10px',
                              padding: '12px',
                              borderRadius: '12px',
                              background: '#3b1e10',
                              color: '#ffffff',
                              border: 'none',
                              fontWeight: 700,
                              fontSize: '13px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px'
                            }}
                          >
                            <Receipt size={16} /> View Digital Tax Receipt
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ========================================================
            TAB 2: PAST ORDERS HISTORY
            ======================================================== */}
        {activeTab === 'orders' && (
          <div
            style={{
              background: '#ffffff',
              borderRadius: '24px',
              padding: '24px 28px',
              border: '1px solid #ebdcd0',
              boxShadow: '0 4px 20px rgba(35, 18, 9, 0.05)'
            }}
          >
            <h3 style={{ margin: '0 0 18px', fontSize: '18px', fontWeight: 800, color: '#1e0c04' }}>
              Your Past Orders ({pastOrders.length})
            </h3>

            {pastOrders.length === 0 ? (
              <p style={{ color: '#8c6e58' }}>No past orders found for +91 {customerPhone.slice(-10)}.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {pastOrders.map(o => (
                  <div
                    key={o.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px 20px',
                      borderRadius: '16px',
                      background: '#fffbf7',
                      border: '1px solid #f3e5d8',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      const st = String(o.status || '').toLowerCase();
                      const isPaid = isOrderSettledPaid(o);
                      if (!isPaid && st !== 'cancelled' && st !== 'completed') {
                        const chosenKey = String(o.order_number || o.id || '');
                        userPinnedOrderKeyRef.current = chosenKey;
                        setUserPinnedOrderKey(chosenKey);
                        try {
                          localStorage.setItem('servora_selected_order_id', chosenKey);
                          localStorage.setItem('servora_active_order_id', String(o.id || chosenKey));
                          if (o.order_number) localStorage.setItem('servora_active_order_num', String(o.order_number));
                          if (o.table_label) localStorage.setItem('servora_active_order_table', String(o.table_label));
                        } catch { }
                        setActiveOrder(o);
                        setActiveOrderItems(o.order_items || o.items || []);
                        setActiveTab('tracker');
                      } else {
                        setReceiptModalOrder(o);
                      }
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <b style={{ fontSize: '16px', color: '#1e0c04' }}>Order #SVR{o.order_number}</b>
                        <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '8px', background: '#e0f2fe', color: '#0369a1', fontWeight: 700 }}>
                          Table {o.table_label || '—'}
                        </span>
                        <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '8px', background: '#dcfce7', color: '#16a34a', fontWeight: 700 }}>
                          {o.status?.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#8c6e58', marginTop: '4px' }}>
                        {new Date(o.created_at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} at {new Date(o.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div>
                        <div style={{ fontSize: '17px', fontWeight: 800, color: '#ea580c' }}>
                          ₹{Number(o.total || 0).toFixed(2)}
                        </div>
                        <small style={{ color: '#8c6e58' }}>{o.payment_status === 'paid' ? 'Paid' : 'Unpaid'}</small>
                      </div>

                      <button
                        type="button"
                        onClick={() => setReceiptModalOrder(o)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '10px',
                          background: '#ffffff',
                          border: '1.5px solid #ebdcd0',
                          color: '#3b1e10',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        Receipt
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================
            TAB 3: VISITS & BILLS
            ======================================================== */}
        {activeTab === 'bills' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
            {/* 3 Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px' }}>
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '18px',
                  padding: '20px',
                  border: '1px solid #ebdcd0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px'
                }}
              >
                <div style={{ width: 44, height: 44, borderRadius: '12px', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <History size={22} color="#ea580c" />
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: '#8c6e58', fontWeight: 700 }}>TOTAL VISITS</span>
                  <p style={{ margin: '2px 0 0', fontSize: '22px', fontWeight: 800, color: '#1e0c04' }}>
                    {pastOrders.length || 1} Visits
                  </p>
                </div>
              </div>

              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '18px',
                  padding: '20px',
                  border: '1px solid #ebdcd0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px'
                }}
              >
                <div style={{ width: 44, height: 44, borderRadius: '12px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Receipt size={22} color="#16a34a" />
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: '#8c6e58', fontWeight: 700 }}>TOTAL DINING SPEND</span>
                  <p style={{ margin: '2px 0 0', fontSize: '22px', fontWeight: 800, color: '#1e0c04' }}>
                    ₹{pastOrders.reduce((sum, o) => sum + Number(o.total || 0), 0).toFixed(2)}
                  </p>
                </div>
              </div>

              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '18px',
                  padding: '20px',
                  border: '1px solid #ebdcd0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px'
                }}
              >
                <div style={{ width: 44, height: 44, borderRadius: '12px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Heart size={22} color="#d97706" />
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: '#8c6e58', fontWeight: 700 }}>FAVORITE CUISINE</span>
                  <p style={{ margin: '2px 0 0', fontSize: '18px', fontWeight: 800, color: '#1e0c04' }}>
                    South Indian Tiffin
                  </p>
                </div>
              </div>
            </div>

            {/* List of Tax Invoices & Multi-Bill Merge Option */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '24px',
                padding: '24px 28px',
                border: '1px solid #ebdcd0',
                boxShadow: '0 4px 20px rgba(35, 18, 9, 0.05)'
              }}
            >
              {/* Multi-Bill Merge Option for Customers */}
              {(() => {
                const unpaidOrders = pastOrders.filter(o => o.payment_status !== 'paid');
                if (unpaidOrders.length < 2) return null;

                const selectedOrders = pastOrders.filter(o => selectedBillIds.includes(o.id));
                const mergedSub = selectedOrders.reduce((sum, o) => {
                  const oItems = (o.order_items || []) as any[];
                  const itemSum = oItems.reduce((acc: number, it: any) => acc + (Number(it.line_total) || (Number(it.unit_price) || 0) * (it.quantity || 1)), 0);
                  return sum + (Number(o.subtotal) > 0 ? Number(o.subtotal) : (itemSum > 0 ? itemSum : (Number(o.total) > 0 ? Math.round(Number(o.total) / 1.05) : 0)));
                }, 0);
                const mergedTax = Math.round(mergedSub * 0.05);
                const mergedTot = mergedSub + mergedTax;

                return (
                  <div
                    style={{
                      background: 'linear-gradient(135deg, #fffbf7, #fff4eb)',
                      border: '2px solid #fdba74',
                      borderRadius: 18,
                      padding: '18px 20px',
                      marginBottom: 24,
                      boxShadow: '0 4px 14px rgba(234, 88, 12, 0.08)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Layers size={22} color="#ea580c" />
                        <div>
                          <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#3b1e10' }}>
                            Merge &amp; Pay Multiple Bills ({unpaidOrders.length} Unpaid Available)
                          </h4>
                          <span style={{ fontSize: 12, color: '#8c6e58' }}>
                            Select bills to combine and settle in one single transaction
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => setSelectedBillIds(unpaidOrders.map(o => o.id))}
                          style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 8, background: '#fff', border: '1px solid #ebdcd0', color: '#ea580c', cursor: 'pointer' }}
                        >
                          Select All ({unpaidOrders.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedBillIds([])}
                          style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 8, background: '#fff', border: '1px solid #ebdcd0', color: '#7c5841', cursor: 'pointer' }}
                        >
                          Clear Selection
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {unpaidOrders.map(o => {
                        const isChecked = selectedBillIds.includes(o.id);
                        const oItems = (o.order_items || []) as any[];
                        const itemSum = oItems.reduce((sum: number, it: any) => sum + (Number(it.line_total) || (Number(it.unit_price) || 0) * (it.quantity || 1)), 0);
                        const oTot = Number(o.total_amount) > 0 ? Number(o.total_amount) : Number(o.total) > 0 ? Number(o.total) : (itemSum > 0 ? Math.round(itemSum * 1.05) : 0);

                        return (
                          <div
                            key={o.id}
                            onClick={() => {
                              if (isChecked) setSelectedBillIds(prev => prev.filter(id => id !== o.id));
                              else setSelectedBillIds(prev => [...prev, o.id]);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 14px',
                              borderRadius: 12,
                              background: isChecked ? '#fff7ed' : '#ffffff',
                              border: isChecked ? '1.5px solid #ea580c' : '1px solid #ebdcd0',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => { }}
                                style={{ width: 16, height: 16, accentColor: '#ea580c', cursor: 'pointer' }}
                              />
                              <div>
                                <b style={{ fontSize: 14, color: '#1e0c04' }}>Order #SVR{o.order_number}</b>
                                <span style={{ fontSize: 12, color: '#8c6e58', marginLeft: 8 }}>Table {o.table_label || 'T01'}</span>
                              </div>
                            </div>
                            <b style={{ color: '#ea580c', fontSize: 15 }}>₹{oTot.toFixed(2)}</b>
                          </div>
                        );
                      })}
                    </div>

                    {selectedBillIds.length > 0 && (
                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #fdba74', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                        <div>
                          <span style={{ fontSize: 12, color: '#8c6e58' }}>Merged Total ({selectedBillIds.length} Selected):</span>
                          <b style={{ fontSize: 18, color: '#ea580c', marginLeft: 8 }}>₹{mergedTot.toFixed(2)}</b>
                          <span style={{ fontSize: 11, color: '#8c6e58', marginLeft: 6 }}>(incl. 5% GST)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsMergedPay(true);
                            setShowPayModal(true);
                          }}
                          style={{
                            padding: '10px 20px',
                            borderRadius: 10,
                            background: 'linear-gradient(135deg, #ea580c, #c2410c)',
                            color: '#ffffff',
                            border: 'none',
                            fontWeight: 800,
                            fontSize: 14,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            boxShadow: '0 4px 12px rgba(234, 88, 12, 0.35)'
                          }}
                        >
                          <Wallet size={16} /> Merge &amp; Pay ({selectedBillIds.length} Bills • ₹{mergedTot.toFixed(2)})
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 800, color: '#1e0c04' }}>
                Itemized Tax Invoices &amp; Receipts
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {pastOrders.map(o => (
                  <div
                    key={o.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 18px',
                      borderRadius: '14px',
                      background: '#fffbf7',
                      border: '1px solid #f3e5d8'
                    }}
                  >
                    <div>
                      <b style={{ fontSize: '15px', color: '#1e0c04' }}>Tax Invoice #SVR{o.order_number}</b>
                      <div style={{ fontSize: '12px', color: '#8c6e58', marginTop: '2px' }}>
                        Table {o.table_label} &bull; GST (5%) Included &bull; {new Date(o.created_at).toLocaleDateString('en-IN')}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <b style={{ color: '#ea580c', fontSize: '16px' }}>₹{Number(o.total || 0).toFixed(2)}</b>
                      <button
                        type="button"
                        onClick={() => setReceiptModalOrder(o)}
                        style={{
                          padding: '7px 14px',
                          borderRadius: '10px',
                          background: '#ea580c',
                          color: '#fff',
                          border: 'none',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Download size={13} /> View &amp; Download Invoice
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            TAB 4: LOYALTY & REWARDS
            ======================================================== */}
        {activeTab === 'loyalty' && (
          <div
            style={{
              background: '#ffffff',
              borderRadius: '24px',
              padding: '32px',
              border: '1px solid #ebdcd0',
              boxShadow: '0 4px 20px rgba(35, 18, 9, 0.05)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px', marginBottom: '24px' }}>
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: '18px',
                  background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 24px rgba(234, 88, 12, 0.4)'
                }}
              >
                <Award size={30} color="#fff" />
              </div>
              <div>
                <span style={{ fontSize: '12px', color: '#ea580c', fontWeight: 800, textTransform: 'uppercase' }}>
                  Servora Privilege Club
                </span>
                <h3 style={{ margin: '2px 0 0', fontSize: '22px', fontWeight: 800, color: '#1e0c04' }}>
                  Gold Tier Diner Member
                </h3>
                <small style={{ color: '#8c6e58' }}>Mobile: +91 {customerPhone.slice(-10)}</small>
              </div>
            </div>

            <div
              style={{
                background: 'linear-gradient(135deg, #1c100a 0%, #2f1409 100%)',
                borderRadius: '20px',
                padding: '24px 28px',
                color: '#fff',
                marginBottom: '24px',
                boxShadow: '0 8px 24px rgba(28, 16, 10, 0.25)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '12px', color: '#fed7aa', fontWeight: 700 }}>REWARD POINTS BALANCE</span>
                  <p style={{ margin: '6px 0 0', fontSize: '32px', fontWeight: 900, color: '#f97316' }}>
                    {(pastOrders.length * 150) || 350} pts
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '12px', color: '#cbd5e1' }}>Value: ₹{(((pastOrders.length * 150) || 350) * 0.5).toFixed(0)}</span>
                  <div style={{ marginTop: '4px', fontSize: '11px', color: '#16a34a', fontWeight: 700, background: '#dcfce7', padding: '3px 8px', borderRadius: '8px', display: 'inline-block' }}>
                    Active
                  </div>
                </div>
              </div>
            </div>

            <h4 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 800, color: '#1e0c04' }}>
              Your Dining Privileges
            </h4>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#6d4a36', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>Earn 10 points for every ₹100 spent on Dine-In orders.</li>
              <li>Priority seating and automatic kitchen rush ticket pass.</li>
              <li>Complementary traditional filter coffee on birthday visits.</li>
            </ul>
          </div>
        )}
      </main>

      {/* PRINTABLE TAX RECEIPT MODAL */}
      {receiptModalOrder && (
        <div className="waiter-modal-backdrop" onClick={() => setReceiptModalOrder(null)}>
          <div className="waiter-modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px', padding: '24px' }}>
            <div style={{ textAlign: 'center', borderBottom: '1px dashed #ebdcd0', paddingBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: '#ea580c' }}>SERVORA</h2>
              <small style={{ color: '#8c6e58' }}>Dine-In QR &amp; Service</small>
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#6d4a36' }}>
                Tax Invoice &bull; Order #SVR{receiptModalOrder.order_number}
              </div>
              <div style={{ fontSize: '12px', color: '#6d4a36' }}>
                Table: <b>{receiptModalOrder.table_label}</b> &bull; Customer: <b>{receiptModalOrder.customer_name || customerName}</b>
              </div>
              <div style={{ fontSize: '11px', color: '#a88470', marginTop: '4px' }}>
                {new Date(receiptModalOrder.created_at).toLocaleString('en-IN')}
              </div>
            </div>

            <div style={{ padding: '16px 0', borderBottom: '1px dashed #ebdcd0', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal:</span>
                <b>₹{Number(receiptModalOrder.subtotal || 0).toFixed(2)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>GST (5%):</span>
                <b>₹{Number(receiptModalOrder.tax || 0).toFixed(2)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 800, color: '#1e0c04', marginTop: '6px' }}>
                <span>Total Amount:</span>
                <span style={{ color: '#ea580c' }}>₹{Number(receiptModalOrder.total || 0).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#8c6e58' }}>
                <span>Payment Status:</span>
                <b>{receiptModalOrder.payment_status?.toUpperCase() || 'PAID'}</b>
              </div>
            </div>

            <div style={{ textAlign: 'center', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ margin: 0, fontSize: '12px', color: '#8c6e58' }}>Thank you for dining with Servora!</p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    const billText = `SERVORA - TAX INVOICE
Order #${receiptModalOrder.order_number} • Table ${receiptModalOrder.table_label}
Date: ${new Date(receiptModalOrder.created_at || Date.now()).toLocaleString()}
Guest: ${receiptModalOrder.customer_name || 'Valued Diner'}
------------------------------------------------
${(receiptModalOrder.order_items || []).map((it: any) => `${it.quantity}x ${it.item_name} - ₹${Number(it.line_total || it.unit_price * it.quantity).toFixed(2)}`).join('\n')}
------------------------------------------------
Subtotal: ₹${Number(receiptModalOrder.subtotal || 0).toFixed(2)}
GST (5%): ₹${Number(receiptModalOrder.tax || 0).toFixed(2)}
Total Amount: ₹${Number(receiptModalOrder.total || 0).toFixed(2)}
Thank you for dining at Servora!
`;
                    const blob = new Blob([billText], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Invoice_SVR${receiptModalOrder.order_number}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '10px',
                    border: '1px solid #ebdcd0',
                    background: '#fff',
                    color: '#3b1e10',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Download size={15} /> Download Invoice
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptModalOrder(null)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '10px',
                    background: '#ea580c',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          INLINE POPUP PAYMENT MODAL (NO REDIRECT / NO EXTERNAL LINK)
          ======================================================== */}
      {showPayModal && activeOrder && (() => {
        const isMultiMerged = isMergedPay && selectedBillIds.length > 0;
        const selectedOrders = isMultiMerged ? pastOrders.filter(o => selectedBillIds.includes(o.id)) : [];
        const mergedSub = isMultiMerged ? selectedOrders.reduce((sum, o) => {
          const oItems = (o.order_items || []) as any[];
          const itemSum = oItems.reduce((acc: number, it: any) => acc + (Number(it.line_total) || (Number(it.unit_price) || 0) * (it.quantity || 1)), 0);
          return sum + (Number(o.subtotal) > 0 ? Number(o.subtotal) : (itemSum > 0 ? itemSum : (Number(o.total) > 0 ? Math.round(Number(o.total) / 1.05) : 0)));
        }, 0) : 0;
        const mergedTax = isMultiMerged ? Math.round(mergedSub * 0.05) : 0;
        const mergedTotal = isMultiMerged ? (mergedSub + mergedTax) : 0;

        const curItems = activeOrderItems || [];
        const itemsSum = curItems.reduce((acc: number, it: any) => acc + (Number(it.line_total) || (Number(it.unit_price) || 0) * (it.quantity || 1)), 0);
        const subVal = isMultiMerged ? mergedSub : (Number(activeOrder?.subtotal) > 0 ? Number(activeOrder.subtotal) : itemsSum);
        const taxVal = isMultiMerged ? mergedTax : (Number(activeOrder?.tax) > 0 ? Number(activeOrder.tax) : Math.round(subVal * 0.05));
        const totVal = isMultiMerged ? mergedTotal : (Number(activeOrder?.total) > 0 ? Number(activeOrder.total) : Number(activeOrder?.total_amount) > 0 ? Number(activeOrder.total_amount) : (subVal + taxVal));

        return (
          <div
            onClick={() => {
              setShowPayModal(false);
              setIsMergedPay(false);
            }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(28, 14, 8, 0.65)',
              backdropFilter: 'blur(5px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              zIndex: 9999
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#ffffff',
                borderRadius: '24px',
                width: '100%',
                maxWidth: '460px',
                padding: '24px',
                boxShadow: '0 25px 60px rgba(28, 14, 8, 0.3)',
                position: 'relative',
                maxHeight: '90vh',
                overflowY: 'auto'
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#1e0c04' }}>
                    {isMultiMerged ? `Settle & Pay ${selectedBillIds.length} Merged Bills` : 'Settle & Pay Bill'}
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: '#8c6e58' }}>
                    {isMultiMerged
                      ? `Orders: ${selectedOrders.map(o => '#' + o.order_number).join(', ')} • Table ${selectedOrders[0]?.table_label || '—'}`
                      : `Order #SVR${activeOrder?.order_number || ''} • Table ${activeOrder?.table_label || 'T01'}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowPayModal(false);
                    setIsMergedPay(false);
                  }}
                  style={{
                    background: '#f5ebe1',
                    border: 'none',
                    borderRadius: '50%',
                    width: 32,
                    height: 32,
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'pointer',
                    color: '#8c6e58'
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Amount Highlight */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #fff7ed, #fed7aa)',
                  border: '1.5px solid #fdba74',
                  borderRadius: 16,
                  padding: '16px',
                  textAlign: 'center',
                  marginBottom: 20
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Total Amount Due
                </div>
                <div style={{ fontSize: 32, fontWeight: 900, color: '#c2410c', marginTop: 4 }}>
                  ₹{totVal.toFixed(2)}
                </div>
                <div style={{ fontSize: 11, color: '#78350f', marginTop: 4 }}>
                  Subtotal: ₹{subVal.toFixed(2)} + GST (5%): ₹{taxVal.toFixed(2)}
                </div>
              </div>

              {/* Payment Method Selector */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#4a2c17', marginBottom: 8 }}>
                  Select Payment Method
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setPayMethod('upi')}
                    style={{
                      padding: '10px 6px',
                      borderRadius: 12,
                      border: payMethod === 'upi' ? '2px solid #ea580c' : '1px solid #ebdcd0',
                      background: payMethod === 'upi' ? '#fff7ed' : '#ffffff',
                      color: payMethod === 'upi' ? '#c2410c' : '#5c3a21',
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <QrCode size={18} /> UPI / QR
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayMethod('card')}
                    style={{
                      padding: '10px 6px',
                      borderRadius: 12,
                      border: payMethod === 'card' ? '2px solid #ea580c' : '1px solid #ebdcd0',
                      background: payMethod === 'card' ? '#fff7ed' : '#ffffff',
                      color: payMethod === 'card' ? '#c2410c' : '#5c3a21',
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <CreditCard size={18} /> Card
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayMethod('cash')}
                    style={{
                      padding: '10px 6px',
                      borderRadius: 12,
                      border: payMethod === 'cash' ? '2px solid #ea580c' : '1px solid #ebdcd0',
                      background: payMethod === 'cash' ? '#fff7ed' : '#ffffff',
                      color: payMethod === 'cash' ? '#c2410c' : '#5c3a21',
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Wallet size={18} /> Cash / Counter
                  </button>
                </div>
              </div>

              {/* Payment Details Body */}
              {payMethod === 'upi' && (
                <div style={{ textAlign: 'center', padding: '12px 14px', background: '#fdfbf9', borderRadius: 14, border: '1px solid #ebdcd0', marginBottom: 18 }}>
                  <div style={{ width: 140, height: 140, margin: '0 auto 10px', background: '#ffffff', border: '1.5px solid #fed7aa', borderRadius: 12, display: 'grid', placeItems: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.04)' }}>
                    <QrCode size={100} color="#ea580c" />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1e0c04' }}>
                    UPI ID: <span style={{ color: '#ea580c' }}>servora.food@icici</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#8c6e58', marginTop: 4 }}>
                    Scan with Google Pay, PhonePe, Paytm, or BHIM UPI
                  </div>
                </div>
              )}

              {payMethod === 'card' && (
                <div style={{ padding: '12px 14px', background: '#fdfbf9', borderRadius: 14, border: '1px solid #ebdcd0', marginBottom: 18 }}>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#5c3a21', marginBottom: 4 }}>Card Number</label>
                    <input
                      type="text"
                      placeholder="•••• •••• •••• 4242"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d6c2b4', fontSize: 13, background: '#fff' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#5c3a21', marginBottom: 4 }}>Expiry</label>
                      <input
                        type="text"
                        placeholder="MM/YY"
                        defaultValue="08/28"
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d6c2b4', fontSize: 13, background: '#fff' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#5c3a21', marginBottom: 4 }}>CVV</label>
                      <input
                        type="password"
                        placeholder="•••"
                        defaultValue="782"
                        maxLength={3}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d6c2b4', fontSize: 13, background: '#fff' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {payMethod === 'cash' && (
                <div style={{ padding: '14px', background: '#fdfbf9', borderRadius: 14, border: '1px solid #ebdcd0', marginBottom: 18, textAlign: 'center' }}>
                  <Wallet size={32} color="#ea580c" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1e0c04' }}>
                    Pay at Table or Counter
                  </div>
                  <div style={{ fontSize: 11, color: '#8c6e58', marginTop: 4, lineHeight: 1.4 }}>
                    Inform the captain or pay at the cash counter. Admin/waiter will update the status to paid on their terminal.
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: 12,
                    border: '1px solid #ebdcd0',
                    background: '#fdfbf9',
                    color: '#5c3a21',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isPaying}
                  onClick={async () => {
                    setIsPaying(true);
                    try {
                      if (isMultiMerged) {
                        if (payMethod === 'cash') {
                          if (supabase) {
                            const { error: cashErr } = await supabase.from('orders').update({ payment_method: 'cash', payment_status: 'unpaid' }).in('id', selectedBillIds);
                            if (cashErr) throw cashErr;
                          }
                          if (setNotice) {
                            setNotice({
                              text: `Offline cash requested for ${selectedBillIds.length} merged bills. Please pay at counter or waiter.`,
                              kind: 'success'
                            });
                          }
                        } else {
                          // A browser can never confirm a payment. Online gateway is not integrated yet.
                          if (setNotice) {
                            setNotice({ text: 'Online payment is not enabled yet. Please pay at the counter or with your server; staff will mark the bill as paid.', kind: 'info' });
                          }
                        }
                        setSelectedBillIds([]);
                        setIsMergedPay(false);
                        await loadCustomerData();
                      } else {
                        if (payMethod === 'cash') {
                          if (setNotice) {
                            setNotice({
                              text: 'Offline Cash requested. Please pay at counter or waiter. Staff will verify & mark Paid.',
                              kind: 'success'
                            });
                          }
                        } else {
                          // A browser can never confirm a payment. Online gateway is not integrated yet.
                          if (setNotice) {
                            setNotice({ text: 'Online payment is not enabled yet. Please pay at the counter or with your server; staff will mark the bill as paid.', kind: 'info' });
                          }
                        }
                      }
                      setShowPayModal(false);
                    } catch (err: any) {
                      if (setNotice) {
                        setNotice({
                          text: err.message || 'Payment processing failed.',
                          kind: 'error'
                        });
                      }
                    } finally {
                      setIsPaying(false);
                    }
                  }}
                  style={{
                    flex: 2,
                    padding: '12px',
                    borderRadius: 12,
                    border: 'none',
                    background: 'linear-gradient(135deg, #ea580c, #c2410c)',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: 14,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(234, 88, 12, 0.35)',
                    opacity: isPaying ? 0.7 : 1
                  }}
                >
                  {isPaying ? 'Processing...' : payMethod === 'cash' ? 'Request Cash Settlement' : `Confirm & Pay ₹${totVal.toFixed(2)}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Cancellation Request Modal */}
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
                  Order #{activeOrder?.order_number || activeOrder?.id || '---'} • Table {activeOrder?.table_label || '---'}
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
                    name="cancelReasonCust"
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
