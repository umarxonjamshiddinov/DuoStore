/**
 * DUO STORE — Admin Orders Management
 * Управление заказами с поиском и фильтрацией
 */
(function() {
    'use strict';
    
    // ============================================================================
    // СОСТОЯНИЕ
    // ============================================================================
    
    let orders = [];
    let currentOrdersFilter = 'all';
    let searchQuery = '';
    let selectedOrder = null;
    let isLoadingOrders = false;
    
    // ============================================================================
    // API ФУНКЦИИ
    // ============================================================================
    
    /**
     * Проверка AAL2 сессии администратора
     * @returns {Promise<{valid: boolean, error?: string}>}
     */
    async function checkAAL2Session() {
        try {
            if (!window.supabase) {
                return { valid: false, error: 'Supabase не инициализирован' };
            }
            
            const { data: aal, error: aalError } = await window.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            
            if (aalError) {
                console.error('[Orders] Ошибка проверки AAL:', aalError);
                return { valid: false, error: 'Ошибка проверки сессии' };
            }
            
            if (aal?.currentLevel !== 'aal2') {
                console.warn('[Orders] AAL уровень:', aal?.currentLevel, '| Требуется: aal2');
                return { valid: false, error: 'Требуется MFA-авторизация. Введите код аутентификатора.' };
            }
            
            return { valid: true };
        } catch (e) {
            console.error('[Orders] Исключение при проверке AAL:', e);
            return { valid: false, error: 'Ошибка проверки прав доступа' };
        }
    }
    
    /**
     * Загрузка заказов из Supabase
     */
    async function loadOrders() {
        // Защита от параллельных вызовов
        if (isLoadingOrders) {
            console.log('[Orders] Загрузка уже выполняется');
            return [];
        }
        isLoadingOrders = true;
        
        try {
            if (!window.supabase) {
                console.warn('[Orders] Supabase не готов');
                showErrorState('Система не инициализирована. Обновите страницу.');
                return [];
            }
            
            // КРИТИЧЕСКИ ВАЖНО: Проверяем AAL2 перед запросом к orders
            const aalCheck = await checkAAL2Session();
            if (!aalCheck.valid) {
                console.warn('[Orders] AAL2 проверка не пройдена:', aalCheck.error);
                showErrorState(aalCheck.error);
                return [];
            }
            
            console.log('[Orders] Загрузка заказов с AAL2 сессией...');
            
            const { data, error } = await window.supabase
                .from('orders')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) {
                console.error('[Orders] Ошибка загрузки:', error);
                // Показываем детальную ошибку пользователю
                let errorMessage = 'Ошибка загрузки заказов';
                
                if (error.code === 'PGRST301' || error.message?.includes('policy')) {
                    errorMessage = 'Нет прав доступа к заказам. Убедитесь что MFA активировано.';
                } else if (error.code === '42501') {
                    errorMessage = 'Недостаточно прав для чтения заказов.';
                } else if (error.message) {
                    errorMessage = `Ошибка: ${error.message}`;
                }
                
                showErrorState(errorMessage);
                
                // Уведомление через toast если доступен
                if (typeof window.adminToast === 'function') {
                    window.adminToast(errorMessage, 'error');
                }
                
                return [];
            }
            
            orders = data || [];
            console.log('[Orders] Загружено заказов:', orders.length);
            
            // Скрываем состояние ошибки если есть
            hideErrorState();
            
            // Обновляем badge с количеством новых заказов
            updateOrdersBadge();
            updateOrdersCount();
            
            return orders;
        } catch (e) {
            console.error('[Orders] Исключение:', e);
            showErrorState('Произошла ошибка при загрузке заказов');
            return [];
        } finally {
            isLoadingOrders = false;
        }
    }
    
    /**
     * Обновление статуса заказа
     */
    async function updateOrderStatus(orderId, newStatus) {
        try {
            // Проверяем AAL2 перед обновлением
            const aalCheck = await checkAAL2Session();
            if (!aalCheck.valid) {
                console.warn('[Orders] Невозможно обновить заказ без AAL2');
                if (typeof window.adminToast === 'function') {
                    window.adminToast(aalCheck.error, 'error');
                }
                return false;
            }
            
            const { error } = await window.supabase
                .from('orders')
                .update({ status: newStatus })
                .eq('id', orderId);
            
            if (error) {
                console.error('[Orders] Ошибка обновления:', error);
                if (typeof window.adminToast === 'function') {
                    window.adminToast('Ошибка обновления статуса: ' + error.message, 'error');
                }
                return false;
            }
            return true;
        } catch (e) {
            console.error('[Orders] Исключение при обновлении:', e);
            return false;
        }
    }
    
    /**
     * Получение текстового представления статуса
     */
    function getStatusText(status) {
        const statuses = {
            'new': 'Новый',
            'processing': 'В обработке',
            'confirmed': 'Подтверждён',
            'shipped': 'Отправлен',
            'delivered': 'Доставлен',
            'cancelled': 'Отменён'
        };
        return statuses[status] || status;
    }
    
    function getStatusClass(status) {
        const classes = {
            'new': 'status-new',
            'processing': 'status-processing',
            'confirmed': 'status-confirmed',
            'shipped': 'status-shipped',
            'delivered': 'status-delivered',
            'cancelled': 'status-cancelled'
        };
        return classes[status] || '';
    }
    
    /**
     * Показать состояние ошибки в контейнере заказов
     */
    function showErrorState(message) {
        const container = document.getElementById('ordersContainer');
        if (!container) return;
        
        container.innerHTML = `
            <div class="orders-error-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p class="error-message">${escapeHtml(message)}</p>
                <button class="btn btn-primary btn-sm" onclick="window.adminOrders.loadOrders()">
                    Повторить
                </button>
            </div>
        `;
    }
    
    /**
     * Скрыть состояние ошибки (вызывается при успешной загрузке)
     */
    function hideErrorState() {
        // Error state заменяется при следующем renderOrders()
    }
    
    // ============================================================================
    // РЕНДЕР
    // ============================================================================
    
    function renderOrders() {
        const container = document.getElementById('ordersContainer');
        if (!container) return;
        
        // Фильтруем по статусу и поиску
        let filtered = orders;
        
        if (currentOrdersFilter !== 'all') {
            filtered = filtered.filter(o => o.status === currentOrdersFilter);
        }
        
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            filtered = filtered.filter(o => 
                o.id?.toLowerCase().includes(query) ||
                o.customer_name?.toLowerCase().includes(query) ||
                o.customer_phone?.includes(query)
            );
        }
        
        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="orders-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
                        <rect x="9" y="3" width="6" height="4" rx="1"/>
                    </svg>
                    <p>${searchQuery ? 'Заказы не найдены' : 'Нет заказов'}</p>
                </div>
            `;
            return;
        }
        
        let html = '<div class="orders-list">';
        
        filtered.forEach(order => {
            const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
            const itemsCount = items ? items.length : 0;
            const date = new Date(order.created_at || order.createdAt).toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            html += `
                <div class="order-card" data-order-id="${order.id}">
                    <div class="order-header">
                        <div class="order-info">
                            <span class="order-id">#${order.id}</span>
                            <span class="order-date">${date}</span>
                        </div>
                        <span class="order-status ${getStatusClass(order.status)}">${getStatusText(order.status)}</span>
                    </div>
                    <div class="order-body">
                        <div class="order-customer">
                            <strong>${escapeHtml(order.customer_name || order.customer?.name || 'Клиент')}</strong>
                            <a href="tel:${order.customer_phone || order.customer?.phone || ''}">${order.customer_phone || order.customer?.phone || ''}</a>
                        </div>
                        <div class="order-details">
                            <span>${itemsCount} ${pluralize(itemsCount, 'товар', 'товара', 'товаров')}</span>
                            <strong>${formatPrice(order.total || 0)}</strong>
                        </div>
                    </div>
                    <div class="order-actions">
                        <button class="btn btn-sm btn-ghost" onclick="window.adminOrders.viewOrder('${order.id}')">
                            Подробнее
                        </button>
                        <select class="status-select" onchange="window.adminOrders.changeStatus('${order.id}', this.value)">
                            <option value="new" ${order.status === 'new' ? 'selected' : ''}>Новый</option>
                            <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>В обработке</option>
                            <option value="confirmed" ${order.status === 'confirmed' ? 'selected' : ''}>Подтверждён</option>
                            <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>Отправлен</option>
                            <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Доставлен</option>
                            <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Отменён</option>
                        </select>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
    }
    
    // ============================================================================
    // ДЕТАЛИ ЗАКАЗА
    // ============================================================================
    
    async function viewOrder(orderId) {
        const order = orders.find(o => o.id === orderId);
        if (!order) return;
        
        selectedOrder = order;
        
        const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
        const customer = order.customer || {
            name: order.customer_name,
            phone: order.customer_phone,
            city: order.customer_city,
            address: order.customer_address,
            comment: order.customer_comment
        };
        
        let itemsHtml = '';
        if (items && items.length > 0) {
            items.forEach(item => {
                itemsHtml += `
                    <div class="order-item">
                        <img src="${item.image || ''}" alt="${escapeHtml(item.name)}" class="order-item-image" onerror="this.style.display='none'">
                        <div class="order-item-info">
                            <span class="order-item-name">${escapeHtml(item.name)}</span>
                            <span class="order-item-meta">${item.size || ''} × ${item.qty || 1}</span>
                        </div>
                        <span class="order-item-price">${formatPrice(item.price * (item.qty || 1))}</span>
                    </div>
                `;
            });
        }
        
        const modal = document.getElementById('orderModal');
        const body = document.getElementById('orderModalBody');
        
        if (modal && body) {
            body.innerHTML = `
                <div class="order-detail">
                    <div class="order-detail-header">
                        <div>
                            <h3>Заказ #${order.id}</h3>
                            <span class="order-status ${getStatusClass(order.status)}">${getStatusText(order.status)}</span>
                        </div>
                        <span class="order-date">${new Date(order.created_at || order.createdAt).toLocaleString('ru-RU')}</span>
                    </div>
                    
                    <div class="order-section">
                        <h4>Покупатель</h4>
                        <p><strong>${escapeHtml(customer.name || '')}</strong></p>
                        <p><a href="tel:${customer.phone || ''}">${customer.phone || ''}</a></p>
                        ${customer.city ? `<p>${escapeHtml(customer.city)}</p>` : ''}
                        ${customer.address ? `<p>${escapeHtml(customer.address)}</p>` : ''}
                    </div>
                    
                    <div class="order-section">
                        <h4>Товары</h4>
                        <div class="order-items-list">${itemsHtml || '<p>Нет товаров</p>'}</div>
                    </div>
                    
                    <div class="order-total">
                        <span>Итого:</span>
                        <strong>${formatPrice(order.total || 0)}</strong>
                    </div>
                    
                    ${customer.comment ? `
                        <div class="order-section">
                            <h4>Комментарий</h4>
                            <p>${escapeHtml(customer.comment)}</p>
                        </div>
                    ` : ''}
                </div>
            `;
            
            modal.classList.add('is-visible');
        }
    }
    
    async function changeStatus(orderId, newStatus) {
        const success = await updateOrderStatus(orderId, newStatus);
        if (success) {
            const order = orders.find(o => o.id === orderId);
            if (order) order.status = newStatus;
            renderOrders();
            updateOrdersBadge(); // Обновляем badge при изменении статуса
            updateOrdersCount(); // Обновляем счётчик при изменении статуса
            if (typeof window.adminToast === 'function') {
                window.adminToast('Статус заказа обновлён', 'success');
            }
        }
    }
    
    function setFilter(filter) {
        currentOrdersFilter = filter;
        renderOrders();
        
        document.querySelectorAll('.orders-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
    }
    
    function setSearch(query) {
        searchQuery = query;
        renderOrders();
    }
    
    // ============================================================================
    // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // ============================================================================
    
    function formatPrice(price) {
        return Number(price || 0).toLocaleString('ru-RU') + ' сум';
    }
    
    function pluralize(n, one, few, many) {
        if (n % 10 === 1 && n % 100 !== 11) return one;
        if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return few;
        return many;
    }
    
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Обновить счётчик заказов рядом с заголовком
     */
    function updateOrdersCount() {
        const countEl = document.getElementById('ordersCount');
        if (!countEl) return;
        
        const total = orders.length;
        const text = pluralize(total, 'заказ', 'заказа', 'заказов');
        countEl.textContent = `${total} ${text}`;
    }
    
    /**
     * Обновить badge на кнопке "Заказы" с количеством новых заказов
     */
    function updateOrdersBadge() {
        const ordersBtn = document.querySelector('.admin-nav-btn[data-tab="orders"]');
        if (!ordersBtn) return;
        
        const newOrdersCount = orders.filter(o => o.status === 'new').length;
        
        // Удаляем существующий badge
        const existingBadge = ordersBtn.querySelector('.orders-badge');
        if (existingBadge) {
            existingBadge.remove();
        }
        
        // Добавляем новый badge если есть новые заказы
        if (newOrdersCount > 0) {
            const badge = document.createElement('span');
            badge.className = 'orders-badge';
            badge.textContent = newOrdersCount > 99 ? '99+' : newOrdersCount;
            ordersBtn.appendChild(badge);
        }
    }
    
    // ============================================================================
    // ЭКСПОРТ
    // ============================================================================
    
    window.adminOrders = {
        init: async function() {
            await loadOrders();
            renderOrders();
            updateOrdersBadge();
            updateOrdersCount();
        },
        loadOrders,
        renderOrders,
        viewOrder,
        changeStatus,
        setFilter,
        setSearch,
        getOrders: () => orders,
        updateBadge: updateOrdersBadge
    };
    
})();
