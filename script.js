(() => {
    'use strict';

    const CART = 'duoCart', WISH = 'duoWishlist', PAGE = 12, MAX_QTY = 10;
    const checkout = location.pathname.endsWith('/checkout.html');
    const get = id => document.getElementById(id);
    const money = n => `${Number(n).toLocaleString('ru-RU')} сум`;
    const sum = items => items.reduce((value, item) => value + item.price * item.qty, 0);
    const url = id => 'product.html?id=' + encodeURIComponent(id);
    const node = (tag, cls, value) => {
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        if (value != null) el.textContent = value;
        return el;
    };
    function icon(id) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const use = document.createElementNS(svg.namespaceURI, 'use');
        svg.setAttribute('class', 'icon');
        svg.setAttribute('aria-hidden', 'true');
        use.setAttribute('href', '#' + id);
        svg.append(use);
        return svg;
    }
    function read(key) {
        try { const a = JSON.parse(localStorage.getItem(key)); return Array.isArray(a) ? a : []; }
        catch { return []; }
    }
    function save(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
    }
    const keyFor = (id, size) => JSON.stringify([id, size]);
    function normalizeItem(row) {
        if (!row || typeof row.id !== 'string' || !row.id.trim() || typeof row.name !== 'string' || row.price == null) return null;
        const price = Number(row.price), qty = Number(row.qty);
        if (!Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(qty) || qty < 1) return null;
        const size = typeof row.size === 'string' ? row.size.trim().slice(0, 32) : '';
        return {key: keyFor(row.id, size), id: row.id, name: row.name, price, qty: Math.min(qty, MAX_QTY), image: row.image, size};
    }
    const readCart = () => read(CART).map(normalizeItem).filter(Boolean);
    const readWish = () => new Set([...read(WISH), ...read('duWishlist')].filter(id => typeof id === 'string'));
    let cart = readCart();
    let wish = readWish();
    if (save(WISH, [...wish])) { try { localStorage.removeItem('duWishlist'); } catch {} }
    const local = window.DUO_LOCAL_PRODUCTS || [];
    let products = local;
    let source = 'local';
    let cartLocked = false;
    const initialView = new URLSearchParams(location.search).get('view');
    let filter = ['new', 'wish'].includes(initialView) ? initialView : 'all';
    let query = '', limit = PAGE;
    let cartDialog, nav, menu, toastTimer;

    function productImage(path, name, cls) {
        const img = node('img', cls);
        img.alt = name;
        img.loading = 'lazy';
        setImage(img, path);
        return img;
    }
    function setImage(img, path) {
        const fallback = 'images/product-placeholder.svg';
        const safe = typeof path === 'string' && (/^images\/(?!\/)/.test(path) || /^https:\/\//i.test(path));
        img.addEventListener('error', () => { img.src = fallback; }, {once: true});
        img.src = safe ? path : fallback;
    }
    function sizesFor(product) {
        if (Array.isArray(product?.sizes)) {
            return [...new Set(product.sizes.map(size => String(size).trim()).filter(Boolean))];
        }
        if (!product?.meta) return [];
        const clothing = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL'];
        const values = String(product.meta).toUpperCase().replace(/[–—]/g, '-').replace(/\s*-\s*/g, '-').split(/[\s,;/]+/);
        const sizes = values.flatMap(part => {
            const [a, b, extra] = part.replace(/\bXXL\b/g, '2XL').replace(/\bXXXL\b/g, '3XL').split('-');
            if (!extra && clothing.includes(a) && (!b || clothing.indexOf(b) >= clothing.indexOf(a))) {
                return b ? clothing.slice(clothing.indexOf(a), clothing.indexOf(b) + 1) : [a];
            }
            if (product.cat === 'Обувь' && !extra && /^\d{2}$/.test(a) && (!b || /^\d{2}$/.test(b))) {
                const start = Number(a), end = Number(b || a);
                if (start >= 20 && end <= 55 && end >= start) return Array.from({length: end - start + 1}, (_, i) => String(start + i));
            }
            return [];
        });
        return [...new Set(sizes)];
    }
    function notify(message) {
        let toast = get('toast');
        if (!toast) {
            toast = node('div', 'toast');
            toast.id = 'toast';
            document.body.append(toast);
        }
        toast.setAttribute('role', 'status');
        (get('toastText') || toast).textContent = message;
        toast.classList.add('is-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2800);
    }
    function cartChanged(focusKey, focusAction) {
        if (!save(CART, cart)) notify('Корзину не удалось сохранить в этом браузере.');
        paintCart(focusKey, focusAction);
        document.dispatchEvent(new Event('duo:cart'));
    }
    function add(product, size = '') {
        if (cartLocked || !product || product.in_stock === false) return false;
        const sizes = sizesFor(product);
        if (sizes.length && !sizes.includes(size)) return false;
        const key = keyFor(product.id, size);
        const item = cart.find(i => i.key === key);
        if (!item && cart.length >= 50) { notify('В одном заказе может быть до 50 позиций'); return false; }
        if (cart.filter(i => i.id === product.id).reduce((n, i) => n + i.qty, 0) >= MAX_QTY) {
            notify('Можно заказать до 10 единиц одного товара'); return false;
        }
        if (item) Object.assign(item, {qty: item.qty + 1, price: product.price, name: product.name, image: product.image});
        else cart.push(normalizeItem({...product, size, qty: 1}));
        cartChanged();
        return true;
    }
    function wishButton(button, id) {
        const active = wish.has(id);
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
        button.setAttribute('aria-label', active ? 'Убрать из избранного' : 'Добавить в избранное');
    }
    function paintWish() {
        if (get('wishBadge')) {
            get('wishBadge').textContent = wish.size;
            get('wishBadge').hidden = !wish.size;
        }
        const trigger = get('wishlistBtn');
        if (trigger) trigger.setAttribute('aria-label', `Избранное: ${wish.size}`);
        document.querySelectorAll('[data-wish-id]').forEach(btn => wishButton(btn, btn.dataset.wishId));
    }
    function toggleWish(id) {
        if (wish.has(id)) wish.delete(id); else wish.add(id);
        const saved = save(WISH, [...wish]);
        if (filter === 'wish') paintCatalog();
        paintWish();
        notify(saved ? (wish.has(id) ? 'Добавлено в избранное' : 'Удалено из избранного') : 'Избранное не удалось сохранить в этом браузере.');
    }

    function makeCard(product) {
        const item = node('article', 'product-card');
        const link = node('a', 'product-card-link');
        link.href = url(product.id);
        const media = node('div', 'product-media has-photo');
        media.append(productImage(product.image, '', 'product-photo'));
        if (product.badge === 'new' || product.badge === 'hit') media.append(node('span', 'product-badge', product.badge === 'new' ? 'Новинка' : 'Хит'));
        const body = node('div', 'product-body');
        body.append(node('span', 'product-cat', product.cat), node('h3', 'product-name', product.name), node('span', 'product-meta', product.meta));
        const foot = node('div', 'product-foot');
        const price = node('div', 'price');
        price.append(node('strong', '', money(product.price)));
        foot.append(price);
        link.append(media, body, foot);
        const sizes = sizesFor(product);
        const choose = sizes.length > 1 || product.in_stock === false;
        const action = node(choose ? 'a' : 'button', 'add-btn', choose ? (product.in_stock === false ? 'Подробнее' : 'Выбрать размер') : 'В корзину');
        if (choose) action.href = url(product.id);
        else {
            action.type = 'button';
            action.addEventListener('click', () => {
                if (add(product, sizes[0])) {
                    notify(`${product.name} — в корзине`);
                    action.textContent = 'Добавлено ✓';
                    action.classList.add('is-added');
                    clearTimeout(action.feedbackTimer);
                    action.feedbackTimer = setTimeout(() => { action.textContent = 'В корзину'; action.classList.remove('is-added'); }, 1400);
                }
            });
        }
        const fav = node('button', 'wish-btn');
        fav.type = 'button';
        fav.dataset.wishId = product.id;
        fav.append(icon('i-heart'));
        wishButton(fav, product.id);
        fav.addEventListener('click', () => {
            const wasFocused = document.activeElement === fav;
            toggleWish(product.id);
            if (wasFocused && !fav.isConnected) (document.querySelector('#productGrid .wish-btn') || get('resetFilters'))?.focus();
        });
        item.append(link, action, fav);
        return item;
    }

    function setFilter(value, scroll = false) {
        filter = value;
        limit = PAGE;
        paintCatalog();
        if (scroll) {
            get('catalog').scrollIntoView();
            get('catalogHeading')?.focus({preventScroll: true});
        }
    }
    function paintFilters() {
        const group = get('catalogFilters');
        if (!group) return;
        const cats = [...new Set(products.map(p => p.cat).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
        const values = [['all', 'Все'], ['new', 'Новинки'], ...cats.map(cat => [cat, cat]), ['wish', 'Избранное']];
        if (!values.some(([value]) => value === filter)) filter = 'all';
        group.replaceChildren(...values.map(([value, name]) => {
            const button = node('button', 'chip', name);
            button.type = 'button';
            button.dataset.filter = value;
            button.addEventListener('click', () => setFilter(value));
            return button;
        }));
    }
    function paintCatalog(paging = false) {
        const grid = get('productGrid');
        if (!grid) return;
        const filtered = products.filter(p => {
            const matches = filter === 'all' || (filter === 'wish' ? wish.has(p.id) : filter === 'new' ? p.badge === 'new' : p.cat === filter);
            return matches && `${p.name} ${p.cat}`.toLocaleLowerCase('ru').includes(query);
        });
        const cards = filtered.slice(paging ? grid.childElementCount : 0, limit).map(makeCard);
        if (paging) grid.append(...cards); else grid.replaceChildren(...cards);
        const shown = Math.min(limit, filtered.length);
        get('resultCount').textContent = filtered.length > shown ? `Показано ${shown} из ${filtered.length}` : `Найдено: ${filtered.length}`;
        get('catalogMore').hidden = shown >= filtered.length;
        get('catalogEmpty').hidden = filtered.length > 0;
        get('catalogEmptyTitle').textContent = filter === 'wish' && !query ? 'В избранном пока пусто' : 'Ничего не нашлось';
        get('catalogEmptyText').textContent = filter === 'wish' && !query ? 'Нажмите на сердце на карточке, чтобы сохранить товар.' : 'Попробуйте изменить запрос или выбрать другую категорию.';
        get('resetFilters').textContent = filter === 'wish' && !query ? 'Показать все товары' : 'Сбросить фильтры';
        get('catalogFilters').querySelectorAll('button').forEach(btn => {
            const active = btn.dataset.filter === filter;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', String(active));
        });
        if (paging) cards[0]?.querySelector('a').focus();
    }
    function setupCatalog() {
        const search = get('searchInput');
        if (!search) return;
        const clear = get('searchClear');
        function resetSearch() { search.value = ''; query = ''; clear.hidden = true; }
        search.addEventListener('input', () => {
            query = search.value.trim().toLocaleLowerCase('ru');
            clear.hidden = !search.value;
            limit = PAGE;
            paintCatalog();
        });
        clear.addEventListener('click', () => { resetSearch(); limit = PAGE; paintCatalog(); search.focus(); });
        get('searchToggle')?.addEventListener('click', () => { get('catalog').scrollIntoView(); search.focus({preventScroll: true}); });
        get('resetFilters').addEventListener('click', () => { resetSearch(); setFilter('all'); get('catalogFilters').querySelector('button').focus(); });
        get('loadMore').addEventListener('click', () => { limit += PAGE; paintCatalog(true); });
        document.querySelectorAll('a[href="#catalog"]:not(.js-wish-link):not(.js-cart-link)').forEach(link => link.addEventListener('click', () => { resetSearch(); setFilter('all'); }));
        paintFilters();
        paintCatalog();
    }

    function actionButton(cls, label, text) {
        const btn = node('button', cls, text);
        btn.type = 'button';
        if (label) btn.setAttribute('aria-label', label);
        return btn;
    }
    function setupCart() {
        if (!get('cartOpen') && !checkout) return;
        cartDialog = node('dialog', 'store-cart');
        cartDialog.id = 'cartDrawer';
        cartDialog.setAttribute('aria-labelledby', 'cartTitle');
        cartDialog.innerHTML = `<div class="store-cart-layout">
            <header class="drawer-head"><h2 id="cartTitle">Корзина <span id="cartCountLabel">0</span></h2>
                <button class="icon-btn" type="button" id="cartClose" aria-label="Закрыть корзину" autofocus>×</button></header>
            <div class="drawer-body" id="cartItems"></div>
            <footer class="drawer-foot" id="cartFoot" hidden>
                <div class="cart-line cart-line--total"><span>Сумма товаров</span><strong id="cartTotal">0 сум</strong></div>
                <p class="drawer-note">Стоимость доставки подтвердит менеджер.</p>
                ${checkout ? '<button type="button" class="btn btn-primary btn-full" id="checkoutOpen">Вернуться к оформлению</button>' : '<a class="btn btn-primary btn-full" href="checkout.html" id="checkoutOpen">Оформить заказ</a>'}
            </footer></div>`;
        document.body.append(cartDialog);
        cartDialog.addEventListener('close', () => {
            document.body.classList.remove('cart-open');
            get('cartOpen')?.setAttribute('aria-expanded', 'false');
        });
        cartDialog.addEventListener('click', event => { if (event.target === cartDialog) cartDialog.close(); });
        get('cartClose').addEventListener('click', () => cartDialog.close());
        if (checkout) get('checkoutOpen').addEventListener('click', () => cartDialog.close());
        const trigger = get('cartOpen');
        trigger?.setAttribute('aria-haspopup', 'dialog');
        trigger?.setAttribute('aria-controls', cartDialog.id);
        trigger?.setAttribute('aria-expanded', 'false');
        trigger?.addEventListener('click', openCart);
        get('editCart')?.addEventListener('click', openCart);
        document.querySelectorAll('.js-cart-link').forEach(a => a.addEventListener('click', event => { event.preventDefault(); openCart(); }));
        paintCart();
    }
    function openCart() {
        if (!cartDialog || cartDialog.open || cartLocked) return;
        setMenu(false);
        cartDialog.showModal();
        get('cartOpen')?.setAttribute('aria-expanded', 'true');
        document.body.classList.add('cart-open');
    }
    function paintCart(focusKey, focusAction) {
        if (!cartDialog) return;
        const count = cart.reduce((n, item) => n + item.qty, 0);
        if (get('cartBadge')) get('cartBadge').textContent = count;
        get('cartOpen')?.setAttribute('aria-label', `Корзина: ${count}`);
        get('cartCountLabel').textContent = count;
        get('cartTotal').textContent = money(sum(cart));
        get('cartFoot').hidden = !cart.length;
        const items = get('cartItems');
        const oldScroll = items.scrollTop;
        const rows = cart.map(item => {
            const row = node('div', 'cart-item');
            const thumb = node('a', 'cart-thumb has-photo');
            thumb.href = url(item.id);
            thumb.setAttribute('aria-label', item.name);
            thumb.append(productImage(item.image, '', 'cart-photo'));
            const info = node('div', 'cart-info');
            info.append(node('h3', 'cart-name', item.name));
            if (item.size) info.append(node('p', 'cart-size', 'Размер: ' + item.size));
            info.append(node('p', 'cart-price', money(item.price * item.qty)));
            const stepper = node('div', 'cart-qty');
            const less = actionButton('qty-btn', 'Уменьшить количество: ' + item.name, '−');
            less.disabled = item.qty <= 1;
            const more = actionButton('qty-btn', 'Увеличить количество: ' + item.name, '+');
            more.disabled = cart.filter(i => i.id === item.id).reduce((n, i) => n + i.qty, 0) >= MAX_QTY;
            const remove = actionButton('cart-remove', 'Удалить ' + item.name, '×');
            for (const [btn, action] of [[less, 'less'], [more, 'more'], [remove, 'remove']]) {
                btn.dataset.cartAction = action;
                btn.addEventListener('click', () => {
                    if (cartLocked) return;
                    if (action === 'remove') cart = cart.filter(i => i !== item);
                    else item.qty += action === 'less' ? -1 : 1;
                    cartChanged(item.key, action);
                });
            }
            stepper.append(less, node('span', '', item.qty), more);
            info.append(stepper);
            row.append(thumb, info, remove);
            row.dataset.cartKey = item.key;
            return row;
        });
        if (!rows.length) {
            const empty = node('div', 'cart-empty');
            const link = node('a', 'btn btn-primary', 'Перейти в каталог');
            link.href = 'index.html#catalog';
            empty.append(node('h3', '', 'Корзина пока пуста'), node('p', '', 'Выберите что-нибудь в каталоге.'), link);
            rows.push(empty);
        }
        items.replaceChildren(...rows);
        items.scrollTop = oldScroll;
        if (focusKey) {
            const target = rows.find(row => row.dataset.cartKey === focusKey);
            (target?.querySelector(`[data-cart-action="${focusAction}"]:not([disabled])`) || target?.querySelector('.qty-btn:not([disabled])') || items.querySelector('.cart-remove, .cart-empty a') || get('cartClose')).focus({preventScroll: true});
        }
    }
    function setMenu(open) {
        if (!menu || !nav) return;
        nav.classList.toggle('is-open', open);
        menu.setAttribute('aria-expanded', String(open));
        menu.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    }
    function setupMenu() {
        nav = get('nav'); menu = get('burger');
        if (!nav || !menu) return;
        menu.addEventListener('click', () => {
            const open = menu.getAttribute('aria-expanded') !== 'true';
            setMenu(open);
            if (open) nav.querySelector('a')?.focus();
        });
        nav.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
        document.addEventListener('click', event => { if (!nav.contains(event.target) && !menu.contains(event.target)) setMenu(false); });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { setMenu(false); menu.focus(); }
        });
        matchMedia('(max-width: 1050px)').addEventListener('change', () => setMenu(false));
    }
    function setup() {
        setupMenu();
        setupCart();
        setupCatalog();
        paintWish();
        const showWish = event => {
            event.preventDefault();
            if (get('productGrid')) {
                if (get('searchInput').value) get('searchClear').click();
                setFilter('wish', true);
            } else location.href = 'index.html?view=wish#catalog';
        };
        get('wishlistBtn')?.addEventListener('click', showWish);
        document.querySelectorAll('.js-wish-link').forEach(a => a.addEventListener('click', showWish));
        const toTop = get('toTop');
        if (toTop) {
            const update = () => toTop.classList.toggle('is-visible', window.scrollY > 520);
            window.addEventListener('scroll', update, {passive: true});
            toTop.addEventListener('click', () => window.scrollTo({top: 0}));
            update();
        }
        window.addEventListener('storage', event => {
            if (event.key === CART || event.key === null) { cart = readCart(); paintCart(); document.dispatchEvent(new Event('duo:cart')); }
            if (event.key === WISH || event.key === null) { wish = readWish(); paintWish(); if (filter === 'wish') paintCatalog(); }
        });
    }

    const fetchCatalog = (() => {
        let pending;
        return () => pending ??= (async () => {
            if (!window.waitForSupabase) return products;
            try {
                const client = await window.waitForSupabase(3500);
                const {data, error} = await client.from('products').select('*').eq('is_active', true).order('id').abortSignal(AbortSignal.timeout(5500));
                if (error || !Array.isArray(data)) return products;
                const byId = new Map(local.map(p => [p.id, p]));
                products = data.filter(p => p.id != null && p.price != null && Number.isSafeInteger(Number(p.price)) && Number(p.price) >= 0).map(p => ({
                    id: String(p.id), name: String(p.name || 'Товар'), price: Number(p.price), cat: p.cat || p.category || 'Одежда',
                    description: String(p.description || ''), meta: p.meta || (Array.isArray(p.sizes) ? p.sizes.join(', ') : p.sizes) || '',
                    sizes: p.sizes, image: p.image_url || p.image || byId.get(String(p.id))?.image,
                    badge: p.badge, in_stock: p.in_stock !== false
                }));
                source = 'live';
                return products;
            } catch { return products; }
        })();
    })();

    window.DuoStore = {
        get products() { return products; }, get source() { return source; },
        getCart: () => cart.map(item => ({...item})),
        clearPurchased(snapshot) {
            const purchased = new Map(snapshot.map(item => [item.key, item.qty]));
            cart = cart.map(item => ({...item, qty: item.qty - (purchased.get(item.key) || 0)})).filter(item => item.qty > 0);
            cartChanged();
        },
        lockCart: locked => { cartLocked = locked; },
        fetchCatalog, money, sum, url, node, setImage, productImage, sizesFor, makeCard, add, openCart, toggleWish, wishButton, notify
    };
    function ready() {
        setup();
        if (get('productGrid')) fetchCatalog().then(() => { if (source === 'live') { paintFilters(); paintCatalog(); } });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
