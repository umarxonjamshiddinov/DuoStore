/**
 * DUO STORE — Order Tracking
 * Безопасное отслеживание заказов через Supabase Edge Function
 */
(function() {
    'use strict';

    // URL Edge Function для отслеживания заказов
    const TRACKING_FUNCTION_URL = 'https://bsmjppsvpmthyecvovhv.supabase.co/functions/v1/track-order';

    // Нейтральное сообщение об ошибке (не раскрывает существование заказа)
    const NEUTRAL_ERROR = 'Заказ не найден. Проверьте номер заказа и номер телефона.';

    // Описания статусов
    const STATUS_DESCRIPTIONS = {
        new: 'Ваш заказ принят и ожидает обработки. Мы свяжемся с вами для подтверждения.',
        processing: 'Заказ обрабатывается. Менеджер проверяет наличие товаров.',
        confirmed: 'Заказ подтверждён. Готовим его к отправке.',
        shipped: 'Заказ передан в доставку. Ожидайте звонка от курьера.',
        delivered: 'Заказ доставлен. Спасибо за покупку!',
        cancelled: 'Заказ отменён. Свяжитесь с нами для уточнения деталей.'
    };

    const STATUS_LABELS = {
        new: 'Принят',
        processing: 'В обработке',
        confirmed: 'Подтвёрден',
        shipped: 'Отправлен',
        delivered: 'Доставлен',
        cancelled: 'Отменён'
    };

    const STATUS_ORDER = ['new', 'processing', 'confirmed', 'shipped', 'delivered'];

    let form, orderNumberInput, orderPhoneInput, submitBtn;
    let errorContainer, errorText;
    let resultContainer;
    let resultOrderNumber, resultOrderDate;
    let resultStatusBadge, resultStatusText, resultStatusDescription;
    let progressFill;

    function init() {
        form = document.getElementById('trackingForm');
        orderNumberInput = document.getElementById('orderNumber');
        orderPhoneInput = document.getElementById('orderPhone');
        submitBtn = document.getElementById('trackingSubmitBtn');
        errorContainer = document.getElementById('trackingError');
        errorText = document.getElementById('trackingErrorText');
        resultContainer = document.getElementById('trackingResult');
        resultOrderNumber = document.getElementById('resultOrderNumber');
        resultOrderDate = document.getElementById('resultOrderDate');
        resultStatusBadge = document.getElementById('resultStatusBadge');
        resultStatusText = document.getElementById('resultStatusText');
        resultStatusDescription = document.getElementById('resultStatusDescription');
        progressFill = document.getElementById('progressFill');

        if (!form) {
            console.warn('[DUO Tracking] Форма не найдена');
            return;
        }

        const order = new URLSearchParams(location.search).get('order');
        if (validateOrderNumber(order).valid) orderNumberInput.value = order.toUpperCase();

        form.addEventListener('submit', handleSubmit);
        orderNumberInput?.addEventListener('input', () => hideError());
        orderPhoneInput?.addEventListener('input', hideError);
        orderNumberInput?.addEventListener('blur', normalizeOrderNumber);

        console.log('[DUO Tracking] Инициализация завершена');
    }

    function validateOrderNumber(value) {
        const cleaned = (value || '').trim().toUpperCase();
        if (!cleaned) return { valid: false, error: 'Введите номер заказа' };
        if (!cleaned.startsWith('ORD-')) return { valid: false, error: 'Номер заказа должен начинаться с ORD-' };
        const pattern = /^ORD-[A-Z0-9]{6,10}-[A-Z0-9]{4}$/;
        if (!pattern.test(cleaned)) return { valid: false, error: 'Неверный формат номера заказа' };
        return { valid: true, value: cleaned };
    }

    function validatePhone(value) {
        let digits = (value || '').replace(/[^\d]/g, '');
        if (digits.startsWith('998')) digits = digits.substring(3);
        if (digits.length !== 9) return { valid: false, error: 'Введите корректный номер телефона' };
        const codes = ['90', '91', '93', '94', '95', '97', '98', '99', '33', '50', '77', '55', '88', '78', '79', '71', '72', '73', '74', '75', '76'];
        if (!codes.includes(digits.substring(0, 2))) return { valid: false, error: 'Неверный код оператора' };
        return { valid: true, value: '+998' + digits };
    }

    function normalizeOrderNumber(e) {
        let value = e.target.value.trim().toUpperCase().replace(/\s+/g, '');
        if (value && !value.startsWith('ORD-')) value = 'ORD-' + value;
        e.target.value = value;
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (submitBtn.disabled) return;
        hideError();

        const orderResult = validateOrderNumber(orderNumberInput.value);
        if (!orderResult.valid) {
            showError(orderResult.error);
            orderNumberInput.focus();
            return;
        }

        const phoneResult = validatePhone(orderPhoneInput.value);
        if (!phoneResult.valid) {
            showError(phoneResult.error);
            orderPhoneInput.focus();
            return;
        }

        setLoading(true);

        try {
            const response = await fetch(TRACKING_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(10000),
                body: JSON.stringify({
                    orderNumber: orderResult.value,
                    phone: phoneResult.value
                })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                showError(NEUTRAL_ERROR);
                return;
            }

            showResult(data);
            resultContainer.focus();

        } catch (error) {
            console.error('[DUO Tracking] Ошибка:', error);
            showError('Ошибка соединения. Попробуйте позже.');
        } finally {
            setLoading(false);
        }
    }

    function showError(message) {
        errorText.textContent = message;
        errorContainer.hidden = false;
        resultContainer.hidden = true;
    }

    function hideError() {
        errorContainer.hidden = true;
    }

    function setLoading(loading) {
        submitBtn.disabled = loading;
        submitBtn.querySelector('.btn-text').hidden = loading;
        submitBtn.querySelector('.btn-loader').hidden = !loading;
    }

    function showResult(data) {
        hideError();
        resultOrderNumber.textContent = data.orderNumber;
        resultOrderDate.textContent = formatDate(data.createdAt);

        const status = data.status || 'new';
        resultStatusBadge.setAttribute('data-status', status);
        resultStatusText.textContent = STATUS_LABELS[status] || status;
        resultStatusDescription.textContent = STATUS_DESCRIPTIONS[status] || 'Статус заказа обновляется.';

        updateProgressBar(status);
        resultContainer.hidden = false;
        resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function updateProgressBar(status) {
        const currentIndex = STATUS_ORDER.indexOf(status);
        const steps = document.querySelectorAll('.progress-step');
        
        steps.forEach((step, index) => {
            step.classList.remove('is-active', 'is-complete');
            if (status === 'cancelled') return;
            if (index < currentIndex) step.classList.add('is-complete');
            else if (index === currentIndex) step.classList.add('is-active');
        });

        progressFill.style.width = status === 'cancelled' ? '0%' : ((currentIndex + 1) / STATUS_ORDER.length) * 100 + '%';
    }

    function formatDate(dateString) {
        if (!dateString) return '';
        try {
            return new Date(dateString).toLocaleDateString('ru-RU', {
                day: 'numeric', month: 'long', year: 'numeric'
            });
        } catch { return dateString; }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

