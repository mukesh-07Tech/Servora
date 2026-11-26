import { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  Check,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  Layers,
  Lock,
  QrCode,
  Receipt,
  RefreshCw,
  Search,
  Smartphone,
  Utensils,
  X
} from 'lucide-react';
import { DEFAULT_TABLES, getCached, getOrders, getTables, getPendingCancellationRequests, approveOrderCancellation, rejectOrderCancellation, CancellationRequestInfo } from '../lib/data';
import { money, supabase } from '../lib/supabase';

export function WaiterBillsPage({
  setNotice,
  globalSearch
}: {
  setNotice?: (n: any) => void;
  globalSearch?: string;
}) {
  const [tables, setTables] = useState<any[]>(() => getCached<any[]>('tables') || DEFAULT_TABLES);
  const [orders, setOrders] = useState<any[]>(() => getCached<any[]>('orders_all') || []);
  const [settledBills, setSettledBills] = useState<any[]>([]);
  const [cancelRequests, setCancelRequests] = useState<CancellationRequestInfo[]>([]);
  const [selectedTableNum, setSelectedTableNum] = useState<string>('T01');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'upi' | 'razorpay'>('cash');
  const [cashTendered, setCashTendered] = useState<string>('');
  const [upiRef, setUpiRef] = useState<string>('');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [lastSettledBill, setLastSettledBill] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async (force = false) => {
    try {
      const [tData, oData, cReqs] = await Promise.all([
        getTables(force),
        getOrders({}, force),
        getPendingCancellationRequests()
      ]);
      if (tData !== null && tData !== undefined) setTables(tData);
      if (oData !== null && oData !== undefined) setOrders(oData);
      if (cReqs) setCancelRequests(cReqs);

      if (supabase) {
        const { data: billsData } = await supabase
          .from('bills')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);
        if (billsData && billsData.length > 0) setSettledBills(billsData);
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
      .channel('bills-page-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { loadData(true); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dining_tables' }, () => { loadData(true); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests' }, () => { loadData(true); })
      .subscribe();

    return () => {
      if (supabase) supabase.removeChannel(channel);
    };
  }, []);

  const handleApproveCancel = async (cr: CancellationRequestInfo) => {
    setIsSubmitting(true);
    try {
      const matchingOrd = orders.find(o => o.id === cr.orderId || String(o.order_number) === String(cr.orderNumber));
      const targetOrdId = matchingOrd?.id || cr.orderId;
      await approveOrderCancellation(targetOrdId, cr.id, cr.tableLabel);
      if (setNotice) setNotice({ text: `Order #${cr.orderNumber} cancellation APPROVED by billing counter. Order cancelled and removed from bill.`, kind: 'success' });
      await loadData(true);
    } catch (e: any) {
      if (setNotice) setNotice({ text: e.message || 'Could not approve cancellation.', kind: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectCancel = async (cr: CancellationRequestInfo) => {
    try {
      await rejectOrderCancellation(cr.id, 'Declined by billing counter');
      if (setNotice) setNotice({ text: `Cancellation request for Order #${cr.orderNumber} declined. Order remains active.`, kind: 'info' });
      await loadData(true);
    } catch (e: any) {
      if (setNotice) setNotice({ text: e.message || 'Could not decline cancellation.', kind: 'error' });
    }
  };

  // Filter tables that have an active order or requested bill
  const billingTables = tables.filter(t => {
    const hasOrder = orders.some(o => o.table_label === t.table_number && o.payment_status !== 'paid');
    return hasOrder || t.status === 'bill_requested' || t.status === 'occupied';
  });

  const currentTable = tables.find(t => t.table_number === selectedTableNum) || billingTables[0] || tables[0];
  const tableOrders = orders.filter(
    o => o.table_label === currentTable?.table_number && o.payment_status !== 'paid'
  );
  const [mergeAllOrders, setMergeAllOrders] = useState(true);

  // If table has multiple unpaid orders and mergeAllOrders is enabled, merge them all into a single settlement
  const activeOrders = (tableOrders.length > 1 && mergeAllOrders)
    ? tableOrders
    : (tableOrders.length > 0 ? [tableOrders[0]] : (orders.find(o => o.table_label === currentTable?.table_number) ? [orders.find(o => o.table_label === currentTable?.table_number)!] : []));
  const activeOrder = activeOrders[0] || null;

  const allOrderItems = activeOrders.flatMap(o => o.order_items || []);
  const subtotal = activeOrders.reduce((sum, o) => {
    const raw = (o.order_items || []) as any[];
    const itemsSum = raw.reduce((s: number, it: any) => s + (Number(it.line_total) || (Number(it.unit_price) || 0) * (it.quantity || 1)), 0);
    return sum + (Number(o.subtotal) > 0 ? Number(o.subtotal) : (itemsSum > 0 ? itemsSum : (Number(o.total) > 0 ? Math.round(Number(o.total) / 1.05) : 0)));
  }, 0);
  const discountAmount = Number(((subtotal * discountPercent) / 100).toFixed(2));
  const taxableSubtotal = Math.max(0, subtotal - discountAmount);
  const taxGst = Number((taxableSubtotal * 0.05).toFixed(2));
  const finalTotal = Number((taxableSubtotal + taxGst).toFixed(2));

  const changeReturn = Number(cashTendered) > finalTotal ? Number(cashTendered) - finalTotal : 0;

  // Handle Bill Settlement
  const handleSettleBill = async () => {
    if (!activeOrder || activeOrders.length === 0) {
      if (setNotice) setNotice({ text: 'No active order to settle for this table.', kind: 'error' });
      return;
    }

    if (paymentMode === 'razorpay') {
      if (setNotice) setNotice({ text: 'Razorpay is disabled by administrator. Please use Cash or UPI.', kind: 'error' });
      return;
    }

    if (paymentMode === 'cash' && Number(cashTendered) < finalTotal && Number(cashTendered) !== 0) {
      if (setNotice) setNotice({ text: `Cash tendered (₹${cashTendered}) is less than total bill (₹${finalTotal}).`, kind: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      const restRes = await supabase?.from('restaurants').select('id').limit(1).maybeSingle();
      const restaurantId = restRes?.data?.id || 'a0000000-0000-0000-0000-000000000001';

      const billRecord = {
        restaurant_id: restaurantId,
        dining_session_id: activeOrder.dining_session_id || null,
        subtotal: taxableSubtotal,
        tax: taxGst,
        service_charge: 0,
        discount: discountAmount,
        total: finalTotal,
        paid_amount: finalTotal,
        status: 'settled',
        created_at: new Date().toISOString()
      };

      if (supabase) {
        // Insert Bill
        const { data: insertedBill, error: bErr } = await supabase.from('bills').insert(billRecord).select().single();
        if (bErr) throw bErr;

        // Update all merged orders to Paid & Completed
        const orderIds = activeOrders.map(o => o.id);
        await supabase
          .from('orders')
          .update({
            payment_status: 'paid',
            status: 'completed',
            updated_at: new Date().toISOString()
          })
          .in('id', orderIds);

        // Also sync order_items status for these orders to completed
        try {
          await supabase.from('order_items').update({ status: 'completed' }).in('order_id', orderIds);
        } catch {}

        // Free Table to available
        if (currentTable) {
          await supabase
            .from('dining_tables')
            .update({ status: 'available' })
            .eq('id', currentTable.id);
        }

        setLastSettledBill({
          billNumber: insertedBill?.bill_number || `BIL-${Date.now().toString().slice(-4)}`,
          orderNumber: activeOrders.map(o => `#SVR${o.order_number}`).join(', '),
          tableLabel: currentTable?.table_number,
          customerName: activeOrder.customer_name || 'Guest',
          subtotal: taxableSubtotal,
          tax: taxGst,
          discount: discountAmount,
          total: finalTotal,
          paymentMode: paymentMode.toUpperCase(),
          cashTendered: Number(cashTendered) || finalTotal,
          changeReturn,
          date: new Date().toLocaleString('en-IN'),
          items: allOrderItems
        });

        setReceiptModalOpen(true);
      }

      if (setNotice) {
        setNotice({
          text: `Bill settled successfully for Table ${currentTable?.table_number}! (${activeOrders.length} order(s) merged • Total: ₹${finalTotal})`,
          kind: 'success'
        });
      }
      setCashTendered('');
      setUpiRef('');
      await loadData();
    } catch (err: any) {
      if (setNotice) setNotice({ text: err.message || 'Error settling bill.', kind: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="waiter-tables-container" style={{ gap: '20px' }}>
      {/* Top Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #231209 0%, #3a190b 100%)',
          borderRadius: '20px',
          padding: '20px 24px',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Receipt size={24} color="#f97316" />
          </div>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: '#ffffff' }}>
              Table Billing & Payment Settlement
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#ebdcd0' }}>
              Calculate GST, generate digital tax invoices and record Cash or UPI payments.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => loadData(true)}
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: '10px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 700,
            fontSize: '13px'
          }}
        >
          <RefreshCw size={14} /> Refresh Tables
        </button>
      </div>

      {/* Select Table Bar */}
      <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
        {tables.map(t => {
          const isSel = t.table_number === selectedTableNum;
          const hasBillReq = t.status === 'bill_requested';
          const isOcc = t.status === 'occupied';

          return (
            <button
              key={t.id || t.table_number}
              type="button"
              onClick={() => setSelectedTableNum(t.table_number)}
              style={{
                padding: '10px 18px',
                borderRadius: '14px',
                border: isSel ? '2px solid #ea580c' : '1px solid #ebdcd0',
                background: isSel ? '#fff7ed' : '#ffffff',
                color: isSel ? '#ea580c' : '#3b1e10',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexShrink: 0
              }}
            >
              <span>{t.table_number}</span>
              {cancelRequests.some(cr => cr.tableLabel === t.table_number) && (
                <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '10px', background: '#dc2626', color: '#fff', fontWeight: 800 }}>
                  Cancel Req
                </span>
              )}
              {hasBillReq && (
                <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '10px', background: '#ea580c', color: '#fff' }}>
                  Bill Req
                </span>
              )}
              {isOcc && !hasBillReq && (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Main Billing Split Grid */}
      <div className="waiter-billing-grid">
        {/* Left: Order Items & Calculation */}
        <div className="billing-left-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ebdcd0', paddingBottom: '14px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#1e0c04' }}>
                Table {currentTable?.table_number || 'T01'} – Order Summary
              </h3>
              <small style={{ color: '#8c6e58' }}>
                Order #{activeOrder ? activeOrder.order_number : '—'} &bull; Guest: {activeOrder?.customer_name || 'Dine-In Guest'}
              </small>
            </div>
            <span className="table-status-pill occupied">
              {activeOrder?.status?.toUpperCase() || 'UNBILLED'}
            </span>
          </div>

          {/* Cancellation Request Warning Banner for this Table */}
          {(() => {
            const tableCancelReqs = cancelRequests.filter(cr =>
              cr.tableLabel === currentTable?.table_number ||
              activeOrders.some(o => o.id === cr.orderId || String(o.order_number) === String(cr.orderNumber))
            );
            if (tableCancelReqs.length === 0) return null;
            return (
              <div style={{
                background: '#fff1f2',
                border: '1.5px solid #fecdd3',
                borderRadius: '12px',
                padding: '12px 16px',
                marginTop: '12px',
                marginBottom: '10px'
              }}>
                {tableCancelReqs.map(cr => (
                  <div key={cr.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <AlertTriangle size={18} />
                      </div>
                      <div>
                        <b style={{ color: '#991b1b', fontSize: '13px', display: 'block' }}>
                          Customer Requested Cancellation for Order #{cr.orderNumber}
                        </b>
                        <span style={{ color: '#be123c', fontSize: '12px' }}>
                          Table {cr.tableLabel} • Reason: "{cr.reason}"
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        style={{
                          background: '#dc2626',
                          color: '#ffffff',
                          border: 'none',
                          padding: '8px 14px',
                          borderRadius: '8px',
                          fontWeight: 800,
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)'
                        }}
                        disabled={isSubmitting}
                        onClick={() => handleApproveCancel(cr)}
                      >
                        <Check size={14} /> Approve Cancellation
                      </button>
                      <button
                        type="button"
                        style={{
                          background: '#ffffff',
                          color: '#4b5563',
                          border: '1px solid #d1d5db',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                        disabled={isSubmitting}
                        onClick={() => handleRejectCancel(cr)}
                      >
                        ✕ Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Dish items table */}
          {!activeOrder ? (
            <div style={{ padding: '36px', textAlign: 'center', color: '#8c6e58' }}>
              <Utensils size={36} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
              <b>No active orders on this table.</b>
              <p style={{ margin: '4px 0 0', fontSize: '13px' }}>Select an occupied table or table with requested bill.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {tableOrders.length > 1 && (
                <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Layers size={18} color="#ea580c" />
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#c2410c' }}>
                      {tableOrders.length} Unpaid Orders for Table {currentTable?.table_number}
                    </span>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#9a3412', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={mergeAllOrders}
                      onChange={e => setMergeAllOrders(e.target.checked)}
                      style={{ accentColor: '#ea580c' }}
                    />
                    Merge All Orders &amp; Settle
                  </label>
                </div>
              )}
              {(allOrderItems.length > 0 ? allOrderItems : (activeOrder.order_items || [])).map((it: any, idx: number) => {
                const lineTotal = Number(it.line_total || it.unit_price * it.quantity);
                const itemGst = (lineTotal * 0.05).toFixed(2);
                return (
                  <div
                    key={it.id || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      background: '#fffbf7',
                      border: '1px solid #f3e5d8'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          marginTop: 3,
                          borderRadius: '4px',
                          border: '1.5px solid #16a34a',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                        title="Pure Vegetarian"
                      >
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <b style={{ color: '#1e0c04', fontSize: '15px' }}>{it.item_name}</b>
                          {it.station && (
                            <span
                              style={{
                                fontSize: '11px',
                                padding: '2px 7px',
                                borderRadius: '6px',
                                background: '#fef3c7',
                                color: '#92400e',
                                fontWeight: 700
                              }}
                            >
                              {it.station}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: '#8c6e58', marginTop: '2px' }}>
                          Rate: ₹{it.unit_price} &bull; Qty: <b>{it.quantity}</b> &bull; GST (5%): ₹{itemGst}
                        </div>
                        {it.notes && (
                          <div style={{ fontSize: '11px', color: '#ea580c', fontWeight: 600, marginTop: '2px' }}>
                            Special note: &ldquo;{it.notes}&rdquo;
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <b style={{ color: '#ea580c', fontSize: '16px' }}>
                        ₹{lineTotal.toFixed(2)}
                      </b>
                      <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700, marginTop: '2px' }}>
                        Ready for Serving
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Discounts */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', borderTop: '1px solid #ebdcd0', paddingTop: '14px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#3b1e10' }}>Discount:</span>
            {[0, 5, 10, 15].map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setDiscountPercent(d)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '10px',
                  border: discountPercent === d ? '1.5px solid #ea580c' : '1px solid #ebdcd0',
                  background: discountPercent === d ? '#fff7ed' : '#ffffff',
                  color: discountPercent === d ? '#ea580c' : '#3b1e10',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                {d === 0 ? 'None' : `${d}% OFF`}
              </button>
            ))}
          </div>

          {/* Breakdown Box */}
          <div className="billing-receipt-summary">
            <div className="billing-calc-row">
              <span>Subtotal:</span>
              <b>₹{subtotal.toFixed(2)}</b>
            </div>
            {discountPercent > 0 && (
              <div className="billing-calc-row" style={{ color: '#16a34a' }}>
                <span>Discount ({discountPercent}%):</span>
                <b>-₹{discountAmount.toFixed(2)}</b>
              </div>
            )}
            <div className="billing-calc-row">
              <span>Restaurant GST (5%):</span>
              <b>₹{taxGst.toFixed(2)}</b>
            </div>
            <div className="billing-calc-row total-row">
              <span>Total Payable:</span>
              <span style={{ color: '#ea580c' }}>₹{finalTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Right: Payment Method & Settlement */}
        <div className="billing-right-card">
          <h3 style={{ margin: 0, fontSize: '18px', color: '#1e0c04', fontWeight: 800 }}>
            Select Payment Method
          </h3>

          <div className="payment-method-selector">
            <button
              type="button"
              className={`pay-method-btn ${paymentMode === 'cash' ? 'active' : ''}`}
              onClick={() => setPaymentMode('cash')}
            >
              <Banknote size={24} />
              <span>Cash</span>
            </button>

            <button
              type="button"
              className={`pay-method-btn ${paymentMode === 'upi' ? 'active' : ''}`}
              onClick={() => setPaymentMode('upi')}
            >
              <Smartphone size={24} />
              <span>UPI / QR</span>
            </button>

            <button
              type="button"
              className="pay-method-btn disabled"
              title="Razorpay gateway disabled by restaurant administrator"
            >
              <CreditCard size={24} />
              <span>Razorpay</span>
              <small style={{ fontSize: '10px', color: '#dc2626', fontWeight: 700 }}>
                <Lock size={10} style={{ display: 'inline', marginRight: 2 }} />
                Disabled
              </small>
            </button>
          </div>

          {/* Cash Tendered Form */}
          {paymentMode === 'cash' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#fffbf7', padding: '16px', borderRadius: '14px', border: '1px solid #ebdcd0' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: '#3b1e10' }}>
                Cash Tendered by Customer (₹)
              </label>
              <input
                type="number"
                placeholder={`e.g. ${finalTotal}`}
                value={cashTendered}
                onChange={e => setCashTendered(e.target.value)}
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #ebdcd0',
                  fontSize: '16px',
                  fontWeight: 700,
                  outline: 'none'
                }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                {[finalTotal, Math.ceil(finalTotal / 100) * 100, 500, 1000].map((amt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCashTendered(String(amt))}
                    style={{
                      flex: 1,
                      padding: '6px',
                      borderRadius: '8px',
                      border: '1px solid #ebdcd0',
                      background: '#fff',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>

              {Number(cashTendered) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#ecfdf5', borderRadius: '10px', color: '#065f46', fontWeight: 700 }}>
                  <span>Change Return:</span>
                  <b>₹{changeReturn.toFixed(2)}</b>
                </div>
              )}
            </div>
          )}

          {/* UPI Form */}
          {paymentMode === 'upi' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#fffbf7', padding: '16px', borderRadius: '14px', border: '1px solid #ebdcd0', textAlign: 'center' }}>
              <b style={{ color: '#1e0c04' }}>Scan Restaurant UPI QR</b>
              <div style={{ width: 140, height: 140, margin: '0 auto', background: '#ffffff', border: '1px solid #ebdcd0', borderRadius: '12px', padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <QrCode size={120} color="#1e0c04" />
              </div>
              <span style={{ fontSize: '13px', color: '#8c6e58' }}>UPI ID: <b>servora.restaurant@okhdfcbank</b></span>

              <input
                type="text"
                placeholder="Enter 12-digit UPI UTR / Ref Number (Optional)"
                value={upiRef}
                onChange={e => setUpiRef(e.target.value)}
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #ebdcd0',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
            </div>
          )}

          <button
            type="button"
            disabled={!activeOrder || isSubmitting}
            onClick={handleSettleBill}
            style={{
              padding: '14px',
              borderRadius: '14px',
              border: 'none',
              background: '#ea580c',
              color: '#ffffff',
              fontSize: '15px',
              fontWeight: 800,
              cursor: activeOrder ? 'pointer' : 'not-allowed',
              opacity: activeOrder ? 1 : 0.6,
              boxShadow: '0 4px 16px rgba(234, 88, 12, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <Check size={18} strokeWidth={2.5} />
            <span>{isSubmitting ? 'Processing Settlement...' : `Settle ₹${finalTotal.toFixed(2)} & Complete`}</span>
          </button>
        </div>
      </div>

      {/* RECEIPT MODAL */}
      {receiptModalOpen && lastSettledBill && (
        <div className="waiter-modal-backdrop" onClick={() => setReceiptModalOpen(false)}>
          <div className="waiter-modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px', padding: '24px' }}>
            <div style={{ textAlign: 'center', borderBottom: '1px dashed #ebdcd0', paddingBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: '#ea580c' }}>SERVORA</h2>
              <small style={{ color: '#8c6e58' }}>Dine-In QR &amp; Service</small>
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#6d4a36' }}>
                Bill #{lastSettledBill.billNumber} &bull; Order #SVR{lastSettledBill.orderNumber}
              </div>
              <div style={{ fontSize: '12px', color: '#6d4a36' }}>
                Table: <b>{lastSettledBill.tableLabel}</b> &bull; Waiter: <b>Waiter</b>
              </div>
              <div style={{ fontSize: '11px', color: '#a88470', marginTop: '4px' }}>{lastSettledBill.date}</div>
            </div>

            {/* Food items in receipt */}
            {lastSettledBill.items && lastSettledBill.items.length > 0 && (
              <div style={{ padding: '12px 0', borderBottom: '1px dashed #ebdcd0' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#8c6e58', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>
                  Ordered Food Items
                </div>
                {lastSettledBill.items.map((it: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                    <span>{it.quantity}&times; {it.item_name}</span>
                    <span style={{ fontWeight: 700, color: '#1e0c04' }}>
                      ₹{Number(it.line_total || it.unit_price * it.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ padding: '16px 0', borderBottom: '1px dashed #ebdcd0', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal:</span>
                <b>₹{lastSettledBill.subtotal.toFixed(2)}</b>
              </div>
              {lastSettledBill.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                  <span>Discount:</span>
                  <b>-₹{lastSettledBill.discount.toFixed(2)}</b>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>GST (5%):</span>
                <b>₹{lastSettledBill.tax.toFixed(2)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 800, color: '#1e0c04', marginTop: '6px' }}>
                <span>Total Amount:</span>
                <span style={{ color: '#ea580c' }}>₹{lastSettledBill.total.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#8c6e58' }}>
                <span>Payment Mode:</span>
                <b>{lastSettledBill.paymentMode}</b>
              </div>
              {lastSettledBill.changeReturn > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#059669', fontWeight: 700 }}>
                  <span>Change Returned:</span>
                  <b>₹{lastSettledBill.changeReturn.toFixed(2)}</b>
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ margin: 0, fontSize: '12px', color: '#8c6e58' }}>Thank you for dining with Servora!</p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    const billText = `SERVORA - FINAL DINING RECEIPT
Order #${lastSettledBill.order_number} • Table ${lastSettledBill.table_label}
Date: ${new Date().toLocaleString()}
Payment Method: ${lastSettledBill.paymentMethod.toUpperCase()}
------------------------------------------------
Subtotal: ₹${lastSettledBill.subtotal.toFixed(2)}
GST (5%): ₹${lastSettledBill.tax.toFixed(2)}
Total Paid: ₹${lastSettledBill.total.toFixed(2)}
${lastSettledBill.changeReturn > 0 ? `Change Returned: ₹${lastSettledBill.changeReturn.toFixed(2)}\n` : ''}------------------------------------------------
Thank you for dining with Servora!
`;
                    const blob = new Blob([billText], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Receipt_SVR${lastSettledBill.order_number}.txt`;
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
                  <Download size={15} /> Download Receipt
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptModalOpen(false)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '10px',
                    border: 'none',
                    background: '#ea580c',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
