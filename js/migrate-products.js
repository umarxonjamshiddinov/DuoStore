/**
 * DUO STORE - Migration Script
 * Миграция товаров из script.js в Supabase
 * 
 * Запуск: откройте консоль браузера на странице админки и выполните:
 * await migrateProductsToSupabase()
 */

(function() {
    'use strict';
    
    // ============================================================================
    // РЕЗЕРВНАЯ КОПИЯ ТОВАРОВ (из script.js на момент миграции)
    // ============================================================================
    
    const PRODUCTS_BACKUP = [
        {id:"p1",name:"Tommy Hilfiger",cat:"Одежда",meta:"Все размеры",price:70000,badge:"new",image:"images/photos/photo_1@09-05-2026_19-14-32.jpg"},
        {id:"p2",name:"Gymshark",cat:"Одежда",meta:"Все размеры",price:200000,badge:"new",image:"images/photos/photo_3@09-05-2026_19-24-37.jpg"},
        {id:"p3",name:"Polo Ralph Lauren",cat:"Одежда",meta:"Все размеры",price:250000,badge:"new",image:"images/photos/photo_5@17-05-2026_17-26-24.jpg"},
        {id:"p4",name:"Polo Ralph Lauren",cat:"Одежда",meta:"Все размеры",price:70000,badge:"new",image:"images/photos/photo_7@20-05-2026_17-08-25.jpg"},
        {id:"p5",name:"Shorts",cat:"Шорты",meta:"M, L, XL, 2XL 3XL",price:99000,badge:"new",image:"images/photos/photo_10@11-06-2026_17-08-38.jpg"},
        {id:"p6",name:"Miami x Bape",cat:"Одежда",meta:"XS, S, M, L, XL-6XL",price:79000,badge:"new",image:"images/photos/photo_13@11-06-2026_17-16-21.jpg"},
        {id:"p7",name:"Nike Dunk Low",cat:"Обувь",meta:"35, 36, 37, 38, 39, 40, 41, 42, 43, 44",price:299000,badge:"new",image:"images/photos/photo_16@12-06-2026_00-40-14.jpg"},
        {id:"p8",name:"Genius",cat:"Одежда",meta:"S-6XL",price:79000,badge:"new",image:"images/photos/photo_27@21-06-2026_02-00-39.jpg"},
        {id:"p9",name:"Gymshark",cat:"Одежда",meta:"M-3XL",price:79000,badge:"new",image:"images/photos/photo_32@22-06-2026_11-47-21.jpg"},
        {id:"p10",name:"Gymshark",cat:"Одежда",meta:"S-3XL",price:89000,badge:"new",image:"images/photos/photo_39@22-06-2026_15-14-45.jpg"},
        {id:"p11",name:"Clutch",cat:"Сумки",meta:"4, 5",price:67777,badge:null,image:"images/photos/photo_40@22-06-2026_19-09-32.jpg"},
        {id:"p12",name:"Corteiz",cat:"Одежда",meta:"Все размеры",price:59000,badge:null,image:"images/photos/photo_52@27-06-2026_22-22-49.jpg"},
        {id:"p13",name:"Shorts",cat:"Шорты",meta:"M-5XL",price:89000,badge:null,image:"images/photos/photo_61@30-06-2026_18-38-14.jpg"},
        {id:"p14",name:"Look",cat:"Одежда",meta:"S-2XL",price:299000,badge:null,image:"images/photos/photo_66@22-07-2026_23-57-17.jpg"},
        {id:"p15",name:"Лук",cat:"Одежда",meta:"S-2XL",price:269000,badge:null,image:"images/photos/photo_70@23-07-2026_16-51-52.jpg"},
        {id:"p16",name:"Кроссовки",cat:"Обувь",meta:"35-47",price:499000,badge:null,image:"images/photos/photo_75@24-07-2026_20-46-52.jpg"},
        {id:"p17",name:"Adidas",cat:"Одежда",meta:"M-6XL",price:299000,badge:null,image:"images/photos/photo_76@29-07-2026_14-25-39.jpg"},
        {id:"p18",name:"Nike Dunk Low",cat:"Обувь",meta:"36-44",price:289000,badge:null,image:"images/photos/photo_78@29-07-2026_15-31-42.jpg"},
        {id:"p19",name:"Идеальный Лук На Жаркое",cat:"Одежда",meta:"S-2XL",price:249000,badge:null,image:"images/photos/photo_79@29-07-2026_23-20-18.jpg"},
        {id:"p20",name:"Y2K",cat:"Одежда",meta:"S-5XL",price:269000,badge:null,image:"images/photos/photo_82@30-07-2026_10-05-44.jpg"},
        {id:"p21",name:"Gym",cat:"Одежда",meta:"Все размеры",price:279000,badge:null,image:"images/photos/photo_85@03-08-2026_16-47-31.jpg"},
        {id:"p22",name:"Лук",cat:"Одежда",meta:"S-3XL",price:279000,badge:null,image:"images/photos/photo_88@04-08-2026_12-03-53.jpg"},
        {id:"p23",name:"Лук",cat:"Одежда",meta:"S-3XL",price:225000,badge:null,image:"images/photos/photo_89@06-08-2026_22-46-27.jpg"},
        {id:"p24",name:"Polo Ralph Lauren",cat:"Обувь",meta:"38-45",price:300000,badge:null,image:"images/photos/photo_91@06-08-2026_22-58-26.jpg"},
        {id:"p25",name:"Кроссовки",cat:"Обувь",meta:"35-47",price:499000,badge:null,image:"images/photos/photo_97@09-08-2026_01-06-27.jpg"},
        {id:"p26",name:"Essentials",cat:"Одежда",meta:"Все размеры",price:249000,badge:null,image:"images/photos/photo_101@09-08-2026_11-33-11.jpg"},
        {id:"p27",name:"T",cat:"Одежда",meta:"S-3XL",price:89000,badge:null,image:"images/photos/photo_106@10-08-2026_00-27-19.jpg"},
        ,
        {id:"p59",name:"Lining",cat:"Обувь",meta:"39-46",price:600000,badge:null,image:"images/photos/photo_225@14-09-2026_19-20-30.jpg"},
        {id:"p60",name:"Crocs",cat:"Обувь",meta:"36-45",price:250000,badge:null,image:"images/photos/photo_230@18-09-2026_21-27-10.jpg"},
        {id:"p61",name:"Bape",cat:"Обувь",meta:"36-45",price:260000,badge:null,image:"images/photos/photo_231@18-09-2026_21-28-55.jpg"},
        {id:"p62",name:"Casual",cat:"Одежда",meta:"Все размеры",price:190000,badge:null,image:"images/photos/photo_213@11-09-2026_15-20-43.jpg"},
        {id:"p68",name:"Lining",cat:"Обувь",meta:"39-46",price:650000,badge:null,image:"images/photos/photo_236@23-09-2026_07-51-13.jpg"},
        {id:"p69",name:"Cardigan",cat:"Одежда",meta:"Все размеры",price:270000,badge:null,image:"images/photos/photo_238@27-09-2026_12-54-40.jpg"},
        {id:"p70",name:"Cardigan",cat:"Одежда",meta:"Все размеры",price:210000,badge:null,image:"images/photos/photo_239@29-09-2026_09-42-53.jpg"},
        {id:"p71",name:"Loro Piana",cat:"Куртки",meta:"Все размеры",price:280000,badge:null,image:"images/photos/photo_242@29-09-2026_22-05-09.jpg"},
        {id:"p72",name:"Moncler",cat:"Одежда",meta:"Все размеры",price:410000,badge:null,image:"images/photos/photo_247@29-09-2026_22-25-53.jpg"},
        {id:"p73",name:"Maison",cat:"Обувь",meta:"39-47",price:650000,badge:null,image:"images/photos/photo_250@30-09-2026_22-48-12.jpg"},
        {id:"p74",name:"Skechers",cat:"Обувь",meta:"39-47",price:1050000,badge:null,image:"images/photos/photo_257@03-10-2026_21-13-17.jpg"},
        {id:"p75",name:"Thenorthface",cat:"Обувь",meta:"36-45",price:570000,badge:null,image:"images/photos/photo_258@05-10-2026_22-05-18.jpg"},
        {id:"p76",name:"Dior",cat:"Одежда",meta:"Все размеры",price:280000,badge:null,image:"images/photos/photo_266@07-10-2026_14-57-06.jpg"},
        {id:"p77",name:"Loro Piana",cat:"Куртки",meta:"M-3XL",price:320000,badge:null,image:"images/photos/photo_267@07-10-2026_20-11-47.jpg"},
        {id:"p78",name:"Polo Ralph Lauren",cat:"Одежда",meta:"S-3XL",price:290000,badge:null,image:"images/photos/photo_272@07-10-2026_20-15-16.jpg"},
        {id:"p79",name:"Moncler",cat:"Одежда",meta:"Все размеры",price:380000,badge:null,image:"images/photos/photo_273@09-10-2026_13-13-15.jpg"},
        {id:"p80",name:"Moncler",cat:"Одежда",meta:"Все размеры",price:180000,badge:null,image:"images/photos/photo_274@26-10-2026_15-24-11.jpg"},
        {id:"p81",name:"Dimejeans",cat:"Одежда",meta:"S-2XL",price:190000,badge:null,image:"images/photos/photo_276@26-10-2026_16-36-06.jpg"},
        {id:"p82",name:"Polo Ralph Lauren",cat:"Одежда",meta:"Все размеры",price:300000,badge:null,image:"images/photos/photo_280@27-10-2026_22-58-28.jpg"},
        {id:"p83",name:"Saber",cat:"Обувь",meta:"41",price:740000,badge:null,image:"images/photos/photo_283@03-11-2026_23-15-44.jpg"},
        {id:"p84",name:"Шапки Которые Согреют Твою Гол",cat:"Одежда",meta:"Все размеры",price:65000,badge:null,image:"images/photos/photo_290@05-11-2026_14-06-58.jpg"},
        {id:"p85",name:"Loro Piana",cat:"Куртки",meta:"L-4XL",price:385000,badge:null,image:"images/photos/photo_291@14-11-2026_14-14-49.jpg"}
    ];
    
    // Флаг, что миграция уже выполнена (хранится в localStorage)
    const MIGRATION_FLAG = 'duo_migration_completed';
    
    /**
     * Основная функция миграции товаров в Supabase
     */
    window.migrateProductsToSupabase = async function(productsArray) {
        if (typeof window.supabase === 'undefined') {
            console.error('[Migration] Supabase не инициализирован');
            return { success: false, error: 'Supabase not initialized' };
        }
        
        const products = productsArray || PRODUCTS_BACKUP;
        if (!products || products.length === 0) {
            console.error('[Migration] Нет товаров для миграции');
            return { success: false, error: 'No products to migrate' };
        }
        
        if (localStorage.getItem(MIGRATION_FLAG) === 'true') {
            console.log('[Migration] Миграция уже выполнена. Пропускаем.');
            console.log('[Migration] Для повтора: resetMigrationFlag(); await migrateProductsToSupabase()');
            return { success: true, message: 'Migration already completed', skipped: true };
        }
        
        console.log(`[Migration] Начинаем миграцию ${products.length} товаров...`);
        
        try {
            // Получаем существующие ID
            const { data: existingProducts, error: fetchError } = await window.supabase
                .from('products').select('id');
            
            if (fetchError) {
                console.error('[Migration] Ошибка:', fetchError);
                return { success: false, error: fetchError };
            }
            
            const existingIds = new Set(existingProducts ? existingProducts.map(p => p.id) : []);
            console.log(`[Migration] Найдено ${existingIds.size} существующих товаров`);
            
            // Фильтруем новые
            const newProducts = products.filter(p => !existingIds.has(p.id));
            
            if (newProducts.length === 0) {
                console.log('[Migration] Все товары уже в БД');
                localStorage.setItem(MIGRATION_FLAG, 'true');
                return { success: true, total: products.length, existing: existingIds.size, added: 0 };
            }
            
            console.log(`[Migration] ${newProducts.length} новых товаров для добавления`);
            
            // Преобразуем для Supabase
            const supabaseProducts = newProducts.map(p => ({
                id: p.id, name: p.name, cat: p.cat, meta: p.meta,
                price: p.price, badge: p.badge || null,
                image_url: p.image || p.image_url || null, is_active: true
            }));
            
            // Вставляем пачками
            let insertedCount = 0, allInserted = [];
            for (let i = 0; i < supabaseProducts.length; i += 50) {
                const batch = supabaseProducts.slice(i, i + 50);
                const { data, error } = await window.supabase.from('products').insert(batch).select();
                if (error) {
                    console.error('[Migration] Ошибка вставки:', error);
                    return { success: false, error: error, insertedCount };
                }
                if (data) { insertedCount += data.length; allInserted = allInserted.concat(data); }
            }
            
            localStorage.setItem(MIGRATION_FLAG, 'true');
            console.log(`[Migration] ✅ Успешно мигрировано ${insertedCount} товаров!`);
            return { success: true, total: products.length, existing: existingIds.size, added: insertedCount, data: allInserted };
        } catch (e) {
            console.error('[Migration] Исключение:', e);
            return { success: false, error: e };
        }
    };
    
    // Сбросить флаг миграции
    window.resetMigrationFlag = function() {
        localStorage.removeItem(MIGRATION_FLAG);
        console.log('[Migration] Флаг миграции сброшен');
    };
    
    // Автоматическая миграция при наличии авторизации
    window.autoMigrateProducts = async function() {
        if (typeof window.supabase === 'undefined') {
            window.addEventListener('supabaseReady', runAutoMigration, { once: true });
        } else {
            runAutoMigration();
        }
    };
    
    async function runAutoMigration() {
        try {
            const { data: { session } } = await window.supabase.auth.getSession();
            if (!session) { console.log('[Migration] Не авторизован'); return; }
            if (localStorage.getItem(MIGRATION_FLAG) === 'true') { console.log('[Migration] Уже мигрировано'); return; }
            
            const result = await window.migrateProductsToSupabase();
            if (result.success && result.added > 0) console.log(`[Migration] ✅ Добавлено ${result.added} товаров`);
        } catch (e) { console.warn('[Migration] Ошибка:', e); }
    }
    
    window.autoMigrateProducts();
    
    console.log('[Migration] Скрипт загружен. Команды: await migrateProductsToSupabase(), resetMigrationFlag()');
    
})();
