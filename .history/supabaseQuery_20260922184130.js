const { supabase } = require('./supabaseClient');

function compact(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim();
}

function throwIf(error, context) {
  if (!error) return;
  const details = error.details || error.hint || '';
  throw new Error(`Supabase${context ? ' (' + context + ')' : ''}: ${error.message}${details ? ' — ' + details : ''}`);
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return value;
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isNaN(n) ? value : n;
}

const NUMERIC_KEYS = new Set([
  'id', 'category_id', 'product_id', 'order_id', 'table_id', 'merchant_id',
  'price', 'special_price', 'custom_tea_price', 'unit_price', 'total_amount',
  'amount', 'balance', 'current_total', 'is_active', 'is_special', 'quantity',
  'sort_order', 'pending_order_count', 'tx_count', 'transaction_count',
  'merchant_count', 'total', 'nakit', 'kart', 'veresiye', 'total_income',
  'total_quantity', 'total_debt', 'today_orders_amount', 'today_collected_amount',
  'count', 'today_orders', 'today_payments'
]);

function coerceRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const key of Object.keys(out)) {
    if (NUMERIC_KEYS.has(key)) out[key] = toNumber(out[key]);
  }
  return out;
}

function coerceRows(rows) {
  return (rows || []).map(coerceRow);
}

function todayRangeIstanbul() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const day = fmt.format(new Date());
  return {
    start: `${day}T00:00:00+03:00`,
    end: `${day}T23:59:59.999+03:00`
  };
}

async function sbInsert(table, payload) {
  const { data, error } = await supabase.from(table).insert(payload).select('id').single();
  throwIf(error, `insert ${table}`);
  return { lastID: data.id, changes: 1 };
}

async function sbUpdate(table, payload, applyFilters) {
  let q = supabase.from(table).update(payload);
  q = applyFilters(q);
  const { error, count } = await q.select('id');
  throwIf(error, `update ${table}`);
  return { lastID: 0, changes: Array.isArray(count) ? count.length : 1 };
}

async function sbDelete(table, applyFilters) {
  let q = supabase.from(table).delete();
  q = applyFilters(q);
  const { data, error } = await q.select('id');
  throwIf(error, `delete ${table}`);
  return { lastID: 0, changes: Array.isArray(data) ? data.length : 0 };
}

function parseInsert(sql, params) {
  const match = compact(sql).match(/^INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\((.+?)\)(?:\s+ON\s+CONFLICT\s*\(([^)]+)\)\s*DO\s+UPDATE\s+SET\s+.*)?$/i);
  if (!match) return null;
  const table = match[1];
  const columns = match[2].split(',').map((c) => c.trim());
  const rawValues = match[3];
  const onConflict = match[4] ? match[4].split(',').map((col) => col.trim()).join(',') : null;
  const tokens = [];
  let buf = '';
  let depth = 0;
  let quote = null;
  for (let i = 0; i < rawValues.length; i++) {
    const ch = rawValues[i];
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      tokens.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) tokens.push(buf.trim());

  const payload = {};
  let p = 0;
  columns.forEach((col, i) => {
    const token = (tokens[i] || '').trim();
    if (token === '?') {
      payload[col] = params[p++];
    } else if (/^datetime\(/i.test(token) || /^now\(\)/i.test(token) || /^CURRENT_TIMESTAMP$/i.test(token)) {
      payload[col] = new Date().toISOString();
    } else if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))) {
      payload[col] = token.slice(1, -1);
    } else if (token === 'NULL') {
      payload[col] = null;
    } else if (token !== '') {
      const num = Number(token);
      payload[col] = Number.isNaN(num) ? token : num;
    }
  });
  return { table, payload, orIgnore: /^\s*INSERT\s+OR\s+IGNORE/i.test(sql), onConflict };
}

async function runSupabase(sql, params = []) {
  const s = compact(sql);

  if (/^INSERT INTO merchant_transactions \(merchant_id, type, amount, description, waiter_name, created_at\) VALUES \(\?, 'order', \?, \?, \?, datetime\('now', 'localtime'\)\)$/i.test(s)) {
    return sbInsert('merchant_transactions', {
      merchant_id: params[0],
      type: 'order',
      amount: params[1],
      description: params[2],
      waiter_name: params[3],
      created_at: new Date().toISOString()
    });
  }

  if (/^INSERT INTO orders \(table_id, table_name, waiter_name, status, total_amount, created_at, updated_at\) VALUES \(\?, \?, \?, 'pending', \?, datetime\('now', 'localtime'\), datetime\('now', 'localtime'\)\)$/i.test(s)) {
    return sbInsert('orders', {
      table_id: params[0],
      table_name: params[1],
      waiter_name: params[2],
      status: 'pending',
      total_amount: params[3],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  if (/^INSERT INTO orders \(table_id, table_name, waiter_name, status, total_amount, created_at, updated_at\) VALUES \(\?, \?, \?, 'approved', \?, datetime\('now', 'localtime'\), datetime\('now', 'localtime'\)\)$/i.test(s)) {
    return sbInsert('orders', {
      table_id: params[0],
      table_name: params[1],
      waiter_name: params[2],
      status: 'approved',
      total_amount: params[3],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  if (/^INSERT INTO order_items \(order_id, product_id, product_name, quantity, unit_price, note, status\) VALUES \(\?, \?, \?, \?, \?, \?, 'pending'\)$/i.test(s)) {
    return sbInsert('order_items', {
      order_id: params[0],
      product_id: params[1],
      product_name: params[2],
      quantity: params[3],
      unit_price: params[4],
      note: params[5],
      status: 'pending'
    });
  }

  if (/^INSERT INTO order_items \(order_id, product_id, product_name, quantity, unit_price, note, status\) VALUES \(\?, \?, \?, \?, \?, \?, 'approved'\)$/i.test(s)) {
    return sbInsert('order_items', {
      order_id: params[0],
      product_id: params[1],
      product_name: params[2],
      quantity: params[3],
      unit_price: params[4],
      note: params[5],
      status: 'approved'
    });
  }

  if (/^INSERT INTO merchant_transactions \(merchant_id, type, amount, description, payment_type, waiter_name, created_at\) VALUES \(\?, 'payment', \?, \?, \?, \?, datetime\('now', 'localtime'\)\)$/i.test(s)) {
    return sbInsert('merchant_transactions', {
      merchant_id: params[0],
      type: 'payment',
      amount: params[1],
      description: params[2],
      payment_type: params[3],
      waiter_name: params[4],
      created_at: new Date().toISOString()
    });
  }

  if (s.startsWith('INSERT INTO merchant_product_prices ') && s.includes('ON CONFLICT(merchant_id, product_id)')) {
    const { error } = await supabase
      .from('merchant_product_prices')
      .upsert({
        merchant_id: params[0],
        product_id: params[1],
        custom_price: params[2],
        updated_at: new Date().toISOString()
      }, { onConflict: 'merchant_id,product_id' });
    throwIf(error, 'esnaf özel fiyatı kaydetme');
    return { lastID: 0, changes: 1 };
  }

  const insert = parseInsert(s, params);
  if (insert) {
    if (insert.onConflict) {
      const { error } = await supabase.from(insert.table).upsert(insert.payload, { onConflict: insert.onConflict });
      throwIf(error, `upsert ${insert.table}`);
      return { lastID: 0, changes: 1 };
    }
    if (insert.orIgnore) {
      const { error } = await supabase.from(insert.table).upsert(insert.payload, { onConflict: 'name', ignoreDuplicates: true });
      if (error && !String(error.message).toLowerCase().includes('duplicate')) throwIf(error, `upsert ${insert.table}`);
      return { lastID: 0, changes: 1 };
    }
    return sbInsert(insert.table, insert.payload);
  }

  if (/^DELETE FROM tables WHERE id = \?$/i.test(s)) {
    return sbDelete('tables', (q) => q.eq('id', params[0]));
  }
  if (/^DELETE FROM waiters WHERE id = \?$/i.test(s)) {
    return sbDelete('waiters', (q) => q.eq('id', params[0]));
  }
  if (/^DELETE FROM merchant_transactions WHERE merchant_id = \?$/i.test(s)) {
    return sbDelete('merchant_transactions', (q) => q.eq('merchant_id', params[0]));
  }
  if (/^DELETE FROM merchant_transactions WHERE id = \?$/i.test(s)) {
    return sbDelete('merchant_transactions', (q) => q.eq('id', params[0]));
  }
  if (/^DELETE FROM merchant_product_prices WHERE merchant_id = \?$/i.test(s)) {
    return sbDelete('merchant_product_prices', (q) => q.eq('merchant_id', params[0]));
  }
  if (/^DELETE FROM merchants WHERE id = \?$/i.test(s)) {
    return sbDelete('merchants', (q) => q.eq('id', params[0]));
  }

  if (s.includes("UPDATE products SET price = ?") && s.includes("Oralet")) {
    const newPrice = params[0];
    const { data: rows, error } = await supabase.from('products').select('id, name');
    throwIf(error, 'çay ürünleri');
    const ids = (rows || [])
      .filter((p) => p.id === 1 || p.name === 'Çay' || String(p.name).startsWith('Oralet') || ['Kuşburnu', 'Adaçayı', 'Ihlamur'].includes(p.name))
      .map((p) => p.id);
    if (!ids.length) return { lastID: 0, changes: 0 };
    const { error: upErr } = await supabase.from('products').update({ price: newPrice }).in('id', ids);
    throwIf(upErr, 'çay fiyatı');
    return { lastID: 0, changes: ids.length };
  }

  if (/^UPDATE products SET category_id/i.test(s)) {
    return sbUpdate('products', {
      category_id: params[0],
      name: params[1],
      price: params[2],
      quick_notes: params[3],
      is_active: params[4],
      special_price: params[5]
    }, (q) => q.eq('id', params[6]));
  }
  if (/^UPDATE products SET special_price = \? WHERE id = \?$/i.test(s)) {
    return sbUpdate('products', { special_price: params[0] }, (q) => q.eq('id', params[1]));
  }
  if (/^UPDATE products SET is_active = 0 WHERE id = \?$/i.test(s)) {
    return sbUpdate('products', { is_active: 0 }, (q) => q.eq('id', params[0]));
  }

  if (s.includes('UPDATE tables') && s.includes('SET name =')) {
    const payload = { name: params[0], custom_tea_price: params[2] };
    if (params[1] != null) payload.section = params[1];
    if (params[3] != null) payload.is_special = params[3];
    return sbUpdate('tables', payload, (q) => q.eq('id', params[4]));
  }
  if (/^UPDATE tables SET is_special = \?,\s*custom_tea_price = \? WHERE id IN/i.test(s)) {
    const ids = params.slice(2);
    return sbUpdate('tables', { is_special: params[0], custom_tea_price: params[1] }, (q) => q.in('id', ids));
  }
  if (/^UPDATE tables SET custom_tea_price = \?,\s*is_special = \? WHERE id IN/i.test(s)) {
    const ids = params.slice(2);
    return sbUpdate('tables', { custom_tea_price: params[0], is_special: params[1] }, (q) => q.in('id', ids));
  }
  if (/^UPDATE tables SET status = 'occupied' WHERE id = \?$/i.test(s)) {
    return sbUpdate('tables', { status: 'occupied' }, (q) => q.eq('id', params[0]));
  }
  if (/^UPDATE tables SET status = 'empty' WHERE id = \?$/i.test(s)) {
    return sbUpdate('tables', { status: 'empty' }, (q) => q.eq('id', params[0]));
  }

  if (s.includes('UPDATE orders SET table_name = ? WHERE table_id = ?')) {
    const { data, error } = await supabase.from('orders').select('id, status').eq('table_id', params[1]);
    throwIf(error, 'sipariş masa adı');
    const ids = (data || []).filter((o) => o.status !== 'completed' && o.status !== 'cancelled').map((o) => o.id);
    if (!ids.length) return { lastID: 0, changes: 0 };
    return sbUpdate('orders', { table_name: params[0] }, (q) => q.in('id', ids));
  }
  if (s.includes('UPDATE orders SET status = ?') && s.includes('updated_at')) {
    return sbUpdate('orders', { status: params[0], updated_at: new Date().toISOString() }, (q) => q.eq('id', params[1]));
  }
  if (s.includes('UPDATE orders SET charged_at =')) {
    return sbUpdate('orders', { charged_at: new Date().toISOString() }, (q) => q.eq('id', params[0]));
  }
  if (s.includes("UPDATE orders SET status = 'completed'")) {
    const { data, error } = await supabase.from('orders').select('id, status').eq('table_id', params[0]);
    throwIf(error, 'sipariş kapat');
    const ids = (data || []).filter((o) => o.status !== 'completed' && o.status !== 'cancelled').map((o) => o.id);
    if (!ids.length) return { lastID: 0, changes: 0 };
    return sbUpdate('orders', { status: 'completed', updated_at: new Date().toISOString() }, (q) => q.in('id', ids));
  }
  if (s.includes('UPDATE orders SET table_id = ?') && s.includes('table_name = ?')) {
    const { data, error } = await supabase.from('orders').select('id, status').eq('table_id', params[2]);
    throwIf(error, 'masa aktar');
    const ids = (data || []).filter((o) => o.status !== 'completed' && o.status !== 'cancelled').map((o) => o.id);
    if (!ids.length) return { lastID: 0, changes: 0 };
    return sbUpdate('orders', { table_id: params[0], table_name: params[1] }, (q) => q.in('id', ids));
  }
  if (/^UPDATE order_items SET status = \? WHERE order_id = \?$/i.test(s)) {
    return sbUpdate('order_items', { status: params[0] }, (q) => q.eq('order_id', params[1]));
  }

  if (/^UPDATE merchants SET name = \?/i.test(s)) {
    return sbUpdate('merchants', {
      name: params[0],
      shop_type: params[1],
      phone: params[2],
      notes: params[3]
    }, (q) => q.eq('id', params[4]));
  }
  if (/^UPDATE merchants SET balance = balance \+ \? WHERE id = \?$/i.test(s)) {
    const merchant = await getSupabase('SELECT * FROM merchants WHERE id = ?', [params[1]]);
    const next = Number(merchant.balance || 0) + Number(params[0]);
    return sbUpdate('merchants', { balance: next }, (q) => q.eq('id', params[1]));
  }
  if (/^UPDATE merchants SET balance = balance - \? WHERE id = \?$/i.test(s)) {
    const merchant = await getSupabase('SELECT * FROM merchants WHERE id = ?', [params[1]]);
    const next = Number(merchant.balance || 0) - Number(params[0]);
    return sbUpdate('merchants', { balance: next }, (q) => q.eq('id', params[1]));
  }
  if (/^UPDATE merchants SET balance = \? WHERE id = \?$/i.test(s)) {
    return sbUpdate('merchants', { balance: params[0] }, (q) => q.eq('id', params[1]));
  }

  throw new Error('Supabase için tanınmayan SQL (run): ' + s);
}

async function allSupabase(sql, params = []) {
  const s = compact(sql);

  if (s.includes('FROM tables t') && s.includes('current_total')) {
    const { data: tables, error } = await supabase.from('tables').select('*').order('id', { ascending: true });
    throwIf(error, 'masalar');
    const { data: orders, error: oErr } = await supabase.from('orders').select('table_id, total_amount, status');
    throwIf(oErr, 'masa siparişleri');
    const open = (orders || []).filter((o) => ['approved', 'preparing', 'ready'].includes(o.status));
    return coerceRows(tables).map((t) => {
      const related = open.filter((o) => Number(o.table_id) === Number(t.id));
      const pending = related.filter((o) => o.status === 'pending' || o.status === 'preparing');
      return {
        ...t,
        current_total: related.reduce((sum, o) => sum + Number(o.total_amount || 0), 0),
        pending_order_count: pending.length
      };
    }).sort((a, b) => String(a.section).localeCompare(String(b.section), 'tr') || a.id - b.id);
  }

  if (/^SELECT \* FROM categories ORDER BY sort_order ASC$/i.test(s)) {
    const { data, error } = await supabase.from('categories').select('*').order('sort_order', { ascending: true });
    throwIf(error, 'kategoriler');
    return coerceRows(data);
  }
  if (s.includes('FROM products WHERE is_active = 1') && s.includes('ORDER BY category_id')) {
    const { data, error } = await supabase.from('products').select('*').eq('is_active', 1);
    throwIf(error, 'ürünler');
    return coerceRows(data).sort((a, b) =>
      Number(a.category_id || 0) - Number(b.category_id || 0) ||
      (String(a.name).toLocaleLowerCase('tr') === 'çay' ? -1 : 0) -
      (String(b.name).toLocaleLowerCase('tr') === 'çay' ? -1 : 0) ||
      String(a.name).localeCompare(String(b.name), 'tr')
    );
  }
  if (s.includes('SELECT * FROM orders') && s.includes("status IN ('pending', 'preparing', 'ready', 'approved')")) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .in('status', ['pending', 'preparing', 'ready', 'approved']);
    throwIf(error, 'aktif siparişler');
    const rank = { pending: 1, preparing: 2, ready: 3, approved: 4 };
    return coerceRows(data).sort((a, b) => (rank[a.status] || 9) - (rank[b.status] || 9) || new Date(a.created_at) - new Date(b.created_at) || a.id - b.id);
  }
  if (/^SELECT \* FROM order_items WHERE order_id = \?$/i.test(s)) {
    const { data, error } = await supabase.from('order_items').select('*').eq('order_id', params[0]).order('id', { ascending: true });
    throwIf(error, 'sipariş kalemleri');
    return coerceRows(data);
  }
  if (s.includes('SELECT * FROM orders') && s.includes('table_id = ?') && (s.includes("status != 'completed'") || s.includes("status IN ('approved', 'preparing', 'ready')"))) {
    const { data, error } = await supabase.from('orders').select('*').eq('table_id', params[0]);
    throwIf(error, 'masa siparişleri');
    const rows = coerceRows(data).filter((o) => ['approved', 'preparing', 'ready'].includes(o.status));
    rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return rows;
  }
  if (s.includes('FROM payments') && s.includes('date(created_at)') && s.includes('LIMIT 20')) {
    const { start, end } = todayRangeIstanbul();
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false })
      .limit(20);
    throwIf(error, 'günlük ödemeler');
    return coerceRows(data);
  }
  if (s.includes('FROM order_items oi') && s.includes('GROUP BY oi.product_name')) {
    const { start, end } = todayRangeIstanbul();
    const { data: orders, error } = await supabase.from('orders').select('id, created_at, status');
    throwIf(error, 'rapor siparişler');
    const todayIds = (orders || [])
      .filter((o) => o.status !== 'cancelled' && o.created_at >= start && o.created_at <= end)
      .map((o) => o.id);
    if (!todayIds.length) return [];
    const { data: items, error: iErr } = await supabase.from('order_items').select('order_id, product_name, quantity, unit_price').in('order_id', todayIds);
    throwIf(iErr, 'rapor kalemler');
    const map = new Map();
    for (const it of items || []) {
      const cur = map.get(it.product_name) || { product_name: it.product_name, total_quantity: 0, total_income: 0 };
      cur.total_quantity += Number(it.quantity || 0);
      cur.total_income += Number(it.quantity || 0) * Number(it.unit_price || 0);
      map.set(it.product_name, cur);
    }
    return [...map.values()].sort((a, b) => b.total_quantity - a.total_quantity);
  }
  if (/^SELECT \* FROM waiters ORDER BY name ASC$/i.test(s)) {
    const { data, error } = await supabase.from('waiters').select('*').order('name', { ascending: true });
    throwIf(error, 'garsonlar');
    return coerceRows(data);
  }
  if (s.includes('FROM merchants m') && s.includes('tx_count')) {
    const { data: merchants, error } = await supabase.from('merchants').select('*');
    throwIf(error, 'esnaflar');
    const { data: txs, error: tErr } = await supabase.from('merchant_transactions').select('merchant_id, created_at');
    throwIf(tErr, 'çetele');
    return coerceRows(merchants).map((m) => {
      const related = (txs || []).filter((t) => Number(t.merchant_id) === Number(m.id));
      const last = related.reduce((max, t) => (!max || t.created_at > max ? t.created_at : max), null);
      return { ...m, tx_count: related.length, last_tx_time: last };
    }).sort((a, b) => Number(b.balance) - Number(a.balance) || String(a.name).localeCompare(String(b.name), 'tr'));
  }
  if (s.includes('FROM merchant_transactions') && s.includes('merchant_id = ?') && s.includes('LIMIT 100')) {
    const { data, error } = await supabase
      .from('merchant_transactions')
      .select('*')
      .eq('merchant_id', params[0])
      .order('created_at', { ascending: false })
      .limit(100);
    throwIf(error, 'esnaf hareketleri');
    return coerceRows(data);
  }
  if (s.includes('FROM merchant_product_prices WHERE merchant_id = ?') && s.includes('ORDER BY product_id ASC')) {
    const { data, error } = await supabase
      .from('merchant_product_prices')
      .select('*')
      .eq('merchant_id', params[0])
      .order('product_id', { ascending: true });
    throwIf(error, 'esnaf özel fiyatları');
    return coerceRows(data);
  }

  throw new Error('Supabase için tanınmayan SQL (all): ' + s);
}

async function getSupabase(sql, params = []) {
  const s = compact(sql);

  if (/^SELECT COUNT\(\*\) as count FROM waiters$/i.test(s)) {
    const { count, error } = await supabase.from('waiters').select('*', { count: 'exact', head: true });
    throwIf(error, 'garson sayısı');
    return { count: count || 0 };
  }
  if (/^SELECT COUNT\(\*\) as count FROM merchants$/i.test(s)) {
    const { count, error } = await supabase.from('merchants').select('*', { count: 'exact', head: true });
    throwIf(error, 'esnaf sayısı');
    return { count: count || 0 };
  }
  if (/^SELECT COUNT\(\*\) as count FROM categories$/i.test(s)) {
    const { count, error } = await supabase.from('categories').select('*', { count: 'exact', head: true });
    throwIf(error, 'kategori sayısı');
    return { count: count || 0 };
  }
  if (/^SELECT COUNT\(\*\) as count FROM tables$/i.test(s)) {
    const { count, error } = await supabase.from('tables').select('*', { count: 'exact', head: true });
    throwIf(error, 'masa sayısı');
    return { count: count || 0 };
  }
  if (/^SELECT COUNT\(\*\) as count FROM products$/i.test(s)) {
    const { count, error } = await supabase.from('products').select('*', { count: 'exact', head: true });
    throwIf(error, 'ürün sayısı');
    return { count: count || 0 };
  }
  if (/^SELECT id FROM categories WHERE name = \?$/i.test(s) || /^SELECT id FROM categories WHERE name = '/i.test(s)) {
    const name = params[0] || (s.match(/name = '([^']+)'/) || [])[1];
    const { data, error } = await supabase.from('categories').select('id').eq('name', name).maybeSingle();
    throwIf(error, 'kategori id');
    return coerceRow(data);
  }

  if (/^SELECT \* FROM tables WHERE id = \?$/i.test(s)) {
    const { data, error } = await supabase.from('tables').select('*').eq('id', params[0]).maybeSingle();
    throwIf(error, 'masa');
    return coerceRow(data);
  }
  if (/^SELECT \* FROM orders WHERE id = \?$/i.test(s)) {
    const { data, error } = await supabase.from('orders').select('*').eq('id', params[0]).maybeSingle();
    throwIf(error, 'sipariş');
    return coerceRow(data);
  }
  if (s.includes('SELECT custom_price FROM merchant_product_prices') && s.includes('merchant_id = ?') && s.includes('product_id = ?')) {
    const { data, error } = await supabase
      .from('merchant_product_prices')
      .select('custom_price')
      .eq('merchant_id', params[0])
      .eq('product_id', params[1])
      .maybeSingle();
    throwIf(error, 'esnaf özel ürün fiyatı');
    return coerceRow(data);
  }
  if (/^SELECT \* FROM waiters WHERE id = \?$/i.test(s)) {
    const { data, error } = await supabase.from('waiters').select('*').eq('id', params[0]).maybeSingle();
    throwIf(error, 'garson');
    return coerceRow(data);
  }
  if (/^SELECT \* FROM waiters WHERE LOWER\(name\) = LOWER\(\?\)$/i.test(s)) {
    const { data, error } = await supabase.from('waiters').select('*').ilike('name', params[0]).maybeSingle();
    throwIf(error, 'garson adı');
    return coerceRow(data);
  }
  if (/^SELECT \* FROM merchants WHERE id = \?$/i.test(s)) {
    const { data, error } = await supabase.from('merchants').select('*').eq('id', params[0]).maybeSingle();
    throwIf(error, 'esnaf');
    return coerceRow(data);
  }
  if (/^SELECT \* FROM merchants WHERE name = \?$/i.test(s)) {
    const { data, error } = await supabase.from('merchants').select('*').eq('name', params[0]).maybeSingle();
    throwIf(error, 'esnaf adı');
    return coerceRow(data);
  }
  if (s.includes('FROM merchant_transactions') && s.includes('id = ?') && s.includes('merchant_id = ?') && s.includes("type = 'order'")) {
    const { data, error } = await supabase
      .from('merchant_transactions')
      .select('*')
      .eq('id', params[0])
      .eq('merchant_id', params[1])
      .eq('type', 'order')
      .maybeSingle();
    throwIf(error, 'esnaf sipariş hareketi');
    return coerceRow(data);
  }
  if (s.includes("SELECT COUNT(*) as count FROM orders WHERE table_id = ?") && (s.includes("status != 'completed'") || s.includes("status IN ('approved', 'preparing', 'ready')"))) {
    const { data, error } = await supabase.from('orders').select('id, status').eq('table_id', params[0]);
    throwIf(error, 'açık sipariş sayısı');
    const count = (data || []).filter((o) => ['approved', 'preparing', 'ready'].includes(o.status)).length;
    return { count };
  }
  if (s.includes('FROM payments') && s.includes("date(created_at) = date('now'")) {
    const { start, end } = todayRangeIstanbul();
    const { data, error } = await supabase.from('payments').select('amount, payment_type').gte('created_at', start).lte('created_at', end);
    throwIf(error, 'günlük ciro');
    const rows = data || [];
    const sum = (type) => rows.filter((r) => r.payment_type === type).reduce((a, r) => a + Number(r.amount || 0), 0);
    return {
      total: rows.reduce((a, r) => a + Number(r.amount || 0), 0),
      nakit: sum('nakit'),
      kart: sum('kart'),
      veresiye: sum('veresiye'),
      transaction_count: rows.length
    };
  }
  if (s.includes('COALESCE(SUM(balance), 0) as total_debt')) {
    const { data, error } = await supabase.from('merchants').select('balance');
    throwIf(error, 'esnaf özet');
    const rows = data || [];
    return {
      total_debt: rows.reduce((a, r) => a + Number(r.balance || 0), 0),
      merchant_count: rows.length
    };
  }
  if (s.includes("FROM merchant_transactions") && s.includes("type = 'order'") && s.includes('date(created_at)')) {
    const { start, end } = todayRangeIstanbul();
    const { data, error } = await supabase.from('merchant_transactions').select('amount, type, created_at').eq('type', 'order').gte('created_at', start).lte('created_at', end);
    throwIf(error, 'bugünkü çetele');
    return {
      today_orders_amount: (data || []).reduce((a, r) => a + Number(r.amount || 0), 0),
      count: (data || []).length
    };
  }
  if (s.includes("FROM merchant_transactions") && s.includes("type = 'payment'") && s.includes('date(created_at)')) {
    const { start, end } = todayRangeIstanbul();
    const { data, error } = await supabase.from('merchant_transactions').select('amount, type, created_at').eq('type', 'payment').gte('created_at', start).lte('created_at', end);
    throwIf(error, 'bugünkü tahsilat');
    return {
      today_collected_amount: (data || []).reduce((a, r) => a + Number(r.amount || 0), 0),
      count: (data || []).length
    };
  }
  if (s.includes('SUM(CASE WHEN type = \'order\'') && s.includes('FROM merchant_transactions') && s.includes('merchant_id = ?')) {
    const { data, error } = await supabase
      .from('merchant_transactions')
      .select('type, amount')
      .eq('merchant_id', params[0]);
    throwIf(error, 'esnaf bakiye hesaplama');
    const balance = (data || []).reduce((total, row) => {
      const amount = Number(row.amount || 0);
      return total + (row.type === 'order' ? amount : -amount);
    }, 0);
    return { balance };
  }

  throw new Error('Supabase için tanınmayan SQL (get): ' + s);
}

async function pingSupabase() {
  const { error } = await supabase.from('products').select('id').limit(1);
  throwIf(error, 'bağlantı testi');
}

module.exports = {
  runSupabase,
  allSupabase,
  getSupabase,
  pingSupabase,
  coerceRow
};
