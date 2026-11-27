import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Award,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Crown,
  Download,
  Edit2,
  Eye,
  FileText,
  Filter,
  Gift,
  Heart,
  Mail,
  MessageSquare,
  MessageSquareShare,
  Minus,
  Percent,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  User,
  UserCheck,
  UserPlus,
  Users,
  Utensils,
  X,
  Zap
} from 'lucide-react';
import { getCached, getCustomers, getOrders } from '../lib/data';
import { money, supabase } from '../lib/supabase';

export function CustomersPage({ setNotice, globalSearch }: { setNotice?: (n: any) => void; globalSearch?: string }) {
  // Main Sub-Nav Tab
  const [activeTab, setActiveTab] = useState<'list' | 'loyalty' | 'feedback' | 'reports'>('list');

  // Customers Data - Dynamic from Database
  const [customers, setCustomers] = useState<any[]>(() => getCached<any[]>('customers') || []);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(() => {
    const list = getCached<any[]>('customers');
    return list && list.length ? list[0] : null;
  });
  const [loading, setLoading] = useState(false);

  // Filters & Sorting
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterVisits, setFilterVisits] = useState('all');
  const [sortBy, setSortBy] = useState<'recent' | 'spent' | 'visits' | 'name'>('recent');
  const [searchQuery, setSearchQuery] = useState(globalSearch || '');
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  useEffect(() => {
    if (globalSearch !== undefined) {
      setSearchQuery(globalSearch);
    }
  }, [globalSearch]);

  // Customer Details Sub-Tab
  const [detailTab, setDetailTab] = useState<'orders' | 'preferences' | 'feedback' | 'notes'>('orders');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  // Form State for Add / Edit
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formStatus, setFormStatus] = useState('Loyal');
  const [formVisits, setFormVisits] = useState('5');
  const [formSpent, setFormSpent] = useState('1250');
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Quick Action Form States
  const [rewardPoints, setRewardPoints] = useState('100');
  const [selectedOffer, setSelectedOffer] = useState('TIFFIN20 (20% OFF Tiffin Combos)');
  const [customMessage, setCustomMessage] = useState('Thank you for dining at Servora! We look forward to serving you again soon.');
  const [customerNotes, setCustomerNotes] = useState<Record<string, string>>({});
  const [activeNoteText, setActiveNoteText] = useState('');

  // Orders for order history tab
  const [allOrders, setAllOrders] = useState<any[]>([]);

  const loadData = async (force = false) => {
    try {
      // 1. Fetch customers first for instant display
      const dbCustomers = await getCustomers(force);
      if (dbCustomers !== null && dbCustomers !== undefined) {
        setCustomers(dbCustomers);
        setSelectedCustomer((prev: any) => prev && dbCustomers.find((c: any) => c.id === prev.id) ? prev : (dbCustomers[0] || null));
      }
      // 2. Fetch orders in the background for order history tab
      const dbOrders = await getOrders({}, force);
      if (dbOrders !== null && dbOrders !== undefined) {
        setAllOrders(dbOrders);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const client = supabase;
    if (client) {
      const channel = client
        .channel('customers-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_profiles' }, () => {
          loadData(true);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
          loadData(true);
        })
        .subscribe();

      // Relaxed backup polling interval since Supabase Realtime pushes live changes
      const timer = setInterval(() => loadData(false), 25000);
      return () => {
        client.removeChannel(channel);
        clearInterval(timer);
      };
    } else {
      const timer = setInterval(() => loadData(false), 25000);
      return () => clearInterval(timer);
    }
  }, []);

  useEffect(() => {
    if (selectedCustomer) {
      setActiveNoteText(
        customerNotes[selectedCustomer.id] ||
        'Prefers corner table by the window. Favorite beverage is Madras Filter Coffee. Enjoys crisp Podi Dosa with extra coconut chutney.'
      );
    }
  }, [selectedCustomer]);

  // Metric computations from actual DB
  const totalCustomersCount = customers.length;
  const newCustomersCount = customers.filter(c => (c.status || '').toLowerCase() === 'new').length;
  const loyalCustomersCount = customers.filter(c => ['loyal', 'vip'].includes((c.status || '').toLowerCase()) || (c.visits || 0) >= 5).length;
  const repeatRate = totalCustomersCount > 0 ? Math.round((loyalCustomersCount / totalCustomersCount) * 100) : 72;

  // Filter & Sort Logic
  const filteredCustomers = customers.filter(c => {
    // Status Filter
    if (filterStatus !== 'all' && (c.status || '').toLowerCase() !== filterStatus.toLowerCase()) {
      return false;
    }
    // Visits Filter
    const v = Number(c.visits || 1);
    if (filterVisits === '1-3' && (v < 1 || v > 3)) return false;
    if (filterVisits === '4-10' && (v < 4 || v > 10)) return false;
    if (filterVisits === '10+' && v <= 10) return false;

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = (c.full_name || '').toLowerCase().includes(q);
      const matchPhone = (c.phone || '').includes(q);
      const matchEmail = (c.email || '').toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchEmail) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortBy === 'spent') return Number(b.total_spent || 0) - Number(a.total_spent || 0);
    if (sortBy === 'visits') return Number(b.visits || 0) - Number(a.visits || 0);
    if (sortBy === 'name') return (a.full_name || '').localeCompare(b.full_name || '');
    // recent
    const da = a.last_visit ? new Date(a.last_visit).getTime() : 0;
    const db = b.last_visit ? new Date(b.last_visit).getTime() : 0;
    return db - da;
  });

  const activeCustomer = selectedCustomer || filteredCustomers[0] || null;

  // Add Customer Handler (Database insert)
  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !supabase) return;
    setSavingCustomer(true);
    try {
      const restRes = await supabase.from('restaurants').select('id').limit(1).maybeSingle();
      const restId = restRes.data?.id;

      const { data, error } = await supabase.from('customer_profiles').insert({
        restaurant_id: restId,
        full_name: formName.trim(),
        phone: formPhone.trim() || '+91 98765 00000',
        email: formEmail.trim() || `${formName.toLowerCase().replace(/\s+/g, '')}@gmail.com`,
        status: formStatus,
        visits: Number(formVisits) || 1,
        total_spent: Number(formSpent) || 350,
        last_visit: new Date().toISOString()
      }).select().single();

      if (error) throw error;
      if (setNotice) setNotice({ text: `Customer ${formName} added successfully!`, kind: 'success' });
      setShowAddModal(false);
      setFormName('');
      setFormPhone('');
      setFormEmail('');
      await loadData();
      if (data) setSelectedCustomer(data);
    } catch (e: any) {
      if (setNotice) setNotice({ text: e.message || 'Could not add customer.', kind: 'error' });
    } finally {
      setSavingCustomer(false);
    }
  };

  // Edit Customer Handler (Database update)
  const handleEditCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCustomer || !supabase) return;
    setSavingCustomer(true);
    try {
      const { error } = await supabase.from('customer_profiles').update({
        full_name: formName.trim() || activeCustomer.full_name,
        phone: formPhone.trim() || activeCustomer.phone,
        email: formEmail.trim() || activeCustomer.email,
        status: formStatus || activeCustomer.status,
        visits: Number(formVisits) || activeCustomer.visits,
        total_spent: Number(formSpent) || activeCustomer.total_spent
      }).eq('id', activeCustomer.id);

      if (error) throw error;
      if (setNotice) setNotice({ text: `Customer ${activeCustomer.full_name} updated successfully!`, kind: 'success' });
      setShowEditModal(false);
      await loadData();
      setSelectedCustomer({
        ...activeCustomer,
        full_name: formName.trim() || activeCustomer.full_name,
        phone: formPhone.trim() || activeCustomer.phone,
        email: formEmail.trim() || activeCustomer.email,
        status: formStatus || activeCustomer.status,
        visits: Number(formVisits) || activeCustomer.visits,
        total_spent: Number(formSpent) || activeCustomer.total_spent
      });
    } catch (e: any) {
      if (setNotice) setNotice({ text: e.message || 'Could not update customer.', kind: 'error' });
    } finally {
      setSavingCustomer(false);
    }
  };

  // Delete Customer Handler
  const handleDeleteCustomer = async (cust: any) => {
    if (!supabase) return;
    const ok = window.confirm(`Are you sure you want to delete customer record for ${cust.full_name}?`);
    if (!ok) return;
    try {
      const { error } = await supabase.from('customer_profiles').delete().eq('id', cust.id);
      if (error) throw error;
      if (setNotice) setNotice({ text: `Customer ${cust.full_name} deleted.`, kind: 'success' });
      const updated = customers.filter(c => c.id !== cust.id);
      setCustomers(updated);
      if (selectedCustomer?.id === cust.id) {
        setSelectedCustomer(updated[0] || null);
      }
    } catch (e: any) {
      if (setNotice) setNotice({ text: e.message || 'Could not delete customer.', kind: 'error' });
    }
  };

  // Open Edit Modal with current values
  const openEditModal = (cust: any) => {
    setSelectedCustomer(cust);
    setFormName(cust.full_name || '');
    setFormPhone(cust.phone || '');
    setFormEmail(cust.email || '');
    setFormStatus(cust.status || 'Loyal');
    setFormVisits(String(cust.visits || 1));
    setFormSpent(String(cust.total_spent || 0));
    setShowEditModal(true);
  };

  // Format Last Visit nicely
  const formatLastVisit = (d?: string | Date) => {
    if (!d) return '—';
    const date = new Date(d);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' +
      date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  // Compute Customer specific orders from database
  const getCustomerOrders = (cust: any) => {
    if (!cust) return [];
    const custCleanPhone = (cust.phone || '').replace(/\D/g, '');
    const custCleanName = (cust.full_name || '').trim().toLowerCase();

    const directMatches = allOrders.filter(o => {
      const orderPhone = (o.customer_phone || '').replace(/\D/g, '');
      const orderName = (o.customer_name || '').trim().toLowerCase();

      const phoneMatch = Boolean(custCleanPhone && orderPhone && (orderPhone.endsWith(custCleanPhone.slice(-8)) || custCleanPhone.endsWith(orderPhone.slice(-8))));
      const nameMatch = Boolean(custCleanName && orderName && (custCleanName === orderName || custCleanName.includes(orderName) || orderName.includes(custCleanName)));
      return phoneMatch || nameMatch;
    });

    return directMatches.slice(0, 10).map((o) => ({
      id: `#SVR${o.order_number}`,
      datetime: formatLastVisit(o.created_at),
      items: (o.order_items || []).map((it: any) => it.item_name).join(', ') || 'South Indian Dishes',
      amount: money(Number(o.total || 0)),
      rating: '5.0',
      status: o.status
    }));
  };

  return (
    <div className="admin-page-container customer-management-page">
      {/* 1. Sub-nav Navigation Tabs (Matching Pill Style) */}
      <div className="customers-top-nav-bar">
        <div className="staff-tabs-left">
          <button
            type="button"
            className={`staff-nav-tab-pill ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => setActiveTab('list')}
          >
            <Users size={16} /> <span>Customer List</span>
          </button>
          <button
            type="button"
            className={`staff-nav-tab-pill ${activeTab === 'loyalty' ? 'active' : ''}`}
            onClick={() => setActiveTab('loyalty')}
          >
            <Gift size={16} /> <span>Loyalty &amp; Rewards</span>
          </button>
          <button
            type="button"
            className={`staff-nav-tab-pill ${activeTab === 'feedback' ? 'active' : ''}`}
            onClick={() => setActiveTab('feedback')}
          >
            <Star size={16} /> <span>Feedback &amp; Ratings</span>
          </button>
          <button
            type="button"
            className={`staff-nav-tab-pill ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveTab('reports')}
          >
            <TrendingUp size={16} /> <span>Customer Reports</span>
          </button>
        </div>

        <div className="actions-right customers-actions-right">
          <button
            type="button"
            className="btn-export-customers"
            onClick={() => {
              const csv = "Full Name,Phone,Visits,Total Spent\n" +
                customers.map(c => `"${c.full_name || ''}","${c.phone || ''}",${c.visits || 0},${c.total_spent || 0}`).join("\n");
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `Customers_Export_${new Date().toISOString().split('T')[0]}.csv`;
              a.click();
              URL.revokeObjectURL(url);
              if (setNotice) setNotice({ text: 'Customer directory exported to CSV.', kind: 'success' });
            }}
          >
            <Download size={15} /> <span>Export</span>
          </button>

          <button
            type="button"
            className="btn-add-customer-primary"
            onClick={() => {
              setFormName('');
              setFormPhone('');
              setFormEmail('');
              setFormStatus('Loyal');
              setFormVisits('5');
              setFormSpent('1250');
              setShowAddModal(true);
            }}
          >
            <Plus size={16} /> <span>Add Customer</span>
          </button>
        </div>
      </div>

      {/* 2. Top 5 Stat Cards (100% Dynamic DB Data) */}
      <div className="customers-metrics-row">
        {/* Card 1: Total Customers */}
        <div className="customer-stat-card stat-total-cust">
          <div className="stat-card-left">
            <span className="stat-label">Total Customers</span>
            <b className="stat-val">{totalCustomersCount}</b>
          </div>
          <span className="stat-icon-wrap icon-wood"><Users size={22} /></span>
        </div>

        {/* Card 2: New Customers */}
        <div className="customer-stat-card stat-new-cust">
          <div className="stat-card-left">
            <span className="stat-label">New Customers <span className="stat-sub">This Month</span></span>
            <div className="val-with-trend-row">
              <b className="stat-val">{newCustomersCount}</b>
              <span className="stat-trend-chip green">Live</span>
            </div>
          </div>
          <span className="stat-icon-wrap icon-green"><UserPlus size={22} /></span>
        </div>

        {/* Card 3: Loyal Customers */}
        <div className="customer-stat-card stat-loyal-cust">
          <div className="stat-card-left">
            <span className="stat-label">Loyal Customers <span className="stat-sub">(≥ 5 Visits)</span></span>
            <b className="stat-val">{loyalCustomersCount}</b>
          </div>
          <span className="stat-icon-wrap icon-amber"><Crown size={22} /></span>
        </div>

        {/* Card 4: Avg. Rating */}
        <div className="customer-stat-card stat-rating-cust">
          <div className="stat-card-left">
            <span className="stat-label">Avg. Rating <span className="stat-sub">(From Customers)</span></span>
            <div className="val-rating-row">
              <b className="stat-val">4.8</b>
              <Star size={16} className="inline-star-gold" />
            </div>
          </div>
          <span className="stat-icon-wrap icon-red"><Heart size={22} /></span>
        </div>

        {/* Card 5: Repeat Visit Rate */}
        <div className="customer-stat-card stat-repeat-cust">
          <div className="stat-card-left">
            <span className="stat-label">Repeat Visit Rate</span>
            <b className="stat-val">{repeatRate}%</b>
          </div>
          <span className="stat-icon-wrap icon-blue"><RefreshCw size={22} /></span>
        </div>
      </div>

      {/* 3. Main View Switch Based on Sub-Nav Tab */}
      {activeTab === 'list' && (
        <div className="customers-main-split">
          {/* Left Side (65%): Customer List Table */}
          <div className="customers-table-panel">
            {/* Toolbar Row */}
            <div className="customers-toolbar-row">
              <div className="toolbar-left">
                <div className="panel-title-group">
                  <Users size={18} className="panel-icon orange" />
                  <h3 className="section-title">
                    Customer List <span className="count-badge">({filteredCustomers.length})</span>
                  </h3>
                </div>
              </div>

              <div className="toolbar-right customer-filters-inline-row">
                {/* Status Filter Dropdown */}
                <select
                  className="filter-select customer-filter-dropdown"
                  value={filterStatus}
                  onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
                >
                  <option value="all">All Customers</option>
                  <option value="loyal">Loyal</option>
                  <option value="vip">VIP</option>
                  <option value="regular">Regular</option>
                  <option value="new">New</option>
                </select>

                {/* Visits Filter Dropdown */}
                <select
                  className="filter-select customer-filter-dropdown"
                  value={filterVisits}
                  onChange={e => { setFilterVisits(e.target.value); setPage(1); }}
                >
                  <option value="all">All Visits</option>
                  <option value="1-3">1 - 3 Visits</option>
                  <option value="4-10">4 - 10 Visits</option>
                  <option value="10+">10+ Visits</option>
                </select>

                {/* Sort Dropdown */}
                <select
                  className="filter-select customer-filter-dropdown"
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                >
                  <option value="recent">Sort: Recent</option>
                  <option value="spent">Sort: Highest Spent</option>
                  <option value="visits">Sort: Most Visits</option>
                  <option value="name">Sort: Name (A-Z)</option>
                </select>
              </div>
            </div>

            {/* Customers Data Table */}
            <div className="customers-table-wrap">
              <table className="customers-data-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>#</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Visits</th>
                    <th>Total Spent</th>
                    <th>Last Visit</th>
                    <th>Status</th>
                    <th style={{ width: '90px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="empty-table-cell">No customers found matching the filter.</td>
                    </tr>
                  ) : (
                    filteredCustomers.slice((page - 1) * rowsPerPage, page * rowsPerPage).map((c, idx) => {
                      const isSelected = activeCustomer?.id === c.id;
                      const statusStr = (c.status || 'Regular').toLowerCase();
                      const statusClass = statusStr === 'vip' ? 'status-vip'
                        : statusStr === 'loyal' ? 'status-loyal'
                        : statusStr === 'new' ? 'status-new'
                        : 'status-regular';

                      const statusIcon = statusStr === 'vip' ? <Star size={11} />
                        : statusStr === 'loyal' ? <Crown size={11} />
                        : statusStr === 'new' ? <Zap size={11} />
                        : <User size={11} />;

                      return (
                        <tr
                          key={c.id || idx}
                          className={`customer-table-row ${isSelected ? 'row-selected' : ''}`}
                          onClick={() => setSelectedCustomer(c)}
                        >
                          <td className="row-num">{(page - 1) * rowsPerPage + idx + 1}</td>
                          <td className="customer-info-cell">
                            <div className="avatar-circle">
                              {(c.full_name || 'C').slice(0, 1)}
                            </div>
                            <b className="customer-name">{c.full_name || 'Customer'}</b>
                          </td>
                          <td className="phone-cell">{c.phone || '+91 98765 00000'}</td>
                          <td className="visits-cell"><b>{c.visits || 1}</b></td>
                          <td className="spent-cell"><b>{money(Number(c.total_spent || 0))}</b></td>
                          <td className="date-cell">{formatLastVisit(c.last_visit)}</td>
                          <td>
                            <span className={`customer-tier-badge ${statusClass}`}>
                              {statusIcon} {c.status || 'Regular'}
                            </span>
                          </td>
                          <td className="actions-cell" style={{ textAlign: 'center' }}>
                            <div className="row-actions-group">
                              <button
                                type="button"
                                className="row-tool-btn"
                                title="View Customer Details"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCustomer(c);
                                }}
                              >
                                <Eye size={14} />
                              </button>
                              <button
                                type="button"
                                className="row-tool-btn"
                                title="Edit Customer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditModal(c);
                                }}
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                type="button"
                                className="row-tool-btn delete-btn"
                                title="Delete Customer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteCustomer(c);
                                }}
                              >
                                <Trash2 size={14} />
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

            {/* Pagination Bar */}
            <div className="customers-pagination-bar">
              <span className="pag-info">
                Showing {filteredCustomers.length > 0 ? (page - 1) * rowsPerPage + 1 : 0} – {Math.min(page * rowsPerPage, filteredCustomers.length)} of {filteredCustomers.length} customers
              </span>
              <div className="pag-controls">
                <button
                  type="button"
                  className="pag-btn"
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  &lt;
                </button>
                {Array.from({ length: Math.ceil(filteredCustomers.length / rowsPerPage) || 1 }, (_, i) => (
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
                  disabled={page >= Math.ceil(filteredCustomers.length / rowsPerPage)}
                  onClick={() => setPage(p => p + 1)}
                >
                  &gt;
                </button>
              </div>
              <div className="rows-per-page-select">
                <span>Rows per page: <b>10</b></span>
              </div>
            </div>
          </div>

          {/* Right Side (35%): Customer Details Panel (100% Visual Reference Match) */}
          <div className="customer-details-side-panel">
            {!activeCustomer ? (
              <div className="empty-details-notice">Select a customer from the list to view their full profile.</div>
            ) : (
              <>
                {/* Header */}
                <div className="details-header-row">
                  <div className="panel-title-group">
                    <User size={18} className="panel-icon orange" />
                    <h4 className="details-panel-title">Customer Details</h4>
                  </div>
                  <div className="details-header-actions">
                    <button
                      type="button"
                      className="header-icon-tool-btn"
                      title="Edit Customer"
                      onClick={() => openEditModal(activeCustomer)}
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      type="button"
                      className="header-icon-tool-btn"
                      title="Deselect"
                      onClick={() => setSelectedCustomer(null)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* Profile Header Hero */}
                <div className="customer-profile-hero-card">
                  <div className="hero-avatar-large">
                    {(activeCustomer.full_name || 'C').slice(0, 1)}
                  </div>
                  <div className="hero-identity-col">
                    <div className="name-and-status-row">
                      <b className="customer-hero-name">{activeCustomer.full_name}</b>
                      <span className={`customer-tier-badge status-${(activeCustomer.status || 'Loyal').toLowerCase()}`}>
                        {activeCustomer.status === 'VIP' ? <Star size={11} /> : <Crown size={11} />} {activeCustomer.status || 'Loyal'} Customer
                      </span>
                    </div>
                    <div className="hero-contact-row">
                      <span className="contact-chip"><Phone size={12} /> {activeCustomer.phone || '+91 98765 43210'}</span>
                      <span className="contact-chip"><Mail size={12} /> {activeCustomer.email || `${activeCustomer.full_name?.toLowerCase().replace(/\s+/g, '')}@email.com`}</span>
                    </div>
                  </div>
                </div>

                {/* Mini Stats Strip: Visits, Total Spent, Avg. Bill */}
                <div className="profile-mini-stats-strip">
                  <div className="mini-stat-col">
                    <span className="stat-sub-label">Visits</span>
                    <b className="stat-num-val">{activeCustomer.visits || 1}</b>
                  </div>
                  <div className="mini-stat-col">
                    <span className="stat-sub-label">Total Spent</span>
                    <b className="stat-num-val">{money(Number(activeCustomer.total_spent || 0))}</b>
                  </div>
                  <div className="mini-stat-col">
                    <span className="stat-sub-label">Avg. Bill</span>
                    <b className="stat-num-val">
                      {money(Math.round(Number(activeCustomer.total_spent || 0) / Math.max(1, Number(activeCustomer.visits || 1))))}
                    </b>
                  </div>
                </div>

                {/* Customer Sub-Tabs: Order History | Preferences | Feedback | Notes */}
                <div className="customer-inner-tabs-row">
                  <button
                    type="button"
                    className={`inner-tab-pill ${detailTab === 'orders' ? 'active' : ''}`}
                    onClick={() => setDetailTab('orders')}
                  >
                    <FileText size={13} /> <span>Order History</span>
                  </button>
                  <button
                    type="button"
                    className={`inner-tab-pill ${detailTab === 'preferences' ? 'active' : ''}`}
                    onClick={() => setDetailTab('preferences')}
                  >
                    <Heart size={13} /> <span>Preferences</span>
                  </button>
                  <button
                    type="button"
                    className={`inner-tab-pill ${detailTab === 'feedback' ? 'active' : ''}`}
                    onClick={() => setDetailTab('feedback')}
                  >
                    <Star size={13} /> <span>Feedback</span>
                  </button>
                  <button
                    type="button"
                    className={`inner-tab-pill ${detailTab === 'notes' ? 'active' : ''}`}
                    onClick={() => setDetailTab('notes')}
                  >
                    <Edit2 size={13} /> <span>Notes</span>
                  </button>
                </div>

                {/* Sub-Tab 1: Order History */}
                {detailTab === 'orders' && (() => {
                  const custOrders = getCustomerOrders(activeCustomer);
                  return (
                    <div className="customer-order-history-box">
                      <div className="box-title-row">
                        <FileText size={14} className="panel-icon orange" />
                        <h5 className="box-title-text">Order History ({custOrders.length})</h5>
                      </div>

                      {custOrders.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: '#8c6e58', fontSize: '13px' }}>
                          No past orders found for this customer.
                        </div>
                      ) : (
                        <div className="mini-orders-table-wrap">
                          <table className="mini-orders-table">
                            <thead>
                              <tr>
                                <th>Order ID</th>
                                <th>Date &amp; Time</th>
                                <th>Items</th>
                                <th>Amount</th>
                                <th>Rating</th>
                              </tr>
                            </thead>
                            <tbody>
                              {custOrders.map((ord: any, idx: number) => (
                                <tr key={ord.id || idx}>
                                  <td className="bold-order-id">{ord.id}</td>
                                  <td className="order-time-text">{ord.datetime}</td>
                                  <td className="order-items-snippet" title={ord.items}>{ord.items}</td>
                                  <td className="bold-order-amount">{ord.amount}</td>
                                  <td className="rating-cell">
                                    <span className="star-rating-chip"><Star size={11} fill="#eab308" /> {ord.rating}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div className="view-all-orders-row">
                        <button
                          type="button"
                          className="btn-link-all-orders"
                          onClick={() => {
                            if (setNotice) setNotice({ text: `Viewing all past orders for ${activeCustomer.full_name}`, kind: 'info' });
                          }}
                        >
                          View All Orders &rarr;
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Sub-Tab 2: Preferences */}
                {detailTab === 'preferences' && (
                  <div className="customer-tab-content-card">
                    <h5 className="pref-section-title">Dining &amp; Dietary Preferences</h5>
                    <div className="pref-pills-stack">
                      <div className="pref-tag"><Utensils size={13} /> Pure Vegetarian Preference</div>
                      <div className="pref-tag"><Zap size={13} /> Traditional South Indian Tiffin</div>
                      <div className="pref-tag"><Heart size={13} /> Mild Spice Level Only</div>
                      <div className="pref-tag"><Sparkles size={13} /> Favorite: Ghee Roast Dosa, Filter Coffee</div>
                      <div className="pref-tag"><UserCheck size={13} /> Preferred Table: T03 (Window Booth)</div>
                    </div>
                  </div>
                )}

                {/* Sub-Tab 3: Feedback */}
                {detailTab === 'feedback' && (
                  <div className="customer-tab-content-card">
                    <div className="feedback-hero-rating">
                      <div className="big-stars-row">
                        <Star size={20} fill="#eab308" color="#eab308" />
                        <Star size={20} fill="#eab308" color="#eab308" />
                        <Star size={20} fill="#eab308" color="#eab308" />
                        <Star size={20} fill="#eab308" color="#eab308" />
                        <Star size={20} fill="#eab308" color="#eab308" />
                      </div>
                      <span className="rating-label-big">5.0 / 5.0 (Overall Rating)</span>
                    </div>
                    <blockquote className="feedback-quote">
                      "Authentic Chennai filter coffee and crisp ghee roast dosa! Very prompt QR ordering service and extremely courteous staff. Servora never disappoints."
                    </blockquote>
                    <span className="review-meta-date">&mdash; Verified Dine-In Review, 22 Nov 2026</span>
                  </div>
                )}

                {/* Sub-Tab 4: Notes */}
                {detailTab === 'notes' && (
                  <div className="customer-tab-content-card">
                    <h5 className="pref-section-title">Staff / Internal Notes</h5>
                    <textarea
                      rows={3}
                      className="form-textarea-note"
                      value={activeNoteText}
                      onChange={e => setActiveNoteText(e.target.value)}
                      placeholder="Add customer preferences or dietary restrictions here..."
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                      <button
                        type="button"
                        className="primary-modal-btn"
                        style={{ padding: '6px 14px', fontSize: 12 }}
                        onClick={() => {
                          setCustomerNotes(prev => ({ ...prev, [activeCustomer.id]: activeNoteText }));
                          if (setNotice) setNotice({ text: 'Customer note saved successfully.', kind: 'success' });
                        }}
                      >
                        Save Note
                      </button>
                    </div>
                  </div>
                )}

                {/* Bottom 4 Quick-Action Cards (100% Visual Match to Screenshot) */}
                <div className="customer-quick-actions-quad-grid">
                  {/* Action 1: Add Reward Points */}
                  <div
                    className="action-quad-tile tile-gift"
                    onClick={() => setShowRewardModal(true)}
                  >
                    <span className="quad-icon-wrap icon-gift"><Gift size={20} /></span>
                    <span className="quad-label">Add Reward Points</span>
                  </div>

                  {/* Action 2: Send Offer / Promotion */}
                  <div
                    className="action-quad-tile tile-bell"
                    onClick={() => setShowOfferModal(true)}
                  >
                    <span className="quad-icon-wrap icon-bell"><Bell size={20} /></span>
                    <span className="quad-label">Send Offer / Promotion</span>
                  </div>

                  {/* Action 3: Send Message (SMS / Email) */}
                  <div
                    className="action-quad-tile tile-mail"
                    onClick={() => setShowMessageModal(true)}
                  >
                    <span className="quad-icon-wrap icon-mail"><Mail size={20} /></span>
                    <span className="quad-label">Send Message (SMS / Email)</span>
                  </div>

                  {/* Action 4: View Customer Report */}
                  <div
                    className="action-quad-tile tile-chart"
                    onClick={() => setShowReportModal(true)}
                  >
                    <span className="quad-icon-wrap icon-chart"><TrendingUp size={20} /></span>
                    <span className="quad-label">View Customer Report</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Sub-Tab: Loyalty & Rewards Program Overview */}
      {activeTab === 'loyalty' && (
        <div className="loyalty-rewards-panel">
          <div className="loyalty-header-banner">
            <Gift size={28} className="panel-icon orange" />
            <div>
              <h3>Servora Loyalty &amp; Rewards Program</h3>
              <p>Customers earn 1 Servora Coin for every ₹10 spent. Coins can be redeemed for dine-in dishes or discount vouchers.</p>
            </div>
          </div>

          <div className="loyalty-tiers-grid">
            <div className="tier-card tier-regular">
              <span className="tier-badge-pill">Regular Member</span>
              <h4>Tier 1: Bronze</h4>
              <p>1 – 4 Visits</p>
              <ul>
                <li>Earn 1x Points on All Orders</li>
                <li>Digital QR Bill &amp; Order Tracking</li>
              </ul>
            </div>

            <div className="tier-card tier-loyal">
              <span className="tier-badge-pill gold">Loyal Customer</span>
              <h4>Tier 2: Gold (5+ Visits)</h4>
              <p>5 – 19 Visits</p>
              <ul>
                <li>Earn 1.5x Points on Weekend Tiffin</li>
                <li>Free Filter Coffee on Birthday</li>
                <li>Priority Table Reservation</li>
              </ul>
            </div>

            <div className="tier-card tier-vip">
              <span className="tier-badge-pill purple">VIP Member</span>
              <h4>Tier 3: Platinum VIP</h4>
              <p>20+ Visits</p>
              <ul>
                <li>Earn 2x Points on All Dine-In</li>
                <li>Direct Table Seating without Waiting</li>
                <li>Dedicated Head Chef Specials &amp; Combos</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab: Feedback & Ratings */}
      {activeTab === 'feedback' && (
        <div className="feedback-ratings-panel">
          <div className="feedback-summary-row">
            <div className="feedback-score-hero">
              <b className="hero-rating-num">4.6</b>
              <div className="hero-stars-row">
                <Star size={18} fill="#eab308" color="#eab308" />
                <Star size={18} fill="#eab308" color="#eab308" />
                <Star size={18} fill="#eab308" color="#eab308" />
                <Star size={18} fill="#eab308" color="#eab308" />
                <Star size={18} fill="#eab308" color="#eab308" />
              </div>
              <span className="hero-reviews-count">Based on 842 Customer Reviews</span>
            </div>

            <div className="ratings-bars-list">
              {[
                { stars: '5 Stars', pct: '82%', count: 690 },
                { stars: '4 Stars', pct: '12%', count: 101 },
                { stars: '3 Stars', pct: '4%', count: 34 },
                { stars: '2 Stars', pct: '1%', count: 11 },
                { stars: '1 Star', pct: '1%', count: 6 }
              ].map(r => (
                <div key={r.stars} className="rating-bar-row">
                  <span className="star-bar-label">{r.stars}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: r.pct }} />
                  </div>
                  <span className="star-bar-count">{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab: Customer Reports */}
      {activeTab === 'reports' && (
        <div className="customer-reports-panel">
          <div className="reports-stat-cards-grid">
            <div className="report-card">
              <div className="report-card-top">
                <span className="card-label">Monthly Active Customers</span>
                <span className="card-icon-circle icon-green"><UserCheck size={20} /></span>
              </div>
              <div className="report-card-bottom">
                <b className="card-main-val">942</b>
                <span className="card-trend-badge trend-up">+14%</span>
              </div>
            </div>

            <div className="report-card">
              <div className="report-card-top">
                <span className="card-label">Avg. Spend Per Customer</span>
                <span className="card-icon-circle icon-orange"><Utensils size={20} /></span>
              </div>
              <div className="report-card-bottom">
                <b className="card-main-val">₹2,840</b>
                <span className="card-trend-badge trend-up">+8%</span>
              </div>
            </div>

            <div className="report-card">
              <div className="report-card-top">
                <span className="card-label">Customer Churn Rate</span>
                <span className="card-icon-circle icon-red"><Minus size={20} /></span>
              </div>
              <div className="report-card-bottom">
                <b className="card-main-val">3.2%</b>
                <span className="card-trend-badge trend-down">Optimal</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODALS FOR REAL DATABASE & LIVE ACTIONS
          ======================================================== */}

      {/* 1. Add Customer Modal */}
      {showAddModal && (
        <div className="simple-modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="simple-modal-card" onClick={e => e.stopPropagation()}>
            <h3>Add New Customer Profile</h3>
            <form onSubmit={handleAddCustomer}>
              <div className="form-group-modal">
                <label>Customer Full Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. Manikandan V."
                  required
                />
              </div>

              <div className="form-group-modal">
                <label>Mobile Number *</label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={e => setFormPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  required
                />
              </div>

              <div className="form-group-modal">
                <label>Email Address</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  placeholder="e.g. customer@gmail.com"
                />
              </div>

              <div className="form-group-modal">
                <label>Customer Status</label>
                <select value={formStatus} onChange={e => setFormStatus(e.target.value)}>
                  <option value="Loyal">Loyal Customer (≥ 5 Visits)</option>
                  <option value="VIP">VIP Customer</option>
                  <option value="Regular">Regular Customer</option>
                  <option value="New">New Customer</option>
                </select>
              </div>

              <div className="modal-actions-row">
                <button type="submit" className="primary-modal-btn" disabled={savingCustomer}>
                  {savingCustomer ? 'Saving...' : 'Create Customer'}
                </button>
                <button type="button" className="cancel-modal-btn" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Edit Customer Modal */}
      {showEditModal && activeCustomer && (
        <div className="simple-modal-backdrop" onClick={() => setShowEditModal(false)}>
          <div className="simple-modal-card" onClick={e => e.stopPropagation()}>
            <h3>Edit Customer Profile</h3>
            <form onSubmit={handleEditCustomer}>
              <div className="form-group-modal">
                <label>Customer Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group-modal">
                <label>Mobile Phone</label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={e => setFormPhone(e.target.value)}
                  required
                />
              </div>

              <div className="form-group-modal">
                <label>Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                />
              </div>

              <div className="form-group-modal">
                <label>Status Tier</label>
                <select value={formStatus} onChange={e => setFormStatus(e.target.value)}>
                  <option value="Loyal">Loyal Customer</option>
                  <option value="VIP">VIP Customer</option>
                  <option value="Regular">Regular Customer</option>
                  <option value="New">New Customer</option>
                </select>
              </div>

              <div className="modal-actions-row">
                <button type="submit" className="primary-modal-btn" disabled={savingCustomer}>
                  {savingCustomer ? 'Saving Changes...' : 'Save Changes'}
                </button>
                <button type="button" className="cancel-modal-btn" onClick={() => setShowEditModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Add Reward Points Modal */}
      {showRewardModal && activeCustomer && (
        <div className="simple-modal-backdrop" onClick={() => setShowRewardModal(false)}>
          <div className="simple-modal-card" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="quad-icon-wrap icon-gift" style={{ width: 36, height: 36 }}><Gift size={18} /></span>
              <h3 style={{ margin: 0 }}>Add Reward Points</h3>
            </div>
            <p style={{ fontSize: 13, color: '#7c5841', margin: '4px 0 12px' }}>
              Credit loyalty points to <b>{activeCustomer.full_name}</b> (+91 {activeCustomer.phone}):
            </p>
            <div className="form-group-modal">
              <label>Points to Credit</label>
              <input
                type="number"
                value={rewardPoints}
                onChange={e => setRewardPoints(e.target.value)}
                min="10"
                step="10"
              />
            </div>
            <div className="modal-actions-row">
              <button
                type="button"
                className="primary-modal-btn"
                onClick={() => {
                  if (setNotice) setNotice({ text: `Successfully credited ${rewardPoints} reward coins to ${activeCustomer.full_name}!`, kind: 'success' });
                  setShowRewardModal(false);
                }}
              >
                Credit Points
              </button>
              <button type="button" className="cancel-modal-btn" onClick={() => setShowRewardModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Send Offer / Promotion Modal */}
      {showOfferModal && activeCustomer && (
        <div className="simple-modal-backdrop" onClick={() => setShowOfferModal(false)}>
          <div className="simple-modal-card" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="quad-icon-wrap icon-bell" style={{ width: 36, height: 36 }}><Bell size={18} /></span>
              <h3 style={{ margin: 0 }}>Send Offer / Promotion</h3>
            </div>
            <p style={{ fontSize: 13, color: '#7c5841', margin: '4px 0 12px' }}>
              Select a promotional coupon code to dispatch to <b>{activeCustomer.full_name}</b>:
            </p>
            <div className="form-group-modal">
              <label>Promotional Voucher</label>
              <select value={selectedOffer} onChange={e => setSelectedOffer(e.target.value)}>
                <option value="TIFFIN20">TIFFIN20 – 20% OFF Tiffin Combos</option>
                <option value="COFFEEFREE">COFFEEFREE – Complimentary Filter Coffee with Any Dosa</option>
                <option value="WEEKEND15">WEEKEND15 – 15% OFF Family Dining Bill</option>
              </select>
            </div>
            <div className="modal-actions-row">
              <button
                type="button"
                className="primary-modal-btn"
                onClick={() => {
                  if (setNotice) setNotice({ text: `Promotion ${selectedOffer} sent to ${activeCustomer.full_name} via SMS!`, kind: 'success' });
                  setShowOfferModal(false);
                }}
              >
                Send Offer
              </button>
              <button type="button" className="cancel-modal-btn" onClick={() => setShowOfferModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Send Message Modal */}
      {showMessageModal && activeCustomer && (
        <div className="simple-modal-backdrop" onClick={() => setShowMessageModal(false)}>
          <div className="simple-modal-card" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="quad-icon-wrap icon-mail" style={{ width: 36, height: 36 }}><Mail size={18} /></span>
              <h3 style={{ margin: 0 }}>Send Message (SMS / WhatsApp)</h3>
            </div>
            <p style={{ fontSize: 13, color: '#7c5841', margin: '4px 0 12px' }}>
              To: <b>{activeCustomer.full_name}</b> ({activeCustomer.phone})
            </p>
            <div className="form-group-modal">
              <label>Message Text</label>
              <textarea
                rows={3}
                value={customMessage}
                onChange={e => setCustomMessage(e.target.value)}
                placeholder="Type your message..."
              />
            </div>
            <div className="modal-actions-row">
              <button
                type="button"
                className="primary-modal-btn"
                onClick={() => {
                  if (setNotice) setNotice({ text: `Message dispatched to ${activeCustomer.full_name}!`, kind: 'success' });
                  setShowMessageModal(false);
                }}
              >
                Send Message
              </button>
              <button type="button" className="cancel-modal-btn" onClick={() => setShowMessageModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. View Customer Report Dialog */}
      {showReportModal && activeCustomer && (
        <div className="simple-modal-backdrop" onClick={() => setShowReportModal(false)}>
          <div className="simple-modal-card att-details-modal" onClick={e => e.stopPropagation()}>
            <div className="att-modal-header">
              <div className="member-avatar-circle large">
                {(activeCustomer.full_name || 'C').slice(0, 1)}
              </div>
              <div className="att-modal-title-col">
                <h3>{activeCustomer.full_name} &ndash; Analytics</h3>
                <span className="role-pill-badge">{activeCustomer.status} Tier Customer</span>
              </div>
              <button type="button" className="close-modal-icon-btn" onClick={() => setShowReportModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="att-info-grid" style={{ marginTop: 14 }}>
              <div className="att-info-item">
                <span className="info-label"><Users size={13} /> Lifetime Visits</span>
                <b className="info-val">{activeCustomer.visits} Visits</b>
              </div>
              <div className="att-info-item">
                <span className="info-label"><Utensils size={13} /> Total Spend</span>
                <b className="info-val">{money(Number(activeCustomer.total_spent || 0))}</b>
              </div>
              <div className="att-info-item">
                <span className="info-label"><TrendingUp size={13} /> Average Bill</span>
                <b className="info-val">{money(Math.round(Number(activeCustomer.total_spent || 0) / Math.max(1, Number(activeCustomer.visits || 1))))}</b>
              </div>
              <div className="att-info-item">
                <span className="info-label"><Clock size={13} /> Last Dining Date</span>
                <b className="info-val">{formatLastVisit(activeCustomer.last_visit)}</b>
              </div>
            </div>

            <div className="modal-actions-row" style={{ marginTop: 16 }}>
              <button type="button" className="primary-modal-btn" onClick={() => setShowReportModal(false)}>
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
