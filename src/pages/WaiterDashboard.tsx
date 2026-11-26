import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Droplet,
  Flame,
  LayoutGrid,
  Receipt,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Users,
  Utensils
} from 'lucide-react';
import { DEFAULT_TABLES, getCached, getOrders, getTables, updateOrderStatus } from '../lib/data';
import { money, supabase } from '../lib/supabase';

export function WaiterDashboard({
  onNavigateTab,
  setNotice
}: {
  onNavigateTab?: (tab: string) => void;
  setNotice?: (n: any) => void;
}) {
  const [tables, setTables] = useState<any[]>(() => getCached<any[]>('tables') || DEFAULT_TABLES);
  const [orders, setOrders] = useState<any[]>(() => getCached<any[]>('orders_all') || []);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async (force = false) => {
    try {
      const [tData, oData] = await Promise.all([getTables(force), getOrders({}, force)]);
      if (tData !== null && tData !== undefined) setTables(tData);
      if (oData !== null && oData !== undefined) setOrders(oData);

      if (supabase) {
        const { data: reqs } = await supabase
          .from('service_requests')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);
        if (reqs && reqs.length > 0) setRequests(reqs);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    if (!supabase) return;
    const channel = supabase
      .channel('waiter-dash-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dining_tables' }, () => loadData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests' }, () => loadData(true))
      .subscribe();

    return () => {
      if (supabase) supabase.removeChannel(channel);
    };
  }, []);

  const handleMarkServed = async (orderId: string, orderNum: number) => {
    if (!supabase) return;
    try {
      await updateOrderStatus(orderId, 'served');
      if (setNotice) setNotice({ text: `Order #SVR${orderNum} marked as Served!`, kind: 'success' });
      await loadData();
    } catch (err: any) {
      if (setNotice) setNotice({ text: err.message || 'Error marking served.', kind: 'error' });
    }
  };

  // Stats calculation
  const occupiedTables = tables.filter(t => t.status === 'occupied' || t.status === 'bill_requested');
  const activeOrders = orders.filter(o => o.status === 'received' || o.status === 'preparing' || o.status === 'ready_for_serving' || o.status === 'ready');
  const newOrders = orders.filter(o => o.status === 'received' || o.status === 'new');
  const readyOrders = orders.filter(o => o.status === 'ready_for_serving' || o.status === 'ready');
  const servedToday = orders.filter(o => o.status === 'served' || o.status === 'completed');

  return (
    <div className="waiter-tables-container" style={{ gap: '24px' }}>
      {/* 1. Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #231209 0%, #3d1c0b 100%)',
          borderRadius: '20px',
          padding: '24px 28px',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          boxShadow: '0 8px 24px rgba(35, 18, 9, 0.25)'
        }}
      >
        <div>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Live Floor Operations
          </span>
          <h2 style={{ fontSize: '24px', fontWeight: 800, margin: '4px 0 6px', color: '#ffffff' }}>
            Welcome back, Waiter!
          </h2>
          <p style={{ margin: 0, fontSize: '14px', color: '#e5d5c5' }}>
            You have <b>{occupiedTables.length} active tables</b> and <b>{readyOrders.length} orders ready to serve</b>.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigateTab && onNavigateTab('tables')}
          style={{
            background: '#ea580c',
            color: '#ffffff',
            border: 'none',
            padding: '12px 22px',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(234, 88, 12, 0.4)'
          }}
        >
          <span>Manage Tables</span>
          <ArrowRight size={16} />
        </button>
      </div>

      {/* 2. Top Summary Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div style={{ background: '#ffffff', border: '1px solid #ebdcd0', borderRadius: '16px', padding: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: 48, height: 48, borderRadius: '12px', background: '#fff2e6', color: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Utensils size={22} />
          </div>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#1e0c04' }}>{occupiedTables.length} / {tables.length}</div>
            <div style={{ fontSize: '12.5px', color: '#8c6e58', fontWeight: 600 }}>Active Dining Tables</div>
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #ebdcd0', borderRadius: '16px', padding: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: 48, height: 48, borderRadius: '12px', background: '#fef2f2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Flame size={22} />
          </div>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#1e0c04' }}>{activeOrders.length}</div>
            <div style={{ fontSize: '12.5px', color: '#8c6e58', fontWeight: 600 }}>Orders In Preparation</div>
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #ebdcd0', borderRadius: '16px', padding: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: 48, height: 48, borderRadius: '12px', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#1e0c04' }}>{readyOrders.length}</div>
            <div style={{ fontSize: '12.5px', color: '#8c6e58', fontWeight: 600 }}>Ready to Serve</div>
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #ebdcd0', borderRadius: '16px', padding: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: 48, height: 48, borderRadius: '12px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShoppingBag size={22} />
          </div>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#1e0c04' }}>{servedToday.length}</div>
            <div style={{ fontSize: '12.5px', color: '#8c6e58', fontWeight: 600 }}>Orders Served Today</div>
          </div>
        </div>
      </div>

      {/* 3. Ready to Serve Alert Banner */}
      {readyOrders.length > 0 && (
        <div
          style={{
            background: '#f0fdf4',
            border: '1.5px solid #86efac',
            borderRadius: '16px',
            padding: '18px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
              <b style={{ color: '#15803d', fontSize: '16px' }}>Ready for Immediate Service ({readyOrders.length})</b>
            </div>
            <span style={{ fontSize: '12.5px', color: '#166534', fontWeight: 600 }}>
              Kitchen has finished preparing these orders
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            {readyOrders.map(ord => (
              <div
                key={ord.id}
                style={{
                  background: '#ffffff',
                  border: '1px solid #bbf7d0',
                  borderRadius: '14px',
                  padding: '14px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <b style={{ fontSize: '15px', color: '#1e0c04' }}>#SVR{ord.order_number}</b>
                  <div style={{ fontSize: '13px', color: '#15803d', fontWeight: 700 }}>
                    Table {ord.table_label || 'T01'} &bull; {ord.customer_name || 'Guest'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleMarkServed(ord.id, ord.order_number)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '20px',
                    border: 'none',
                    background: '#16a34a',
                    color: '#ffffff',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(22, 163, 74, 0.3)'
                  }}
                >
                  <Check size={14} /> <span>Mark as Served</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Two Column Layout: Assigned Tables Quick Grid + Live Service Requests */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.1fr', gap: '20px' }}>
        {/* Left: Assigned Tables Overview */}
        <div style={{ background: '#ffffff', border: '1px solid #ebdcd0', borderRadius: '20px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '18px', color: '#1e0c04', fontWeight: 800 }}>
              Your Assigned Tables ({tables.length})
            </h3>
            <button
              type="button"
              onClick={() => onNavigateTab && onNavigateTab('tables')}
              style={{ background: 'none', border: 'none', color: '#ea580c', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
            >
              Open Table Service &rarr;
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px' }}>
            {tables.slice(0, 12).map(t => {
              const status = (t.status || 'available').toLowerCase();
              return (
                <div
                  key={t.id || t.table_number}
                  onClick={() => onNavigateTab && onNavigateTab('tables')}
                  style={{
                    border: '1.5px solid #ebdcd0',
                    borderRadius: '14px',
                    padding: '12px',
                    background: '#fffbf7',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b style={{ fontSize: '16px', color: '#1e0c04' }}>{t.table_number}</b>
                    <small style={{ color: '#8c6e58' }}>{t.capacity}p</small>
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '12px',
                      width: 'fit-content',
                      background: status === 'occupied' ? '#fee2e2' : status === 'bill_requested' ? '#ffedd5' : '#dcfce7',
                      color: status === 'occupied' ? '#dc2626' : status === 'bill_requested' ? '#c2410c' : '#15803d'
                    }}
                  >
                    {status === 'occupied' ? 'Occupied' : status === 'bill_requested' ? 'Bill Req' : 'Available'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Live Guest Requests */}
        <div style={{ background: '#ffffff', border: '1px solid #ebdcd0', borderRadius: '20px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '18px', color: '#1e0c04', fontWeight: 800 }}>
              Recent Guest Requests
            </h3>
            <button
              type="button"
              onClick={() => onNavigateTab && onNavigateTab('tables')}
              style={{ background: 'none', border: 'none', color: '#ea580c', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
            >
              View All &rarr;
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {requests.slice(0, 5).map(r => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: '#fffbf7',
                  borderRadius: '12px',
                  border: '1px solid #ebdcd0'
                }}
              >
                <div>
                  <b style={{ fontSize: '13.5px', color: '#1e0c04' }}>
                    {r.request_type === 'water'
                      ? 'Water requested'
                      : r.request_type === 'plates'
                      ? 'Extra plates'
                      : r.request_type === 'bill'
                      ? 'Bill requested'
                      : 'Call waiter'}
                  </b>
                  <div style={{ fontSize: '11.5px', color: '#8c6e58' }}>
                    Table {r.table_label || 'T01'} &bull; {r.status}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: '12px',
                    background: r.status === 'completed' ? '#dcfce7' : '#ffedd5',
                    color: r.status === 'completed' ? '#15803d' : '#c2410c'
                  }}
                >
                  {r.status?.toUpperCase() || 'NEW'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
