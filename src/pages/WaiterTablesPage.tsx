import { useEffect, useState } from 'react';
import {
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Droplet,
  ExternalLink,
  Flame,
  LayoutGrid,
  Menu,
  Minus,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  User,
  Users,
  Utensils,
  X
} from 'lucide-react';
import { DEFAULT_MENU, DEFAULT_TABLES, getCached, getMenu, getOrders, getTables } from '../lib/data';
import { money, supabase } from '../lib/supabase';

export function WaiterTablesPage({
  setNotice,
  globalSearch
}: {
  setNotice?: (n: any) => void;
  globalSearch?: string;
}) {
  const [tables, setTables] = useState<any[]>(() => getCached<any[]>('tables') || DEFAULT_TABLES);
  const [orders, setOrders] = useState<any[]>(() => getCached<any[]>('orders_all') || []);
  const [menuItems, setMenuItems] = useState<any[]>(() => getCached<any[]>('menu_available') || DEFAULT_MENU);
  const [requests, setRequests] = useState<any[]>([]);
  const [selectedTableNum, setSelectedTableNum] = useState<string>('T01');
  const [loading, setLoading] = useState(false);
  const [searchTable, setSearchTable] = useState(globalSearch || '');

  // Modals
  const [viewOrderModalOpen, setViewOrderModalOpen] = useState(false);
  const [addItemsModalOpen, setAddItemsModalOpen] = useState(false);
  const [cart, setCart] = useState<{ [itemId: string]: number }>({});
  const [itemNotes, setItemNotes] = useState<{ [itemId: string]: string }>({});
  const [itemSearch, setItemSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAllRequests, setShowAllRequests] = useState(false);

  useEffect(() => {
    if (globalSearch !== undefined) {
      setSearchTable(globalSearch);
    }
  }, [globalSearch]);

  // Load all data
  const loadData = async (force = false) => {
    try {
      const [tData, oData, mData] = await Promise.all([
        getTables(force),
        getOrders({}, force),
        getMenu(false, force)
      ]);
      if (tData !== null && tData !== undefined) setTables(tData);
      if (oData !== null && oData !== undefined) setOrders(oData);
      if (mData !== null && mData !== undefined) setMenuItems(mData);

      // Fetch service requests
      if (supabase) {
        const { data: sReqs } = await supabase
          .from('service_requests')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20);
        setRequests(sReqs || []);
      }
    } catch (e) {
      console.error('Error loading waiter data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Setup Supabase Realtime Subscription for service requests & orders
    if (!supabase) return;
    const channel = supabase
      .channel('waiter-tables-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dining_tables' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      if (supabase) supabase.removeChannel(channel);
    };
  }, []);

  // Find currently selected table
  const selectedTable = tables.find(t => t.table_number === selectedTableNum) || tables[0] || {
    table_number: 'T04',
    capacity: 3,
    status: 'occupied'
  };

  // Find active order for selected table
  const activeOrderForTable = orders.find(
    o => o.table_label === selectedTable.table_number && o.status !== 'completed' && o.status !== 'cancelled'
  ) || orders.find(o => o.table_label === selectedTable.table_number);

  // Calculate dining duration in minutes
  const calculateDuration = () => {
    if (!activeOrderForTable?.created_at) return 25;
    const diff = Math.floor((new Date().getTime() - new Date(activeOrderForTable.created_at).getTime()) / 60000);
    return Math.max(diff, 1);
  };

  // Format Time Ago
  const formatTimeAgo = (dateStr: string) => {
    if (!dateStr) return 'Just now';
    const seconds = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 45) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hr ago`;
  };

  // Handle Quick Guest Request Trigger ("Need Something?")
  const handleQuickRequest = async (type: 'call_waiter' | 'water' | 'plates' | 'bill') => {
    if (!supabase) return;
    try {
      const typeLabels: Record<string, string> = {
        call_waiter: 'Call waiter',
        water: 'Water bottle',
        plates: 'Extra plates',
        bill: 'Request bill'
      };

      const restRes = await supabase.from('restaurants').select('id').limit(1).maybeSingle();
      const restaurantId = restRes.data?.id || 'a0000000-0000-0000-0000-000000000001';

      const { error } = await supabase.from('service_requests').insert({
        restaurant_id: restaurantId,
        table_id: selectedTable.id,
        table_label: selectedTable.table_number,
        request_type: type,
        status: 'new',
        note: `Guest requested ${typeLabels[type]} for Table ${selectedTable.table_number}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      if (error) throw error;
      if (setNotice) setNotice({ text: `Requested ${typeLabels[type]} for Table ${selectedTable.table_number}!`, kind: 'success' });
      await loadData();
    } catch (err: any) {
      if (setNotice) setNotice({ text: err.message || 'Could not send request.', kind: 'error' });
    }
  };

  // Acknowledge Service Request
  const handleAcknowledgeRequest = async (reqId: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('service_requests')
        .update({ status: 'in_progress', updated_at: new Date().toISOString() })
        .eq('id', reqId);
      if (error) throw error;
      if (setNotice) setNotice({ text: 'Request acknowledged and in progress.', kind: 'success' });
      await loadData();
    } catch (err: any) {
      if (setNotice) setNotice({ text: err.message || 'Error updating request.', kind: 'error' });
    }
  };

  // Complete Service Request
  const handleCompleteRequest = async (reqId: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('service_requests')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', reqId);
      if (error) throw error;
      if (setNotice) setNotice({ text: 'Request marked as completed!', kind: 'success' });
      await loadData();
    } catch (err: any) {
      if (setNotice) setNotice({ text: err.message || 'Error completing request.', kind: 'error' });
    }
  };

  // Mark Table Clean & Available
  const handleMarkClean = async () => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('dining_tables')
        .update({ status: 'available' })
        .eq('id', selectedTable.id);
      if (error) throw error;
      if (setNotice) setNotice({ text: `Table ${selectedTable.table_number} marked clean & available!`, kind: 'success' });
      await loadData();
    } catch (err: any) {
      if (setNotice) setNotice({ text: err.message || 'Could not update table.', kind: 'error' });
    }
  };

  // Request Bill for Table
  const handleRequestBillAction = async () => {
    if (!supabase) return;
    try {
      await Promise.all([
        supabase.from('dining_tables').update({ status: 'bill_requested' }).eq('id', selectedTable.id),
        handleQuickRequest('bill')
      ]);
      if (setNotice) setNotice({ text: `Bill requested for Table ${selectedTable.table_number}.`, kind: 'success' });
      await loadData();
    } catch (err: any) {
      if (setNotice) setNotice({ text: err.message || 'Could not request bill.', kind: 'error' });
    }
  };

  // Add Items to Order
  const handleSaveAddedItems = async () => {
    if (!activeOrderForTable) {
      if (setNotice) setNotice({ text: 'No active order found for this table. Place a new order first.', kind: 'error' });
      return;
    }
    const itemIds = Object.keys(cart).filter(id => cart[id] > 0);
    if (itemIds.length === 0) {
      if (setNotice) setNotice({ text: 'Please select at least 1 item to add.', kind: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      let addSubtotal = 0;
      const orderItemsToInsert = itemIds.map(id => {
        const item = menuItems.find(m => m.id === id);
        const qty = cart[id];
        const price = Number(item?.price || 0);
        addSubtotal += price * qty;
        return {
          order_id: activeOrderForTable.id,
          menu_item_id: id,
          item_name: item?.name || 'Dish Item',
          quantity: qty,
          unit_price: price,
          line_total: price * qty,
          status: 'preparing',
          note: itemNotes[id] || '',
          created_at: new Date().toISOString()
        };
      });

      if (supabase) {
        const { error: insErr } = await supabase.from('order_items').insert(orderItemsToInsert);
        if (insErr) throw insErr;

        // Recalculate order totals
        const newSubtotal = Number(activeOrderForTable.subtotal || 0) + addSubtotal;
        const newTax = Number((newSubtotal * 0.05).toFixed(2));
        const newTotal = Number((newSubtotal + newTax).toFixed(2));

        await supabase
          .from('orders')
          .update({
            subtotal: newSubtotal,
            tax: newTax,
            total: newTotal,
            status: 'preparing',
            updated_at: new Date().toISOString()
          })
          .eq('id', activeOrderForTable.id);
      }

      if (setNotice) setNotice({ text: `Added ${itemIds.length} dishes to Order #${activeOrderForTable.order_number}!`, kind: 'success' });
      setCart({});
      setItemNotes({});
      setAddItemsModalOpen(false);
      await loadData();
    } catch (err: any) {
      if (setNotice) setNotice({ text: err.message || 'Could not add items to order.', kind: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter Tables
  const filteredTables = tables.filter(t => {
    if (!searchTable.trim()) return true;
    const q = searchTable.toLowerCase().trim();
    return (t.table_number || '').toLowerCase().includes(q);
  });

  // Filter Active Requests
  const activeRequests = requests.filter(r => showAllRequests ? true : r.status !== 'completed');

  // Categories for Menu Add Items
  const categories = ['all', ...Array.from(new Set(menuItems.map(m => m.category_name || 'Main')))];
  const filteredMenuItems = menuItems.filter(m => {
    if (selectedCategory !== 'all' && (m.category_name || 'Main') !== selectedCategory) return false;
    if (itemSearch.trim()) {
      const q = itemSearch.toLowerCase().trim();
      return m.name.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="waiter-tables-container">
      {/* 1. TOP CAROUSEL OF ASSIGNED TABLES (Matches Screenshot 100%) */}
      <div className="waiter-tables-carousel">
        {filteredTables.map(t => {
          const isSelected = t.table_number === selectedTable.table_number;
          const ord = orders.find(
            o => o.table_label === t.table_number && o.status !== 'completed' && o.status !== 'cancelled'
          ) || orders.find(o => o.table_label === t.table_number);

          const status = (t.status || 'available').toLowerCase();

          return (
            <div
              key={t.id || t.table_number}
              className={`waiter-table-card ${isSelected ? 'selected' : ''}`}
              onClick={() => setSelectedTableNum(t.table_number)}
            >
              <div className="table-card-top-row">
                <h3 className="table-card-id">{t.table_number}</h3>
                {isSelected && (
                  <span className="table-selected-check-badge">
                    <Check size={14} strokeWidth={3} />
                  </span>
                )}
              </div>

              <div className="table-card-guests-row">
                <Users size={14} />
                <span>{t.capacity || 4} Guests</span>
              </div>

              <div className={`table-status-pill ${status}`}>
                {status === 'bill_requested' ? (
                  <>
                    <Check size={12} strokeWidth={2.5} />
                    <span>Bill Requested</span>
                  </>
                ) : status === 'occupied' ? (
                  <>
                    <span className="status-dot" />
                    <span>Occupied</span>
                  </>
                ) : status === 'cleaning' ? (
                  <>
                    <span className="status-dot" />
                    <span>Cleaning</span>
                  </>
                ) : status === 'reserved' ? (
                  <>
                    <span className="status-dot" />
                    <span>Reserved</span>
                  </>
                ) : (
                  <>
                    <span className="status-dot" />
                    <span>Available</span>
                  </>
                )}
              </div>

              <span className="table-card-order-num">
                {ord ? `Order: #SVR${ord.order_number}` : '—'}
              </span>
            </div>
          );
        })}
      </div>

      {/* 2. SPLIT SECTION: TABLE DETAILS (65%) + GUEST REQUESTS (35%) */}
      <div className="waiter-split-layout">
        {/* Left Side: Table Details */}
        <div className="waiter-details-panel">
          <div className="waiter-details-header">
            <div className="waiter-details-title-group">
              <Utensils size={22} />
              <h2 className="waiter-details-title">
                Table {selectedTable.table_number} – Details
              </h2>
            </div>
            <div className={`table-status-pill ${(selectedTable.status || 'available').toLowerCase()}`}>
              <span className="status-dot" />
              <span>
                {selectedTable.status === 'occupied'
                  ? 'Occupied'
                  : selectedTable.status === 'bill_requested'
                  ? 'Bill Requested'
                  : selectedTable.status === 'cleaning'
                  ? 'Cleaning'
                  : selectedTable.status === 'reserved'
                  ? 'Reserved'
                  : 'Available'}
              </span>
            </div>
          </div>

          {/* 3 Metric Summary Boxes */}
          <div className="waiter-metrics-row">
            <div className="waiter-metric-box">
              <div className="waiter-metric-icon-wrap">
                <Users size={20} />
              </div>
              <div className="waiter-metric-content">
                <b className="waiter-metric-val">{selectedTable.capacity || 3} Guests</b>
                <span className="waiter-metric-lbl">Current Guests</span>
              </div>
            </div>

            <div className="waiter-metric-box">
              <div className="waiter-metric-icon-wrap">
                <Clock size={20} />
              </div>
              <div className="waiter-metric-content">
                <b className="waiter-metric-val">
                  {selectedTable.status === 'occupied' || selectedTable.status === 'bill_requested'
                    ? `${calculateDuration()} min`
                    : '0 min'}
                </b>
                <span className="waiter-metric-lbl">Dining Duration</span>
              </div>
            </div>

            <div className="waiter-metric-box">
              <div className="waiter-metric-icon-wrap">
                <Receipt size={20} />
              </div>
              <div className="waiter-metric-content">
                <b className="waiter-metric-val">
                  {activeOrderForTable ? `#SVR${activeOrderForTable.order_number}` : 'No Active Order'}
                </b>
                <span className="waiter-metric-lbl">Current Order</span>
              </div>
            </div>
          </div>

          {/* Feature 5: Need something? Section */}
          <div className="waiter-sub-section">
            <div className="waiter-section-heading-row">
              <Bell size={18} />
              <h4 className="waiter-section-heading">Need something?</h4>
            </div>

            <div className="waiter-quick-requests-grid">
              <button
                type="button"
                className="quick-request-pill-btn icon-bell"
                onClick={() => handleQuickRequest('call_waiter')}
                title="Send Call Waiter Request"
              >
                <Bell size={16} />
                <span>Call waiter</span>
              </button>

              <button
                type="button"
                className="quick-request-pill-btn icon-water"
                onClick={() => handleQuickRequest('water')}
                title="Request Water"
              >
                <Droplet size={16} />
                <span>Water</span>
              </button>

              <button
                type="button"
                className="quick-request-pill-btn icon-plates"
                onClick={() => handleQuickRequest('plates')}
                title="Request Extra Plates"
              >
                <Utensils size={16} />
                <span>Extra plates</span>
              </button>

              <button
                type="button"
                className="quick-request-pill-btn icon-bill"
                onClick={() => handleQuickRequest('bill')}
                title="Request Bill"
              >
                <Receipt size={16} />
                <span>Request bill</span>
              </button>
            </div>
          </div>

          {/* Quick Actions Row */}
          <div className="waiter-sub-section">
            <div className="waiter-section-heading-row">
              <Sparkles size={18} />
              <h4 className="waiter-section-heading">Quick Actions</h4>
            </div>

            <div className="waiter-quick-actions-grid">
              <button
                type="button"
                className="waiter-action-btn btn-view-order"
                onClick={() => {
                  if (!activeOrderForTable) {
                    if (setNotice) setNotice({ text: 'No active order to view for this table.', kind: 'info' });
                    return;
                  }
                  setViewOrderModalOpen(true);
                }}
              >
                <Utensils size={16} />
                <span>View Order</span>
              </button>

              <button
                type="button"
                className="waiter-action-btn btn-add-items"
                onClick={() => setAddItemsModalOpen(true)}
              >
                <Plus size={16} />
                <span>Add Items</span>
              </button>

              <button
                type="button"
                className="waiter-action-btn btn-req-bill"
                onClick={handleRequestBillAction}
              >
                <Receipt size={16} />
                <span>Request Bill</span>
              </button>

              <button
                type="button"
                className="waiter-action-btn btn-clean"
                onClick={handleMarkClean}
              >
                <Sparkles size={16} />
                <span>Mark Table Clean</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Guest Requests (Feature 5) */}
        <div className="waiter-requests-panel">
          <div className="waiter-requests-header">
            <div className="waiter-requests-title-group">
              <Bell size={20} />
              <h3 className="waiter-requests-title">Guest Requests</h3>
            </div>
            <button
              type="button"
              className="waiter-view-all-link"
              onClick={() => setShowAllRequests(!showAllRequests)}
            >
              <span>{showAllRequests ? 'View Active' : 'View All'}</span>
              <span>&rarr;</span>
            </button>
          </div>

          <div className="waiter-requests-list">
            {activeRequests.length === 0 ? (
              <div className="empty-requests-notice">
                <CheckCircle2 size={32} />
                <b>All Caught Up!</b>
                <span>No pending service requests for your tables.</span>
              </div>
            ) : (
              activeRequests.map(req => {
                const isWater = req.request_type === 'water';
                const isPlates = req.request_type === 'plates';
                const isBill = req.request_type === 'bill';
                const isCallWaiter = req.request_type === 'call_waiter';

                const title = isWater
                  ? 'Water requested'
                  : isPlates
                  ? 'Extra plates'
                  : isBill
                  ? 'Bill requested'
                  : 'Waiter called';

                return (
                  <div key={req.id} className="waiter-request-row">
                    <div className="request-item-left">
                      <div className={`request-item-icon-circle ${req.request_type}`}>
                        {isWater ? (
                          <Droplet size={18} />
                        ) : isPlates ? (
                          <Utensils size={18} />
                        ) : isBill ? (
                          <Receipt size={18} />
                        ) : (
                          <Bell size={18} />
                        )}
                      </div>

                      <div className="request-item-text">
                        <b className="request-title-bold">{title}</b>
                        <span className="request-meta-subtitle">
                          {req.table_label || 'T01'} &bull; {formatTimeAgo(req.created_at)}
                        </span>
                      </div>
                    </div>

                    <div className="request-item-right">
                      {req.status === 'new' ? (
                        <button
                          type="button"
                          className="request-action-btn btn-ack"
                          onClick={() => handleAcknowledgeRequest(req.id)}
                        >
                          <Check size={14} /> <span>Acknowledge</span>
                        </button>
                      ) : req.status === 'in_progress' ? (
                        <button
                          type="button"
                          className="request-action-btn btn-done"
                          onClick={() => handleCompleteRequest(req.id)}
                        >
                          <CheckCircle2 size={14} /> <span>Mark completed</span>
                        </button>
                      ) : (
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#16a34a' }}>
                          Completed
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* VIEW ORDER MODAL */}
      {viewOrderModalOpen && activeOrderForTable && (
        <div className="waiter-modal-backdrop" onClick={() => setViewOrderModalOpen(false)}>
          <div className="waiter-modal-box" onClick={e => e.stopPropagation()}>
            <div className="waiter-modal-header">
              <h3>Order Details – Table {selectedTable.table_number}</h3>
              <button
                type="button"
                className="waiter-modal-close-btn"
                onClick={() => setViewOrderModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="waiter-modal-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '18px', color: '#1e0c04' }}>
                    #SVR{activeOrderForTable.order_number}
                  </h4>
                  <small style={{ color: '#8c6e58' }}>
                    Guest: {activeOrderForTable.customer_name || 'Dine-In Customer'} ({activeOrderForTable.customer_phone || '—'})
                  </small>
                </div>
                <span className="table-status-pill occupied">
                  {activeOrderForTable.status?.toUpperCase() || 'PREPARING'}
                </span>
              </div>

              <div style={{ borderTop: '1px solid #ebdcd0', paddingTop: '14px' }}>
                <b style={{ color: '#1e0c04', fontSize: '14px' }}>Ordered Items:</b>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                  {(activeOrderForTable.order_items || []).map((it: any, idx: number) => (
                    <div
                      key={it.id || idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        background: '#fffbf7',
                        borderRadius: '12px',
                        border: '1px solid #f3e5d8'
                      }}
                    >
                      <div>
                        <b style={{ color: '#1e0c04', fontSize: '14px' }}>{it.item_name}</b>
                        <div style={{ fontSize: '12px', color: '#8c6e58' }}>
                          ₹{it.unit_price} &times; {it.quantity} {it.note ? `• (${it.note})` : ''}
                        </div>
                      </div>
                      <b style={{ color: '#ea580c', fontSize: '15px' }}>
                        ₹{Number(it.line_total || it.unit_price * it.quantity).toFixed(2)}
                      </b>
                    </div>
                  ))}
                </div>
              </div>

              {/* Breakdown */}
              <div
                style={{
                  background: '#fcf8f4',
                  borderRadius: '14px',
                  padding: '14px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span>Subtotal:</span>
                  <b>₹{Number(activeOrderForTable.subtotal || 0).toFixed(2)}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span>GST (5%):</span>
                  <b>₹{Number(activeOrderForTable.tax || 0).toFixed(2)}</b>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '16px',
                    fontWeight: 800,
                    color: '#ea580c',
                    borderTop: '1px solid #ebdcd0',
                    paddingTop: '6px'
                  }}
                >
                  <span>Total Payable:</span>
                  <span>₹{Number(activeOrderForTable.total || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD ITEMS MODAL */}
      {addItemsModalOpen && (
        <div className="waiter-modal-backdrop" onClick={() => setAddItemsModalOpen(false)}>
          <div className="waiter-modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '720px' }}>
            <div className="waiter-modal-header">
              <div>
                <h3>Add Dishes – Table {selectedTable.table_number}</h3>
                <small style={{ color: '#8c6e58' }}>
                  Select items to add to Order #{activeOrderForTable?.order_number || 'New'}
                </small>
              </div>
              <button
                type="button"
                className="waiter-modal-close-btn"
                onClick={() => setAddItemsModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="waiter-modal-body">
              {/* Search + Category Tabs */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#8c6e58' }} />
                  <input
                    type="text"
                    placeholder="Search dishes (e.g. Dosa, Coffee)..."
                    value={itemSearch}
                    onChange={e => setItemSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 36px',
                      borderRadius: '12px',
                      border: '1.5px solid #ebdcd0',
                      outline: 'none',
                      fontSize: '13.5px'
                    }}
                  />
                </div>
              </div>

              {/* Menu Items List */}
              <div style={{ maxHeight: '380px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredMenuItems.map(m => {
                  const qty = cart[m.id] || 0;
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: '12px',
                        background: '#ffffff',
                        border: '1px solid #ebdcd0'
                      }}
                    >
                      <div>
                        <b style={{ color: '#1e0c04', fontSize: '14px' }}>{m.name}</b>
                        <div style={{ fontSize: '12px', color: '#ea580c', fontWeight: 700 }}>
                          ₹{m.price}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {qty > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => setCart(prev => ({ ...prev, [m.id]: Math.max(0, (prev[m.id] || 0) - 1) }))}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: '8px',
                                border: '1px solid #ea580c',
                                background: '#fff',
                                color: '#ea580c',
                                cursor: 'pointer'
                              }}
                            >
                              -
                            </button>
                            <b style={{ minWidth: 20, textAlign: 'center', color: '#1e0c04' }}>{qty}</b>
                            <button
                              type="button"
                              onClick={() => setCart(prev => ({ ...prev, [m.id]: (prev[m.id] || 0) + 1 }))}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: '8px',
                                border: 'none',
                                background: '#ea580c',
                                color: '#fff',
                                cursor: 'pointer'
                              }}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCart(prev => ({ ...prev, [m.id]: 1 }))}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '10px',
                              border: '1.5px solid #ea580c',
                              background: '#fff',
                              color: '#ea580c',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            + Add
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Submit */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #ebdcd0', paddingTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => setAddItemsModalOpen(false)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '12px',
                    border: '1px solid #ebdcd0',
                    background: '#fff',
                    color: '#6d4a36',
                    cursor: 'pointer',
                    fontWeight: 700
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSaveAddedItems}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '12px',
                    border: 'none',
                    background: '#ea580c',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: 700,
                    boxShadow: '0 4px 14px rgba(234, 88, 12, 0.35)'
                  }}
                >
                  {isSubmitting ? 'Submitting to Kitchen...' : 'Confirm & Send to Kitchen'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
