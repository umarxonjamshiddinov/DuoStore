(() => {
    'use strict';

    const store = window.DuoStore;
    const get = id => document.getElementById(id);
    const form = get('checkoutForm');
    const submit = get('submitOrderBtn');
    const error = get('orderError');
    const telegram = get('telegramDraft');
    const telegramOpen = get('telegramOpen');
    const limit = 12_000;
    let busy = false, completed = false, attempt = null, latest = null;

    function shipping(city, total) {
        const isTashkent = /^(ташкент|tashkent|toshkent)$/i.test(city.trim());
        return isTashkent && total >= 500000 ? 'Бесплатно' : 'Уточнит менеджер';
    }

    function draftText(cart) {
        return [
            'Здравствуйте! Хочу оформить заказ в DUO STORE:',
            ...cart.map(item => '• ' + item.name + ' (' + item.id + ')' + (item.size ? ', размер ' + item.size : '') + ' × ' + item.qty + ' — ' + store.money(item.price * item.qty)),
            'Товары: ' + store.money(store.sum(cart)),
            'Подскажите, пожалуйста, наличие, условия доставки и оплаты.'
        ].join('\n');
    }

    function render() {
        const cart = store.getCart();
        const priced = latest && latest.key === JSON.stringify(cart) ? latest.items : cart;
        const subtotal = store.sum(priced);
        get('checkoutEmpty').hidden = cart.length > 0 || completed;
        get('checkoutGrid').hidden = !cart.length || completed;
        get('checkoutItems').replaceChildren(...priced.map(item => {
            const row = store.node('div', 'order-summary-item');
            const link = store.node('a', 'order-line-name', item.name);
            link.href = store.url(item.id);
            const details = store.node('div', 'order-summary-label');
            details.append(link, store.node('small', '', [item.size && 'Размер ' + item.size, item.qty + ' шт.'].filter(Boolean).join(' · ')));
            row.append(store.productImage(item.image, '', 'order-line-photo'), details, store.node('strong', '', store.money(item.price * item.qty)));
            return row;
        }));
        get('checkoutSubtotal').textContent = store.money(subtotal);
        get('checkoutShipping').textContent = shipping(get('customerCity').value, subtotal);
        const draft = draftText(priced);
        const href = 'https://t.me/rusto69?text=' + encodeURIComponent(draft);
        telegram.value = draft;
        // Avoid very long URLs; the customer can copy the draft from the same panel.
        telegramOpen.href = href.length <= 3500 ? href : 'https://t.me/rusto69';
        get('telegramDraftHint').textContent = href.length <= 3500
            ? 'Проверьте черновик и нажмите «Отправить» уже в Telegram.'
            : 'Скопируйте черновик и вставьте его в чат магазина в Telegram.';
    }

    function setStatus(text) {
        error.hidden = !text;
        error.textContent = text || '';
        if (text) error.focus();
    }

    function normalizePhone(value) {
        const digits = value.replace(/\D/g, '');
        const normalized = digits.length === 9 ? '998' + digits : digits;
        return /^998(?:33|50|55|7[1-9]|88|9[013-5789])\d{7}$/.test(normalized) ? '+' + normalized : '';
    }

    function validate() {
        const specs = [
            ['customerName', 'Введите имя (не менее 2 символов).', value => value.length >= 2, 'customer_name'],
            ['customerPhone', 'Введите номер Узбекистана: +998 и 9 цифр.', value => !!normalizePhone(value), 'customer_phone'],
            ['customerCity', 'Введите название города.', value => value.length >= 2, 'customer_city'],
            ['customerAddress', 'Введите адрес доставки (не менее 5 символов).', value => value.length >= 5, 'customer_address']
        ];
        const data = {};
        for (const [id, message, valid, field] of specs) {
            const el = get(id);
            const value = el.value.trim();
            el.setCustomValidity(valid(value) ? '' : message);
            el.setAttribute('aria-invalid', String(!valid(value)));
            data[field] = field === 'customer_phone' ? normalizePhone(value) : value;
        }
        if (!form.reportValidity()) return null;
        data.customer_comment = get('customerComment').value.trim() || null;
        return data;
    }

    async function verifyPrices(client, cart) {
        const ids = [...new Set(cart.map(item => item.id))];
        const {data, error: loadError} = await client.from('products').select('*').in('id', ids).eq('is_active', true).abortSignal(AbortSignal.timeout(7000));
        if (loadError || !Array.isArray(data)) throw new Error('Не удалось проверить цены и наличие. Попробуйте позже или оформите заявку в Telegram.');
        const catalog = new Map(data.map(item => [String(item.id), item]));
        return cart.map(item => {
            const row = catalog.get(item.id);
            const price = Number(row?.price);
            const meta = row?.meta || row?.sizes;
            const sizes = store.sizesFor({meta, sizes: row?.sizes, cat: row?.cat || row?.category});
            if (!row || row.in_stock === false || (sizes.length && !sizes.includes(item.size))) {
                throw new Error('Товар или размер больше недоступен: ' + item.name + '. Измените корзину перед оформлением.');
            }
            if (row.price == null || !Number.isSafeInteger(price) || price < 0) throw new Error('Не удалось проверить стоимость товара. Попробуйте позже.');
            return {...item, price, name: String(row.name || item.name), image: row.image_url || row.image || item.image};
        });
    }

    function orderNumber() {
        const token = crypto.getRandomValues(new Uint16Array(1))[0].toString(16).padStart(4, '0').toUpperCase();
        return 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + token;
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || completed) return;
        setStatus('');
        const checkoutData = validate();
        const cart = store.getCart();
        if (!checkoutData || !cart.length) return;
        const qtyPerProduct = new Map();
        for (const item of cart) qtyPerProduct.set(item.id, (qtyPerProduct.get(item.id) || 0) + item.qty);
        if (cart.length > 50 || [...qtyPerProduct.values()].some(qty => qty > 10)) {
            setStatus('В заказе может быть до 50 позиций и до 10 единиц одного товара. Измените корзину.');
            return;
        }

        busy = true;
        store.lockCart(true);
        get('editCart').disabled = true;
        submit.disabled = true;
        form.setAttribute('aria-busy', 'true');
        submit.textContent = 'Проверяем корзину…';
        let errorText = '';
        let didSave = false;
        let writeStarted = false;
        try {
            let client;
            try { client = await window.waitForSupabase(4000); }
            catch { throw new Error('Онлайн-оформление недоступно. Можно отправить черновик заказа через Telegram.'); }
            const priced = await verifyPrices(client, cart);
            const key = JSON.stringify(cart);
            if (JSON.stringify(store.getCart()) !== key) throw new Error('Корзина изменилась. Проверьте состав заказа и попробуйте ещё раз.');
            const known = latest?.key === key ? latest.items : cart;
            if (priced.some((item, i) => item.price !== known[i].price)) {
                latest = {key, items: priced};
                render();
                throw new Error('Цена изменилась. Проверьте новую сумму и подтвердите заказ ещё раз.');
            }

            const items = priced.map(({id, name, qty, price, size, image}) => ({id, name, qty, price, size: size || null, image: image || ''}));
            const payload = {...checkoutData, items, total: store.sum(priced), status: 'new'};
            const signature = JSON.stringify(payload);
            if (attempt?.signature !== signature) attempt = {signature, id: orderNumber()};
            const id = attempt.id;
            submit.textContent = 'Отправляем заказ…';
            writeStarted = true;
            const {error: writeError} = await client.from('orders').insert({id, ...payload}).abortSignal(AbortSignal.timeout(limit));
            if (writeError) {
                if (writeError.code === '23505') throw new Error('Этот номер заказа уже существует: ' + id + '. Проверьте статус заказа по номеру и телефону перед повторной отправкой.');
                throw new Error('Не удалось подтвердить сохранение заказа (' + id + '). Проверьте статус перед повтором или свяжитесь с магазином.');
            }
            completed = true;
            didSave = true;
            store.clearPurchased(cart);
            form.reset();
            get('orderNumber').textContent = id;
            get('trackingLink').href = 'tracking.html?order=' + encodeURIComponent(id);
            get('checkoutSuccess').hidden = false;
            render();
            get('receiptTitle').focus();
        } catch (failure) {
            errorText = failure instanceof Error ? failure.message : 'Не удалось оформить заказ. Попробуйте ещё раз.';
            if (writeStarted && attempt && !errorText.includes(attempt.id)) {
                errorText = 'Не удалось подтвердить сохранение заказа (' + attempt.id + '). Проверьте статус перед повтором или свяжитесь с магазином.';
            }
            if (writeStarted && attempt) {
                const link = get('checkAttempt');
                link.hidden = false;
                link.href = 'tracking.html?order=' + encodeURIComponent(attempt.id);
            }
        } finally {
            busy = false;
            store.lockCart(false);
            get('editCart').disabled = false;
            submit.disabled = didSave;
            submit.textContent = 'Подтвердить заказ';
            form.removeAttribute('aria-busy');
            if (errorText) setStatus(errorText);
        }
    });
    form.addEventListener('input', event => {
        event.target.setCustomValidity?.('');
        event.target.removeAttribute?.('aria-invalid');
        if (event.target.id === 'customerCity') render();
    });
    get('copyDraft').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(telegram.value);
            get('copyDraftStatus').textContent = 'Черновик скопирован.';
        } catch {
            telegram.focus();
            telegram.select();
            get('copyDraftStatus').textContent = 'Текст выделен. Скопируйте его вручную.';
        }
    });
    document.addEventListener('duo:cart', render);
    render();
})();
