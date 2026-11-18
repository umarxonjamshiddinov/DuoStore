(() => {
    'use strict';

    const store = window.DuoStore;
    const get = id => document.getElementById(id);
    const id = new URLSearchParams(location.search).get('id');
    const picker = get('sizeSelector');
    const addButton = get('addToCartBtn');
    const wish = get('addToWishBtn');
    let product, size = '', feedback;

    function render(item) {
        if (!item) {
            product = null;
            get('productLayout').hidden = true;
            get('productRelated').hidden = true;
            get('productError').hidden = false;
            return;
        }

        if (product !== item) {
            const oldSize = size;
            product = item;
            document.title = item.name + ' — DUO STORE';
            const photo = get('productImage');
            photo.alt = item.name;
            store.setImage(photo, item.image);
            get('productName').textContent = item.name;
            get('productCat').textContent = item.cat;
            get('productMeta').textContent = item.meta || '';
            get('productMeta').hidden = !item.meta;
            get('productPrice').textContent = store.money(item.price);
            get('breadcrumbName').textContent = item.name;
            get('productDescription').textContent = item.description || '';
            get('productDescription').hidden = !item.description;
            get('productBadge').hidden = !['new', 'hit'].includes(item.badge);
            get('productBadge').textContent = item.badge === 'new' ? 'Новинка' : 'Хит';
            wish.dataset.wishId = item.id;
            store.wishButton(wish, item.id);

            const sizes = store.sizesFor(item);
            size = sizes.includes(oldSize) ? oldSize : sizes.length === 1 ? sizes[0] : '';
            get('sizePrompt').textContent = sizes.length ? 'Выберите размер' : 'Наличие нужного размера подтвердит менеджер.';
            picker.hidden = !sizes.length;
            picker.replaceChildren(...sizes.map(value => {
                const button = store.node('button', 'size-btn', value);
                button.type = 'button';
                button.dataset.size = value;
                button.addEventListener('click', () => {
                    size = value;
                    get('sizeError').hidden = true;
                    paintSize();
                });
                return button;
            }));
            get('sizeError').hidden = true;
            addButton.disabled = item.in_stock === false;
            get('addToCartText').textContent = addButton.disabled ? 'Нет в наличии' : 'В корзину';
            get('productLayout').hidden = false;
            get('productError').hidden = true;
            paintSize();
        }

        const related = store.products.filter(p => p.id !== id);
        const matches = related.filter(p => p.cat === item.cat);
        const extras = related.filter(p => p.cat !== item.cat);
        get('relatedProducts').replaceChildren(...[...matches, ...extras].slice(0, 4).map(store.makeCard));
        get('productRelated').hidden = !related.length;
    }

    function paintSize() {
        for (const btn of picker.children) {
            const selected = btn.dataset.size === size;
            btn.classList.toggle('is-active', selected);
            btn.setAttribute('aria-pressed', String(selected));
        }
    }

    addButton.addEventListener('click', () => {
        if (!product) return;
        if (picker.children.length && !size) {
            get('sizeError').hidden = false;
            picker.firstElementChild.focus();
            return;
        }
        if (!store.add(product, size)) return;
        get('addToCartText').textContent = 'Добавлено ✓';
        addButton.classList.add('is-added');
        clearTimeout(feedback);
        feedback = setTimeout(() => { get('addToCartText').textContent = 'В корзину'; addButton.classList.remove('is-added'); }, 1500);
        store.openCart();
    });
    wish.addEventListener('click', () => { if (product) store.toggleWish(product.id); });

    const find = () => store.products.find(p => p.id === id);
    const initial = find();
    if (initial || !id) render(initial);
    if (id) store.fetchCatalog().then(() => { get('productLoading').hidden = true; render(find()); });
    get('productLoading').hidden = !!initial || !id;
})();
