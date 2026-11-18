/**
 * DUO STORE — Supabase Client
 * 
 * ИНИЦИАЛИЗАЦИЯ:
 * 1. Замените SUPABASE_URL на URL вашего проекта (https://xxxxx.supabase.co)
 * 2. Замените SUPABASE_ANON_KEY на публичный ключ из Dashboard → Settings → API
 * 
 * БЕЗОПАСНОСТЬ:
 * - Используйте ТОЛЬКО anon key (никогда не используйте service_role key на клиенте!)
 * - Убедитесь, что RLS-политики настроены на всех таблицах
 */

// ============================================================================
// КОНФИГУРАЦИЯ — ЗАПОЛНИТЕ ЭТИ ЗНАЧЕНИЯ
// ============================================================================

const SUPABASE_URL = 'https://bsmjppsvpmthyecvovhv.supabase.co';  // Project URL из Supabase
const SUPABASE_ANON_KEY = 'sb_publishable_YQZZBGNIQiFAYoEnSuD27A_Tbsy2Wjn';  // Anon key из Supabase

// ============================================================================
// ПРОВЕРКА КОНФИГУРАЦИИ
// ============================================================================

if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
    console.error('❌ Supabase не настроен! Заполните SUPABASE_URL и SUPABASE_ANON_KEY в js/supabaseClient.js');
}

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ КЛИЕНТА
// ============================================================================

// Загружаем Supabase JS SDK из CDN
const supabaseGuest = document.currentScript?.hasAttribute('data-guest') === true;
const supabaseScript = document.createElement('script');
supabaseScript.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
let supabaseFailed = false;
function signalSupabaseError() {
    supabaseFailed = true;
    window.dispatchEvent(new Event('supabaseUnavailable'));
}
supabaseScript.onload = function() {
    // Инициализируем клиент
    try { window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            autoRefreshToken: !supabaseGuest,
            persistSession: !supabaseGuest,
            detectSessionInUrl: !supabaseGuest,
            storage: supabaseGuest ? undefined : window.localStorage
        }
    }); } catch { signalSupabaseError(); return; }
    
    console.log('✅ Supabase клиент инициализирован');
    
    // Отправляем событие готовности
    window.dispatchEvent(new CustomEvent('supabaseReady'));
};
supabaseScript.onerror = function() {
    signalSupabaseError();
    console.error('❌ Ошибка загрузки Supabase SDK');
};
document.head.appendChild(supabaseScript);

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Проверить, готов ли Supabase клиент
 */
function isSupabaseReady() {
    return typeof window.supabase?.from === 'function';
}

/**
 * Дождаться готовности Supabase клиента
 */
function waitForSupabase(timeout = 8000) {
    if (isSupabaseReady()) return Promise.resolve(window.supabase);
    if (supabaseFailed) return Promise.reject(new Error('Supabase unavailable'));
    return new Promise((resolve, reject) => {
        const timer = setTimeout(fail, timeout);
        function finish() {
            clearTimeout(timer);
            window.removeEventListener('supabaseReady', ready);
            window.removeEventListener('supabaseUnavailable', fail);
        }
        function ready() { finish(); resolve(window.supabase); }
        function fail() { finish(); reject(new Error('Supabase unavailable')); }
        window.addEventListener('supabaseReady', ready);
        window.addEventListener('supabaseUnavailable', fail);
    });
}

// Экспорт для использования в admin.js
window.waitForSupabase = waitForSupabase;
window.isSupabaseReady = isSupabaseReady;
