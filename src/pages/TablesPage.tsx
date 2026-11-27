import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  Edit2,
  ExternalLink,
  Filter,
  LayoutGrid,
  List,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Users,
  Utensils,
  X
} from 'lucide-react';
import { DEFAULT_TABLES, getCached, getTables } from '../lib/data';
import { supabase } from '../lib/supabase';

export function TablesPage({ setNotice, globalSearch }: { setNotice?: (n: any) => void; globalSearch?: string }) {
  const [tables, setTables] = useState<any[]>(() => getCached<any[]>('tables') || DEFAULT_TABLES);
  const [selectedTable, setSelectedTable] = useState<string>('T01');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState(globalSearch || '');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [addingTable, setAddingTable] = useState(false);
  const [newTableNum, setNewTableNum] = useState('');
  const [newCapacity, setNewCapacity] = useState('4');
  const [updatingId, setUpdatingId] = useState('');

  useEffect(() => {
    if (globalSearch !== undefined) {
      setSearchQuery(globalSearch);
    }
  }, [globalSearch]);

  const loadData = async (force = false) => {
    try {
      const t = await getTables(force);
      if (t && t.length > 0) {
        setTables(t);
        if (!selectedTable) {
          setSelectedTable(t[0].table_number);
        }
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
        .channel('tables-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dining_tables' }, () => {
          loadData(true);
        })
        .subscribe();
      return () => {
        client.removeChannel(channel);
      };
    }
  }, []);

  // Generate QR code for the selected table
  useEffect(() => {
    const generateQr = async () => {
      try {
        const origin = window.location.origin;
        const targetUrl = `${origin}/order?table=${selectedTable}`;
        const url = await QRCode.toDataURL(targetUrl, {
          width: 360,
          margin: 2,
          color: {
            dark: '#1e0c04',
            light: '#ffffff'
          }
        });
        setQrCodeDataUrl(url);
      } catch (e) {
        console.error(e);
      }
    };
    if (selectedTable) generateQr();
  }, [selectedTable]);

  // Download QR code image
  const handleDownloadQr = () => {
    if (!qrCodeDataUrl) return;
    const a = document.createElement('a');
    a.href = qrCodeDataUrl;
    a.download = `Servora_Table_${selectedTable}_QR.png`;
    a.click();
    if (setNotice) setNotice({ text: `Downloaded QR code for Table ${selectedTable}.`, kind: 'success' });
  };

  const handleExportTables = () => {
    const csvContent = "Table Number,Capacity,Status\n" +
      tables.map(t => `${t.table_number},${t.capacity || 4},${t.status || 'available'}`).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tables_Directory_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    if (setNotice) setNotice({ text: 'Exported tables list to CSV.', kind: 'success' });
  };

  const handleToggleTableStatus = async (table: any) => {
    if (!supabase) return;
    const nextStatus = table.status === 'occupied' ? 'available' : 'occupied';
    setUpdatingId(table.id);
    try {
      const { error } = await supabase.from('dining_tables').update({ status: nextStatus }).eq('id', table.id);
      if (error) throw error;
      setTables(prev => prev.map(t => t.id === table.id ? { ...t, status: nextStatus } : t));
      if (setNotice) setNotice({ text: `Table ${table.table_number} marked as ${nextStatus}.`, kind: 'success' });
    } catch (e: any) {
      if (setNotice) setNotice({ text: e.message || 'Error updating table status', kind: 'error' });
    } finally {
      setUpdatingId('');
    }
  };

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !newTableNum.trim()) return;
    try {
      const restRes = await supabase.from('restaurants').select('id').limit(1).single();
      const restaurantId = restRes.data?.id;

      const { error } = await supabase.from('dining_tables').insert({
        restaurant_id: restaurantId,
        table_number: newTableNum.trim().toUpperCase(),
        capacity: Number(newCapacity) || 4,
        status: 'available',
        is_active: true
      });
      if (error) throw error;
      if (setNotice) setNotice({ text: `Table ${newTableNum.toUpperCase()} created successfully!`, kind: 'success' });
      setAddingTable(false);
      setNewTableNum('');
      await loadData();
    } catch (e: any) {
      if (setNotice) setNotice({ text: e.message || 'Could not add table.', kind: 'error' });
    }
  };

  const totalTables = tables.length;
  const occupiedCount = tables.filter(t => t.status === 'occupied').length;
  const availableCount = tables.filter(t => t.status !== 'occupied').length;

  const filteredTables = tables.filter(t => {
    if (statusFilter === 'occupied' && t.status !== 'occupied') return false;
    if (statusFilter === 'available' && t.status === 'occupied') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (t.table_number || '').toLowerCase().includes(q);
    }
    return true;
  });

  const selectedTableObj = tables.find(t => t.table_number === selectedTable) || tables[0];

  const totalSeats = tables.reduce((acc, t) => acc + (Number(t.capacity) || 4), 0);

  return (
    <div className="admin-page-container tables-qr-redesigned-page">
      {/* 1. Top Actions Header Row */}
      <div className="tables-top-header-row">
        <div className="tables-header-left-title">
          <h2 className="tables-main-title">Dining Tables & QR Management</h2>
          <p className="tables-sub-title">Configure hall tables, generate live ordering QR codes, and monitor occupancy.</p>
        </div>
        <div className="tables-header-right-actions">
          <button type="button" className="tables-action-pill-btn" onClick={handleExportTables}>
            <Download size={14} /> <span>Export List</span>
          </button>
          <button type="button" className="tables-btn-add-primary" onClick={() => setAddingTable(true)}>
            <Plus size={16} /> <span>Add Table</span>
          </button>
        </div>
      </div>

      {/* 2. Top 4 Balanced Stat Cards */}
      <div className="tables-top-stat-cards">
        <div className="table-stat-card stat-total-tables">
          <div className="stat-card-left">
            <span className="stat-label">Total Tables</span>
            <b className="stat-val">{totalTables}</b>
          </div>
          <span className="stat-card-icon icon-wood"><Utensils size={24} /></span>
        </div>

        <div className="table-stat-card stat-available-tables">
          <div className="stat-card-left">
            <span className="stat-label">Available Tables</span>
            <b className="stat-val">{availableCount}</b>
          </div>
          <span className="stat-card-icon icon-green"><CheckCircle2 size={24} /></span>
        </div>

        <div className="table-stat-card stat-occupied-tables">
          <div className="stat-card-left">
            <span className="stat-label">Occupied Tables</span>
            <b className="stat-val">{occupiedCount}</b>
          </div>
          <span className="stat-card-icon icon-coral"><Users size={24} /></span>
        </div>

        <div className="table-stat-card stat-capacity-tables">
          <div className="stat-card-left">
            <span className="stat-label">Hall Capacity</span>
            <b className="stat-val">{totalSeats} Seats</b>
          </div>
          <span className="stat-card-icon icon-rate"><LayoutGrid size={24} /></span>
        </div>
      </div>

      {/* Add Table Modal */}
      {addingTable && (
        <div className="simple-modal-backdrop">
          <div className="simple-modal-card">
            <h3>Add New Dining Table</h3>
            <form onSubmit={handleAddTable}>
              <div className="form-group-modal">
                <label>Table Number (e.g. T21) *</label>
                <input
                  type="text"
                  value={newTableNum}
                  onChange={e => setNewTableNum(e.target.value)}
                  placeholder="e.g. T21"
                  required
                />
              </div>
              <div className="form-group-modal">
                <label>Seating Capacity</label>
                <select value={newCapacity} onChange={e => setNewCapacity(e.target.value)}>
                  <option value="2">2 Seater (Couple / Intimate)</option>
                  <option value="4">4 Seater (Family Standard)</option>
                  <option value="6">6 Seater (Group Dining)</option>
                  <option value="8">8 Seater (Banquet)</option>
                </select>
              </div>
              <div className="modal-actions-row">
                <button type="submit" className="primary-modal-btn">Save Table</button>
                <button type="button" className="cancel-modal-btn" onClick={() => setAddingTable(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Main Redesigned Split View: Table Management (65%) + QR Code & Table Hub (35%) */}
      <div className="tables-redesigned-split-grid">
        {/* Left Side: Tables Management */}
        <div className="tables-management-main-panel">
          {/* Toolbar */}
          <div className="tables-toolbar-header">
            <div className="toolbar-left-filter-pills">
              {[
                { key: 'all', label: `All Tables (${totalTables})` },
                { key: 'available', label: `Available (${availableCount})` },
                { key: 'occupied', label: `Occupied (${occupiedCount})` }
              ].map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  className={`table-filter-tab-pill ${statusFilter === tab.key ? 'active' : ''}`}
                  onClick={() => setStatusFilter(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="toolbar-right-actions">
              <div className="table-search-input-box">
                <Search size={15} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search table (e.g. T01)..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="view-mode-toggle-pills">
                <button
                  type="button"
                  className={`view-pill ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => setViewMode('grid')}
                  title="Grid View"
                >
                  <LayoutGrid size={15} />
                </button>
                <button
                  type="button"
                  className={`view-pill ${viewMode === 'table' ? 'active' : ''}`}
                  onClick={() => setViewMode('table')}
                  title="Table View"
                >
                  <List size={15} />
                </button>
              </div>
            </div>
          </div>

          {/* Grid View */}
          {viewMode === 'grid' ? (
            <div className="tables-grid-cards-container">
              {filteredTables.length === 0 ? (
                <div className="empty-tables-notice">
                  <Utensils size={32} className="muted-icon" />
                  <p>No dining tables found matching the filter.</p>
                </div>
              ) : (
                filteredTables.map(t => {
                  const isOccupied = t.status === 'occupied';
                  const isSelected = selectedTable === t.table_number;

                  return (
                    <div
                      key={t.id}
                      className={`redesigned-table-card ${isOccupied ? 'is-occupied' : 'is-available'} ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => setSelectedTable(t.table_number)}
                    >
                      <div className="table-card-top-row">
                        <div className="table-badge-large">{t.table_number}</div>
                        <span className={`table-status-pill ${isOccupied ? 'tone-occupied' : 'tone-available'}`}>
                          <span className="dot" /> {isOccupied ? 'Occupied' : 'Available'}
                        </span>
                      </div>

                      <div className="table-card-center-meta">
                        <div className="meta-capacity-chip">
                          <Users size={14} />
                          <span>{t.capacity || 4} Guests Capacity</span>
                        </div>
                        <span className="section-label">Section: Dining Hall</span>
                      </div>

                      <div className="table-card-actions-bar">
                        <button
                          type="button"
                          className="table-quick-toggle-btn"
                          disabled={updatingId === t.id}
                          onClick={e => {
                            e.stopPropagation();
                            handleToggleTableStatus(t);
                          }}
                        >
                          {isOccupied ? 'Mark Available' : 'Mark Occupied'}
                        </button>

                        <button
                          type="button"
                          className="table-qr-preview-icon-btn"
                          title="View QR Code"
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedTable(t.table_number);
                          }}
                        >
                          <QrCode size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* Table View */
            <div className="tables-list-table-wrap">
              <table className="tables-full-data-table">
                <thead>
                  <tr>
                    <th>Table Number</th>
                    <th>Section</th>
                    <th>Capacity</th>
                    <th>Status</th>
                    <th>QR Preview</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTables.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="empty-table-cell">No tables found.</td>
                    </tr>
                  ) : (
                    filteredTables.map(t => {
                      const isOccupied = t.status === 'occupied';
                      const isSelected = selectedTable === t.table_number;

                      return (
                        <tr
                          key={t.id}
                          className={`table-data-row ${isSelected ? 'row-selected' : ''}`}
                          onClick={() => setSelectedTable(t.table_number)}
                        >
                          <td className="bold-table-number">{t.table_number}</td>
                          <td>Dining Hall</td>
                          <td>{t.capacity || 4} Seater</td>
                          <td>
                            <span className={`table-status-pill ${isOccupied ? 'tone-occupied' : 'tone-available'}`}>
                              <span className="dot" /> {isOccupied ? 'Occupied' : 'Available'}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="table-qr-btn-pill"
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedTable(t.table_number);
                              }}
                            >
                              <QrCode size={14} /> View QR
                            </button>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="table-status-toggle-link"
                              onClick={e => {
                                e.stopPropagation();
                                handleToggleTableStatus(t);
                              }}
                            >
                              {isOccupied ? 'Set Available' : 'Set Occupied'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Side: Table QR Code & Hub */}
        <div className="table-qr-hub-panel">
          <div className="hub-panel-header">
            <div className="panel-title-group">
              <QrCode size={18} className="panel-icon orange" />
              <h3 className="panel-title">Table QR Code Hub</h3>
            </div>
            <span className="hub-active-badge">Live QR</span>
          </div>

          <div className="qr-code-graphic-container">
            {qrCodeDataUrl ? (
              <div className="qr-image-frame">
                <img
                  src={qrCodeDataUrl}
                  alt={`QR Code for Table ${selectedTable}`}
                  className="qr-canvas-image"
                />
                <div className="qr-center-logo-badge">
                  <img
                    src="/servora-icon.png"
                    alt="S"
                    className="qr-center-icon-img"
                    onError={e => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <Utensils size={14} className="center-fork-icon" />
                </div>
              </div>
            ) : (
              <div className="qr-loading-box">Generating QR...</div>
            )}

            <div className="qr-table-tag-pill">
              Table : <b>{selectedTable}</b>
              {selectedTableObj && (
                <span className={`hub-status-pip ${selectedTableObj.status === 'occupied' ? 'occupied' : 'available'}`}>
                  • {selectedTableObj.status === 'occupied' ? 'Occupied' : 'Available'}
                </span>
              )}
            </div>
          </div>

          <div className="qr-actions-buttons-row">
            <button type="button" className="btn-download-qr" onClick={handleDownloadQr} style={{ width: '100%', justifyContent: 'center' }}>
              <Download size={15} /> Download Table QR Code
            </button>
          </div>

          <div className="qr-settings-section">
            <div className="settings-header-label">
              <Settings size={14} /> <span>QR Configuration</span>
            </div>

            <div className="qr-setting-field">
              <span className="field-label">Ordering Mode</span>
              <select className="qr-select" defaultValue="dinein">
                <option value="dinein">Dine-In Ordering + Payment</option>
                <option value="menu">Digital Menu Only</option>
              </select>
            </div>

            <div className="qr-setting-field">
              <span className="field-label">QR Validity</span>
              <select className="qr-select" defaultValue="always">
                <option value="always">Permanent (Always Active)</option>
                <option value="session">Single Customer Session</option>
              </select>
            </div>

            <div className="qr-setting-field toggle-field">
              <span className="field-label">Display Logo on QR</span>
              <label className="servora-toggle-switch">
                <input type="checkbox" defaultChecked />
                <span className="slider round" />
              </label>
            </div>

            {selectedTableObj && (
              <div className="quick-table-status-changer">
                <span className="field-label">Current Table State:</span>
                <button
                  type="button"
                  className={`btn-state-changer ${selectedTableObj.status === 'occupied' ? 'is-occupied' : 'is-available'}`}
                  onClick={() => handleToggleTableStatus(selectedTableObj)}
                >
                  {selectedTableObj.status === 'occupied' ? 'Mark Table as Available' : 'Mark Table as Occupied'}
                </button>
              </div>
            )}

            <a
              href={`/order?table=${selectedTable}`}
              target="_blank"
              rel="noreferrer"
              className="open-table-link-btn"
            >
              <ExternalLink size={15} /> Open Customer Dine-In ({selectedTable})
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
