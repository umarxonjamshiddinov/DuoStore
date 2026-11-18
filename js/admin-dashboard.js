/**
 * DUO STORE — Admin Dashboard Module
 * Dashboard статистики и расширенные функции
 */

(function() {
    'use strict';
    
    // ============================================================================
    // СОСТОЯНИЕ DASHBOARD
    // ============================================================================
    
    let dashboardStats = {
        products: { total: 0, active: 0 },
        orders: { total: 0, new: 0, processing: 0, paid: 0 },
        revenue: { total: 0, confirmed: 0 },
        lowStock: []
    };
    
    let isLoading = false;
    
    // ============================================================================
    // ЗАГРУЗКА СТАТИСТИКИ
    // ============================================================================
    
    async function loadDashboardStats() {
        if (isLoading) return;
        isLoading = true;
        
        showSkeletonLoading(true);
        
        try {
            if (!window.supabase) {
                console.warn('[Dashboard] Supabase не готов');
                return;
            }
            
            // Загружаем данные параллельно
            await Promise.all([
                loadProductsStats(),
                loadOrdersStats()
            ]);
            
            // Обновляем UI
            renderDashboardStats();
            renderRecentOrders();
            renderLowStockProducts();
            
        } catch (error) {
            console.error('[Dashboard] Ошибка загрузки:', error);
            if (typeof window.adminToast === 'function') {
                window.adminToast('Ошибка загрузки статистики', 'error');
            }
        } finally {
            isLoading = false;
            showSkeletonLoading(false);
        }
    }

    async function loadProductsStats() {
        try {
            const { data, error } = await window.supabase
                .from('products')
                .select('id, name, price, is_active, stock, image_url')
                .order('id');
            
            if (error) throw error;
            
            const products = data || [];
            
            dashboardStats.products.total = products.length;
            dashboardStats.products.active = products.filter(p => p.is_active !== false).length;
            
            // Товары с низкими остатками
            dashboardStats.lowStock = products
                .filter(p => p.is_active !== false && (!p.stock || p.stock < 5))
                .slice(0, 5);
            
            return products;
            
        } catch (error) {
            console.error('[Dashboard] Ошибка загрузки товаров:', error);
            return [];
        }
    }
    
    async function loadOrdersStats() {
        try {
            // КРИТИЧЕСКИ ВАЖНО: Проверяем AAL2 перед запросом к orders
            const { data: aal, error: aalError } = await window.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            
            if (aalError || aal?.currentLevel !== 'aal2') {
                console.warn('[Dashboard] AAL2 не подтверждён, заказы не загружаются');
                // Показываем 0 заказов если нет AAL2
                dashboardStats.orders.total = 0;
                dashboardStats.orders.new = 0;
                dashboardStats.orders.processing = 0;
                dashboardStats.orders.paid = 0;
                dashboardStats.revenue.total = 0;
                dashboardStats.revenue.confirmed = 0;
                return [];
            }
            
            const { data, error } = await window.supabase
                .from('orders')
                .select('id, total, status, created_at')
                .order('created_at', { ascending: false });
            
            if (error) {
                console.error('[Dashboard] Ошибка загрузки заказов:', error);
                // Не выбрасываем ошибку, чтобы не ломать весь dashboard
                return [];
            }
            
            const orders = data || [];
            
            dashboardStats.orders.total = orders.length;
            dashboardStats.orders.new = orders.filter(o => o.status === 'new').length;
            dashboardStats.orders.processing = orders.filter(o => o.status === 'processing').length;
            dashboardStats.orders.paid = orders.filter(o => o.status === 'paid' || o.status === 'confirmed').length;
            
            // Выручка
            dashboardStats.revenue.total = orders
                .filter(o => o.status !== 'cancelled')
                .reduce((sum, o) => sum + (o.total || 0), 0);
            
            dashboardStats.revenue.confirmed = orders
                .filter(o => ['paid', 'confirmed', 'shipped', 'delivered'].includes(o.status))
                .reduce((sum, o) => sum + (o.total || 0), 0);
            
            return orders;
            
        } catch (error) {
            console.error('[Dashboard] Ошибка загрузки заказов:', error);
            return [];
        }
    }
    
    // ============================================================================
    // РЕНДЕР UI
    // ============================================================================
    
    function renderDashboardStats() {
        updateStatCard('statProductsTotal', dashboardStats.products.total);
        updateStatCard('statProductsActive', dashboardStats.products.active);
        updateStatCard('statOrdersTotal', dashboardStats.orders.total);
        updateStatCard('statOrdersNew', dashboardStats.orders.new);
        updateStatCard('statRevenueTotal', formatPrice(dashboardStats.revenue.total));
    }
    
    function updateStatCard(elementId, value) {
        const el = document.getElementById(elementId);
        if (el) {
            el.textContent = value;
            el.classList.remove('skeleton');
        }
    }
    
    function renderRecentOrders() {
        const container = document.getElementById('recentOrdersBody');
        if (!container) return;
        
        if (window.adminOrders && typeof window.adminOrders.getOrders === 'function') {
            const orders = window.adminOrders.getOrders().slice(0, 5);
            
            if (orders.length === 0) {
                container.innerHTML = '<tr><td colspan="5" class="empty-cell">Нет заказов</td></tr>';
                return;
            }
            
            let html = '';
            orders.forEach(order => {
                // Экранируем все данные для безопасности
                const safeId = escapeHtml(order.id);
                const safeName = escapeHtml(order.customer_name || '-');
                const safeTotal = formatPrice(order.total || 0);
                const safeStatus = escapeHtml(getStatusText(order.status));
                const safeStatusClass = escapeHtml(order.status);
                
                html += `<tr>
                    <td><strong>${safeId}</strong></td>
                    <td>${safeName}</td>
                    <td>${safeTotal}</td>
                    <td><span class="status-badge status-${safeStatusClass}">${safeStatus}</span></td>
                    <td><button class="action-btn" data-order-id="${safeId}" onclick="window.adminOrders.viewOrder(this.dataset.orderId)">👁</button></td>
                </tr>`;
            });
            container.innerHTML = html;
        }
    }
    
    function renderLowStockProducts() {
        const container = document.getElementById('lowStockList');
        if (!container) return;
        
        if (dashboardStats.lowStock.length === 0) {
            container.innerHTML = '<p class="empty-message">Нет товаров с низкими остатками</p>';
            return;
        }
        
        let html = '';
        dashboardStats.lowStock.forEach(product => {
            html += `<div class="low-stock-item">
                <img src="${product.image_url || ''}" alt="${escapeHtml(product.name)}" class="low-stock-image">
                <div class="low-stock-info">
                    <div class="low-stock-name">${escapeHtml(product.name)}</div>
                    <div class="low-stock-sku">${product.id}</div>
                </div>
                <span class="low-stock-count">${product.stock || 0} шт</span>
            </div>`;
        });
        container.innerHTML = html;
    }
    
    function showSkeletonLoading(show) {
        const spinner = document.getElementById('dashboardSpinner');
        if (spinner) spinner.style.display = show ? 'flex' : 'none';
    }
    
    function formatPrice(price) {
        return Number(price || 0).toLocaleString('ru-RU') + ' сум';
    }
    
    function getStatusText(status) {
        const statuses = {
            'new': 'Новый', 'processing': 'В обработке', 'confirmed': 'Подтверждён',
            'paid': 'Оплачен', 'shipped': 'Отправлен', 'delivered': 'Доставлен', 'cancelled': 'Отменён'
        };
        return statuses[status] || status;
    }
    
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // ============================================================================
    // ЭКСПОРТ
    // ============================================================================
    
    window.adminDashboard = {
        init: loadDashboardStats,
        reload: loadDashboardStats,
        getStats: () => dashboardStats
    };
    
})();