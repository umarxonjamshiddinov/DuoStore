/**
 * DUO STORE — Admin Tab Navigation Module
 * Handles tab switching and dashboard initialization
 */

(function() {
    'use strict';
    
    // Wait for DOM ready
    function initTabNavigation() {
        const navBtns = document.querySelectorAll('.admin-nav-btn');
        
        navBtns.forEach(btn => {
            btn.addEventListener('click', function(e) {
                handleTabClick(this);
            });
        });
        
        console.log('[TabNav] Navigation initialized');
    }
    
    function handleTabClick(btn) {
        const tab = btn.dataset.tab;
        if (!tab) return;
        
        // Update active button
        document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Get panels
        const dashboardPanel = document.getElementById('dashboardPanel');
        const productsPanel = document.getElementById('productsPanel');
        const ordersPanel = document.getElementById('ordersPanel');
        
        // Hide all panels
        if (dashboardPanel) dashboardPanel.hidden = true;
        if (productsPanel) productsPanel.hidden = true;
        if (ordersPanel) ordersPanel.hidden = true;
        
        // Show selected panel
        if (tab === 'dashboard') {
            if (dashboardPanel) {
                dashboardPanel.hidden = false;
            }
            // Load dashboard stats
            if (window.adminDashboard && typeof window.adminDashboard.init === 'function') {
                window.adminDashboard.init();
            }
        } else if (tab === 'products') {
            if (productsPanel) {
                productsPanel.hidden = false;
            }
        } else if (tab === 'orders') {
            if (ordersPanel) {
                ordersPanel.hidden = false;
            }
            // Load orders
            if (window.adminOrders && typeof window.adminOrders.init === 'function') {
                window.adminOrders.init();
            }
        }
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTabNavigation);
    } else {
        initTabNavigation();
    }
    
    // Export for external use
    window.switchToTab = function(tabName) {
        const btn = document.querySelector(`.admin-nav-btn[data-tab="${tabName}"]`);
        if (btn) handleTabClick(btn);
    };
    
})();