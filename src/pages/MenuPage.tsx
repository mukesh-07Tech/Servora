import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  Download,
  Edit2,
  Eye,
  Filter,
  Flame,
  Layers,
  LayoutGrid,
  List,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Utensils,
  X
} from 'lucide-react';
import { DEFAULT_MENU, deleteMenuItem, getCategories, getCached, getMenu } from '../lib/data';
import { supabase } from '../lib/supabase';

// High-resolution authentic food imagery map for South Indian cuisine
const CATEGORY_DEFAULT_IMAGES: Record<string, string> = {
  tiffin: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=400&q=80',
  'south indian': 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=400&q=80',
  snacks: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=400&q=80',
  meals: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=400&q=80',
  beverages: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=400&q=80',
  desserts: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=400&q=80'
};

export function MenuPage({ setNotice, globalSearch }: { setNotice?: (n: any) => void; globalSearch?: string }) {
  const [items, setItems] = useState<any[]>(() => getCached<any[]>('menu_all') || DEFAULT_MENU);
  const [categories, setCategories] = useState<any[]>(() => getCached<any[]>('categories') || []);
  const [activeSubTab, setActiveSubTab] = useState<'items' | 'categories' | 'combos' | 'availability'>('items');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(8);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState(globalSearch || '');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'unavailable'>('all');
  const [sortBy, setSortBy] = useState<'default' | 'price-asc' | 'price-desc' | 'name'>('default');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  useEffect(() => {
    if (globalSearch !== undefined) {
      setSearchQuery(globalSearch);
    }
  }, [globalSearch]);

  // Image Upload & Preview states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadFileName, setUploadFileName] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);

  // Form states for Add/Edit item panel
  const [formName, setFormName] = useState('Masala Dosa');
  const [formNameTa, setFormNameTa] = useState('மசாலா தோசை');
  const [formCategory, setFormCategory] = useState('Tiffin');
  const [formPrice, setFormPrice] = useState('90');
  const [formType, setFormType] = useState<'veg' | 'non-veg'>('veg');
  const [formDesc, setFormDesc] = useState('Crispy golden crepe with spiced potato filling, coconut chutney, and piping hot sambar.');
  const [formAvailable, setFormAvailable] = useState(true);
  const [formPrepMinutes, setFormPrepMinutes] = useState(8);
  const [formImage, setFormImage] = useState('https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=600&q=80');

  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      if (setNotice) setNotice({ text: 'Please select an image file (JPEG, PNG, WEBP).', kind: 'error' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      if (setNotice) setNotice({ text: 'Image size must be less than 5MB.', kind: 'error' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setFormImage(result);
      setUploadFileName(file.name);
      if (setNotice) setNotice({ text: `Image "${file.name}" loaded for preview! Click "Save Changes" to confirm.`, kind: 'info' });
    };
    reader.onerror = () => {
      if (setNotice) setNotice({ text: 'Could not read image file.', kind: 'error' });
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processImageFile(file);
  };

  const loadData = async (force = false) => {
    try {
      const [m, c] = await Promise.all([getMenu(true, force), getCategories(force)]);
      if (m && m.length > 0) setItems(m);
      if (c && c.length > 0) setCategories(c);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleEditClick = (item: any) => {
    setEditingItem(item);
    setFormName(item.name || '');
    setFormNameTa(item.name_ta || '');
    setFormCategory(item.category_name || categories[0]?.name || 'Tiffin');
    setFormPrice(String(item.price || 40));
    setFormType(item.is_vegetarian !== false ? 'veg' : 'non-veg');
    setFormDesc(item.description || '');
    setFormAvailable(item.is_available !== false);
    setFormPrepMinutes(item.prep_minutes || 8);
    setFormImage(item.image_url || 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80');
    setUploadFileName('');
  };

  const handleNewClick = () => {
    setEditingItem({ id: 'new' });
    setFormName('');
    setFormNameTa('');
    setFormCategory(categories[0]?.name || 'Tiffin');
    setFormPrice('');
    setFormType('veg');
    setFormDesc('');
    setFormAvailable(true);
    setFormPrepMinutes(8);
    setFormImage('https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80');
    setUploadFileName('');
  };

  const handleToggleAvailability = async (item: any) => {
    if (!supabase) return;
    const nextVal = !item.is_available;
    try {
      await supabase.from('menu_items').update({ is_available: nextVal }).eq('id', item.id);
      setItems(prev => prev.map(x => x.id === item.id ? { ...x, is_available: nextVal } : x));
      if (setNotice) setNotice({ text: `${item.name} marked as ${nextVal ? 'Available (In Stock)' : 'Unavailable (Out of Stock)'}.`, kind: 'success' });
    } catch (e: any) {
      if (setNotice) setNotice({ text: e.message || 'Error updating availability', kind: 'error' });
    }
  };

  const handleDeleteItem = async (dish: any) => {
    if (!window.confirm(`Are you sure you want to remove "${dish.name}" from the menu?`)) return;
    try {
      await deleteMenuItem(dish.id);
      if (setNotice) setNotice({ text: `Removed ${dish.name} from menu.`, kind: 'info' });
      await loadData();
    } catch (e: any) {
      if (setNotice) setNotice({ text: e.message || 'Could not delete item.', kind: 'error' });
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    try {
      const restRes = await supabase.from('restaurants').select('id').limit(1).single();
      const restaurantId = restRes.data?.id;

      // Find category id from categories table
      const catObj = categories.find(c => c.name.toLowerCase() === formCategory.toLowerCase());
      const categoryId = catObj ? catObj.id : categories[0]?.id;

      const payload: any = {
        name: formName.trim(),
        name_ta: formNameTa.trim() || null,
        price: Number(formPrice) || 40,
        description: formDesc.trim(),
        is_vegetarian: formType === 'veg',
        is_available: formAvailable,
        prep_minutes: formPrepMinutes,
        image_url: formImage,
        category_id: categoryId,
        restaurant_id: restaurantId
      };

      if (editingItem?.id && editingItem.id !== 'new') {
        const { error } = await supabase.from('menu_items').update(payload).eq('id', editingItem.id);
        if (error) throw error;
        if (setNotice) setNotice({ text: `Updated ${formName} successfully!`, kind: 'success' });
      } else {
        const { error } = await supabase.from('menu_items').insert(payload);
        if (error) throw error;
        if (setNotice) setNotice({ text: `Added ${formName} to menu!`, kind: 'success' });
      }
      setEditingItem(null);
      await loadData();
    } catch (e: any) {
      if (setNotice) setNotice({ text: e.message || 'Could not save menu item.', kind: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Filter items by category, search, and availability
  let filteredItems = items.filter(it => {
    if (selectedCategory !== 'all') {
      const cat = (it.category_name || '').toLowerCase();
      if (!cat.includes(selectedCategory.toLowerCase())) return false;
    }
    if (availabilityFilter === 'available' && it.is_available === false) return false;
    if (availabilityFilter === 'unavailable' && it.is_available !== false) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = (it.name || '').toLowerCase().includes(q);
      const matchTa = (it.name_ta || '').toLowerCase().includes(q);
      const matchCat = (it.category_name || '').toLowerCase().includes(q);
      if (!matchName && !matchTa && !matchCat) return false;
    }
    return true;
  });

  // Sorting
  if (sortBy === 'price-asc') {
    filteredItems.sort((a, b) => (a.price || 0) - (b.price || 0));
  } else if (sortBy === 'price-desc') {
    filteredItems.sort((a, b) => (b.price || 0) - (a.price || 0));
  } else if (sortBy === 'name') {
    filteredItems.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  // Dynamic category tiles computed from live items & categories in DB
  const categoryTiles = [
    {
      key: 'all',
      label: 'All Items',
      count: items.length,
      img: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=120&q=80'
    },
    ...categories.map(cat => {
      const count = items.filter(i => i.category_id === cat.id || (i.category_name || '').toLowerCase() === cat.name.toLowerCase()).length;
      const lower = cat.name.toLowerCase();
      const defaultImg = CATEGORY_DEFAULT_IMAGES[lower] || 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=120&q=80';
      const sampleItem = items.find(i => i.category_id === cat.id && i.image_url);
      return {
        key: lower,
        label: cat.name,
        count,
        img: sampleItem?.image_url || defaultImg
      };
    })
  ];

  const totalPages = Math.ceil(filteredItems.length / rowsPerPage) || 1;
  const paginatedItems = filteredItems.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  return (
    <div className="admin-page-container menu-management-overhaul-page">
      {/* 1. Sub-nav Navigation Tabs with Full Styling & Colors */}
      <div className="menu-top-nav-bar">
        <div className="menu-tabs-left">
          <button
            type="button"
            className={`menu-nav-tab-pill ${activeSubTab === 'items' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('items')}
          >
            <Utensils size={15} /> <span>Menu Items</span>
          </button>
          <button
            type="button"
            className={`menu-nav-tab-pill ${activeSubTab === 'categories' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('categories')}
          >
            <Layers size={15} /> <span>Categories ({categories.length})</span>
          </button>
          <button
            type="button"
            className={`menu-nav-tab-pill ${activeSubTab === 'availability' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('availability')}
          >
            <Clock3 size={15} /> <span>Quick Availability</span>
          </button>
          <button
            type="button"
            className={`menu-nav-tab-pill ${activeSubTab === 'combos' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('combos')}
          >
            <Sparkles size={15} /> <span>Combo Offers</span>
          </button>
        </div>

        <div className="menu-actions-right">
          <button
            type="button"
            className="menu-action-pill-btn"
            onClick={() => {
              const csv = "Item Name,Tamil Name,Category,Price,Available\n" +
                items.map((m: any) => `"${m.name || ''}","${m.name_ta || ''}","${m.category || m.category_name || ''}",${m.price || 0},${m.is_available ? 'Yes' : 'No'}`).join("\n");
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `Menu_Directory_${new Date().toISOString().split('T')[0]}.csv`;
              a.click();
              URL.revokeObjectURL(url);
              if (setNotice) setNotice({ text: 'Menu directory exported to CSV.', kind: 'success' });
            }}
            title="Export Menu to CSV"
          >
            <Download size={14} /> <span>Export Menu</span>
          </button>

          <button type="button" className="menu-btn-add-primary" onClick={handleNewClick}>
            <Plus size={16} /> <span>Add Menu Item</span>
          </button>
        </div>
      </div>

      {/* ========================================================
          SUB-TAB 1: MENU ITEMS (DEFAULT DUAL VIEW: GRID + DRAWER)
          ======================================================== */}
      {activeSubTab === 'items' && (
        <>
          {/* 2. Dynamic Categories Carousel */}
          <div className="menu-category-carousel-wrapper">
            <div className="category-cards-carousel">
              {categoryTiles.map(cat => (
                <div
                  key={cat.key}
                  className={`category-item-card ${selectedCategory === cat.key ? 'active' : ''}`}
                  onClick={() => { setSelectedCategory(cat.key); setPage(1); }}
                >
                  <div className="category-card-img-circle">
                    <img src={cat.img} alt={cat.label} />
                  </div>
                  <span className="category-card-title">{cat.label}</span>
                  <span className="category-card-count">({cat.count})</span>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Action Toolbar */}
          <div className="menu-action-toolbar">
            <div className="toolbar-left-group">
              <h3 className="section-title">
                Menu Directory <span className="items-count-badge">({filteredItems.length})</span>
              </h3>

              <div className="menu-search-box">
                <Search size={15} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search dishes (e.g. Dosa, Idli, Pongal)..."
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                  className="menu-search-input"
                />
                {searchQuery && (
                  <button type="button" className="search-clear-mini-btn" onClick={() => setSearchQuery('')}>
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            <div className="toolbar-right-group">
              <div className="filter-dropdown-wrap">
                <select
                  className="filter-select"
                  value={availabilityFilter}
                  onChange={e => { setAvailabilityFilter(e.target.value as any); setPage(1); }}
                >
                  <option value="all">All Availability</option>
                  <option value="available">In Stock Only</option>
                  <option value="unavailable">Out of Stock Only</option>
                </select>
              </div>

              <div className="filter-dropdown-wrap">
                <select
                  className="filter-select"
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                >
                  <option value="default">Sort: Default</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="name">Name: A to Z</option>
                </select>
              </div>

              <div className="view-mode-toggle-pills">
                <button
                  type="button"
                  className={`view-pill ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => setViewMode('grid')}
                  title="Grid Cards View"
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

          {/* 4. Main Split: Dish Grid (Left 66%) + Add/Edit Side Panel (Right 34%) */}
          <div className={`menu-main-split ${editingItem ? 'has-drawer' : 'full-grid'}`}>
            {/* Left Side: Dish Grid or Table View */}
            <div className="menu-grid-main-container">
              {filteredItems.length === 0 ? (
                <div className="empty-menu-notice">
                  <Utensils size={36} className="muted-icon" />
                  <h4>No menu dishes found</h4>
                  <p>Try adjusting your search or category filter, or click "Add Menu Item" above.</p>
                </div>
              ) : viewMode === 'grid' ? (
                <div className="dish-cards-responsive-grid">
                  {paginatedItems.map((dish) => {
                    const isAvailable = dish.is_available !== false;
                    const isSelected = editingItem?.id === dish.id;

                    return (
                      <div
                        key={dish.id}
                        className={`menu-dish-card ${isSelected ? 'is-selected' : ''} ${!isAvailable ? 'is-unavailable' : ''}`}
                        onClick={() => handleEditClick(dish)}
                      >
                        {/* Top Badges */}
                        <div className="dish-card-badges-row">
                          <span className={`veg-nonveg-badge ${dish.is_vegetarian !== false ? 'is-veg' : 'is-nonveg'}`} title={dish.is_vegetarian !== false ? 'Vegetarian' : 'Non-Vegetarian'}>
                            <span className="inner-dot" />
                          </span>
                          <span className="dish-category-pill">{dish.category_name || 'South Indian'}</span>
                          <span className="dish-prep-badge">
                            <Clock3 size={11} /> {dish.prep_minutes || 8}m
                          </span>
                        </div>

                        {/* Dish Photo */}
                        <div className="dish-card-image-wrap">
                          <img
                            src={dish.image_url || 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80'}
                            alt={dish.name}
                            className="dish-photo"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80';
                            }}
                          />
                        </div>

                        {/* Name & Subtitle */}
                        <div className="dish-card-details">
                          <h4 className="dish-name" title={dish.name}>{dish.name}</h4>
                          {dish.name_ta && <span className="dish-tamil-sub">{dish.name_ta}</span>}

                          {/* Price & Availability switch */}
                          <div className="dish-price-row">
                            <span className="dish-price">₹{dish.price}</span>

                            <div className="dish-availability-switch-wrap" onClick={e => e.stopPropagation()}>
                              <label className="servora-toggle-switch">
                                <input
                                  type="checkbox"
                                  checked={isAvailable}
                                  onChange={() => handleToggleAvailability(dish)}
                                />
                                <span className="slider round" />
                              </label>
                              <span className={`avail-status-label ${isAvailable ? 'in-stock' : 'out-of-stock'}`}>
                                {isAvailable ? 'In Stock' : 'Out'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions Toolbar */}
                        <div className="dish-card-actions-bar" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            className="dish-tool-btn edit-btn"
                            title="Edit dish details"
                            onClick={() => handleEditClick(dish)}
                          >
                            <Pencil size={14} /> <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            className="dish-tool-btn danger-trash"
                            title="Remove dish from menu"
                            onClick={() => handleDeleteItem(dish)}
                          >
                            <Trash2 size={14} /> <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Table View */
                <div className="menu-table-view-wrapper">
                  <table className="staff-data-table menu-full-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>#</th>
                        <th>Dish Photo</th>
                        <th>Dish Name</th>
                        <th>Category</th>
                        <th>Type</th>
                        <th>Price</th>
                        <th>Prep Time</th>
                        <th>Availability</th>
                        <th style={{ textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedItems.map((dish, idx) => {
                        const isAvailable = dish.is_available !== false;
                        return (
                          <tr key={dish.id} className="menu-table-row" onClick={() => handleEditClick(dish)}>
                            <td className="row-num">{(page - 1) * rowsPerPage + idx + 1}</td>
                            <td>
                              <img
                                src={dish.image_url || 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=100&q=80'}
                                alt={dish.name}
                                className="table-dish-thumb"
                              />
                            </td>
                            <td>
                              <b className="name-text">{dish.name}</b>
                              {dish.name_ta && <span className="dish-tamil-sub block">{dish.name_ta}</span>}
                            </td>
                            <td>
                              <span className="dish-category-pill">{dish.category_name || 'South Indian'}</span>
                            </td>
                            <td>
                              <span className={`veg-nonveg-badge ${dish.is_vegetarian !== false ? 'is-veg' : 'is-nonveg'}`}>
                                <span className="inner-dot" />
                              </span>
                            </td>
                            <td className="bold-price">₹{dish.price}</td>
                            <td>{dish.prep_minutes || 8} mins</td>
                            <td onClick={e => e.stopPropagation()}>
                              <div className="dish-availability-switch-wrap">
                                <label className="servora-toggle-switch">
                                  <input
                                    type="checkbox"
                                    checked={isAvailable}
                                    onChange={() => handleToggleAvailability(dish)}
                                  />
                                  <span className="slider round" />
                                </label>
                                <span className={`avail-status-label ${isAvailable ? 'in-stock' : 'out-of-stock'}`}>
                                  {isAvailable ? 'In Stock' : 'Out of Stock'}
                                </span>
                              </div>
                            </td>
                            <td className="actions-cell" style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                              <div className="table-row-actions-group">
                                <button type="button" className="dish-tool-btn edit-btn" onClick={() => handleEditClick(dish)}>
                                  <Pencil size={13} />
                                </button>
                                <button type="button" className="dish-tool-btn danger-trash" onClick={() => handleDeleteItem(dish)}>
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Dynamic Pagination Bar */}
              <div className="menu-pagination-bar">
                <span className="pagination-info">
                  Showing {filteredItems.length > 0 ? (page - 1) * rowsPerPage + 1 : 0} – {Math.min(page * rowsPerPage, filteredItems.length)} of {filteredItems.length} items
                </span>
                <div className="pagination-pages-group">
                  <button
                    type="button"
                    className="page-nav-btn"
                    disabled={page === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    &lt;
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => (
                    <button
                      key={i + 1}
                      type="button"
                      className={`page-number-btn ${page === i + 1 ? 'active' : ''}`}
                      onClick={() => setPage(i + 1)}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="page-nav-btn"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    &gt;
                  </button>
                </div>
                <div className="pagination-rows-select-wrap">
                  <span>Rows:</span>
                  <select
                    className="rows-select"
                    value={rowsPerPage}
                    onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
                  >
                    <option value="8">8 per page</option>
                    <option value="12">12 per page</option>
                    <option value="16">16 per page</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Right Side: Add / Edit Menu Item Panel */}
            {editingItem && (
              <div className="menu-edit-side-panel">
                <div className="edit-panel-header">
                  <div className="panel-title-with-badge">
                    <span className="header-icon-circle"><Pencil size={15} /></span>
                    <h3 className="panel-title">
                      {editingItem?.id && editingItem.id !== 'new' ? `Edit: ${editingItem.name}` : 'Add New Menu Item'}
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="close-drawer-btn"
                    onClick={() => setEditingItem(null)}
                    title="Close editor"
                  >
                    <X size={16} />
                  </button>
                </div>

                <form onSubmit={handleSaveItem} className="menu-edit-form">
                  {/* Image Upload Zone with Live Preview Before Confirm */}
                  <div className="form-image-upload-wrapper">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="image/*"
                      style={{ display: 'none' }}
                    />

                    <div
                      className={`image-upload-dropzone-box ${isDragging ? 'dragging' : ''} ${formImage ? 'has-preview' : ''}`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {formImage ? (
                        <div className="image-preview-card" onClick={e => e.stopPropagation()}>
                          <div className="preview-img-container">
                            <img
                              src={formImage}
                              alt="Dish preview"
                              className="dish-live-preview-img"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80';
                              }}
                            />
                            <span className="preview-badge-floating">
                              <Check size={12} /> Preview Ready
                            </span>
                          </div>
                          <div className="preview-meta-actions">
                            <div className="preview-file-text">
                              <b className="preview-file-title">{uploadFileName || formName || 'Dish Photo Preview'}</b>
                              <span className="preview-file-sub">Preview before saving to menu</span>
                            </div>
                            <div className="preview-btn-actions">
                              <button
                                type="button"
                                className="preview-action-btn btn-change-img"
                                onClick={() => fileInputRef.current?.click()}
                                title="Upload different image"
                              >
                                <Upload size={13} /> <span>Change</span>
                              </button>
                              <button
                                type="button"
                                className="preview-action-btn btn-remove-img"
                                onClick={() => {
                                  setFormImage('');
                                  setUploadFileName('');
                                }}
                                title="Remove photo"
                              >
                                <Trash2 size={13} /> <span>Remove</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="dropzone-empty-prompt">
                          <div className="dropzone-icon-circle">
                            <Upload size={22} className="upload-icon-graphic" />
                          </div>
                          <b className="dropzone-main-text">Click to upload photo or drag &amp; drop</b>
                          <span className="dropzone-sub-text">PNG, JPG, or WEBP (Max 5MB)</span>
                        </div>
                      )}
                    </div>

                    <div className="url-toggle-bar">
                      <button
                        type="button"
                        className="text-link-toggle"
                        onClick={() => setShowUrlInput(!showUrlInput)}
                      >
                        {showUrlInput ? '– Hide image URL field' : '+ Or paste web image URL instead'}
                      </button>
                      {showUrlInput && (
                        <input
                          type="url"
                          className="form-input form-url-input"
                          value={formImage}
                          onChange={e => setFormImage(e.target.value)}
                          placeholder="https://images.unsplash.com/photo-..."
                        />
                      )}
                    </div>
                  </div>

                  {/* Item Name (English & Tamil) */}
                  <div className="form-fields-row-2">
                    <div className="form-field-group">
                      <label className="form-label">Item Name (English) *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={formName}
                        onChange={e => setFormName(e.target.value)}
                        placeholder="e.g. Ghee Roast Dosa"
                        required
                      />
                    </div>

                    <div className="form-field-group">
                      <label className="form-label">Tamil Name (Optional)</label>
                      <input
                        type="text"
                        className="form-input"
                        value={formNameTa}
                        onChange={e => setFormNameTa(e.target.value)}
                        placeholder="e.g. நெய் ரோஸ்ட் தோசை"
                      />
                    </div>
                  </div>

                  {/* Category & Price */}
                  <div className="form-fields-row-2">
                    <div className="form-field-group">
                      <label className="form-label">Category *</label>
                      <select
                        className="form-select"
                        value={formCategory}
                        onChange={e => setFormCategory(e.target.value)}
                      >
                        {categories.map(c => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-field-group">
                      <label className="form-label">Price (₹) *</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        className="form-input"
                        value={formPrice}
                        onChange={e => setFormPrice(e.target.value)}
                        placeholder="90"
                        required
                      />
                    </div>
                  </div>

                  {/* Item Type (Veg vs Non-Veg Styled Pill Selector) */}
                  <div className="form-field-group">
                    <label className="form-label">Food Classification</label>
                    <div className="veg-segmented-control">
                      <button
                        type="button"
                        className={`veg-segment-pill ${formType === 'veg' ? 'active-veg' : ''}`}
                        onClick={() => setFormType('veg')}
                      >
                        <span className="dot dot-veg" /> <span>Vegetarian</span>
                      </button>
                      <button
                        type="button"
                        className={`veg-segment-pill ${formType === 'non-veg' ? 'active-nonveg' : ''}`}
                        onClick={() => setFormType('non-veg')}
                      >
                        <span className="dot dot-nonveg" /> <span>Non-Vegetarian</span>
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="form-field-group">
                    <div className="label-with-counter">
                      <label className="form-label">Description (Optional)</label>
                      <span className="char-counter">{formDesc.length}/150</span>
                    </div>
                    <textarea
                      className="form-textarea"
                      rows={2}
                      maxLength={150}
                      value={formDesc}
                      onChange={e => setFormDesc(e.target.value)}
                      placeholder="e.g., Crispy golden crepe prepared with pure ghee and served with fresh coconut chutney."
                    />
                  </div>

                  {/* Availability Toggle */}
                  <div className="form-toggle-row">
                    <div className="toggle-text-col">
                      <span className="toggle-row-label">Availability</span>
                      <span className="toggle-sub-note">Display in customer digital QR menu</span>
                    </div>
                    <div className="toggle-with-text">
                      <label className="servora-toggle-switch">
                        <input
                          type="checkbox"
                          checked={formAvailable}
                          onChange={e => setFormAvailable(e.target.checked)}
                        />
                        <span className="slider round" />
                      </label>
                      <span className={`toggle-state-text ${formAvailable ? 'in-stock' : 'out-of-stock'}`}>
                        {formAvailable ? 'In Stock' : 'Hidden'}
                      </span>
                    </div>
                  </div>

                  {/* Preparation Time Stepper */}
                  <div className="prep-time-row">
                    <span className="prep-time-label">
                      <Clock3 size={15} /> Preparation Time (minutes)
                    </span>
                    <div className="prep-stepper-control">
                      <button
                        type="button"
                        className="stepper-btn"
                        onClick={() => setFormPrepMinutes(m => Math.max(1, m - 1))}
                        title="Decrease time"
                      >
                        <Minus size={13} />
                      </button>
                      <span className="stepper-value">{formPrepMinutes} min</span>
                      <button
                        type="button"
                        className="stepper-btn"
                        onClick={() => setFormPrepMinutes(m => m + 1)}
                        title="Increase time"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Submit / Cancel Buttons with Servora Brand Colors */}
                  <div className="form-submit-buttons-row">
                    <button type="submit" className="form-btn-save-primary" disabled={saving}>
                      <Check size={16} /> <span>{saving ? 'Saving...' : editingItem?.id && editingItem.id !== 'new' ? 'Save Changes' : 'Add Dish to Menu'}</span>
                    </button>
                    <button
                      type="button"
                      className="form-btn-cancel-plain"
                      onClick={() => setEditingItem(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </>
      )}

      {/* ========================================================
          SUB-TAB 2: CATEGORIES OVERVIEW
          ======================================================== */}
      {activeSubTab === 'categories' && (
        <div className="menu-categories-management-view">
          <div className="categories-overview-header">
            <h3 className="section-title">Menu Categories Directory ({categories.length})</h3>
            <p className="section-subtitle">Live menu categories managed from Supabase database.</p>
          </div>

          <div className="categories-cards-grid">
            {categories.map((cat, idx) => {
              const dishCount = items.filter(i => i.category_id === cat.id || (i.category_name || '').toLowerCase() === cat.name.toLowerCase()).length;
              const sampleImg = items.find(i => i.category_id === cat.id && i.image_url)?.image_url || CATEGORY_DEFAULT_IMAGES[cat.name.toLowerCase()] || 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=300&q=80';

              return (
                <div key={cat.id || idx} className="category-overview-card">
                  <div className="category-thumb-frame">
                    <img src={sampleImg} alt={cat.name} />
                  </div>
                  <div className="category-meta-col">
                    <b className="cat-title">{cat.name}</b>
                    {cat.name_ta && <span className="cat-ta">{cat.name_ta}</span>}
                    <span className="cat-dish-count">{dishCount} Dishes Available</span>
                  </div>
                  <button
                    type="button"
                    className="cat-filter-btn"
                    onClick={() => {
                      setSelectedCategory(cat.name.toLowerCase());
                      setActiveSubTab('items');
                    }}
                  >
                    View Dishes →
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================
          SUB-TAB 3: QUICK AVAILABILITY MANAGER
          ======================================================== */}
      {activeSubTab === 'availability' && (
        <div className="menu-quick-availability-view">
          <div className="availability-overview-header">
            <div>
              <h3 className="section-title">Quick Availability Manager</h3>
              <p className="section-subtitle">Instantly toggle in-stock or 86 out-of-stock items across the dining hall during peak hours.</p>
            </div>
          </div>

          <div className="availability-table-card">
            <table className="staff-data-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th>Dish Photo</th>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Current State</th>
                  <th style={{ width: '160px', textAlign: 'center' }}>Stock Toggle</th>
                </tr>
              </thead>
              <tbody>
                {items.map((dish, i) => {
                  const isAvailable = dish.is_available !== false;
                  return (
                    <tr key={dish.id} className="availability-row">
                      <td className="row-num">{i + 1}</td>
                      <td>
                        <img
                          src={dish.image_url || 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=100&q=80'}
                          alt={dish.name}
                          className="table-dish-thumb"
                        />
                      </td>
                      <td>
                        <b className="name-text">{dish.name}</b>
                        {dish.name_ta && <span className="dish-tamil-sub block">{dish.name_ta}</span>}
                      </td>
                      <td><span className="dish-category-pill">{dish.category_name || 'South Indian'}</span></td>
                      <td className="bold-price">₹{dish.price}</td>
                      <td>
                        <span className={`stock-status-pip ${isAvailable ? 'available' : 'unavailable'}`}>
                          <span className="dot" /> {isAvailable ? 'In Stock (Live on QR)' : 'Out of Stock (86)'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className={`btn-stock-toggle ${isAvailable ? 'active-instock' : 'active-out'}`}
                          onClick={() => handleToggleAvailability(dish)}
                        >
                          {isAvailable ? 'Mark Out of Stock' : 'Mark Available'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          SUB-TAB 4: COMBO OFFERS & THALIS
          ======================================================== */}
      {activeSubTab === 'combos' && (
        <div className="menu-combos-view">
          <div className="combos-header">
            <h3 className="section-title">Special Combos &amp; Thali Offers</h3>
            <p className="section-subtitle">Bundled meal combinations prepared fresh daily for fast customer ordering.</p>
          </div>

          <div className="combos-grid">
            {[
              {
                title: 'South Indian Breakfast Thali',
                items: 'Idli (2 Pcs) + Medu Vada (1 Pc) + Mini Pongal + Filter Coffee',
                price: '₹140',
                img: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=400&q=80',
                saving: 'Save ₹30'
              },
              {
                title: 'Royal Ghee Dosa Feast',
                items: 'Ghee Roast Dosa + 2 Medu Vada + Filter Coffee',
                price: '₹175',
                img: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=400&q=80',
                saving: 'Save ₹25'
              },
              {
                title: 'Executive South Indian Lunch Meal',
                items: 'Steamed Rice + Sambar + Rasam + Kootu + Poriyal + Curd + Appalam + Payasam',
                price: '₹160',
                img: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=400&q=80',
                saving: 'Best Value'
              }
            ].map((combo, idx) => (
              <div key={idx} className="combo-card">
                <div className="combo-card-img-wrap">
                  <img src={combo.img} alt={combo.title} />
                  <span className="combo-saving-pill">{combo.saving}</span>
                </div>
                <div className="combo-details">
                  <b className="combo-title">{combo.title}</b>
                  <p className="combo-items-desc">{combo.items}</p>
                  <div className="combo-bottom-row">
                    <b className="combo-price">{combo.price}</b>
                    <button
                      type="button"
                      className="combo-activate-btn"
                      onClick={() => {
                        if (setNotice) setNotice({ text: `${combo.title} is active in today's special menu!`, kind: 'success' });
                      }}
                    >
                      <Check size={14} /> Active on QR
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
