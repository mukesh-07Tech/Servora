import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Coffee,
  Flame,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Soup,
  Trash2,
  User,
  Users,
  Utensils,
  X
} from 'lucide-react';
import { getMenu, getTables, rememberMyOrder } from '../lib/data';
import { MenuItem, money, supabase } from '../lib/supabase';

type Line = { item: MenuItem; quantity: number };

type Props = {
  open: boolean;
  onClose: () => void;
  customerName: string;
  customerPhone: string;
  /** Table of the diner's current order, when known */
  knownTable?: string;
  setNotice?: (n: any) => void;
  /** Called after the server accepted the order */
  onPlaced: (order: { id: string; order_number: number | string; table: string }) => void;
};

const GST_RATE = 5;

function categoryIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes('south') || n.includes('dosa')) return <Flame size={15} />;
  if (n.includes('meal') || n.includes('rice') || n.includes('thali') || n.includes('biryani')) return <Soup size={15} />;
  if (n.includes('beverage') || n.includes('coffee') || n.includes('tea') || n.includes('juice')) return <Coffee size={15} />;
  if (n.includes('all')) return <Sparkles size={15} />;
  return <Utensils size={15} />;
}

/**
 * "Order more" for a signed-in diner. Same look as the dine-in menu, but it opens on top of the
 * customer dashboard so the diner never leaves their account area.
 */
export function OrderMoreModal({ open, onClose, customerName, customerPhone, knownTable, setNotice, onPlaced }: Props) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [menuState, setMenuState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [tables, setTables] = useState<any[]>([]);
  const [table, setTable] = useState('');
  const [guests, setGuests] = useState(2);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Line[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  // Load menu + tables every time the popup opens
  useEffect(() => {
    if (!open) return;
    setError('');
    setSheetOpen(false);
    setMenuState('loading');
    getMenu()
      .then(items => { setMenu(items); setMenuState('ready'); })
      .catch(() => setMenuState('error'));
    getTables().then(t => setTables(Array.isArray(t) ? t : [])).catch(() => { });

    let remembered = '';
    try {
      const ctx = JSON.parse(localStorage.getItem('servora_dine_ctx') || 'null');
      if (ctx?.guests) setGuests(Number(ctx.guests) || 2);
      remembered = localStorage.getItem('servora_active_order_table') || ctx?.table || '';
    } catch { }
    setTable((knownTable || remembered || '').toUpperCase());
  }, [open, knownTable]);

  // Lock page scroll behind the popup
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(menu.map(m => m.category_name).filter(Boolean) as string[]))],
    [menu]
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menu.filter(i =>
      (category === 'All' || i.category_name === category) &&
      (!q || i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q))
    );
  }, [menu, category, search]);

  const itemCount = cart.reduce((n, l) => n + l.quantity, 0);
  const subtotal = cart.reduce((n, l) => n + l.item.price * l.quantity, 0);
  const tax = Math.round(subtotal * GST_RATE) / 100;
  const total = subtotal + tax;

  const qtyOf = (id: string) => cart.find(l => l.item.id === id)?.quantity || 0;
  const setQty = (item: MenuItem, qty: number) => {
    setCart(prev => {
      const rest = prev.filter(l => l.item.id !== item.id);
      return qty > 0 ? [...rest, { item, quantity: Math.min(qty, 30) }].sort((a, b) => a.item.name.localeCompare(b.item.name)) : rest;
    });
  };

  async function placeOrder() {
    if (busy) return;
    setError('');
    if (!table) { setError('Please choose your table first.'); return; }
    if (cart.length === 0) { setError('Add at least one dish to your order.'); return; }
    if (!supabase) { setError('The service is not configured.'); return; }
    setBusy(true);
    try {
      const accessToken = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
      const { data, error: rpcError } = await supabase.rpc('place_order', {
        p_table_token: table,
        p_customer: { name: customerName || 'Guest', phone: customerPhone.replace(/\D/g, ''), persons: guests },
        p_items: cart.map(l => ({ menu_item_id: l.item.id, quantity: l.quantity, note: '' })),
        p_access_token: accessToken,
        p_idempotency_key: idempotencyKey
      });
      const info = data?.order || data;
      if (rpcError || !info?.id) {
        throw new Error((rpcError?.message || '').replace(/^.*?ERROR:\s*/i, '') || 'We could not place your order. Please try again.');
      }
      const token = info.access_token || accessToken;
      try {
        localStorage.setItem('servora_active_order_id', info.id);
        localStorage.setItem('servora_active_order_token', token);
        localStorage.setItem('servora_active_order_num', String(info.order_number ?? ''));
        localStorage.setItem('servora_active_order_table', table);
        localStorage.setItem('servora_selected_order_id', String(info.order_number ?? info.id));
      } catch { }
      rememberMyOrder({ id: info.id, token, number: info.order_number, table });
      setCart([]);
      setIdempotencyKey(crypto.randomUUID());
      setNotice?.({ text: `Order #SVR${info.order_number} sent to the kitchen for Table ${table}.`, kind: 'success' });
      onPlaced({ id: info.id, order_number: info.order_number, table });
    } catch (e: any) {
      setError(e?.message || 'We could not place your order. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const needsTable = !table;

  const cartPanel = (
    <div className="om-cart">
      <div className="om-cart-head">
        <h4><ShoppingBag size={18} /> Your new order ({itemCount})</h4>
        <button type="button" className="om-icon-btn om-sheet-close" aria-label="Close order" onClick={() => setSheetOpen(false)}>
          <X size={18} />
        </button>
      </div>

      {cart.length === 0 ? (
        <p className="om-cart-empty">No dishes added yet. Tap Add on any dish to begin.</p>
      ) : (
        <div className="om-cart-lines">
          {cart.map(l => (
            <div className="om-cart-line" key={l.item.id}>
              <div className="om-cart-line-info">
                <b>{l.item.name}</b>
                <small>{money(l.item.price)} each</small>
              </div>
              <div className="om-stepper">
                <button type="button" aria-label={`Remove one ${l.item.name}`} onClick={() => setQty(l.item, l.quantity - 1)}><Minus size={14} /></button>
                <span>{l.quantity}</span>
                <button type="button" aria-label={`Add one ${l.item.name}`} onClick={() => setQty(l.item, l.quantity + 1)}><Plus size={14} /></button>
              </div>
              <button type="button" className="om-icon-btn om-remove" aria-label={`Remove ${l.item.name}`} onClick={() => setQty(l.item, 0)}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="om-totals">
        <div><span>Items total</span><b>{money(subtotal)}</b></div>
        <div><span>GST ({GST_RATE}%)</span><b>{money(tax)}</b></div>
        <div className="om-grand"><span>Total</span><b>{money(total)}</b></div>
      </div>

      {error && <p className="om-error" role="alert">{error}</p>}

      <button type="button" className="om-place-btn" disabled={busy || cart.length === 0} onClick={placeOrder}>
        {busy ? 'Sending to kitchen...' : <>Place order <ArrowRight size={17} /></>}
      </button>
      <p className="om-fine">This is added to your table. Pay one bill at the end of your meal.</p>
    </div>
  );

  return (
    <div className="om-overlay" role="dialog" aria-modal="true" aria-label="Order more dishes">
      <div className="om-backdrop" onClick={onClose} />
      <div className="om-modal">
        <header className="om-header">
          <div className="om-title">
            <span className="om-title-icon"><Utensils size={18} /></span>
            <div>
              <h3>Order more dishes</h3>
              <small><User size={12} /> {customerName || 'Guest'}</small>
            </div>
          </div>
          <div className="om-header-actions">
            {table && (
              <button type="button" className="om-chip" onClick={() => setTable('')} title="Change table">
                <Check size={14} /> Table {table} <span>Change</span>
              </button>
            )}
            <div className="om-guests" title="Guests at the table">
              <Users size={14} />
              <button type="button" aria-label="Fewer guests" onClick={() => setGuests(g => Math.max(1, g - 1))}><Minus size={13} /></button>
              <b>{guests}</b>
              <button type="button" aria-label="More guests" onClick={() => setGuests(g => Math.min(20, g + 1))}><Plus size={13} /></button>
            </div>
            <button type="button" className="om-icon-btn" aria-label="Close" onClick={onClose}><X size={19} /></button>
          </div>
        </header>

        {needsTable ? (
          <div className="om-table-pick">
            <h4>Which table are you at?</h4>
            <p>Pick your table so the kitchen knows where to serve your order.</p>
            <div className="om-table-grid">
              {(tables.length ? tables.map((t: any) => t.table_number || t.label || t.name).filter(Boolean) : ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08']).map((t: string) => (
                <button type="button" key={t} onClick={() => setTable(String(t).toUpperCase())}>{t}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="om-body">
            <section className="om-menu">
              <div className="om-search">
                <Search size={17} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search dishes..." aria-label="Search dishes" />
              </div>
              <div className="om-cats">
                {categories.map(c => (
                  <button type="button" key={c} className={c === category ? 'on' : ''} onClick={() => setCategory(c)}>
                    {categoryIcon(c)} {c === 'All' ? 'All dishes' : c}
                  </button>
                ))}
              </div>

              {menuState === 'loading' && <p className="om-state">Loading menu...</p>}
              {menuState === 'error' && <p className="om-state">We could not load the menu. Please close this window and try again.</p>}
              {menuState === 'ready' && shown.length === 0 && <p className="om-state">No dishes match your search.</p>}

              <div className="om-grid">
                {shown.map(item => {
                  const q = qtyOf(item.id);
                  return (
                    <article className="om-dish" key={item.id}>
                      <div className="om-dish-text">
                        <div className="om-dish-title">
                          <b>{item.name}</b>
                          <span className={`om-veg ${item.is_vegetarian ? 'veg' : 'non'}`} title={item.is_vegetarian ? 'Vegetarian' : 'Non-vegetarian'} />
                        </div>
                        {item.description && <p>{item.description}</p>}
                        <div className="om-dish-foot">
                          <strong>{money(item.price)}</strong>
                          {q === 0 ? (
                            <button type="button" className="om-add" onClick={() => setQty(item, 1)}><Plus size={14} /> Add</button>
                          ) : (
                            <div className="om-stepper on">
                              <button type="button" aria-label={`Remove one ${item.name}`} onClick={() => setQty(item, q - 1)}><Minus size={14} /></button>
                              <span>{q}</span>
                              <button type="button" aria-label={`Add one ${item.name}`} onClick={() => setQty(item, q + 1)}><Plus size={14} /></button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="om-dish-img">
                        {item.image_url ? <img src={item.image_url} alt="" loading="lazy" /> : <Utensils size={26} />}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <aside className={`om-side${sheetOpen ? ' open' : ''}`}>{cartPanel}</aside>
            {sheetOpen && <div className="om-sheet-backdrop" onClick={() => setSheetOpen(false)} />}
          </div>
        )}

        {!needsTable && itemCount > 0 && !sheetOpen && (
          <button type="button" className="om-cart-bar" onClick={() => setSheetOpen(true)}>
            <span><ShoppingBag size={18} /> {itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
            <span>View order <b>{money(total)}</b> <ArrowRight size={16} /></span>
          </button>
        )}
      </div>
    </div>
  );
}
