import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  Clock,
  Eye,
  Filter,
  Flame,
  MoreVertical,
  Download,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  User,
  Users,
  Utensils,
  X
} from 'lucide-react';
import { DEFAULT_MENU, getCached, getMenu, getOrders, updateOrderStatus } from '../lib/data';
import { money, supabase } from '../lib/supabase';

// High-resolution authentic food imagery map for South Indian cuisine
const ITEM_IMAGE_MAP: Record<string, string> = {
  'Pongal': 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=240&auto=format&fit=crop&q=80',
  'Ghee Roast Dosa': 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=240&auto=format&fit=crop&q=80',
  'Masala Dosa': 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=240&auto=format&fit=crop&q=80',
  'Special Masala Dosa': 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=240&auto=format&fit=crop&q=80',
  'Idli (2 Pcs)': 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=240&auto=format&fit=crop&q=80',
  'Idli (2)': 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=240&auto=format&fit=crop&q=80',
  'Idli': 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=240&auto=format&fit=crop&q=80',
  'Vada': 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=240&auto=format&fit=crop&q=80',
  'Filter Coffee': 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=240&auto=format&fit=crop&q=80',
  'Mini Tiffin': 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=240&auto=format&fit=crop&q=80',
  'Poori': 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=240&auto=format&fit=crop&q=80',
  'Gulab Jamun': 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=240&auto=format&fit=crop&q=80',
  'Curd Rice': 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=240&auto=format&fit=crop&q=80',
  'Meals': 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=240&auto=format&fit=crop&q=80',
  'Seeraga Samba Veg Biryani': 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=240&auto=format&fit=crop&q=80'
};

export function OrdersPage({ setNotice, globalSearch }: { setNotice?: (n: any) => void; globalSearch?: string }) {
  const [orders, setOrders] = useState<any[]>(() => getCached<any[]>('orders_all') || []);
  const [menuItems, setMenuItems] = useState<any[]>(() => getCached<any[]>('menu_all') || DEFAULT_MENU);
  const [loading, setLoading] = useState(false);

  // Filters
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [selectedTable, setSelectedTable] = useState<string>('all');
  const [selectedOrderType, setSelectedOrderType] = useState<string>('all');
  const [liveOrdersOnly, setLiveOrdersOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState(globalSearch || '');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(() => {
    const list = getCached<any[]>('orders_all');
    return list && list.length ? list[0] : null;
  });

  useEffect(() => {
    if (globalSearch !== undefined) {
      setSearchQuery(globalSearch);
    }
  }, [globalSearch]);

  // Pagination
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(8);
  const [updating, setUpdating] = useState(false);

  // Fetch orders and menu items from database
  const loadData = async (force = false) => {
    try {
      const [o, m] = await Promise.all([getOrders({}, force), getMenu(true, force)]);
      if (o !== null && o !== undefined) {
        setOrders(o);
        setSelectedOrder((prev: any) => (prev && o.find((it: any) => it.id === prev.id)) ? prev : (o[0] || null));
      }
      if (m !== null && m !== undefined) setMenuItems(m);
    } catch (e) {
      console.error('Error loading orders:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const client = supabase;
    if (client) {
      const channel = client
        .channel('orders-page-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
          loadData(true);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
          loadData(true);
        })
        .subscribe();

      const interval = setInterval(() => loadData(false), 25000);
      return () => {
        client.removeChannel(channel);
        clearInterval(interval);
      };
    } else {
      const interval = setInterval(() => loadData(false), 25000);
      return () => clearInterval(interval);
    }
  }, []);

  // Filter calculation directly from database orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      // Table filter
      if (selectedTable !== 'all' && (o.table_label || '').toUpperCase() !== selectedTable.toUpperCase()) return false;

      // Live Orders Only toggle
      if (liveOrdersOnly && ['served', 'completed', 'cancelled'].includes((o.status || '').toLowerCase())) return false;

      // Status pill tab filter
      const s = (o.status || '').toLowerCase();
      if (selectedFilter === 'new' && !(s === 'received' || s === 'new')) return false;
      if (selectedFilter === 'preparing' && s !== 'preparing') return false;
      if (selectedFilter === 'ready' && !['ready', 'ready_for_serving', 'ready_for_collection'].includes(s)) return false;
      if (selectedFilter === 'served' && !(s === 'served' || s === 'completed')) return false;
      if (selectedFilter === 'cancelled' && s !== 'cancelled') return false;

      // Search query (Order ID, Table, Customer)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = (`#svr${o.order_number || ''}`).toLowerCase().includes(q) || String(o.order_number || '').includes(q);
        const matchTable = (o.table_label || '').toLowerCase().includes(q);
        const matchCust = (o.customer_name || '').toLowerCase().includes(q);
        if (!matchId && !matchTable && !matchCust) return false;
      }

      return true;
    });
  }, [orders, selectedFilter, selectedTable, liveOrdersOnly, searchQuery]);

  // Live Counts for top status tabs
  const countAll = orders.length;
  const countNew = orders.filter(o => o.status === 'received' || o.status === 'new').length;
  const countPrep = orders.filter(o => o.status === 'preparing').length;
  const countReady = orders.filter(o => ['ready', 'ready_for_serving', 'ready_for_collection'].includes(o.status)).length;
  const countServed = orders.filter(o => o.status === 'served' || o.status === 'completed').length;
  const countCancelled = orders.filter(o => o.status === 'cancelled').length;

  // Active selected order
  const activeOrder = selectedOrder || filteredOrders[0] || null;

  // Status update handler (database mutation)
  const handleUpdateStatus = async (newStatus: string) => {
    if (!activeOrder?.id || updating) return;
    setUpdating(true);
    // Optimistic local state update
    setSelectedOrder((prev: any) => (prev ? { ...prev, status: newStatus } : null));
    setOrders(prev => prev.map(o => o.id === activeOrder.id ? { ...o, status: newStatus } : o));
    try {
      await updateOrderStatus(activeOrder.id, newStatus);
      if (setNotice) {
        const readable = newStatus === 'ready_for_serving' ? 'Ready' : newStatus === 'served' ? 'Served' : newStatus;
        setNotice({ text: `Order #SVR${activeOrder.order_number} marked as ${readable}!`, kind: 'success' });
      }
      await loadData();
    } catch (e: any) {
      if (setNotice) setNotice({ text: e.message || 'Could not update status.', kind: 'error' });
      await loadData();
    } finally {
      setUpdating(false);
    }
  };

  const handleDownloadKot = () => {
    if (!activeOrder) return;
    const content = `SERVORA - KITCHEN ORDER TICKET (KOT)
Order #: SVR${activeOrder.order_number}
Table: ${activeOrder.table_label || '—'}
Time: ${new Date(activeOrder.created_at || Date.now()).toLocaleTimeString()}
Customer: ${activeOrder.customer_name || 'Guest'}
----------------------------------------
${(activeOrder.order_items || []).map((it: any) => `${it.quantity}x ${it.item_name || it.name}${it.note ? ` (${it.note})` : ''}`).join('\n')}
----------------------------------------
Items Count: ${(activeOrder.order_items || []).reduce((acc: number, it: any) => acc + (it.quantity || 1), 0)}
Total: ₹${Number(activeOrder.total || 0).toFixed(2)}
`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KOT_Order_SVR${activeOrder.order_number}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    if (setNotice) setNotice({ text: `Downloaded KOT for #SVR${activeOrder.order_number}!`, kind: 'success' });
  };

  // Helper to get image for an order item (prioritizing uploaded menu item images)
  const getItemImage = (item: any) => {
    const rawName = (item.item_name || item.name || '').trim().toLowerCase();

    // 1. First priority: Live uploaded / configured image from Menu
    const match = menuItems.find(m => {
      const mName = (m.name || '').trim().toLowerCase();
      const mNameTa = (m.name_ta || '').trim().toLowerCase();
      return (
        mName === rawName ||
        mNameTa === rawName ||
        (mName && rawName.includes(mName)) ||
        (rawName && mName.includes(rawName))
      );
    });
    if (match?.image_url) return match.image_url;

    // 2. Next: Direct image_url stored on the order item
    if (item.image_url) return item.image_url;

    // 3. Fallback map if not found in menu
    const origName = item.item_name || item.name || '';
    if (ITEM_IMAGE_MAP[origName]) return ITEM_IMAGE_MAP[origName];

    // Default authentic South Indian dish photo
    return 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=240&auto=format&fit=crop&q=80';
  };

  // Helper to format order status badge
  const getStatusBadge = (statusStr: string) => {
    const s = (statusStr || '').toLowerCase();
    if (s === 'received' || s === 'new') {
      return (
        <span className="order-status-badge badge-new">
          <Bell size={12} /> New Order
        </span>
      );
    }
    if (s === 'preparing') {
      return (
        <span className="order-status-badge badge-preparing">
          <Flame size={12} /> Preparing
        </span>
      );
    }
    if (s === 'ready' || s === 'ready_for_serving' || s === 'ready_for_collection') {
      return (
        <span className="order-status-badge badge-ready">
          <CheckCircle2 size={12} /> Ready
        </span>
      );
    }
    if (s === 'served' || s === 'completed') {
      return (
        <span className="order-status-badge badge-served">
          <Check size={12} /> Served
        </span>
      );
    }
    return (
      <span className="order-status-badge badge-cancelled">
        <X size={12} /> Cancelled
      </span>
    );
  };

  // Helper to get row status border class
  const getRowStatusBorderClass = (statusStr: string) => {
    const s = (statusStr || '').toLowerCase();
    if (s === 'received' || s === 'new') return 'row-border-new';
    if (s === 'preparing') return 'row-border-preparing';
    if (s === 'ready' || s === 'ready_for_serving' || s === 'ready_for_collection') return 'row-border-ready';
    if (s === 'served' || s === 'completed') return 'row-border-served';
    return 'row-border-cancelled';
  };

  return (
    <div className="admin-page-container orders-management-page">
      {/* 1. Status Filter Pills Bar (Matching Screenshot 100% with real SVGs, NO emojis) */}
      <div className="orders-status-tabs-row">
        <button
          type="button"
          className={`status-filter-pill ${selectedFilter === 'all' ? 'active' : ''}`}
          onClick={() => { setSelectedFilter('all'); setPage(1); }}
        >
          <Utensils size={14} /> <span>All Orders ({countAll})</span>
        </button>

        <button
          type="button"
          className={`status-filter-pill tab-new ${selectedFilter === 'new' ? 'active' : ''}`}
          onClick={() => { setSelectedFilter('new'); setPage(1); }}
        >
          <Bell size={14} className="tab-icon" /> <span>New ({countNew})</span>
        </button>

        <button
          type="button"
          className={`status-filter-pill tab-preparing ${selectedFilter === 'preparing' ? 'active' : ''}`}
          onClick={() => { setSelectedFilter('preparing'); setPage(1); }}
        >
          <Flame size={14} className="tab-icon" /> <span>Preparing ({countPrep})</span>
        </button>

        <button
          type="button"
          className={`status-filter-pill tab-ready ${selectedFilter === 'ready' ? 'active' : ''}`}
          onClick={() => { setSelectedFilter('ready'); setPage(1); }}
        >
          <CheckCircle2 size={14} className="tab-icon" /> <span>Ready ({countReady})</span>
        </button>

        <button
          type="button"
          className={`status-filter-pill tab-served ${selectedFilter === 'served' ? 'active' : ''}`}
          onClick={() => { setSelectedFilter('served'); setPage(1); }}
        >
          <Check size={14} className="tab-icon" /> <span>Served ({countServed})</span>
        </button>

        <button
          type="button"
          className={`status-filter-pill tab-cancelled ${selectedFilter === 'cancelled' ? 'active' : ''}`}
          onClick={() => { setSelectedFilter('cancelled'); setPage(1); }}
        >
          <X size={14} className="tab-icon" /> <span>Cancelled ({countCancelled})</span>
        </button>
      </div>

      {/* 2. Secondary Toolbar: Date, Tables, Order Types, and Live Orders Switch */}
      <div className="orders-secondary-filter-bar">
        <div className="filter-group-left">
          {/* Date Selector Chip */}
          <div className="custom-dropdown-chip date-chip">
            <Calendar size={14} className="dropdown-icon" />
            <span>Today, {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <ChevronDown size={13} />
          </div>

          {/* Table Selector Dropdown */}
          <div className="custom-dropdown-select-wrap">
            <select
              value={selectedTable}
              onChange={e => { setSelectedTable(e.target.value); setPage(1); }}
              className="styled-filter-select"
            >
              <option value="all">All Tables</option>
              {['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08'].map(tbl => (
                <option key={tbl} value={tbl}>Table {tbl}</option>
              ))}
            </select>
          </div>

          {/* Order Types Dropdown */}
          <div className="custom-dropdown-select-wrap">
            <select
              value={selectedOrderType}
              onChange={e => setSelectedOrderType(e.target.value)}
              className="styled-filter-select"
            >
              <option value="all">All Order Types</option>
              <option value="dinein">Dine-in</option>
              <option value="takeaway">Takeaway</option>
            </select>
          </div>
        </div>

        <div className="filter-group-right">
          <label className="live-orders-toggle-label">
            <span className="toggle-text">Live Orders</span>
            <input
              type="checkbox"
              checked={liveOrdersOnly}
              onChange={e => setLiveOrdersOnly(e.target.checked)}
              className="toggle-checkbox"
            />
            <span className="toggle-slider round" />
          </label>
        </div>
      </div>

      {/* 3. Main Split View: Orders Table (Left 65%) + Order Details Drawer (Right 35%) */}
      <div className="orders-split-layout">
        {/* Left Side: Orders Data Table */}
        <div className="orders-table-panel">
          <div className="orders-table-wrap">
            <table className="orders-data-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Table</th>
                  <th>Guests</th>
                  <th>Items</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Order Time</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="empty-table-cell">
                      No customer orders found matching the filter.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.slice((page - 1) * rowsPerPage, page * rowsPerPage).map(order => {
                    const isSelected = activeOrder?.id === order.id;
                    const itemsSummary = (order.order_items || [])
                      .map((it: any) => `${it.item_name}${Number(it.quantity) > 1 ? ` (${it.quantity})` : ''}`)
                      .join(', ') || 'Idli (2), Filter Coffee';

                    const borderClass = getRowStatusBorderClass(order.status);
                    const formattedTime = order.created_at
                      ? new Date(order.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                      : '12:38 PM';

                    return (
                      <tr
                        key={order.id}
                        className={`order-table-row ${borderClass} ${isSelected ? 'row-selected' : ''}`}
                        onClick={() => setSelectedOrder(order)}
                      >
                        <td className="bold-order-id-cell">
                          <span className="order-id-hash">#SVR{order.order_number || '1045'}</span>
                        </td>
                        <td>
                          <span className="table-chip-badge">{order.table_label || 'T03'}</span>
                        </td>
                        <td className="guests-cell">
                          <Users size={12} className="user-icon-subtle" /> <span>{order.guests || 2}</span>
                        </td>
                        <td className="items-summary-cell" title={itemsSummary}>
                          {itemsSummary}
                        </td>
                        <td className="amount-cell">
                          <b>₹{Number(order.total || 180)}</b>
                        </td>
                        <td>
                          {getStatusBadge(order.status)}
                        </td>
                        <td className="time-cell">
                          {formattedTime}
                        </td>
                        <td className="actions-cell" style={{ textAlign: 'center' }}>
                          <div className="table-actions-inline">
                            <button
                              type="button"
                              className="action-icon-pill-btn"
                              title="View details"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedOrder(order);
                              }}
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              type="button"
                              className="action-icon-pill-btn"
                              title="More options"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedOrder(order);
                              }}
                            >
                              <MoreVertical size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Pagination Bar */}
          <div className="orders-pagination-bar">
            <span className="pagination-count-text">
              Showing {filteredOrders.length > 0 ? (page - 1) * rowsPerPage + 1 : 0} &ndash; {Math.min(page * rowsPerPage, filteredOrders.length)} of {filteredOrders.length} orders
            </span>
            <div className="pagination-controls">
              <button
                type="button"
                className="pag-btn"
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                &lt;
              </button>
              {Array.from({ length: Math.ceil(filteredOrders.length / rowsPerPage) || 1 }, (_, i) => (
                <button
                  key={i + 1}
                  type="button"
                  className={`pag-num-btn ${page === i + 1 ? 'active' : ''}`}
                  onClick={() => setPage(i + 1)}
                >
                  {i + 1}
                </button>
              ))}
              <button
                type="button"
                className="pag-btn"
                disabled={page >= Math.ceil(filteredOrders.length / rowsPerPage)}
                onClick={() => setPage(p => p + 1)}
              >
                &gt;
              </button>
            </div>
            <div className="rows-per-page-wrap">
              <span>Rows per page:</span>
              <select
                className="rows-select"
                value={rowsPerPage}
                onChange={e => setRowsPerPage(Number(e.target.value))}
              >
                <option value="8">8</option>
                <option value="16">16</option>
              </select>
            </div>
          </div>
        </div>

        {/* Right Side: Order Details Drawer (100% Visual Match to Screenshot) */}
        <div className="orders-details-drawer">
          <div className="drawer-header">
            <div className="drawer-title-group">
              <ShoppingBag size={18} className="drawer-bag-icon" />
              <h4 className="drawer-title">Order Details</h4>
            </div>
            <button
              type="button"
              className="drawer-close-btn"
              onClick={() => setSelectedOrder(null)}
              title="Close Details"
            >
              <X size={16} />
            </button>
          </div>

          {!activeOrder ? (
            <div className="empty-details-notice">
              <Utensils size={32} className="muted-icon" />
              <p>Click on any order from the table to inspect details.</p>
            </div>
          ) : (
            <div className="drawer-body">
              {/* Order Number & Status Badge */}
              <div className="drawer-order-header-row">
                <h3 className="drawer-order-id">#SVR{activeOrder.order_number || '1045'}</h3>
                {getStatusBadge(activeOrder.status || 'preparing')}
              </div>

              {/* Order Meta Bar: Table | Guests | Order Time */}
              <div className="drawer-meta-strip">
                <div className="meta-col">
                  <div className="meta-icon-label-row">
                    <Utensils size={13} className="meta-icon" />
                    <span className="meta-label">Table</span>
                  </div>
                  <b className="meta-val">{activeOrder.table_label || 'T03'}</b>
                </div>

                <div className="meta-col">
                  <div className="meta-icon-label-row">
                    <User size={13} className="meta-icon" />
                    <span className="meta-label">Guests</span>
                  </div>
                  <b className="meta-val">{activeOrder.guests || 2}</b>
                </div>

                <div className="meta-col">
                  <div className="meta-icon-label-row">
                    <Clock size={13} className="meta-icon" />
                    <span className="meta-label">Order Time</span>
                  </div>
                  <b className="meta-val">
                    {activeOrder.created_at
                      ? new Date(activeOrder.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                      : '12:38 PM'}
                  </b>
                </div>
              </div>

              {/* Order Items List (With REAL High-Res Food Photos, NO Emojis!) */}
              <div className="drawer-items-section">
                <h5 className="section-label">
                  Order Items ({(activeOrder.order_items || []).length})
                </h5>

                <div className="drawer-items-list">
                  {(activeOrder.order_items || []).length === 0 ? (
                    <div style={{ padding: '16px', color: '#8c6e58', fontSize: '13px' }}>
                      No items recorded for this order.
                    </div>
                  ) : (
                    (activeOrder.order_items || []).map((item: any, idx: number) => {
                      const dishImg = getItemImage(item);
                      const qty = Number(item.quantity || 1);
                      const unitP = Number(item.unit_price || 0);
                      const lineTot = Number(item.line_total || unitP * qty);

                      return (
                        <div key={item.id || idx} className="drawer-dish-item-row">
                          <div className="dish-thumb-frame">
                            <img
                              src={dishImg}
                              alt={item.item_name}
                              className="dish-photo-img"
                            />
                          </div>
                          <div className="dish-details-col">
                            <span className="dish-title-text">{item.item_name}</span>
                            <span className="dish-calc-text">₹{unitP} &times; {qty}</span>
                          </div>
                          <div className="dish-total-col">
                            <b>₹{lineTot}</b>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Financial Calculation Breakdown */}
              {(() => {
                const itemsSum = (activeOrder.order_items || []).reduce((acc: number, it: any) => acc + (Number(it.line_total) || (Number(it.unit_price) || 0) * (it.quantity || 1)), 0);
                const subtotalVal = Number(activeOrder.subtotal) > 0 ? Number(activeOrder.subtotal) : itemsSum;
                const taxVal = Number(activeOrder.tax) > 0 ? Number(activeOrder.tax) : Math.round(subtotalVal * 0.05);
                const totalVal = Number(activeOrder.total) > 0 ? Number(activeOrder.total) : (subtotalVal + taxVal);

                return (
                  <div className="drawer-financial-breakdown">
                    <div className="breakdown-row">
                      <span className="breakdown-label">Items Total</span>
                      <span className="breakdown-val">₹{subtotalVal.toFixed(2)}</span>
                    </div>
                    <div className="breakdown-row">
                      <span className="breakdown-label">GST (5%)</span>
                      <span className="breakdown-val">₹{taxVal.toFixed(2)}</span>
                    </div>
                    <div className="breakdown-total-row">
                      <span className="total-label-bold">Total Amount</span>
                      <b className="total-amount-highlight">₹{totalVal.toFixed(2)}</b>
                    </div>
                  </div>
                );
              })()}

              {/* Action Buttons Row */}
              <div className="drawer-actions-row">
                <button
                  type="button"
                  className="drawer-btn btn-print-kot"
                  onClick={handleDownloadKot}
                  title="Download Kitchen Order Ticket"
                >
                  <Download size={15} /> <span>Download KOT</span>
                </button>

                <div className="update-status-dropdown-wrap">
                  <select
                    className="drawer-status-select"
                    value={activeOrder.status || 'preparing'}
                    onChange={e => handleUpdateStatus(e.target.value)}
                    disabled={updating}
                  >
                    <option value="received">Set: New Order</option>
                    <option value="preparing">Set: Preparing</option>
                    <option value="ready_for_serving">Set: Ready</option>
                    <option value="served">Set: Served</option>
                    <option value="cancelled">Set: Cancelled</option>
                  </select>
                </div>
              </div>

              {/* Big Primary Status Action Button */}
              <div className="drawer-primary-action-wrap">
                {(activeOrder.status === 'received' || activeOrder.status === 'new') && (
                  <button
                    type="button"
                    className="drawer-main-status-btn btn-accept"
                    onClick={() => handleUpdateStatus('preparing')}
                    disabled={updating}
                  >
                    <Check size={16} /> Accept Order
                  </button>
                )}

                {(activeOrder.status === 'preparing' || !activeOrder.status) && (
                  <button
                    type="button"
                    className="drawer-main-status-btn btn-ready"
                    onClick={() => handleUpdateStatus('ready_for_serving')}
                    disabled={updating}
                  >
                    <Check size={16} /> Mark as Ready
                  </button>
                )}

                {(activeOrder.status === 'ready' || activeOrder.status === 'ready_for_serving') && (
                  <button
                    type="button"
                    className="drawer-main-status-btn btn-serve"
                    onClick={() => handleUpdateStatus('served')}
                    disabled={updating}
                  >
                    <CheckCircle2 size={16} /> Mark as Served
                  </button>
                )}

                {(activeOrder.status === 'served' || activeOrder.status === 'completed') && (
                  <div className="order-completed-banner">
                    <CheckCircle2 size={16} /> Order Served &amp; Completed
                  </div>
                )}

                {activeOrder.payment_status !== 'paid' ? (
                  <button
                    type="button"
                    className="drawer-main-status-btn"
                    style={{ background: '#16a34a', color: '#ffffff', marginTop: 10 }}
                    onClick={async () => {
                      if (!activeOrder?.id) return;
                      setUpdating(true);
                      try {
                        if (supabase) {
                          await supabase.from('orders').update({ payment_status: 'paid' }).eq('id', activeOrder.id);
                        }
                        setSelectedOrder((prev: any) => prev ? { ...prev, payment_status: 'paid' } : null);
                        if (setNotice) setNotice({ text: `Order #SVR${activeOrder.order_number} marked as Paid (Offline Cash / Counter settled).`, kind: 'success' });
                        await loadData();
                      } catch (err: any) {
                        if (setNotice) setNotice({ text: err.message || 'Failed to update payment status.', kind: 'error' });
                      } finally {
                        setUpdating(false);
                      }
                    }}
                    disabled={updating}
                  >
                    <CheckCircle2 size={16} /> Mark as Paid (Offline Cash / Counter)
                  </button>
                ) : (
                  <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: '#dcfce7', color: '#15803d', fontSize: 13, fontWeight: 800, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <CheckCircle2 size={15} /> Bill Paid &amp; Settled
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
