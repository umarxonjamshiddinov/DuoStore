/**
 * DUO STORE — Admin Panel Logic
 */

(function() {
    'use strict';

    // ============================================================================
    // СОСТОЯНИЕ ПРИЛОЖЕНИЯ
    // ============================================================================
    
    let products = [];
    let currentFilter = 'all';
    let showInactive = false;
    let editingProductId = null;
    let pendingDeleteProduct = null;
    let authState = {
        user: null,
        isAdmin: false,
        mfaVerified: false
    };

    // ============================================================================
    // DOM ЭЛЕМЕНТЫ
    // ============================================================================
    
    // Состояние для MFA настройки
    let mfaSetupData = {
        factorId: null,
        secret: null,
        uri: null
    };

    const elements = {
        loginPage: document.getElementById('loginPage'),
        adminPage: document.getElementById('adminPage'),
        configErrorPage: document.getElementById('configErrorPage'),
        loginForm: document.getElementById('loginForm'),
        loginEmail: document.getElementById('loginEmail'),
        loginPassword: document.getElementById('loginPassword'),
        loginError: document.getElementById('loginError'),
        loginBtn: document.getElementById('loginBtn'),
        mfaForm: document.getElementById('mfaForm'),
        mfaCode: document.getElementById('mfaCode'),
        mfaError: document.getElementById('mfaError'),
        mfaVerifyBtn: document.getElementById('mfaVerifyBtn'),
        mfaCancelBtn: document.getElementById('mfaCancelBtn'),
        // MFA Setup элементы
        mfaSetupForm: document.getElementById('mfaSetupForm'),
        mfaSetupCode: document.getElementById('mfaSetupCode'),
        mfaSetupError: document.getElementById('mfaSetupError'),
        mfaSetupBtn: document.getElementById('mfaSetupBtn'),
        mfaQrImage: document.getElementById('mfaQrImage'),
        qrLoading: document.getElementById('qrLoading'),
        mfaSecretContainer: document.getElementById('mfaSecretContainer'),
        mfaSecretCode: document.getElementById('mfaSecretCode'),
        mfaFactorsInfo: document.getElementById('mfaFactorsInfo'),
        mfaFactorsList: document.getElementById('mfaFactorsList'),
        mfaRetryBtn: document.getElementById('mfaRetryBtn'),
        adminEmail: document.getElementById('adminEmail'),
        logoutBtn: document.getElementById('logoutBtn'),
        productsCount: document.getElementById('productsCount'),
        productsTableBody: document.getElementById('productsTableBody'),
        emptyState: document.getElementById('emptyState'),
        showInactive: document.getElementById('showInactive'),
        categoryFilters: document.getElementById('categoryFilters'),
        addProductBtn: document.getElementById('addProductBtn'),
        productModal: document.getElementById('productModal'),
        modalTitle: document.getElementById('modalTitle'),
        modalClose: document.getElementById('modalClose'),
        modalCancelBtn: document.getElementById('modalCancelBtn'),
        modalDeleteBtn: document.getElementById('modalDeleteBtn'),
        modalSaveBtn: document.getElementById('modalSaveBtn'),
        productForm: document.getElementById('productForm'),
        productId: document.getElementById('productId'),
        productName: document.getElementById('productName'),
        productCategory: document.getElementById('productCategory'),
        productBadge: document.getElementById('productBadge'),
        productMeta: document.getElementById('productMeta'),
        productPrice: document.getElementById('productPrice'),
        productImage: document.getElementById('productImage'),
        productImageUrl: document.getElementById('productImageUrl'),
        productActive: document.getElementById('productActive'),
        imagePreview: document.getElementById('imagePreview'),
        imagePlaceholder: document.getElementById('imagePlaceholder'),
        previewImg: document.getElementById('previewImg'),
        uploadImageBtn: document.getElementById('uploadImageBtn'),
        removeImageBtn: document.getElementById('removeImageBtn'),
        deleteModal: document.getElementById('deleteModal'),
        deleteProductName: document.getElementById('deleteProductName'),
        deleteModalClose: document.getElementById('deleteModalClose'),
        deleteCancelBtn: document.getElementById('deleteCancelBtn'),
        deleteConfirmBtn: document.getElementById('deleteConfirmBtn'),
        toastContainer: document.getElementById('toastContainer'),
        loadingOverlay: document.getElementById('loadingOverlay')
    };

    // ============================================================================
    // ИНИЦИАЛИЗАЦИЯ
    // ============================================================================

    async function init() {
        console.log('🚀 DUO STORE Admin Panel инициализация...');
        
        // Проверить конфигурацию Supabase
        if (typeof window.supabase === 'undefined') {
            // Ждать загрузки supabaseClient.js
            window.addEventListener('supabaseReady', async () => {
                await startApp();
            }, { once: true });
        } else {
            await startApp();
        }
    }

    async function startApp() {
        const { data: { session } } = await window.supabase.auth.getSession();
        
        if (session) {
            await checkAuthAndProceed();
        } else {
            showLoginForm();
        }
        
        window.supabase.auth.onAuthStateChange(handleAuthStateChange);
        bindEvents();
    }

    // ============================================================================
    // АВТОРИЗАЦИЯ
    // ============================================================================
    
    // Флаг для защиты от параллельных вызовов checkAuthAndProceed
    let authCheckInProgress = false;

    async function handleAuthStateChange(event, session) {
        console.log('🔐 Auth state:', event);
        
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Игнорируем INITIAL_SESSION и SIGNED_IN если проверка уже идёт
        // Это предотвращает повторные вызовы enroll() из-за нескольких событий
        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
            if (authCheckInProgress) {
                console.log('[Auth] checkAuthAndProceed already in progress, skipping duplicate call');
                return;
            }
            await checkAuthAndProceed();
        } else if (event === 'SIGNED_OUT') {
            authState = { user: null, isAdmin: false, mfaVerified: false };
            authCheckInProgress = false; // Сброс при выходе
            showLoginForm();
        }
    }

    async function checkAuthAndProceed() {
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Защита от параллельных вызовов
        if (authCheckInProgress) {
            console.log('[Auth] checkAuthAndProceed already in progress, returning early');
            return;
        }
        authCheckInProgress = true;
        
        showLoading(true);
        
        try {
            // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Проверяем что getUser() возвращает того же пользователя
            const { data: { user }, error: userError } = await window.supabase.auth.getUser();
            
            if (userError || !user) {
                console.log('[Auth] No user session, showing login');
                showLoginForm();
                return;
            }
            
            // Также получаем сессию для проверки соответствия
            const { data: { session } } = await window.supabase.auth.getSession();
            
            // КРИТИЧЕСКАЯ ПРОВЕРКА: Убедимся что session.user.id == user.id
            if (!session || session.user.id !== user.id) {
                console.error('[Auth] SESSION MISMATCH: getUser user.id !== session.user.id');
                showMFAErrorWithRetry('Ошибка сессии. Выйдите и войдите заново.', 'session_mismatch');
                return;
            }
            
            console.log('[Auth] User ID:', user.id, '| Email:', user.email);
            authState.user = user;
            
            // Проверить MFA
            console.log('[Auth] Checking MFA status...');
            const { data: aal } = await window.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            const mfaVerified = aal?.currentLevel === 'aal2';
            console.log('[Auth] AAL level:', aal?.currentLevel, '| MFA verified:', mfaVerified);
            authState.mfaVerified = mfaVerified;
            
            if (!mfaVerified) {
                // Проверить, есть ли уже зарегистрированный TOTP-фактор
                console.log('[Auth] AAL is not aal2, checking for verified TOTP factors...');
                // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Supabase v2 возвращает { data: { totp: [...], all: [...] } }
                // НЕ используйте { data: { factors } } — factors всегда undefined!
                const { data: factorsData, error: factorsError } = await window.supabase.auth.mfa.listFactors();
                
                // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Подробная диагностика HTTP 422
                if (factorsError) {
                    console.error('[Auth] listFactors ERROR:', {
                        status: factorsError.status,
                        message: factorsError.message,
                        name: factorsError.name,
                        code: factorsError.code
                    });
                    
                    // HTTP 422 = Unprocessable Entity - проблема с запросом или сессией
                    if (factorsError.status === 422) {
                        console.error('[Auth] HTTP 422 - возможные причины:');
                        console.error('  1. Сессия недействительна или просрочена');
                        console.error('  2. Токен не содержит необходимых claims');
                        console.error('  3. Слишком частые запросы к API');
                        
                        // Пробуем обновить сессию
                        const { error: refreshError } = await window.supabase.auth.refreshSession();
                        if (refreshError) {
                            console.error('[Auth] Session refresh failed:', refreshError.message);
                            showMFAErrorWithRetry(
                                'Сессия устарела. Выйдите и войдите заново.',
                                'session_expired'
                            );
                        } else {
                            showMFAErrorWithRetry(
                                'Ошибка проверки MFA. Нажмите кнопку для повтора.',
                                'listFactors'
                            );
                        }
                    } else {
                        showMFAErrorWithRetry(
                            'Не удалось проверить MFA-факторы. Проверьте соединение и попробуйте снова.',
                            'listFactors'
                        );
                    }
                    return;
                }
                
                // КРИТИЧЕСКАЯ ДИАГНОСТИКА: Проверяем реальную структуру ответа
                // Supabase v2: { data: { totp: [...], all: [...] } }
                console.log('[Auth] listFactors raw response structure:');
                console.log('[Auth]   data type:', typeof factorsData);
                console.log('[Auth]   data keys:', factorsData ? Object.keys(factorsData) : 'null');
                console.log('[Auth]   data.totp type:', typeof factorsData?.totp);
                console.log('[Auth]   data.all type:', typeof factorsData?.all);
                
                // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Извлекаем totp и all из data, а не из factors!
                const totpFactors = factorsData?.totp ?? [];
                const allFactors = factorsData?.all ?? [];
                
                // Логируем только КОЛИЧЕСТВО и типы (без секретов!)
                console.log('[Auth] listFactors result: totp.length=' + totpFactors.length + ', all.length=' + allFactors.length);
                
                // Если массив all не пуст - покажем какие там есть factor_type
                if (allFactors.length > 0) {
                    const factorTypes = allFactors.map(f => f.factor_type);
                    console.log('[Auth] all factors types:', [...new Set(factorTypes)]);
                }
                
                // Собираем все verified TOTP факторы из обеих структур
                const verifiedFromTotp = totpFactors.filter(f => f.status === 'verified');
                const verifiedFromAll = allFactors.filter(f => f.status === 'verified' && f.factor_type === 'totp');
                
                // Объединяем и убираем дубликаты по id
                const allVerified = [...verifiedFromTotp, ...verifiedFromAll];
                const uniqueVerified = allVerified.filter((f, i, arr) => 
                    i === arr.findIndex(x => x.id === f.id)
                );
                
                console.log('[Auth] Verified TOTP factors found:', uniqueVerified.length);
                
                // КРИТИЧЕСКИ ВАЖНО: Если есть verified фактор — показываем форму ввода кода
                if (uniqueVerified.length > 0) {
                    console.log('[Auth] ═══ SHOWING MFA CODE FORM ═══');
                    console.log('[Auth] Factor belongs to user:', user.id);
                    showMFAForm();
                } else {
                    // КРИТИЧЕСКОЕ ПРЕДУПРЕЖДЕНИЕ: Факторы пустые!
                    // НЕ вызываем enroll() автоматически — это вызовет mfa_factor_name_conflict
                    console.warn('[Auth] ═══════════════════════════════════════════════');
                    console.warn('[Auth] ВНИМАНИЕ: listFactors() вернул пустой список verified факторов');
                    console.warn('[Auth] Текущий пользователь:', user.id, user.email);
                    console.warn('[Auth] Проверьте в Supabase SQL:');
                    console.warn('[Auth]   SELECT user_id, status FROM auth.mfa_factors WHERE friendly_name = \'DUO STORE Admin MFA\'');
                    console.warn('[Auth] Если user_id != "' + user.id + '" — фактор принадлежит другому пользователю');
                    console.warn('[Auth] ═══════════════════════════════════════════════');
                    
                    // НЕ вызываем enroll()! Показываем предупреждение
                    showMFAErrorWithRetry(
                        'MFA не найдена для текущей сессии. Если вы настроили MFA, проверьте что вы входите под тем же аккаунтом.',
                        'no_factors'
                    );
                }
                return;
            }
            
            // Проверить is_admin
            const isAdmin = await checkIsAdmin(user.id);
            authState.isAdmin = isAdmin;
            
            if (!isAdmin) {
                showToast('У вас нет прав администратора', 'error');
                await window.supabase.auth.signOut();
                showLoginForm();
                return;
            }
            
            showAdminPanel();
            
        } catch (error) {
            console.error('Ошибка авторизации:', error);
            showToast('Ошибка авторизации', 'error');
            showLoginForm();
        } finally {
            authCheckInProgress = false; // Сброс флага после завершения
            showLoading(false);
        }
    }

    async function checkIsAdmin(userId) {
        try {
            const { data: profile, error } = await window.supabase
                .from('profiles')
                .select('is_admin')
                .eq('id', userId)
                .single();
            
            if (error) {
                console.error('Ошибка проверки is_admin:', error);
                return false;
            }
            
            return profile?.is_admin === true;
        } catch (error) {
            return false;
        }
    }

    async function handleLogin(e) {
        e.preventDefault();
        
        const email = elements.loginEmail.value.trim();
        const password = elements.loginPassword.value;
        
        if (!email || !password) {
            showLoginError('Введите email и пароль');
            return;
        }
        
        showLoading(true);
        hideLoginError();
        
        try {
            const { error } = await window.supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
        } catch (error) {
            showLoginError(getErrorMessage(error.message));
        } finally {
            showLoading(false);
        }
    }

    async function handleMFAVerify(e) {
        e.preventDefault();
        
        const code = elements.mfaCode.value.trim();
        
        if (!code || code.length !== 6) {
            showMFAError('Введите 6-значный код');
            return;
        }
        
        showLoading(true);
        hideMFAError();
        
        try {
            // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Supabase v2 возвращает { data: { totp: [...], all: [...] } }
            const { data: verifyData, error: listError } = await window.supabase.auth.mfa.listFactors();
            
            // ИСПРАВЛЕНО: Проверяем ошибку listFactors
            if (listError) {
                console.error('[MFA Verify] listFactors error:', listError.status, listError.message);
                showMFAError('Не удалось проверить MFA-факторы. Попробуйте снова.');
                return;
            }
            
            // ИСПРАВЛЕНО: Берём ТОЛЬКО verified TOTP-фактор из data.totp
            // НЕ используем factors — этого ключа не существует в ответе!
            const totpFactors = verifyData?.totp ?? [];
            const verifiedTotpFactor = totpFactors.find(f => f.status === 'verified');
            
            if (!verifiedTotpFactor) {
                throw new Error('Нет верифицированного MFA фактора. Настройте MFA заново.');
            }
            
            // ИСПРАВЛЕНО: НЕ логируем factor ID - это секрет!
            console.log('[MFA] Using verified factor, name:', verifiedTotpFactor.friendly_name);
            
            const { error } = await window.supabase.auth.mfa.challengeAndVerify({
                factorId: verifiedTotpFactor.id,
                code: code
            });
            
            if (error) throw error;
            
            // ИСПРАВЛЕНО: Проверяем что сессия действительно имеет AAL2
            const { data: aalAfter } = await window.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            console.log('[MFA] AAL after verify:', aalAfter?.currentLevel);
            
            if (aalAfter?.currentLevel !== 'aal2') {
                throw new Error('Сессия не имеет AAL2 после верификации. Попробуйте ещё раз.');
            }
            
            // Успешная верификация - перезагружаем страницу
            console.log('[MFA] Верификация успешна, AAL2 подтверждён');
            window.location.reload();
            
        } catch (error) {
            showMFAError(getErrorMessage(error.message));
        } finally {
            showLoading(false);
        }
    }


    // ============================================================================
    // НАСТРОЙКА MFA (ПЕРВЫЙ ВХОД)
    // ============================================================================

    // Защита от повторных вызовов
    let mfaSetupInProgress = false;

    async function startMFASetup() {
        console.log('[MFA Setup] startMFASetup called');
        
        // Защита от повторного запуска
        if (mfaSetupInProgress) {
            console.log('[MFA Setup] Already in progress, skipping...');
            return;
        }
        mfaSetupInProgress = true;
        
        showLoading(true);
        elements.mfaFactorsInfo.hidden = true;
        elements.mfaRetryBtn.hidden = true;
        hideMFASetupError();
        
        try {
            // Шаг 1: Получаем список всех факторов
            // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Supabase v2 возвращает { data: { totp: [...], all: [...] } }
            const { data: setupData, error: listError } = await window.supabase.auth.mfa.listFactors();
            
            // ИСПРАВЛЕНО: Не выбрасываем исключение при ошибке listFactors!
            // Показываем ошибку с возможностью повтора вместо enroll()
            if (listError) {
                console.error('[MFA Setup] listFactors error:', listError.status, listError.message);
                showMFAErrorWithRetry(
                    'Не удалось проверить MFA-факторы. Проверьте соединение и попробуйте снова.',
                    'listFactors'
                );
                return;
            }
            
            // ИСПРАВЛЕНО: Извлекаем totp из data, а не из factors!
            const totpFactors = setupData?.totp ?? [];
            
            console.log('[MFA Setup] TOTP factors found:', totpFactors.length);
            // ИСПРАВЛЕНО: НЕ логируем id факторов - только статусы
            console.log('[MFA Setup] Factors status:', totpFactors.map(f => ({ status: f.status })));
            
            // Шаг 2: Проверяем наличие verified и unverified факторов
            const verifiedFactors = totpFactors.filter(f => f.status === 'verified');
            const unverifiedFactors = totpFactors.filter(f => f.status !== 'verified');
            
            console.log('MFA факторы:', totpFactors.map(f => ({
                name: f.friendly_name,
                status: f.status
            })));
            
            // Если есть verified фактор — перенаправляем на ввод кода
            if (verifiedFactors.length > 0) {
                console.log('[MFA Setup] Found verified factors:', verifiedFactors.length, '— showing MFA code form');
                showToast('MFA уже настроена. Используйте код из приложения.', 'info');
                showMFAForm();
                return;
            }
            
            // Если есть unverified фактор — показываем информацию
            if (unverifiedFactors.length > 0) {
                console.log('[MFA Setup] Found unverified factors:', unverifiedFactors.length);
                showFactorsInfo(unverifiedFactors, verifiedFactors);
                elements.mfaRetryBtn.hidden = false;
                elements.qrLoading.hidden = true;
                showMFASetupForm();
                showMFASetupError('Найден незавершённый фактор. Нажмите кнопку ниже для повторной настройки.');
                return;
            }
            
            // Шаг 3: Факторов нет — создаём новый
            // ВАЖНО: к этому моменту мы УВЕРЕНЫ что нет verified факторов
            // (иначе бы уже вернулись на строке 468)
            console.log('[MFA Setup] No factors found, will create new');
            await createNewMFAFactor();
            
        } catch (error) {
            console.error('Ошибка при проверке MFA:', error);
            showToast('Ошибка: ' + getErrorMessage(error.message), 'error');
            showLoginForm();
        } finally {
            mfaSetupInProgress = false;
            showLoading(false);
        }
    }

    async function createNewMFAFactor() {
        // Сбрасываем UI перед созданием
        elements.mfaQrImage.hidden = true;
        elements.qrLoading.hidden = false;
        elements.mfaSecretContainer.hidden = true;
        elements.mfaRetryBtn.hidden = true;
        hideMFASetupError();
        showMFASetupForm();
        showLoading(true);

        // Тайм-аут для загрузки QR-кода (15 сек)
        let timeoutId = null;
        let completed = false;

        try {
            const enrollPromise = window.supabase.auth.mfa.enroll({
                factorType: 'totp',
                friendlyName: 'DUO STORE Admin MFA'
            });

            timeoutId = setTimeout(() => {
                if (!completed) {
                    showMFASetupError('Превышено время ожидания. Попробуйте снова.');
                    elements.qrLoading.hidden = true;
                    elements.mfaRetryBtn.hidden = false;
                }
            }, 15000);

            const { data, error } = await enrollPromise;
            completed = true;
            clearTimeout(timeoutId);

            if (error) throw error;

            mfaSetupData.factorId = data.id;
            console.log('[MFA Enroll] Factor created successfully');
            mfaSetupData.secret = data.totp.secret;
            mfaSetupData.uri = data.totp.uri;

            elements.mfaQrImage.src = data.totp.qr_code;
            elements.mfaQrImage.hidden = false;
            elements.qrLoading.hidden = true;
            elements.mfaSecretCode.textContent = data.totp.secret;
            elements.mfaSecretContainer.hidden = false;
            elements.mfaRetryBtn.hidden = true;

            console.log('QR-код успешно создан.');

        } catch (error) {
            completed = true;
            clearTimeout(timeoutId);
            console.error('[MFA Enroll] ERROR status:', error.status, 'message:', error.message);
            elements.qrLoading.hidden = true;
            
            if (error.message && error.message.includes('already exists')) {
                console.log('[MFA Enroll] Factor already exists - re-checking...');
                try {
                    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Supabase v2 возвращает { data: { totp: [...], all: [...] } }
                    const { data: recheckData, error: listErr } = await window.supabase.auth.mfa.listFactors();
                    if (!listErr && recheckData?.totp) {
                        const verifiedFactor = recheckData.totp.find(f => f.status === 'verified');
                        if (verifiedFactor) {
                            console.log('[MFA Enroll] Found verified factor - showing MFA code form');
                            showToast('MFA уже настроена. Введите код из приложения.', 'info');
                            showMFAForm();
                            return;
                        }
                    }
                } catch (recheckErr) { console.error('[MFA Enroll] Re-check failed:', recheckErr); }
                showMFASetupError('Незавершённая регистрация. Нажмите кнопку ниже.');
                elements.mfaRetryBtn.hidden = false;
                return;
            }
            
            showMFASetupError('Ошибка: ' + getErrorMessage(error.message));
            elements.mfaRetryBtn.hidden = false;
        } finally {
            showLoading(false);
        }
    }

    async function deleteUnverifiedAndRetry() {
        showLoading(true);
        elements.mfaRetryBtn.disabled = true;

        try {
            // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Supabase v2 возвращает { data: { totp: [...], all: [...] } }
            const { data: retryData, error: listError } = await window.supabase.auth.mfa.listFactors();
            if (listError) {
                console.error('[MFA Retry] listFactors error:', listError.status, listError.message);
                showMFAError('Не удалось проверить MFA-факторы. Попробуйте снова.');
                return;
            }
            
            // ИСПРАВЛЕНО: Извлекаем totp из data, а не из factors!
            const verifiedFactors = retryData?.totp?.filter(f => f.status === 'verified') ?? [];
            if (verifiedFactors.length > 0) {
                console.log('[MFA Retry] Found verified factors:', verifiedFactors.length);
                showToast('MFA уже настроена. Введите код из приложения.', 'info');
                showMFAForm();
                return;
            }
            
            const unverifiedFactors = retryData?.totp?.filter(f => f.status !== 'verified') ?? [];

            if (unverifiedFactors.length === 0) {
                await createNewMFAFactor();
                return;
            }

            for (const factor of unverifiedFactors) {
                const { error: unenrollError } = await window.supabase.auth.mfa.unenroll({ 
                    factorId: factor.id 
                });
                if (unenrollError) throw unenrollError;
            }

            showToast('Фактор удалён. Создаём новый...', 'success');
            await new Promise(resolve => setTimeout(resolve, 500));
            await createNewMFAFactor();

        } catch (error) {
            console.error('Ошибка удаления:', error);
            showMFASetupError('Ошибка: ' + getErrorMessage(error.message));
            elements.mfaRetryBtn.disabled = false;
        } finally {
            showLoading(false);
            elements.mfaRetryBtn.disabled = false;
        }
    }

    function showFactorsInfo(unverified, verified) {
        let html = '';
        
        unverified.forEach(f => {
            html += `<div class="mfa-factor-item">
                <span class="mfa-factor-status unverified">незавершён</span>
                <span>${f.friendly_name || 'TOTP'}</span>
            </div>`;
        });
        
        verified.forEach(f => {
            html += `<div class="mfa-factor-item">
                <span class="mfa-factor-status verified">активен</span>
                <span>${f.friendly_name || 'TOTP'}</span>
            </div>`;
        });
        
        if (html) {
            elements.mfaFactorsList.innerHTML = html;
            elements.mfaFactorsInfo.hidden = false;
        }
    }


    async function handleMFASetup(e) {
        e.preventDefault();
        const code = elements.mfaSetupCode.value.trim();
        if (!code || code.length !== 6) {
            showMFASetupError('Введите 6-значный код');
            return;
        }
        
        // КРИТИЧЕСКАЯ ПРОВЕРКА: factorId должен быть валидным UUID
        if (!mfaSetupData.factorId) {
            showMFASetupError('QR-код не создан. Дождитесь генерации QR-кода.');
            console.error('[MFA Setup] factorId is null/undefined');
            return;
        }
        
        // Проверяем что factorId выглядит как UUID (формат: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(mfaSetupData.factorId)) {
            showMFASetupError('Некорректный ID фактора. Попробуйте создать QR-код заново.');
            console.error('[MFA Setup] factorId is not a valid UUID');
            return;
        }
        
        console.log('[MFA Setup] Starting challenge...');
        showLoading(true);
        hideMFASetupError();
        try {
            console.log('[MFA Setup] Starting MFA challenge');
            const { data: challenge, error: challengeError } = await window.supabase.auth.mfa.challenge({
                factorId: mfaSetupData.factorId
            });
            console.log('[MFA Setup] Challenge result:', challenge);
            if (challengeError) throw challengeError;
            const { error: verifyError } = await window.supabase.auth.mfa.verify({
                factorId: mfaSetupData.factorId,
                challengeId: challenge.id,
                code: code
            });
            if (verifyError) throw verifyError;
            showToast('Двухфакторная аутентификация активирована!', 'success');
            window.location.reload();
        } catch (error) {
            console.error('Ошибка верификации MFA:', error);
            showMFASetupError(getErrorMessage(error.message));
        } finally {
            showLoading(false);
        }
    }

    async function handleLogout() {
        try {
            await window.supabase.auth.signOut();
            window.location.reload();
        } catch (error) {
            showToast('Ошибка при выходе', 'error');
        }
    }

    // ============================================================================
    // ЗАГРУЗКА ТОВАРОВ
    // ============================================================================

    async function loadProducts() {
        showLoading(true);
        
        console.log('[Admin] Загрузка товаров из Supabase...');
        
        try {
            let query = window.supabase
                .from('products')
                .select('*')
                .order('id', { ascending: true });
            
            // Фильтр по видимости
            if (!showInactive) {
                query = query.eq('is_active', true);
            }
            
            const { data, error } = await query;
            
            if (error) {
                console.error('[Admin] Ошибка загрузки:', error);
                throw error;
            }
            
            console.log('[Admin] Получено товаров:', data ? data.length : 0);
            
            products = data || [];
            renderProducts();
            updateProductsCount();
            
        } catch (error) {
            console.error('Ошибка загрузки товаров:', error);
            showToast('Ошибка загрузки товаров', 'error');
        } finally {
            showLoading(false);
        }
    }

    function renderProducts() {
        const filteredProducts = getFilteredProducts();
        
        if (filteredProducts.length === 0) {
            elements.productsTableBody.innerHTML = '';
            elements.emptyState.hidden = false;
            return;
        }
        
        elements.emptyState.hidden = true;
        
        let html = '';
        filteredProducts.forEach(product => {
            const isActive = product.is_active !== false;
            const badgeHtml = product.badge ? `<span class="product-badge-cell">${product.badge === 'new' ? 'NEW' : 'ХИТ'}</span>` : '';
            
            html += `
                <tr data-id="${product.id}">
                    <td class="table-photo">
                        <img src="${product.image_url || 'data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 48 48\"%3E%3Crect width=\"48\" height=\"48\" fill=\"%23f0f0f0\"/%3E%3C/svg%3E'}" 
                             alt="${product.name}" 
                             loading="lazy"
                             onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 48 48\\'%3E%3Crect width=\\'48\\' height=\\'48\\' fill=\\'%23f0f0f0\\'/%3E%3C/svg%3E'">
                    </td>
                    <td class="table-id">${product.id}</td>
                    <td class="table-name">
                        <div class="product-info">
                            <span class="product-name-link">${escapeHtml(product.name)}</span>
                            ${badgeHtml}
                        </div>
                    </td>
                    <td class="table-category">${escapeHtml(product.cat)}</td>
                    <td class="table-sizes">${escapeHtml(product.meta)}</td>
                    <td class="table-price">${formatPrice(product.price)}</td>
                    <td class="table-status">
                        <span class="status-badge ${isActive ? 'active' : 'inactive'}">
                            ${isActive ? 'Активен' : 'Скрыт'}
                        </span>
                    </td>
                    <td class="table-actions">
                        <div class="table-actions-inner">
                            <button class="btn-icon" data-action="toggle-active" title="${isActive ? 'Скрыть' : 'Показать'}">
                                <svg class="icon"><use href="#i-${isActive ? 'eye-off' : 'eye'}"/></svg>
                            </button>
                            <button class="btn-icon" data-action="edit" title="Редактировать">
                                <svg class="icon"><use href="#i-edit"/></svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        elements.productsTableBody.innerHTML = html;
    }

    function getFilteredProducts() {
        if (currentFilter === 'all') {
            return products;
        }
        return products.filter(p => p.cat === currentFilter);
    }

    function updateProductsCount() {
        const count = getFilteredProducts().length;
        elements.productsCount.textContent = `${count} ${pluralize(count, 'товар', 'товара', 'товаров')}`;
    }

    // ============================================================================
    // УПРАВЛЕНИЕ ТОВАРАМИ (CRUD)
    // ============================================================================

    function openAddProductModal() {
        editingProductId = null;
        elements.modalTitle.textContent = 'Добавить товар';
        elements.modalDeleteBtn.hidden = true;
        elements.productForm.reset();
        elements.productId.value = '';
        elements.productActive.checked = true;
        clearImagePreview();
        openModal(elements.productModal);
    }

    function openEditProductModal(productId) {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        
        editingProductId = productId;
        elements.modalTitle.textContent = 'Редактировать товар';
        elements.modalDeleteBtn.hidden = false;
        
        elements.productId.value = product.id;
        elements.productName.value = product.name;
        elements.productCategory.value = product.cat;
        elements.productBadge.value = product.badge || '';
        elements.productMeta.value = product.meta;
        elements.productPrice.value = product.price;
        elements.productActive.checked = product.is_active !== false;
        elements.productImageUrl.value = product.image_url || '';
        
        if (product.image_url) {
            setPreviewImage(product.image_url);
        } else {
            clearImagePreview();
        }
        
        openModal(elements.productModal);
    }

    async function saveProduct() {
        const id = elements.productId.value.trim();
        const name = elements.productName.value.trim();
        const category = elements.productCategory.value;
        const badge = elements.productBadge.value || null;
        const meta = elements.productMeta.value.trim();
        const price = parseInt(elements.productPrice.value, 10);
        const isActive = elements.productActive.checked;
        const imageUrl = elements.productImageUrl.value.trim();
        
        if (!name) { showToast('Введите название товара', 'error'); return; }
        if (!category) { showToast('Выберите категорию', 'error'); return; }
        if (!meta) { showToast('Укажите размеры', 'error'); return; }
        if (isNaN(price) || price < 0) { showToast('Введите корректную цену', 'error'); return; }
        
        showLoading(true);
        
        try {
            const productData = {
                id: id || generateProductId(),
                name, cat: category, badge, meta, price,
                is_active: isActive, image_url: imageUrl
            };
            
            if (editingProductId) {
                const { error } = await window.supabase.from('products').update(productData).eq('id', editingProductId);
                if (error) throw error;
                showToast('Товар обновлён', 'success');
            } else {
                const { error } = await window.supabase.from('products').insert(productData);
                if (error) throw error;
                showToast('Товар добавлен', 'success');
            }
            
            closeModal(elements.productModal);
            await loadProducts();
            
        } catch (error) {
            showToast('Ошибка: ' + getErrorMessage(error.message), 'error');
        } finally {
            showLoading(false);
        }
    }

    async function toggleProductActive(productId) {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        
        const newIsActive = product.is_active === false ? true : false;
        showLoading(true);
        
        try {
            const { error } = await window.supabase.from('products').update({ is_active: newIsActive }).eq('id', productId);
            if (error) throw error;
            showToast(newIsActive ? 'Товар показан' : 'Товар скрыт', 'success');
            await loadProducts();
        } catch (error) {
            showToast('Ошибка изменения статуса', 'error');
        } finally {
            showLoading(false);
        }
    }

    async function deleteProduct() {
        if (!pendingDeleteProduct) return;
        showLoading(true);
        
        try {
            const { error } = await window.supabase.from('products').delete().eq('id', pendingDeleteProduct.id);
            if (error) throw error;
            showToast('Товар удалён', 'success');
            closeModal(elements.deleteModal);
            closeModal(elements.productModal);
            await loadProducts();
        } catch (error) {
            showToast('Ошибка удаления', 'error');
        } finally {
            showLoading(false);
            pendingDeleteProduct = null;
        }
    }

    function confirmDelete() {
        if (!editingProductId) return;
        const product = products.find(p => p.id === editingProductId);
        if (!product) return;
        
        pendingDeleteProduct = product;
        elements.deleteProductName.textContent = product.name;
        closeModal(elements.productModal);
        openModal(elements.deleteModal);
    }

    // ============================================================================
    // ЗАГРУЗКА ИЗОБРАЖЕНИЙ
    // ============================================================================

    async function handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            showToast('Допустимы только JPEG, PNG, WebP', 'error');
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            showToast('Максимальный размер: 5 MB', 'error');
            return;
        }
        
        showLoading(true);
        
        try {
            const ext = file.name.split('.').pop();
            const fileName = `product_${Date.now()}.${ext}`;
            
            const { data, error } = await window.supabase.storage.from('products').upload(fileName, file);
            if (error) throw error;
            
            const { data: urlData } = window.supabase.storage.from('products').getPublicUrl(data.path);
            
            elements.productImageUrl.value = urlData.publicUrl;
            setPreviewImage(urlData.publicUrl);
            showToast('Изображение загружено', 'success');
            
        } catch (error) {
            showToast('Ошибка загрузки изображения', 'error');
        } finally {
            showLoading(false);
        }
    }

    function setPreviewImage(url) {
        elements.previewImg.src = url;
        elements.previewImg.hidden = false;
        elements.imagePlaceholder.hidden = true;
        elements.imagePreview.classList.add('has-image');
        elements.removeImageBtn.hidden = false;
    }

    function clearImagePreview() {
        elements.previewImg.src = '';
        elements.previewImg.hidden = true;
        elements.imagePlaceholder.hidden = false;
        elements.imagePreview.classList.remove('has-image');
        elements.removeImageBtn.hidden = true;
        elements.productImageUrl.value = '';
    }

    // ============================================================================
    // СОБЫТИЯ
    // ============================================================================

    function bindEvents() {
        elements.loginForm.addEventListener('submit', handleLogin);
        elements.mfaForm.addEventListener('submit', handleMFAVerify);
        elements.mfaSetupForm.addEventListener('submit', handleMFASetup);
        elements.mfaRetryBtn.addEventListener('click', deleteUnverifiedAndRetry);
        elements.mfaCancelBtn.addEventListener('click', showLoginForm);
        elements.logoutBtn.addEventListener('click', handleLogout);
        
        // ============================================================================
        // ОБРАБОТЧИКИ ВВОДА MFA КОДОВ (критическое исправление)
        // ============================================================================
        
        // Функция для фильтрации и ограничения ввода MFA-кода
        function handleMFAInput(e) {
            const input = e.target;
            const originalValue = input.value;
            
            // Удаляем всё кроме цифр
            let filteredValue = originalValue.replace(/[^0-9]/g, '');
            
            // Ограничиваем до 6 символов
            if (filteredValue.length > 6) {
                filteredValue = filteredValue.substring(0, 6);
            }
            
            // Обновляем значение, если оно изменилось
            if (filteredValue !== originalValue) {
                input.value = filteredValue;
                // БЕЗОПАСНОСТЬ: Не логируем значения MFA-кодов!
            }
            
            // БЕЗОПАСНОСТЬ: Не логируем значения MFA-кодов!
            // Только длина для отладки UI (без значения!)
            // console.log(`[MFA Input] ${input.id}: длина=${filteredValue.length}`);
        }
        
        // Функция для обработки вставки
        function handleMFAPaste(e) {
            e.preventDefault();
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            const filteredText = pastedText.replace(/[^0-9]/g, '').substring(0, 6);
            e.target.value = filteredText;
            // БЕЗОПАСНОСТЬ: Не логируем значения MFA-кодов!
        }
        
        // Функция для блокировки некорректных клавиш
        function handleMFAKeyDown(e) {
            const allowedKeys = [
                'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
                'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
                'Home', 'End'
            ];
            
            // Разрешаем служебные клавиши
            if (allowedKeys.includes(e.key)) return;
            
            // Разрешаем Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
            if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())) return;
            
            // Блокируем всё кроме цифр
            if (!/^[0-9]$/.test(e.key)) {
                e.preventDefault();
                // Не логируем клавиши - неcritical
                return;
            }
            
            // Блокируем ввод больше 6 символов (кроме выделения и замены)
            const input = e.target;
            const hasSelection = input.selectionStart !== input.selectionEnd;
            if (input.value.length >= 6 && !hasSelection) {
                e.preventDefault();
                // Не логируем - неcritical
            }
        }
        
        // Привязываем обработчики к mfaCode
        elements.mfaCode.addEventListener('input', handleMFAInput);
        elements.mfaCode.addEventListener('paste', handleMFAPaste);
        elements.mfaCode.addEventListener('keydown', handleMFAKeyDown);
        
        // Привязываем обработчики к mfaSetupCode
        elements.mfaSetupCode.addEventListener('input', handleMFAInput);
        elements.mfaSetupCode.addEventListener('paste', handleMFAPaste);
        elements.mfaSetupCode.addEventListener('keydown', handleMFAKeyDown);
        
        console.log('✅ MFA input handlers initialized');
        
        elements.addProductBtn.addEventListener('click', openAddProductModal);
        elements.showInactive.addEventListener('change', (e) => {
            showInactive = e.target.checked;
            loadProducts();
        });
        
        elements.categoryFilters.addEventListener('click', (e) => {
            if (e.target.classList.contains('filter-chip')) {
                document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                e.target.classList.add('active');
                currentFilter = e.target.dataset.category;
                renderProducts();
                updateProductsCount();
            }
        });
        
        // Переключение вкладок Товары/Заказы
        document.querySelectorAll('.admin-nav-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const tab = this.dataset.tab;
                
                // Обновляем активную кнопку
                document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                
                // Показываем нужную панель
                const productsPanel = document.querySelector('.admin-main:not(#ordersPanel)');
                const ordersPanel = document.getElementById('ordersPanel');
                
                if (tab === 'products') {
                    if (productsPanel) productsPanel.hidden = false;
                    if (ordersPanel) ordersPanel.hidden = true;
                } else if (tab === 'orders') {
                    if (productsPanel) productsPanel.hidden = true;
                    if (ordersPanel) ordersPanel.hidden = false;
                    // Загружаем заказы
                    if (window.adminOrders) {
                        window.adminOrders.init();
                    }
                }
            });
        });
        
        // Фильтры заказов
        document.getElementById('ordersFilters')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('orders-filter-btn')) {
                const filter = e.target.dataset.filter;
                if (window.adminOrders) {
                    window.adminOrders.setFilter(filter);
                }
            }
        });
        
        // Поиск по заказам
        const ordersSearchInput = document.getElementById('ordersSearch');
        if (ordersSearchInput) {
            ordersSearchInput.addEventListener('input', debounce((e) => {
                if (window.adminOrders) {
                    window.adminOrders.setSearch(e.target.value);
                }
            }, 300));
        }
        
        // Закрытие модального окна заказа
        document.getElementById('orderModalClose')?.addEventListener('click', () => {
            document.getElementById('orderModal')?.classList.remove('is-visible');
        });
        
        document.getElementById('orderModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'orderModal') {
                e.target.classList.remove('is-visible');
            }
        });
        
        elements.productsTableBody.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const row = btn.closest('tr');
            const productId = row?.dataset.id;
            const action = btn.dataset.action;
            
            if (action === 'edit') openEditProductModal(productId);
            else if (action === 'toggle-active') toggleProductActive(productId);
        });
        
        elements.modalClose.addEventListener('click', () => closeModal(elements.productModal));
        elements.modalCancelBtn.addEventListener('click', () => closeModal(elements.productModal));
        elements.modalSaveBtn.addEventListener('click', saveProduct);
        elements.modalDeleteBtn.addEventListener('click', confirmDelete);
        
        elements.deleteModalClose.addEventListener('click', () => closeModal(elements.deleteModal));
        elements.deleteCancelBtn.addEventListener('click', () => closeModal(elements.deleteModal));
        elements.deleteConfirmBtn.addEventListener('click', deleteProduct);
        
        elements.imagePreview.addEventListener('click', () => elements.productImage.click());
        elements.uploadImageBtn.addEventListener('click', (e) => { e.preventDefault(); elements.productImage.click(); });
        elements.removeImageBtn.addEventListener('click', (e) => { e.preventDefault(); clearImagePreview(); });
        elements.productImage.addEventListener('change', handleImageUpload);
        
        elements.productModal.addEventListener('click', (e) => {
            if (e.target === elements.productModal) closeModal(elements.productModal);
        });
        elements.deleteModal.addEventListener('click', (e) => {
            if (e.target === elements.deleteModal) closeModal(elements.deleteModal);
        });
    }

    // ============================================================================
    // UI ФУНКЦИИ
    // ============================================================================

    function showLoginForm() {
        elements.loginPage.hidden = false;
        elements.adminPage.hidden = true;
        elements.configErrorPage.hidden = true;
        elements.loginForm.hidden = false;
        elements.mfaForm.classList.remove('is-visible');
        elements.mfaSetupForm.classList.remove('is-visible');
        hideLoginError();
        hideMFAError();
        hideMFASetupError();
    }


    function showMFASetupForm() {
        elements.loginForm.hidden = true;
        elements.mfaForm.classList.remove('is-visible');
        elements.mfaSetupForm.classList.add('is-visible');
        elements.mfaSetupCode.value = '';
        elements.mfaSetupCode.focus();
        // НЕ сбрасываем состояние QR-кода здесь - это делается в createNewMFAFactor()
        elements.mfaFactorsInfo.hidden = true;
    }

    function showMFASetupError(message) {
        elements.mfaSetupError.textContent = message;
        elements.mfaSetupError.hidden = false;
    }

    function hideMFASetupError() {
        elements.mfaSetupError.hidden = true;
    }

    function showMFAForm() {
        elements.loginForm.hidden = true;
        elements.mfaForm.classList.add('is-visible');
        elements.mfaCode.value = '';
        elements.mfaCode.focus();
    }

    function showAdminPanel() {
        elements.loginPage.hidden = true;
        elements.adminPage.hidden = false;
        elements.configErrorPage.hidden = true;
        
        // Показать email пользователя
        if (authState.user) {
            elements.adminEmail.textContent = authState.user.email;
        }
        
        // Загрузить товары
        loadProducts();
        
        // Инициализировать dashboard при первом входе
        if (window.adminDashboard && typeof window.adminDashboard.init === 'function') {
            // Небольшая задержка для завершения рендеринга
            setTimeout(() => {
                window.adminDashboard.init();
            }, 100);
        }
    }

    function showLoginError(message) {
        elements.loginError.textContent = message;
        elements.loginError.hidden = false;
    }

    function hideLoginError() {
        elements.loginError.hidden = true;
    }

    function showMFAError(message) {
        elements.mfaError.textContent = message;
        elements.mfaError.hidden = false;
    }

    function hideMFAError() {
        elements.mfaError.hidden = true;
    }
    
    // ============================================================================
    // ИСПРАВЛЕНО: Функция показа ошибки MFA с возможностью повтора
    // Используется при ошибках listFactors() вместо автоматического enroll()
    // ============================================================================
    
    function showMFAErrorWithRetry(message, errorType) {
        console.error('[MFA Error]', errorType, ':', message);
        
        // Показываем форму MFA с ошибкой и кнопкой повтора
        elements.loginForm.hidden = true;
        elements.mfaForm.classList.add('is-visible');
        elements.mfaSetupForm.classList.remove('is-visible');
        
        // Показываем ошибку
        showMFAError(message);
        
        // Показываем кнопку повтора
        if (elements.mfaRetryBtn) {
            elements.mfaRetryBtn.hidden = false;
            elements.mfaRetryBtn.textContent = 'Попробовать снова';
            // Сохраняем тип ошибки для обработчика
            elements.mfaRetryBtn.dataset.errorType = errorType;
        }
    }

    function showLoading(show) {
        elements.loadingOverlay.classList.toggle('is-visible', show);
    }

    function openModal(modal) {
        modal.classList.add('is-visible');
        document.body.style.overflow = 'hidden';
    }

    function closeModal(modal) {
        modal.classList.remove('is-visible');
        document.body.style.overflow = '';
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span>${escapeHtml(message)}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
        `;
        
        elements.toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 4000);
    }

    // ============================================================================
    // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // ============================================================================

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatPrice(price) {
        return price?.toLocaleString('ru-RU') + ' сум' || '0 сум';
    }

    function pluralize(n, one, few, many) {
        if (n % 10 === 1 && n % 100 !== 11) return one;
        if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return few;
        return many;
    }
    
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function getErrorMessage(error) {
        const messages = {
            'Invalid login credentials': 'Неверный email или пароль',
            'Email not confirmed': 'Email не подтверждён',
            'Invalid OTP': 'Неверный код',
            'MFA not enabled': 'MFA не настроена'
        };
        return messages[error] || error;
    }

    function generateProductId() {
        const maxId = products.reduce((max, p) => {
            const num = parseInt(p.id.replace('p', ''), 10);
            return num > max ? num : max;
        }, 0);
        return 'p' + (maxId + 1);
    }

    // ============================================================================
    // ЗАПУСК
    // ============================================================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();