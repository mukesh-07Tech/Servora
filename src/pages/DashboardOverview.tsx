import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Coffee,
  LayoutDashboard,
  Plus,
  QrCode,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
  Utensils
} from 'lucide-react';
import { DEFAULT_TABLES, getCached, getOrders, getTables } from '../lib/data';
import { money, supabase } from '../lib/supabase';

export function DashboardOverview() {
  const [orders, setOrders] = useState<any[]>(() => getCached<any[]>('orders_all') || []);
  const [tables, setTables] = useState<any[]>(() => getCached<any[]>('tables') || DEFAULT_TABLES);
  const [salesTimeframe, setSalesTimeframe] = useState<'today' | 'week' | 'month'>('today');
  const [loading, setLoading] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  const loadData = async (force = false) => {
    try {
      const [o, t] = await Promise.all([getOrders({}, force), getTables(force)]);
      if (o !== null && o !== undefined) setOrders(o);
      if (t !== null && t !== undefined) setTables(t);
    } catch (e) {
      console.error('Error loading dashboard data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const client = supabase;
    if (client) {
      const channel = client
        .channel('dashboard-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
          loadData(true);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dining_tables' }, () => {
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

  // Compute live metrics directly from DB
  const totalOrdersCount = orders.length;
  const totalRevenueVal = orders.reduce((acc, o) => acc + Number(o.total || 0), 0);

  // Active tables: tables marked occupied OR currently having an ongoing order in kitchen/service
  const activeOrderTableLabels = useMemo(() => {
    return new Set(
      orders
        .filter(o => !['served', 'completed', 'cancelled'].includes((o.status || '').toLowerCase()))
        .map(o => (o.table_label || '').trim().toUpperCase())
    );
  }, [orders]);

  const isTableOccupied = (t: any) => {
    const num = (t.table_number || '').trim().toUpperCase();
    return activeOrderTableLabels.has(num);
  };

  const occupiedTablesCount = tables.filter(isTableOccupied).length;
  const totalTablesCount = tables.length;
  const occupancyPercent = totalTablesCount > 0 ? Math.round((occupiedTablesCount / totalTablesCount) * 100) : 0;
  const totalGuests = orders.reduce((acc, o) => acc + Number(o.guests || 2), 0);

  // Active live orders for current kitchen queue
  const displayQueue = orders.filter(o => !['served', 'completed', 'cancelled'].includes((o.status || '').toLowerCase())).slice(0, 5);

  // Recent orders list
  const displayRecent = orders.slice(0, 6);

  // Dynamic Sales Overview Chart Data
  const chartData = useMemo(() => {
    const now = new Date();
    let buckets: { label: string; start: Date; end: Date }[] = [];

    if (salesTimeframe === 'today') {
      // 12 hours from 9 AM to 8 PM
      const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
      buckets = hours.map(h => {
        const start = new Date(now);
        start.setHours(h, 0, 0, 0);
        const end = new Date(now);
        end.setHours(h + 1, 0, 0, 0);
        const label = `${h > 12 ? h - 12 : h} ${h >= 12 ? 'PM' : 'AM'}`;
        return { label, start, end };
      });
    } else if (salesTimeframe === 'week') {
      // 7 days
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const start = new Date(d);
        start.setHours(0, 0, 0, 0);
        const end = new Date(d);
        end.setHours(23, 59, 59, 999);
        const label = d.toLocaleDateString('en-US', { weekday: 'short' });
        buckets.push({ label, start, end });
      }
    } else {
      // 30 days: 8 weekly / multi-day intervals
      for (let i = 7; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - Math.round((i * 30) / 7));
        const start = new Date(d);
        start.setHours(0, 0, 0, 0);
        const end = new Date(d);
        end.setDate(end.getDate() + 4);
        end.setHours(23, 59, 59, 999);
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        buckets.push({ label, start, end });
      }
    }

    const points = buckets.map((b, idx) => {
      const matched = orders.filter(o => {
        if (!o.created_at) return false;
        const od = new Date(o.created_at);
        return od >= b.start && od <= b.end;
      });
      const revenue = matched.reduce((sum, o) => sum + Number(o.total || 0), 0);
      const ordersCount = matched.length;
      return {
        label: b.label,
        val: revenue,
        orders: ordersCount,
        idx
      };
    });

    const maxVal = Math.max(...points.map(p => p.val), 500);
    const xStart = 60;
    const xEnd = 715;
    const stepX = (xEnd - xStart) / Math.max(points.length - 1, 1);

    const mapped = points.map((p, i) => {
      const x = Math.round(xStart + i * stepX);
      const y = Math.round(185 - (p.val / maxVal) * 145);
      return {
        ...p,
        x,
        y: Math.max(30, Math.min(185, y))
      };
    });

    const areaPath = `M ${mapped[0].x} ${mapped[0].y} ` +
      mapped.slice(1).map(pt => `L ${pt.x} ${pt.y}`).join(' ') +
      ` L ${mapped[mapped.length - 1].x} 190 L ${mapped[0].x} 190 Z`;

    let linePath = `M ${mapped[0].x} ${mapped[0].y}`;
    for (let i = 1; i < mapped.length; i++) {
      const prev = mapped[i - 1];
      const curr = mapped[i];
      const cx1 = prev.x + (curr.x - prev.x) / 2;
      const cy1 = prev.y;
      const cx2 = prev.x + (curr.x - prev.x) / 2;
      const cy2 = curr.y;
      linePath += ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${curr.x} ${curr.y}`;
    }

    const yLabels = [
      `₹${Math.round(maxVal / 1000)}K`,
      `₹${Math.round((maxVal * 0.75) / 1000)}K`,
      `₹${Math.round((maxVal * 0.5) / 1000)}K`,
      `₹${Math.round((maxVal * 0.25) / 1000)}K`,
      `₹0`
    ];

    return {
      points: mapped,
      areaPath,
      linePath,
      yLabels
    };
  }, [orders, salesTimeframe]);

  return (
    <div className="admin-page-container dashboard-overview-page">
      {/* 1. Hero Greeting Banner */}
      <div className="dash-hero-banner">
        <div className="dash-hero-content">
          <h2 className="dash-hero-title">
            Good Day, Admin <Sparkles size={20} style={{ color: '#f59e0b', verticalAlign: 'middle', display: 'inline-block', marginLeft: 6 }} />
          </h2>
          <p className="dash-hero-sub">Here's what's happening at Servora right now.</p>
        </div>
        <div className="dash-hero-bg-overlay" />
      </div>

      {/* 2. Top 4 Metric Cards */}
      <div className="dash-metrics-grid">
        <div className="dash-stat-card stat-orders">
          <div className="stat-card-top">
            <span className="stat-card-label">Total Orders</span>
            <span className="stat-icon-wrap icon-orders">
              <ShoppingCart size={22} />
            </span>
          </div>
          <div className="stat-card-bottom">
            <span className="stat-main-number">{totalOrdersCount}</span>
            <span className="stat-badge badge-positive">
              <ArrowUpRight size={13} /> Live
            </span>
          </div>
        </div>

        <div className="dash-stat-card stat-revenue">
          <div className="stat-card-top">
            <span className="stat-card-label">Total Revenue</span>
            <span className="stat-icon-wrap icon-revenue">
              <Utensils size={22} />
            </span>
          </div>
          <div className="stat-card-bottom">
            <span className="stat-main-number">{money(totalRevenueVal)}</span>
            <span className="stat-badge badge-positive">
              <ArrowUpRight size={13} /> Live
            </span>
          </div>
        </div>

        <div className="dash-stat-card stat-tables">
          <div className="stat-card-top">
            <span className="stat-card-label">Active Tables</span>
            <span className="stat-icon-wrap icon-tables">
              <LayoutDashboard size={22} />
            </span>
          </div>
          <div className="stat-card-bottom">
            <div className="tables-occupancy-wrap">
              <span className="stat-main-number">{occupiedTablesCount} / {totalTablesCount}</span>
              <span className="occupancy-pct-sub">{occupancyPercent}% Occupied</span>
            </div>
            <div className="occupancy-mini-bar">
              <div className="occupancy-bar-fill" style={{ width: `${occupancyPercent}%` }} />
            </div>
          </div>
        </div>

        <div className="dash-stat-card stat-guests">
          <div className="stat-card-top">
            <span className="stat-card-label">Today's Guests</span>
            <span className="stat-icon-wrap icon-guests">
              <Users size={22} />
            </span>
          </div>
          <div className="stat-card-bottom">
            <span className="stat-main-number">{totalGuests}</span>
            <span className="stat-badge badge-positive">
              <ArrowUpRight size={13} /> Dine-In
            </span>
          </div>
        </div>
      </div>

      {/* 3. Middle Section: Dynamic Sales Overview Chart (Left) + Current Orders Live (Right) */}
      <div className="dash-middle-split">
        {/* Sales Overview Chart */}
        <div className="dash-panel sales-chart-panel">
          <div className="dash-panel-header">
            <div className="panel-title-group">
              <span className="panel-header-icon orange-icon">
                <TrendingUp size={18} />
              </span>
              <h3 className="panel-title">Sales Overview</h3>
            </div>
            <div className="timeframe-toggle-pills">
              <button
                type="button"
                className={`time-pill ${salesTimeframe === 'today' ? 'active' : ''}`}
                onClick={() => setSalesTimeframe('today')}
              >
                Today
              </button>
              <button
                type="button"
                className={`time-pill ${salesTimeframe === 'week' ? 'active' : ''}`}
                onClick={() => setSalesTimeframe('week')}
              >
                Week
              </button>
              <button
                type="button"
                className={`time-pill ${salesTimeframe === 'month' ? 'active' : ''}`}
                onClick={() => setSalesTimeframe('month')}
              >
                Month
              </button>
            </div>
          </div>

          {/* Dynamic SVG Sales Curve */}
          <div className="sales-svg-chart-container" style={{ position: 'relative' }}>
            <svg viewBox="0 0 760 210" className="sales-svg" preserveAspectRatio="none">
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ea580c" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#ea580c" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              <line x1="40" y1="20" x2="740" y2="20" stroke="#f0e4d8" strokeDasharray="4 4" />
              <line x1="40" y1="65" x2="740" y2="65" stroke="#f0e4d8" strokeDasharray="4 4" />
              <line x1="40" y1="110" x2="740" y2="110" stroke="#f0e4d8" strokeDasharray="4 4" />
              <line x1="40" y1="155" x2="740" y2="155" stroke="#f0e4d8" strokeDasharray="4 4" />
              <line x1="40" y1="190" x2="740" y2="190" stroke="#ebdcd0" />

              {chartData.yLabels.map((yl, idx) => (
                <text key={`ylabel-${idx}`} x="32" y={24 + idx * 42} className="chart-y-label">{yl}</text>
              ))}

              {chartData.points.length > 0 && (
                <>
                  <path
                    d={chartData.areaPath}
                    fill="url(#salesGrad)"
                  />
                  <path
                    d={chartData.linePath}
                    fill="none"
                    stroke="#e65c00"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}

              {chartData.points.map((pt, idx) => (
                <circle
                  key={idx}
                  cx={pt.x}
                  cy={pt.y}
                  r={hoveredPoint === idx ? 6.5 : 4.5}
                  fill="#e65c00"
                  stroke="#ffffff"
                  strokeWidth="2"
                  style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                  onMouseEnter={() => setHoveredPoint(idx)}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              ))}
            </svg>

            {hoveredPoint !== null && chartData.points[hoveredPoint] && (
              <div
                style={{
                  position: 'absolute',
                  left: `${(chartData.points[hoveredPoint].x / 760) * 100}%`,
                  top: `${(chartData.points[hoveredPoint].y / 210) * 100 - 36}%`,
                  transform: 'translate(-50%, -100%)',
                  background: '#1c100a',
                  color: '#fff',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                  pointerEvents: 'none',
                  zIndex: 10,
                  whiteSpace: 'nowrap'
                }}
              >
                <b>{chartData.points[hoveredPoint].label}</b>
                <div>Revenue: {money(chartData.points[hoveredPoint].val)}</div>
                <div>Orders: {chartData.points[hoveredPoint].orders}</div>
              </div>
            )}

            <div className="chart-x-labels-row">
              {chartData.points.map((pt, idx) => (
                <span key={idx} className="chart-x-label">{pt.label}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Current Orders (Live) */}
        <div className="dash-panel live-orders-panel">
          <div className="dash-panel-header">
            <div className="panel-title-group">
              <span className="panel-header-icon orange-icon">
                <Utensils size={18} />
              </span>
              <h3 className="panel-title">Current Orders (Live)</h3>
            </div>
            <Link to="/app/orders" className="panel-header-link">
              View All <ArrowRight size={14} />
            </Link>
          </div>

          <div className="live-orders-list">
            {displayQueue.length === 0 ? (
              <div className="empty-panel-notice">
                <Coffee size={24} className="muted-icon" />
                <p>No active orders in kitchen right now.</p>
              </div>
            ) : (
              displayQueue.map((o: any, idx: number) => {
                const status = (o.status || '').toLowerCase();
                const isNew = status === 'received' || status === 'new';
                const isReady = ['ready', 'ready_for_serving', 'ready_for_collection'].includes(status);
                const statusLabel = isNew ? 'New Order' : isReady ? 'Ready' : 'Preparing';
                const statusTone = isNew ? 'tone-new' : isReady ? 'tone-ready' : 'tone-preparing';

                return (
                  <div key={o.id || idx} className="live-order-card-row">
                    <span className={`live-card-border-pip ${statusTone}`} />
                    <div className="live-card-id-col">
                      <b>#SVR{o.order_number || 1000 + idx}</b>
                    </div>
                    <div className="live-card-table-col">
                      <span className="table-chip-mini">{o.table_label || '-'}</span>
                    </div>
                    <div className="live-card-guests-col">
                      <Users size={13} />
                      <span>{o.guests || 2} Guests</span>
                    </div>
                    <div className="live-card-badge-col">
                      <span className={`live-status-pill ${statusTone}`}>{statusLabel}</span>
                    </div>
                    <div className="live-card-time-col">
                      {o.created_at ? new Date(o.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 4. Bottom Split: Recent Orders (Left) + Tables Overview (Right) */}
      <div className="dash-bottom-split">
        {/* Recent Orders List */}
        <div className="dash-panel recent-orders-panel">
          <div className="dash-panel-header">
            <div className="panel-title-group">
              <span className="panel-header-icon orange-icon">
                <Receipt size={18} />
              </span>
              <h3 className="panel-title">Recent Orders</h3>
            </div>
            <Link to="/app/orders" className="panel-header-link">
              View All <ArrowRight size={14} />
            </Link>
          </div>

          <div className="recent-orders-table-wrapper">
            <table className="dash-clean-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Table</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {displayRecent.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '24px' }}>
                      No recent orders found.
                    </td>
                  </tr>
                ) : (
                  displayRecent.map((o: any, idx: number) => {
                    const status = (o.status || '').toLowerCase();
                    const isServed = status === 'served' || status === 'completed';
                    const isReady = ['ready', 'ready_for_serving', 'ready_for_collection'].includes(status);
                    const isNew = status === 'received' || status === 'new';
                    const statusClass = isServed ? 'badge-served' : isReady ? 'badge-ready' : isNew ? 'badge-new' : 'badge-preparing';
                    const statusText = isServed ? 'Served' : isReady ? 'Ready' : isNew ? 'New Order' : 'Preparing';
                    const itemsSummary = (o.order_items || []).map((it: any) => it.item_name).join(', ') || 'South Indian Dishes';

                    return (
                      <tr key={o.id || idx}>
                        <td className="order-id-cell">
                          <b>#SVR{o.order_number || 1000 + idx}</b>
                        </td>
                        <td>
                          <span className="table-badge-outline">{o.table_label || '-'}</span>
                        </td>
                        <td className="items-cell" title={itemsSummary}>
                          {itemsSummary}
                        </td>
                        <td className="total-cell">
                          <b>{money(Number(o.total || 0))}</b>
                        </td>
                        <td>
                          <span className={`status-pill ${statusClass}`}>{statusText}</span>
                        </td>
                        <td className="time-cell">
                          {o.created_at ? new Date(o.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tables Live Overview */}
        <div className="dash-panel tables-grid-panel">
          <div className="dash-panel-header">
            <div className="panel-title-group">
              <span className="panel-header-icon orange-icon">
                <LayoutDashboard size={18} />
              </span>
              <h3 className="panel-title">Tables Live Status</h3>
            </div>
            <Link to="/app/tables" className="panel-header-link">
              Manage Tables <ArrowRight size={14} />
            </Link>
          </div>

          <div className="tables-matrix-grid">
            {tables.slice(0, 12).map((t, idx) => {
              const isOccupied = isTableOccupied(t);
              return (
                <div key={t.id || idx} className={`table-tile ${isOccupied ? 'tile-occupied' : 'tile-available'}`}>
                  <b className="tile-number">{t.table_number || `T${idx + 1}`}</b>
                  <span className="tile-capacity">{t.capacity || 4} Seats</span>
                  <span className={`tile-status-indicator ${isOccupied ? 'indicator-occupied' : 'indicator-available'}`}>
                    {isOccupied ? 'Occupied' : 'Available'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
