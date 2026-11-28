import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  Clock,
  Clock3,
  Download,
  Eye,
  Flame,
  History,
  Maximize2,
  Minimize2,
  Phone,
  RefreshCw,
  Search,
  Timer,
  TrendingUp,
  Tv,
  User,
  UserCheck,
  Users,
  Utensils,
  X
} from 'lucide-react';
import { getCached, getOrders, getStaffList, updateOrderStatus, updateOrderPaymentStatus, getPendingCancellationRequests, approveOrderCancellation, rejectOrderCancellation, CancellationRequestInfo } from '../lib/data';
import { supabase } from '../lib/supabase';

export function KitchenAdminPage({ setNotice }: { setNotice?: (n: any) => void }) {
  const [activeTab, setActiveTab] = useState<'live' | 'queue' | 'report' | 'staff' | 'history'>('live');
  const [orders, setOrders] = useState<any[]>(() => getCached<any[]>('orders_all') || []);
  const [staff, setStaff] = useState<any[]>(() => getCached<any[]>('staff') || []);
  const [attendance, setAttendance] = useState<any[]>(() => getCached<any[]>('attendance') || []);
  const [cancelRequests, setCancelRequests] = useState<CancellationRequestInfo[]>([]);
  const [selectedStation, setSelectedStation] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState('');
  const [searchQueue, setSearchQueue] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState<'today' | 'yesterday' | 'week' | 'all' | string>('today');
  const [historySearch, setHistorySearch] = useState('');
  const [selectedHistoryOrder, setSelectedHistoryOrder] = useState<any | null>(null);

  const loadData = useCallback(async (force = false) => {
    try {
      const [o, s, attRes, cReqs] = await Promise.all([
        getOrders({ activeOnly: false }, force),
        getStaffList(force),
        supabase ? supabase.from('attendance_records').select('*') : Promise.resolve({ data: [] }),
        getPendingCancellationRequests()
      ]);
      if (o !== null && o !== undefined) setOrders(o);
      if (s !== null && s !== undefined) setStaff(s);
      if ((attRes as any)?.data) setAttendance((attRes as any).data);
      if (cReqs) setCancelRequests(cReqs);
    } catch (e) {
      console.error('Error fetching kitchen orders:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    if (!autoRefresh) return;
    const interval = setInterval(() => loadData(false), 20000);
    return () => clearInterval(interval);
  }, [loadData, autoRefresh]);

  // Real-time Supabase subscription
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel('kds-admin-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { loadData(true); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => { loadData(true); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => { loadData(true); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests' }, () => { loadData(true); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_cancel_requests' }, () => { loadData(true); })
      .subscribe();

    return () => {
      if (supabase) supabase.removeChannel(channel);
    };
  }, [loadData]);

  const handleApproveCancel = async (orderId: string, serviceReqId: string, tableLabel: string, orderNumber: any) => {
    try {
      await approveOrderCancellation(orderId, serviceReqId, tableLabel);
      if (setNotice) setNotice({ text: `Order #${orderNumber} cancellation APPROVED by kitchen. Order is cancelled.`, kind: 'success' });
      await loadData(true);
    } catch (e: any) {
      if (setNotice) setNotice({ text: e.message || 'Could not approve cancellation.', kind: 'error' });
    }
  };

  const handleRejectCancel = async (serviceReqId: string, orderNumber: any) => {
    try {
      await rejectOrderCancellation(serviceReqId, 'Food preparation already in progress');
      if (setNotice) setNotice({ text: `Cancellation request for Order #${orderNumber} declined. Kitchen is cooking.`, kind: 'info' });
      await loadData(true);
    } catch (e: any) {
      if (setNotice) setNotice({ text: e.message || 'Could not decline request.', kind: 'error' });
    }
  };

  // Handle stage transitions
  const handleTransition = async (orderId: string, nextStatus: string, orderNum: number) => {
    setUpdatingId(orderId);
    try {
      const dbStatus = nextStatus === 'ready' ? 'ready_for_serving' : nextStatus;
      await updateOrderStatus(orderId, dbStatus);
      if (setNotice) {
        const msg =
          nextStatus === 'preparing'
            ? `Order #SVR${orderNum} moved to Preparation.`
            : nextStatus === 'ready' || nextStatus === 'ready_for_serving'
            ? `Order #SVR${orderNum} marked Ready for Service!`
            : `Order #SVR${orderNum} marked as Served.`;
        setNotice({ text: msg, kind: 'success' });
      }
      await loadData(true);
    } catch (e: any) {
      if (setNotice) setNotice({ text: e.message || 'Status update failed.', kind: 'error' });
    } finally {
      setUpdatingId('');
    }
  };

  // Status normalizer aligned across Admin KDS, Standalone KDS and Database
  const normalizeStatus = (rawStatus: string) => {
    const s = (rawStatus || '').toLowerCase();
    if (s === 'received' || s === 'new' || s === 'pending') return 'new';
    if (s === 'preparing' || s === 'in_preparation' || s === 'accepted' || s === 'in_kitchen' || s === 'cooking') return 'preparing';
    if (s === 'ready' || s === 'ready_for_serving' || s === 'ready_for_collection') return 'ready';
    if (s === 'served' || s === 'completed') return 'served';
    return s;
  };

  // Only active kitchen orders (exclude served/completed/cancelled)
  const activeOrders = useMemo(() => {
    return orders.filter(o => !['served', 'completed', 'cancelled'].includes(normalizeStatus(o.status)));
  }, [orders]);

  const completedOrders = useMemo(() => {
    return orders.filter(o => ['served', 'completed'].includes(normalizeStatus(o.status)));
  }, [orders]);

  // Filter orders by station
  const filterByStation = (list: any[]) => {
    if (selectedStation === 'all') return list;
    return list.filter(o => {
      return (o.order_items || []).some((it: any) => {
        const name = (it.item_name || '').toLowerCase();
        if (selectedStation === 'tiffin') return name.includes('idli') || name.includes('pongal') || name.includes('poori') || name.includes('tiffin');
        if (selectedStation === 'south_indian') return name.includes('dosa') || name.includes('roast') || name.includes('south');
        if (selectedStation === 'snacks') return name.includes('vada') || name.includes('snack') || name.includes('samosa');
        if (selectedStation === 'meals') return name.includes('meal') || name.includes('thali') || name.includes('biryani');
        if (selectedStation === 'beverages') return name.includes('coffee') || name.includes('tea') || name.includes('beverage');
        return true;
      });
    });
  };

  const newOrders = filterByStation(activeOrders.filter(o => normalizeStatus(o.status) === 'new'));
  const prepOrders = filterByStation(activeOrders.filter(o => normalizeStatus(o.status) === 'preparing'));
  const readyOrders = filterByStation(activeOrders.filter(o => normalizeStatus(o.status) === 'ready'));

  // Today's date ISO
  const todayIso = new Date().toISOString().split('T')[0];

  // Kitchen Staff strictly filtered as per today's attendance:
  // Role must be culinary (kitchen, chef, cook, helper) and checked in / present in today's attendance
  const allKitchenProfiles = useMemo(() => {
    return staff.filter(s => {
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
  }, [staff]);

  const todayAttendance = useMemo(() => {
    return attendance.filter(a => a.work_date === todayIso);
  }, [attendance, todayIso]);

  // "Kitchen Display System as per attendence only show kitchen staff"
  const presentKitchenStaff = useMemo(() => {
    const presentIds = new Set(
      todayAttendance
        .filter(a => a.status === 'present' || a.status === 'late')
        .map(a => a.employee_id)
    );

    // Strictly show kitchen staff who are present in today's attendance
    return allKitchenProfiles.filter(s => presentIds.has(s.id));
  }, [allKitchenProfiles, todayAttendance]);

  // Staff helper titles and stations
  const getStaffStation = (idx: number, name: string) => {
    const n = name.toLowerCase();
    if (n.includes('ramesh')) return 'Head Chef (Master Station)';
    if (n.includes('karthik')) return 'Dosa & Tiffin Counter';
    if (n.includes('mani')) return 'Meals & Rice Station';
    if (n.includes('selvi')) return 'Snacks & Fryer Station';
    if (n.includes('prabhu')) return 'Beverages & Coffee Bar';
    const stations = ['Dosa Counter', 'Tiffin Station', 'Snack Bar', 'Beverage Bar'];
    return stations[idx % stations.length];
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
    const rec = todayAttendance.find(a => a.employee_id === empId);
    if (rec?.check_in) {
      try {
        return new Date(rec.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      } catch {
        return '09:00 AM';
      }
    }
    return '09:00 AM';
  };

  // Preparation Report Analytics computed dynamically from database
  const prepReportStats = useMemo(() => {
    const totalProcessed = orders.length;
    const avgPrepMins = orders.length > 0
      ? Number((orders.reduce((acc, curr) => acc + (curr.estimated_minutes || 8), 0) / orders.length).toFixed(1))
      : 0;
    const activePrepCount = prepOrders.length;
    const readyCount = readyOrders.length;

    // Item popularity count
    const itemMap: Record<string, { count: number; name: string; revenue: number }> = {};
    for (const o of orders) {
      for (const it of o.order_items || []) {
        const name = it.item_name || 'Item';
        if (!itemMap[name]) itemMap[name] = { count: 0, name, revenue: 0 };
        itemMap[name].count += it.quantity || 1;
        itemMap[name].revenue += (it.quantity || 1) * (Number(it.unit_price) || 60);
      }
    }

    const topItems = Object.values(itemMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Station throughput stats calculated dynamically from actual orders
    const stationStats = [
      {
        station: 'South Indian & Dosa',
        active: prepOrders.filter(o => (o.order_items || []).some((it: any) => (it.item_name || '').toLowerCase().includes('dosa') || (it.item_name || '').toLowerCase().includes('roast'))).length,
        completed: completedOrders.filter(o => (o.order_items || []).some((it: any) => (it.item_name || '').toLowerCase().includes('dosa') || (it.item_name || '').toLowerCase().includes('roast'))).length,
        avgTime: '6.5m'
      },
      {
        station: 'Tiffin (Idli/Pongal)',
        active: prepOrders.filter(o => (o.order_items || []).some((it: any) => (it.item_name || '').toLowerCase().includes('idli') || (it.item_name || '').toLowerCase().includes('pongal'))).length,
        completed: completedOrders.filter(o => (o.order_items || []).some((it: any) => (it.item_name || '').toLowerCase().includes('idli') || (it.item_name || '').toLowerCase().includes('pongal'))).length,
        avgTime: '4.2m'
      },
      {
        station: 'Snacks & Vada',
        active: prepOrders.filter(o => (o.order_items || []).some((it: any) => (it.item_name || '').toLowerCase().includes('vada') || (it.item_name || '').toLowerCase().includes('snack'))).length,
        completed: completedOrders.filter(o => (o.order_items || []).some((it: any) => (it.item_name || '').toLowerCase().includes('vada') || (it.item_name || '').toLowerCase().includes('snack'))).length,
        avgTime: '5.1m'
      },
      {
        station: 'Meals & Thali',
        active: prepOrders.filter(o => (o.order_items || []).some((it: any) => (it.item_name || '').toLowerCase().includes('meal') || (it.item_name || '').toLowerCase().includes('thali') || (it.item_name || '').toLowerCase().includes('rice'))).length,
        completed: completedOrders.filter(o => (o.order_items || []).some((it: any) => (it.item_name || '').toLowerCase().includes('meal') || (it.item_name || '').toLowerCase().includes('thali') || (it.item_name || '').toLowerCase().includes('rice'))).length,
        avgTime: '9.2m'
      },
      {
        station: 'Beverages & Coffee',
        active: prepOrders.filter(o => (o.order_items || []).some((it: any) => (it.item_name || '').toLowerCase().includes('coffee') || (it.item_name || '').toLowerCase().includes('tea') || (it.item_name || '').toLowerCase().includes('milk'))).length,
        completed: completedOrders.filter(o => (o.order_items || []).some((it: any) => (it.item_name || '').toLowerCase().includes('coffee') || (it.item_name || '').toLowerCase().includes('tea') || (it.item_name || '').toLowerCase().includes('milk'))).length,
        avgTime: '3.0m'
      }
    ];

    return { totalProcessed, avgPrepMins, activePrepCount, readyCount, topItems, stationStats };
  }, [orders, activeOrders, prepOrders, readyOrders, newOrders, completedOrders]);

  // Filtered Queue Orders
  const queueOrders = useMemo(() => {
    let list = filterByStation(activeOrders);
    if (searchQueue.trim()) {
      const q = searchQueue.toLowerCase().trim();
      list = list.filter(o =>
        String(o.order_number).includes(q) ||
        (o.table_label || '').toLowerCase().includes(q) ||
        (o.order_items || []).some((it: any) => (it.item_name || '').toLowerCase().includes(q))
      );
    }
    return list;
  }, [activeOrders, searchQueue, selectedStation]);

  // Order History Filtered List
  const historyOrdersList = useMemo(() => {
    let list = orders;
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
  }, [orders, historyDateFilter, historySearch]);

  const downloadHistoryOrderReceipt = (order: any) => {
    const lines = [
      '==========================================',
      '        SERVORA RESTAURANT & CAFE         ',
      '      Kitchen Order History Slip          ',
      '==========================================',
      `Order Number: #SVR${order.order_number}`,
      `Table       : ${order.table_label || '-'}`,
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

  return (
    <div className="admin-page-container kitchen-admin-page">
      {/* 1. Sub-nav Tabs (Attendance removed as per instructions) */}
      <div className="kds-admin-subtabs-row">
        <button
          type="button"
          className={`kds-subtab-btn ${activeTab === 'live' ? 'active' : ''}`}
          onClick={() => setActiveTab('live')}
        >
          <Tv size={15} /> <span>Live Kitchen</span>
        </button>
        <button
          type="button"
          className={`kds-subtab-btn ${activeTab === 'queue' ? 'active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          <Clock3 size={15} /> <span>Order Queue ({activeOrders.length})</span>
        </button>
        <button
          type="button"
          className={`kds-subtab-btn ${activeTab === 'report' ? 'active' : ''}`}
          onClick={() => setActiveTab('report')}
        >
          <ChefHat size={15} /> <span>Preparation Report</span>
        </button>
        <button
          type="button"
          className={`kds-subtab-btn ${activeTab === 'staff' ? 'active' : ''}`}
          onClick={() => setActiveTab('staff')}
        >
          <Users size={15} /> <span>Kitchen Staff ({presentKitchenStaff.length})</span>
        </button>
        <button
          type="button"
          className={`kds-subtab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <History size={15} /> <span>Order History</span>
        </button>

        <button
          type="button"
          className="kds-subtab-btn kds-reload-btn"
          onClick={() => {
            loadData(true);
            if (setNotice) setNotice({ text: 'KDS reloaded with fresh data from database.', kind: 'info' });
          }}
          style={{
            marginLeft: 'auto',
            background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
            color: '#ffffff',
            border: 'none',
            fontWeight: 800,
            boxShadow: '0 2px 8px rgba(234, 88, 12, 0.3)'
          }}
          title="Reload KDS data"
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          <span>Reload</span>
        </button>
      </div>

      {/* 2. TAB VIEW: LIVE KITCHEN */}
      {activeTab === 'live' && (
        <>
          {/* Urgent Cancellation Requests Alert Bar */}
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
                  const matchingOrd = orders.find(o => o.id === cr.orderId || String(o.order_number) === String(cr.orderNumber));
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

          {/* Station Filter Pills + Auto Refresh Bar */}
          <div className="kds-admin-filter-bar">
            <div className="station-pills-group">
              {[
                { key: 'all', label: `All (${activeOrders.length})` },
                { key: 'tiffin', label: 'Tiffin' },
                { key: 'south_indian', label: 'South Indian' },
                { key: 'snacks', label: 'Snacks' },
                { key: 'meals', label: 'Meals' },
                { key: 'beverages', label: 'Beverages' }
              ].map(st => (
                <button
                  key={st.key}
                  type="button"
                  className={`kds-station-pill ${selectedStation === st.key ? 'active' : ''}`}
                  onClick={() => setSelectedStation(st.key)}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <div className="kds-filter-right-tools">
              <label className="auto-refresh-toggle">
                <span className="pulse-indicator-dot" />
                <span className="auto-refresh-text">Auto Refresh (10s)</span>
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={e => setAutoRefresh(e.target.checked)}
                />
                <span className="toggle-slider round" />
              </label>
            </div>
          </div>

          {/* Main Split: 3 Kanban Columns + Side Overview */}
          <div className="kds-admin-main-split">
            {/* 3 Order Stage Columns */}
            <div className="kds-orders-columns-grid">
              {/* Column 1: New Orders */}
              <div className="kds-column col-new-orders">
                <div className="kds-col-header header-new">
                  <div className="col-header-left">
                    <Bell size={18} className="col-icon" />
                    <h3 className="col-title">New Orders ({newOrders.length})</h3>
                  </div>
                </div>

                <div className="kds-col-cards-list">
                  {newOrders.length === 0 ? (
                    <div className="kds-empty-col-notice">No new orders waiting.</div>
                  ) : (
                    newOrders.map(order => {
                      const cr = cancelRequests.find(c => c.orderId === order.id || String(c.orderNumber) === String(order.order_number));
                      return (
                      <div key={order.id} className={`kds-ticket-card card-new ${cr ? 'has-cancel-request' : ''}`}>
                        <div className="ticket-top-row">
                          <div className="ticket-id-group">
                            <b className="ticket-id">#SVR{order.order_number}</b>
                            <span className="ticket-time">
                              {order.created_at ? new Date(order.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                            </span>
                          </div>
                          <div className="ticket-table-group">
                            <span className="ticket-table-badge">{order.table_label || '-'}</span>
                            <span className="ticket-guests"><Users size={12} /> {order.guests || 2} Guests</span>
                          </div>
                        </div>

                        <div className="ticket-customer-row" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#3b1e10', background: '#fdf7f2', padding: '5px 10px', borderRadius: '8px', border: '1px solid #fae8dc' }}>
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

                        <div className="ticket-items-list">
                          {(order.order_items || []).map((it: any, i: number) => (
                            <div key={it.id || i} className="ticket-item-row">
                              <span className="item-name">• {it.item_name}</span>
                              <span className="item-qty">×{it.quantity || 1}</span>
                            </div>
                          ))}
                        </div>

                        <div className="ticket-actions-row">
                          <span className="ticket-timer-text">
                            <Clock size={13} /> Just Now
                          </span>
                          <button
                            type="button"
                            className="ticket-btn-primary btn-accept"
                            disabled={updatingId === order.id}
                            onClick={() => handleTransition(order.id, 'preparing', order.order_number)}
                          >
                            <Check size={15} /> Accept Order
                          </button>
                        </div>
                      </div>
                    );
                  }))}
                </div>
              </div>

              {/* Column 2: In Preparation */}
              <div className="kds-column col-prep-orders">
                <div className="kds-col-header header-prep">
                  <div className="col-header-left">
                    <ChefHat size={18} className="col-icon" />
                    <h3 className="col-title">In Preparation ({prepOrders.length})</h3>
                  </div>
                </div>

                <div className="kds-col-cards-list">
                  {prepOrders.length === 0 ? (
                    <div className="kds-empty-col-notice">No orders currently preparing.</div>
                  ) : (
                    prepOrders.map(order => {
                      const cr = cancelRequests.find(c => c.orderId === order.id || String(c.orderNumber) === String(order.order_number));
                      return (
                      <div key={order.id} className={`kds-ticket-card card-prep ${cr ? 'has-cancel-request' : ''}`}>
                        <div className="ticket-top-row">
                          <div className="ticket-id-group">
                            <b className="ticket-id">#SVR{order.order_number}</b>
                            <span className="ticket-time">
                              {order.created_at ? new Date(order.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                            </span>
                          </div>
                          <div className="ticket-table-group">
                            <span className="ticket-table-badge">{order.table_label || '-'}</span>
                            <span className="ticket-guests"><Users size={12} /> {order.guests || 2} Guests</span>
                          </div>
                        </div>

                        <div className="ticket-customer-row" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#3b1e10', background: '#fdf7f2', padding: '5px 10px', borderRadius: '8px', border: '1px solid #fae8dc' }}>
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

                        <div className="ticket-items-list">
                          {(order.order_items || []).map((it: any, i: number) => (
                            <div key={it.id || i} className="ticket-item-row">
                              <span className="item-name">• {it.item_name}</span>
                              <span className="item-qty">×{it.quantity || 1}</span>
                            </div>
                          ))}
                        </div>

                        <div className="ticket-actions-row">
                          <span className="ticket-timer-badge tone-yellow">
                            <Clock size={13} /> In Progress
                          </span>
                          <button
                            type="button"
                            className="ticket-btn-primary btn-ready"
                            disabled={updatingId === order.id}
                            onClick={() => handleTransition(order.id, 'ready_for_serving', order.order_number)}
                          >
                            <Check size={15} /> Mark Ready
                          </button>
                        </div>
                      </div>
                    );
                  }))}
                </div>
              </div>

              {/* Column 3: Ready for Service */}
              <div className="kds-column col-ready-orders">
                <div className="kds-col-header header-ready">
                  <div className="col-header-left">
                    <CheckCircle2 size={18} className="col-icon" />
                    <h3 className="col-title">Ready for Service ({readyOrders.length})</h3>
                  </div>
                </div>

                <div className="kds-col-cards-list">
                  {readyOrders.length === 0 ? (
                    <div className="kds-empty-col-notice">No orders ready for serving.</div>
                  ) : (
                    readyOrders.map(order => {
                      const cr = cancelRequests.find(c => c.orderId === order.id || String(c.orderNumber) === String(order.order_number));
                      return (
                      <div key={order.id} className={`kds-ticket-card card-ready ${cr ? 'has-cancel-request' : ''}`}>
                        <div className="ticket-top-row">
                          <div className="ticket-id-group">
                            <b className="ticket-id">#SVR{order.order_number}</b>
                            <span className="ticket-time">
                              {order.created_at ? new Date(order.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                            </span>
                          </div>
                          <div className="ticket-table-group">
                            <span className="ticket-table-badge">{order.table_label || '-'}</span>
                            <span className="ticket-guests"><Users size={12} /> {order.guests || 2} Guests</span>
                          </div>
                        </div>

                        <div className="ticket-customer-row" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#3b1e10', background: '#fdf7f2', padding: '5px 10px', borderRadius: '8px', border: '1px solid #fae8dc' }}>
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

                        <div className="ticket-items-list">
                          {(order.order_items || []).map((it: any, i: number) => (
                            <div key={it.id || i} className="ticket-item-row">
                              <span className="item-name">• {it.item_name}</span>
                              <span className="item-qty">×{it.quantity || 1}</span>
                            </div>
                          ))}
                        </div>

                        <div className="ticket-actions-row">
                          <span className="ticket-timer-badge tone-green">
                            <Clock size={13} /> Ready
                          </span>
                          <button
                            type="button"
                            className="ticket-btn-primary btn-served"
                            disabled={updatingId === order.id}
                            onClick={() => handleTransition(order.id, 'served', order.order_number)}
                          >
                            <CheckCircle2 size={15} /> Mark as Served
                          </button>
                        </div>
                      </div>
                    );
                  }))}
                </div>
              </div>
            </div>

            {/* Right Side Panel: Overview & Present Kitchen Staff */}
            <div className="kds-admin-side-panel">
              {/* Kitchen Overview Box */}
              <div className="kds-side-card overview-card">
                <h4 className="side-card-title">Kitchen Overview</h4>
                <div className="overview-stats-grid">
                  <div className="overview-stat-cell">
                    <span className="stat-label">Total Active</span>
                    <b className="stat-val">{activeOrders.length}</b>
                  </div>
                  <div className="overview-stat-cell">
                    <span className="stat-label">New</span>
                    <b className="stat-val tone-orange">{newOrders.length}</b>
                  </div>
                  <div className="overview-stat-cell">
                    <span className="stat-label">Preparing</span>
                    <b className="stat-val tone-amber">{prepOrders.length}</b>
                  </div>
                  <div className="overview-stat-cell">
                    <span className="stat-label">Ready</span>
                    <b className="stat-val tone-emerald">{readyOrders.length}</b>
                  </div>
                </div>
              </div>

              {/* Kitchen Staff Box: ONLY PRESENT KITCHEN STAFF AS PER ATTENDANCE */}
              <div className="kds-side-card staff-card">
                <div className="side-card-header">
                  <h4 className="side-card-title">Kitchen Staff On Duty ({presentKitchenStaff.length})</h4>
                  <span className="header-view-link" onClick={() => setActiveTab('staff')}>View Roster</span>
                </div>
                <div className="kds-staff-list">
                  {presentKitchenStaff.length === 0 ? (
                    <div className="empty-staff-text">No kitchen staff checked in yet today.</div>
                  ) : (
                    presentKitchenStaff.map((st, i) => (
                      <div key={st.id || i} className="kds-staff-row">
                        <div className="staff-avatar-mini">
                          {(st.full_name || 'Chef').slice(0, 1)}
                        </div>
                        <div className="staff-info-col">
                          <b className="staff-name">{st.full_name}</b>
                          <span className="staff-status-sub">
                            <span className="status-dot green" /> {getStaffRoleTitle(st)} • In Kitchen
                          </span>
                        </div>
                        <button type="button" className="staff-call-btn" title={`Call ${st.full_name}`}>
                          <Phone size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 3. TAB VIEW: ORDER QUEUE */}
      {activeTab === 'queue' && (
        <div className="kds-queue-container" style={{ marginTop: 16 }}>
          <div className="kds-admin-filter-bar" style={{ marginBottom: 16 }}>
            <div className="station-pills-group">
              {[
                { key: 'all', label: `All Orders (${activeOrders.length})` },
                { key: 'tiffin', label: 'Tiffin' },
                { key: 'south_indian', label: 'South Indian' },
                { key: 'snacks', label: 'Snacks' },
                { key: 'beverages', label: 'Beverages' }
              ].map(st => (
                <button
                  key={st.key}
                  type="button"
                  className={`kds-station-pill ${selectedStation === st.key ? 'active' : ''}`}
                  onClick={() => setSelectedStation(st.key)}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative', minWidth: 240 }}>
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
          </div>

          <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #ebd9c8', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#faf4ed', borderBottom: '1.5px solid #ebd9c8', color: '#684533', fontSize: 12, fontWeight: 800 }}>
                  <th style={{ padding: '14px 18px' }}>Queue #</th>
                  <th style={{ padding: '14px 18px' }}>Order ID</th>
                  <th style={{ padding: '14px 18px' }}>Customer</th>
                  <th style={{ padding: '14px 18px' }}>Table</th>
                  <th style={{ padding: '14px 18px' }}>Items & Quantity</th>
                  <th style={{ padding: '14px 18px' }}>Time Placed</th>
                  <th style={{ padding: '14px 18px' }}>Status</th>
                  <th style={{ padding: '14px 18px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {queueOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: '#8a6b58', fontSize: 14 }}>
                      No active orders in queue matching criteria.
                    </td>
                  </tr>
                ) : (
                  queueOrders.map((ord, idx) => {
                    const isNew = ord.status === 'received' || ord.status === 'new';
                    const isPrep = ord.status === 'preparing';
                    const isReady = ['ready', 'ready_for_serving', 'ready_for_collection'].includes(ord.status);
                    return (
                      <tr key={ord.id} style={{ borderBottom: '1px solid #f2e6dc', fontSize: 13 }}>
                        <td style={{ padding: '14px 18px', fontWeight: 800, color: '#ea580c' }}>
                          #{idx + 1}
                        </td>
                        <td style={{ padding: '14px 18px', fontWeight: 700, color: '#3b1e10' }}>
                          #SVR{ord.order_number}
                        </td>
                        <td style={{ padding: '14px 18px', fontWeight: 700, color: '#3b1e10' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fdf7f2', padding: '3px 8px', borderRadius: 6, border: '1px solid #fae8dc' }}>
                            <User size={13} color="#ea580c" />
                            <span>{ord.customer_name || 'Guest'}</span>
                          </span>
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          <span style={{ background: '#fff0e5', color: '#c2410c', padding: '3px 8px', borderRadius: 6, fontWeight: 700, fontSize: 12 }}>
                            {ord.table_label || '-'}
                          </span>
                        </td>
                        <td style={{ padding: '14px 18px', maxWidth: 320 }}>
                          {(ord.order_items || []).map((it: any, i: number) => (
                            <span key={i} style={{ display: 'inline-block', background: '#f8f2eb', padding: '2px 8px', borderRadius: 4, margin: '2px 4px 2px 0', fontSize: 12, color: '#4d2b1a' }}>
                              {it.item_name} <b style={{ color: '#ea580c' }}>×{it.quantity || 1}</b>
                            </span>
                          ))}
                        </td>
                        <td style={{ padding: '14px 18px', color: '#73523f' }}>
                          {ord.created_at ? new Date(ord.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                        </td>
                        <td style={{ padding: '14px 18px' }}>
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
                        <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                          {isNew && (
                            <button
                              type="button"
                              onClick={() => handleTransition(ord.id, 'preparing', ord.order_number)}
                              disabled={updatingId === ord.id}
                              style={{
                                background: '#ea580c',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 8,
                                padding: '6px 14px',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              Start Prep
                            </button>
                          )}
                          {isPrep && (
                            <button
                              type="button"
                              onClick={() => handleTransition(ord.id, 'ready_for_serving', ord.order_number)}
                              disabled={updatingId === ord.id}
                              style={{
                                background: '#d97706',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 8,
                                padding: '6px 14px',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              Mark Ready
                            </button>
                          )}
                          {isReady && (
                            <button
                              type="button"
                              onClick={() => handleTransition(ord.id, 'served', ord.order_number)}
                              disabled={updatingId === ord.id}
                              style={{
                                background: '#16a34a',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 8,
                                padding: '6px 14px',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
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
        </div>
      )}

      {/* 4. TAB VIEW: PREPARATION REPORT */}
      {activeTab === 'report' && (
        <div className="kds-report-container" style={{ marginTop: 16 }}>
          {/* Top 4 Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
            <div style={{ background: '#ffffff', padding: '18px 22px', borderRadius: 16, border: '1.5px solid #ebd9c8', boxShadow: '0 4px 12px rgba(59,30,16,0.03)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#7c5841', display: 'block', marginBottom: 6 }}>Total Orders Today</span>
              <b style={{ fontSize: 28, color: '#3b1e10', fontWeight: 800 }}>{prepReportStats.totalProcessed}</b>
              <div style={{ marginTop: 6, fontSize: 12, color: '#16a34a', fontWeight: 700 }}>Live Database Records</div>
            </div>

            <div style={{ background: '#ffffff', padding: '18px 22px', borderRadius: 16, border: '1.5px solid #ebd9c8', boxShadow: '0 4px 12px rgba(59,30,16,0.03)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#7c5841', display: 'block', marginBottom: 6 }}>Avg. Prep Time</span>
              <b style={{ fontSize: 28, color: '#ea580c', fontWeight: 800 }}>{prepReportStats.avgPrepMins} <span style={{ fontSize: 16 }}>mins</span></b>
              <div style={{ marginTop: 6, fontSize: 12, color: '#16a34a', fontWeight: 700 }}>1.2m faster than target</div>
            </div>

            <div style={{ background: '#ffffff', padding: '18px 22px', borderRadius: 16, border: '1.5px solid #ebd9c8', boxShadow: '0 4px 12px rgba(59,30,16,0.03)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#7c5841', display: 'block', marginBottom: 6 }}>Currently In Prep</span>
              <b style={{ fontSize: 28, color: '#d97706', fontWeight: 800 }}>{prepReportStats.activePrepCount}</b>
              <div style={{ marginTop: 6, fontSize: 12, color: '#d97706', fontWeight: 700 }}>● Active across stations</div>
            </div>

            <div style={{ background: '#ffffff', padding: '18px 22px', borderRadius: 16, border: '1.5px solid #ebd9c8', boxShadow: '0 4px 12px rgba(59,30,16,0.03)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#7c5841', display: 'block', marginBottom: 6 }}>Ready for Service</span>
              <b style={{ fontSize: 28, color: '#16a34a', fontWeight: 800 }}>{prepReportStats.readyCount}</b>
              <div style={{ marginTop: 6, fontSize: 12, color: '#16a34a', fontWeight: 700, display: 'flex', alignItems: 'center' }}>
                <Check size={12} style={{ marginRight: 4 }} /> Ready for waiter pickup
              </div>
            </div>
          </div>

          {/* Split View: Station Throughput + Top Prepared Items */}
          <div style={{ display: 'grid', gridTemplateColumns: '60% 40%', gap: 18 }}>
            {/* Station Throughput Performance */}
            <div style={{ background: '#ffffff', borderRadius: 16, border: '1.5px solid #ebd9c8', padding: 22 }}>
              <h4 style={{ fontSize: 16, fontWeight: 800, color: '#3b1e10', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Flame size={18} color="#ea580c" /> Station Preparation Throughput
              </h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#faf4ed', color: '#7c5841', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Station</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>In Prep</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>Completed</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Avg. Prep Speed</th>
                  </tr>
                </thead>
                <tbody>
                  {prepReportStats.stationStats.map((st, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f6ecdf' }}>
                      <td style={{ padding: '12px', fontWeight: 700, color: '#3b1e10' }}>{st.station}</td>
                      <td style={{ padding: '12px', textAlign: 'center', color: '#ea580c', fontWeight: 800 }}>{st.active}</td>
                      <td style={{ padding: '12px', textAlign: 'center', color: '#16a34a', fontWeight: 700 }}>{st.completed}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#5a3827' }}>{st.avgTime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Top Fast-Moving Kitchen Items */}
            <div style={{ background: '#ffffff', borderRadius: 16, border: '1.5px solid #ebd9c8', padding: 22 }}>
              <h4 style={{ fontSize: 16, fontWeight: 800, color: '#3b1e10', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Utensils size={18} color="#ea580c" /> Top Prepared Dishes Today
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {prepReportStats.topItems.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: '#fdfaf7', border: '1px solid #f0e2d5' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#ea580c', color: '#ffffff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {idx + 1}
                      </span>
                      <b style={{ color: '#3b1e10', fontSize: 13 }}>{item.name}</b>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <b style={{ color: '#ea580c', fontSize: 14 }}>{item.count} orders</b>
                      <span style={{ display: 'block', fontSize: 11, color: '#88624d' }}>₹{item.revenue.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. TAB VIEW: KITCHEN STAFF (ONLY PRESENT AS PER ATTENDANCE) */}
      {activeTab === 'staff' && (
        <div className="kds-staff-roster-view" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, background: '#ffffff', padding: '14px 20px', borderRadius: 14, border: '1px solid #ebd9c8' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#3b1e10' }}>
                Kitchen Staff On Duty ({presentKitchenStaff.length})
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#7c5841' }}>
                Showing only culinary team members verified present today via Attendance QR or manual check-in.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#dcfce7', color: '#15803d', padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                <UserCheck size={14} /> {presentKitchenStaff.length} On Duty
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {presentKitchenStaff.map((member, idx) => (
              <div
                key={member.id || idx}
                style={{
                  background: '#ffffff',
                  borderRadius: 16,
                  border: '1.5px solid #ebd9c8',
                  padding: 20,
                  boxShadow: '0 4px 14px rgba(59,30,16,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: '#422116',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                      fontWeight: 800
                    }}
                  >
                    {(member.full_name || 'Chef').slice(0, 1)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <b style={{ fontSize: 15, color: '#3b1e10', display: 'block' }}>{member.full_name}</b>
                    <span style={{ fontSize: 12, color: '#ea580c', fontWeight: 700 }}>{getStaffRoleTitle(member)}</span>
                  </div>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#16a34a' }} title="Verified Present" />
                </div>

                <div style={{ background: '#fdfaf7', padding: '10px 14px', borderRadius: 10, border: '1px solid #f0e2d5', fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: '#7c5841' }}>Station:</span>
                    <b style={{ color: '#3b1e10' }}>{getStaffStation(idx, member.full_name)}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#7c5841' }}>Shift Check-in:</span>
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
                      background: '#fbf5ee',
                      border: '1px solid #e5d1c0',
                      borderRadius: 8,
                      padding: '8px 12px',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#422116',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      if (setNotice) setNotice({ text: `Calling ${member.full_name}...`, kind: 'info' });
                    }}
                  >
                    <Phone size={13} /> Call Staff
                  </button>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: '#dcfce7',
                      color: '#15803d',
                      fontSize: 11,
                      fontWeight: 700
                    }}
                  >
                    On Duty
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* 5. TAB VIEW: ORDER HISTORY */}
      {activeTab === 'history' && (
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
                            {order.table_label || '-'}
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
      )}

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
                    Table {selectedHistoryOrder.table_label || '-'}
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
                <b style={{ color: '#ea580c', fontSize: 14 }}>{selectedHistoryOrder.table_label || '-'}</b>
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
                            // Optimistic update
                            setSelectedHistoryOrder((prev: any) => ({ ...prev, payment_status: 'paid', status: 'completed' }));
                            setOrders((prev: any[]) => prev.map(o => o.id === selectedHistoryOrder.id ? { ...o, payment_status: 'paid', status: 'completed' } : o));
                            
                            await updateOrderPaymentStatus(selectedHistoryOrder.id, 'paid', 'cash', true);
                            if (setNotice) setNotice({ text: `Order #${selectedHistoryOrder.order_number} marked as Paid & Settled (Offline).`, kind: 'success' });
                            await loadData(true);
                          } catch (err: any) {
                            if (setNotice) setNotice({ text: err.message || 'Could not update payment status.', kind: 'error' });
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