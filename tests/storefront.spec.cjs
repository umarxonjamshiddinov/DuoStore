const {test} = require('node:test');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

const base = process.env.DUO_TEST_URL || 'http://127.0.0.1:8000';
const product = {id:'p7',name:'Nike Dunk Low',cat:'Обувь',meta:'35–44',price:309000,is_active:true,image:'images/photos/photo_16@12-06-2026_00-40-14.jpg'};

function mockSdk() {
    window.supabase = {
        createClient(_url, _key, {auth}) {
            if (auth.persistSession || auth.detectSessionInUrl || auth.autoRefreshToken) {
                throw new Error('Storefront must use a guest client');
            }
            return {
                from(table) {
                    const q = {};
                    for (const method of ['select','in','eq','order']) q[method] = () => q;
                    q.insert = data => { q.payload = data; return q; };
                    q.abortSignal = async signal => {
                        const response = await fetch('/__duo_fixture/' + table, {
                            method: q.payload ? 'POST' : 'GET', signal,
                            headers:{'Content-Type':'application/json'},
                            body:q.payload && JSON.stringify(q.payload)
                        });
                        return response.json();
                    };
                    return q;
                }
            };
        }
    };
}

async function setup(t, options = {}) {
    const browser = await chromium.launch({executablePath:process.env.DUO_CHROME, headless:true});
    t.after(() => browser.close());
    const context = await browser.newContext();
    const requests = [];
    await context.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
    if (!options.offline) {
        await context.route('https://cdn.jsdelivr.net/npm/@supabase/**', route => route.fulfill({
            contentType:'application/javascript', body:'(' + mockSdk.toString() + ')();'
        }));
        await context.route('**/__duo_fixture/**', async route => {
            if (route.request().url().endsWith('/products')) return route.fulfill({json:{data:[product],error:null}});
            requests.push(route.request().postDataJSON());
            const error = options.fail || (options.failFirst && requests.length === 1) ? {code:'NETWORK_ERROR'} : null;
            await route.fulfill({json:{error}});
        });
    }
    const page = await context.newPage();
    const faults = [];
    page.on('pageerror', error => faults.push(String(error)));
    t.after(() => {assert.deepEqual(faults, []);});
    return {page, requests};
}

async function addSample(page, price = 299000) {
    await page.addInitScript(({product, price}) => {
        if (sessionStorage.getItem('fixture-started')) return;
        sessionStorage.setItem('fixture-started','1');
        localStorage.setItem('duoCart', JSON.stringify([{...product,price,qty:2,size:'42'}]));
    }, {product,price});
    await page.goto(base + '/checkout.html');
}

async function fill(page) {
    for (const [id, value] of Object.entries({
        customerName:'Тестовый клиент', customerPhone:'90 000 00 00',
        customerCity:'Ташкент', customerAddress:'Тестовый адрес 1'
    })) await page.locator('#' + id).fill(value);
}

test('offline catalog, size selection, favorites and cart survive navigation and reload', async t => {
    const {page} = await setup(t, {offline:true});
    await page.goto(base + '/');
    assert.equal(await page.locator('.hero-copy').evaluate(el => getComputedStyle(el).opacity), '1');
    await page.locator('#productGrid .product-card').first().waitFor();
    assert.equal(await page.locator('#productGrid .product-card').count(), 12);
    await page.locator('#loadMore').click();
    assert.equal(await page.locator('#productGrid .product-card').count(), 24);
    await page.locator('#searchInput').fill('неизвестный товар');
    await page.locator('#catalogEmpty').waitFor();
    await page.locator('#resetFilters').click();
    await page.locator('#searchInput').fill('Nike Dunk Low');
    const nike = page.locator('#productGrid .product-card').filter({hasText:'299'}).first();
    await nike.locator('.wish-btn').click();
    await page.reload();
    await page.locator('#wishlistBtn').click();
    assert.equal(await page.locator('#productGrid .product-card').count(), 1);
    await page.locator('#productGrid .add-btn').click();
    await page.locator('#addToCartBtn').click();
    await page.locator('#sizeError').waitFor();
    await page.locator('[data-size="42"]').click();
    await page.locator('#addToCartBtn').click();
    await page.locator('#cartDrawer[open]').waitFor();
    await page.locator('[data-cart-action="more"]').click();
    assert.match(await page.locator('#cartTotal').innerText(), /598\s000/);
    await page.keyboard.press('Escape');
    await page.locator('#cartDrawer[open]').waitFor({state:'hidden'});
    await page.goto(base + '/delivery.html');
    await page.reload();
    await page.locator('#cartOpen').click();
    assert.match(await page.locator('#cartTotal').innerText(), /598\s000/);
    await page.locator('#checkoutOpen').click();
    await page.locator('#checkoutGrid').waitFor();
    await page.locator('#editCart').click();
    await page.locator('[data-cart-action="less"]').click();
    await page.locator('#checkoutOpen').click();
    assert.match(await page.locator('#checkoutSubtotal').innerText(), /299\s000/);
});

test('changed price requires consent, successful order clears cart and links to tracking', async t => {
    const {page, requests} = await setup(t);
    await addSample(page);
    await page.locator('#submitOrderBtn').click();
    assert.equal(await page.locator('#customerName').getAttribute('aria-invalid'), 'true');
    await fill(page);
    assert.equal(await page.locator('#checkoutShipping').innerText(), 'Бесплатно');
    await page.locator('#submitOrderBtn').click();
    await page.locator('#orderError').waitFor();
    assert.match(await page.locator('#orderError').innerText(), /Цена изменилась/);
    assert.equal(requests.length, 0);
    assert.match(await page.locator('#checkoutSubtotal').innerText(), /618\s000/);
    await page.locator('#submitOrderBtn').click();
    await page.locator('#checkoutSuccess').waitFor();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].total, 618000);
    assert.equal(requests[0].items[0].size, '42');
    assert.equal(requests[0].customer_phone, '+998900000000');
    assert.equal(Object.hasOwn(requests[0], 'user_id'), false);
    const number = await page.locator('#orderNumber').innerText();
    assert.match(number, /^ORD-[A-Z0-9]{6,10}-[A-F0-9]{4}$/);
    await page.locator('#trackingLink').click();
    await page.waitForLoadState('domcontentloaded');
    assert.equal(await page.locator('#orderNumber').inputValue(), number);
    await page.goto(base + '/checkout.html');
    await page.locator('#checkoutEmpty').waitFor();
});

test('uncertain response keeps basket and retry reuses order number', async t => {
    const {page, requests} = await setup(t, {failFirst:true});
    await addSample(page, 309000);
    await fill(page);
    await page.locator('#submitOrderBtn').click();
    await page.locator('#orderError').waitFor();
    assert.match(await page.locator('#orderError').innerText(), /Проверьте статус/);
    assert.match(await page.locator('#checkoutSubtotal').innerText(), /618\s000/);
    assert.equal(await page.locator('#checkoutSuccess').isVisible(), false);
    await page.locator('#submitOrderBtn').click();
    await page.locator('#checkoutSuccess').waitFor();
    assert.equal(requests.length, 2);
    assert.equal(requests[0].id, requests[1].id);
});

test('offline checkout gives a Telegram draft without form data and keeps the cart', async t => {
    const {page, requests} = await setup(t, {offline:true});
    await addSample(page);
    await fill(page);
    await page.locator('#submitOrderBtn').click();
    await page.locator('#orderError').waitFor();
    assert.match(await page.locator('#orderError').innerText(), /Telegram/);
    await page.locator('.order-telegram > summary').press('Space');
    await page.locator('#telegramDraft').waitFor();
    const draft = await page.locator('#telegramDraft').inputValue();
    assert.match(draft, /Nike Dunk Low.*42.*598\s000/);
    assert.doesNotMatch(draft, /Тестовый адрес|Тестовый клиент|90 000/);
    assert.equal(requests.length, 0);
    assert.equal(await page.locator('#checkoutSuccess').isVisible(), false);
    await page.reload();
    await page.locator('#checkoutGrid').waitFor();
});
