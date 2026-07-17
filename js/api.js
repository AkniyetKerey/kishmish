// ============================================================
// api.js — сервисный слой данных. Все обращения к меню и заказам
// идут ТОЛЬКО через объект `api` — остальные файлы (menu.js, main.js,
// admin.js) не должны знать, откуда именно приходят данные: из
// локальной заглушки (data.js + localStorage) или из настоящей базы Supabase.
//
// Порядок подключения в index.html / admin.html:
//   config.js -> data.js -> api.js -> ...
// ============================================================

// Переключатель источника данных:
//   false — берём меню из data.js / localStorage (как сейчас)
//   true  — реальные запросы к Supabase (включить, когда БД будет готова)
const USE_SUPABASE = false;

// --- Настройки Supabase (заполнить при подключении) --------------
// 1. Зарегистрируйся на https://supabase.com и создай ОДИН проект
//    (у каждого филиала — своя строка в таблицах, а не свой проект,
//    см. поле branch ниже)
// 2. Project Settings -> API -> скопируй сюда Project URL и anon public key
// 3. Подключи библиотеку supabase-js в index.html/admin.html ДО этого файла:
//      <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';   // TODO: вставить Project URL
const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';           // TODO: вставить anon public key

let supabaseClient = null;
if (USE_SUPABASE && typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// --- Меню по филиалам (локальная заглушка) ------------------------
// У каждого филиала — своё меню. Сейчас реальные данные есть только
// для точки 27-71 (взяты из data.js) — остальные два места уже готовы,
// просто пока пустые. Как заполнить:
//   1) через админку (admin.html) — категории/товары сохранятся в
//      localStorage и сразу же появятся в этом филиале;
//   2) либо вручную, прописав сюда второй/третий массив категорий
//      (в том же формате, что и в data.js).
const MENU_BY_BRANCH = {
    '27-71': typeof menuData !== 'undefined' ? menuData : [],
    '28-63': [], // TODO: меню для этой точки ещё не заполнено
    '17-95': []  // TODO: меню для этой точки ещё не заполнено
};

// Ключ localStorage, под которым хранятся правки из админки (per-branch)
const ADMIN_MENU_PREFIX = 'kishMishAdminMenu:';

/** Текущий выбранный филиал (тот же, что видит посетитель сайта) */
function getCurrentBranch() {
    try {
        return localStorage.getItem(STORAGE_KEYS.branch) || BRANCHES[0];
    } catch (e) {
        return BRANCHES[0];
    }
}

/**
 * Возвращает меню (массив категорий) для указанного филиала.
 * Если branch не передан — берёт филиал, который сейчас выбран у посетителя.
 *
 * Сейчас: сначала смотрит, не было ли правок из админки (localStorage),
 * если нет — отдаёт дефолтные данные из MENU_BY_BRANCH.
 * После подключения Supabase: реальный запрос с фильтром по branch.
 */
async function getMenu(branch) {
    const targetBranch = branch || getCurrentBranch();

    if (!USE_SUPABASE) {
        try {
            const stored = localStorage.getItem(ADMIN_MENU_PREFIX + targetBranch);
            if (stored) return JSON.parse(stored);
        } catch (e) {
            console.error('Не удалось прочитать сохранённое меню из localStorage:', e);
        }
        return MENU_BY_BRANCH[targetBranch] || [];
    }

    // --- Реальный запрос к Supabase (пример, подстроить под свою схему БД) ---
    // Ожидается таблица "categories" (с полем branch) и связанные "items".
    // TODO: заменить 'categories'/'items' на реальные имена таблиц/полей.
    try {
        const { data, error } = await supabaseClient
            .from('categories')
            .select('*, items(*)')
            .eq('branch', targetBranch)
            .order('sort_order', { ascending: true });

        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Ошибка загрузки меню из Supabase:', err);
        return [];
    }
}

/**
 * Сохраняет меню (весь массив категорий) для указанного филиала.
 * Используется админкой (admin.html) при добавлении/редактировании/удалении
 * категорий и товаров.
 *
 * Сейчас: пишет в localStorage (доступно сразу же на сайте после обновления).
 * После подключения Supabase: будет делать upsert категорий/товаров в БД.
 */
async function saveMenu(branch, categories) {
    if (!USE_SUPABASE) {
        try {
            localStorage.setItem(ADMIN_MENU_PREFIX + branch, JSON.stringify(categories));
            return { success: true };
        } catch (err) {
            console.error('Ошибка сохранения меню в localStorage:', err);
            return { success: false, error: err.message };
        }
    }

    // --- Реальное сохранение в Supabase (пример) -----------------------------
    // TODO: реализовать под свою схему — обычно это delete+insert категорий
    // и товаров для филиала, либо upsert по id.
    try {
        const { error } = await supabaseClient
            .from('categories')
            .upsert(categories.map(c => ({ ...c, branch })));

        if (error) throw error;
        return { success: true };
    } catch (err) {
        console.error('Ошибка сохранения меню в Supabase:', err);
        return { success: false, error: err.message };
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

// Единая точка доступа для остальных файлов: api.getMenu(), api.saveMenu(), api.placeOrder()
const api = {
    getMenu,
    saveMenu,
    placeOrder
};
