// ============================================================
// api.js — сервисный слой данных. Все обращения к меню и заказам
// идут ТОЛЬКО через объект `api` — остальные файлы (menu.js, main.js)
// не должны знать, откуда именно приходят данные: из локальной
// заглушки (data.js) или из настоящей базы Supabase.
//
// Порядок подключения в index.html: config.js -> data.js -> api.js -> ...
// ============================================================

// Переключатель источника данных:
//   false — берём меню из data.js, заказ просто логируется (как сейчас)
//   true  — реальные запросы к Supabase (включить, когда БД будет готова)
const USE_SUPABASE = false;

// --- Настройки Supabase (заполнить при подключении) --------------
// 1. Зарегистрируйся на https://supabase.com и создай проект
// 2. Project Settings -> API -> скопируй сюда Project URL и anon public key
// 3. Подключи библиотеку supabase-js в index.html ДО этого файла, например:
//      <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';   // TODO: вставить Project URL
const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';           // TODO: вставить anon public key

let supabaseClient = null;
if (USE_SUPABASE && typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * Возвращает меню в виде массива категорий — в том же формате,
 * что и сейчас в data.js (category, items[], hasVariants/hasSizePicker и т.п.).
 *
 * Сейчас: заглушка, отдаёт то, что уже загружено из data.js.
 * После подключения Supabase: реальный запрос к таблицам категорий/товаров.
 */
async function getMenu() {
    if (!USE_SUPABASE) {
        // Заглушка — данные уже загружены глобально из data.js
        return typeof menuData !== 'undefined' ? menuData : [];
    }

    // --- Реальный запрос к Supabase (пример, подстроить под свою схему БД) ---
    // Ожидается таблица "categories", у каждой категории — связанные "items".
    // TODO: заменить 'categories'/'items' на реальные имена таблиц/полей,
    // когда будет спроектирована схема БД.
    try {
        const { data, error } = await supabaseClient
            .from('categories')
            .select('*, items(*)')
            .order('sort_order', { ascending: true });

        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Ошибка загрузки меню из Supabase:', err);
        return [];
    }
}

/**
 * Отправляет готовый заказ.
 *
 * Сейчас: просто выводит заказ в консоль (заглушка).
 * После подключения Supabase: запишет заказ в таблицу "orders".
 *
 * @param {Object} orderData — { items, totalFoodPrice, containersCost,
 *                                deliveryCost, finalTotal, orderType,
 *                                point, address, createdAt }
 */
async function placeOrder(orderData) {
    if (!USE_SUPABASE) {
        console.log('[placeOrder] Заглушка — заказ пока не отправляется в БД:', orderData);
        return { success: true, id: 'local-' + Date.now() };
    }

    // --- Реальная отправка заказа в Supabase (пример) -----------------------
    // TODO: заменить 'orders' на реальное имя таблицы, когда будет готова схема БД.
    try {
        const { data, error } = await supabaseClient
            .from('orders')
            .insert([orderData])
            .select()
            .single();

        if (error) throw error;
        return { success: true, id: data.id };
    } catch (err) {
        console.error('Ошибка отправки заказа в Supabase:', err);
        return { success: false, error: err.message };
    }
}

// Единая точка доступа для остальных файлов: api.getMenu(), api.placeOrder(...)
const api = {
    getMenu,
    placeOrder
};
