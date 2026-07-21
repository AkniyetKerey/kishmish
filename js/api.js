// ============================================================
// api.js — сервисный слой данных. Все обращения к меню и заказам
// идут ТОЛЬКО через объект `api` — остальные файлы (menu.js, main.js,
// admin.js) не должны знать, откуда именно приходят данные: из
// локальной заглушки (data.js + localStorage) или из настоящей базы Supabase.
//
// Порядок подключения в index.html / admin.html:
//   config.js -> data.js -> api.js -> ...
// (при USE_SUPABASE = true перед этим файлом также нужен supabase-js,
//  см. комментарий ниже)
// ============================================================

// Переключатель источника данных:
//   false — берём меню из data.js / localStorage (локальная заглушка)
//   true  — реальные запросы к Supabase
const USE_SUPABASE = true;

// --- Настройки Supabase --------------------------------------------
const SUPABASE_URL = 'https://fzeizdeovbsslmkhgbfl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-cC76ikakA2mTdRZdtXjmw_dEbm-T_i';

let supabaseClient = null;
if (USE_SUPABASE && typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Пока что у всех точек одинаковое меню (общая база на все филиалы).
// Когда меню начнёт отличаться по точкам — просто поставь false,
// и всё, что уже заложено (branch у каждой записи, MENU_BY_BRANCH,
// отдельное хранение per-branch — и в localStorage, и в Supabase),
// заработает само, без переписывания кода.
const SHARE_MENU_ACROSS_BRANCHES = true;

// --- Меню по филиалам (локальная заглушка, когда USE_SUPABASE = false) ---
// На заметку: то меню, что сейчас в data.js — это реальные данные точки
// 28-63, а не 27-71. Пока SHARE_MENU_ACROSS_BRANCHES = true, это не важно —
// оно используется как общее меню для всех точек.
const MENU_BY_BRANCH = {
    shared: typeof menuData !== 'undefined' ? menuData : [], // общее меню (пока используется для всех точек)
    '27-71': [], // TODO: когда меню начнёт отличаться — заполнить сюда
    '28-63': [], // TODO: когда меню начнёт отличаться — заполнить сюда
    '17-95': []  // TODO: когда меню начнёт отличаться — заполнить сюда
};

// Ключ localStorage, под которым хранятся правки из админки (per-branch), пока USE_SUPABASE = false
const ADMIN_MENU_PREFIX = 'kishMishAdminMenu:';

/** Текущий выбранный филиал (тот же, что видит посетитель сайта) */
function getCurrentBranch() {
    try {
        return localStorage.getItem(STORAGE_KEYS.branch) || BRANCHES[0];
    } catch (e) {
        return BRANCHES[0];
    }
}

/** Ключ/значение branch, под которым реально хранится/читается меню — либо общее, либо per-branch */
function resolveStorageBranch(branch) {
    return SHARE_MENU_ACROSS_BRANCHES ? 'shared' : (branch || getCurrentBranch());
}

/**
 * Возвращает меню (массив категорий) для указанного филиала, в ТОМ ЖЕ формате,
 * что и data.js: [{ category, hasVariants?, hasSizePicker?, volumes?, items?, products? }, ...]
 * Если branch не передан — берёт филиал, который сейчас выбран у посетителя.
 */
async function getMenu(branch) {
    const targetBranch = resolveStorageBranch(branch);

    if (!USE_SUPABASE) {
        try {
            const stored = localStorage.getItem(ADMIN_MENU_PREFIX + targetBranch);
            if (stored) return JSON.parse(stored);
        } catch (e) {
            console.error('Не удалось прочитать сохранённое меню из localStorage:', e);
        }
        return MENU_BY_BRANCH[targetBranch] || [];
    }

    // Бесплатный проект Supabase может "засыпать" при простое — первый запрос
    // после паузы иногда не успевает/срывается, а повторный уже проходит
    // нормально. Поэтому при неудаче пробуем ещё раз один раз перед тем,
    // как показать пустое меню.
    try {
        return await fetchMenuFromSupabase(targetBranch);
    } catch (err) {
        console.error('Ошибка загрузки меню из Supabase, пробуем ещё раз через 1.5с:', err);
        await new Promise(resolve => setTimeout(resolve, 1500));
        try {
            return await fetchMenuFromSupabase(targetBranch);
        } catch (err2) {
            console.error('Повторная попытка загрузки меню тоже не удалась:', err2);
            return [];
        }
    }
}

async function fetchMenuFromSupabase(targetBranch) {
    const { data: cats, error: catError } = await supabaseClient
        .from('categories')
        .select('*')
        .eq('branch', targetBranch)
        .order('sort_order', { ascending: true });
    if (catError) throw catError;

    if (cats.length === 0) return [];

    // Дальше — ВСЕГО 2 запроса суммарно (а не по одному на каждую категорию).
    // При 27+ категориях запрос "по одной" делал бы 28+ последовательных
    // запросов подряд — это медленно и на нестабильном соединении может
    // выглядеть так, будто меню "то появляется, то пропадает".
    const catIds = cats.map(c => c.id);

    const { data: allItems, error: itemsError } = await supabaseClient
        .from('items')
        .select('*')
        .in('category_id', catIds);
    if (itemsError) throw itemsError;

    const { data: allProducts, error: prodError } = await supabaseClient
        .from('products')
        .select('*, product_sizes(*)')
        .in('category_id', catIds);
    if (prodError) throw prodError;

    return cats.map(cat => {
        const category = { category: cat.category };
        if (cat.has_variants) category.hasVariants = true;
        if (cat.has_size_picker) category.hasSizePicker = true;
        if (cat.volumes) category.volumes = cat.volumes;

        if (cat.has_size_picker) {
            const products = allProducts.filter(p => p.category_id === cat.id);

            category.products = products.map(p => ({
                name: p.name,
                frozen: p.frozen,
                sizes: (p.product_sizes || [])
                    .slice()
                    .sort((a, b) => a.id - b.id)
                    .map(s => ({ id: s.id, volume: s.volume, price: s.price }))
            }));

            // Плоский список для корзины/оформления заказа (как в data.js)
            category.items = products.flatMap(p =>
                (p.product_sizes || []).map(s => ({
                    id: s.id,
                    name: `${p.name} (${s.volume})`,
                    price: s.price,
                    description: '',
                    frozen: p.frozen
                }))
            );
        } else {
            const items = allItems.filter(i => i.category_id === cat.id);

            category.items = items.map(i => {
                const item = {
                    id: i.id,
                    name: i.name,
                    price: i.price,
                    description: i.description || '',
                    frozen: i.frozen
                };
                if (i.volume) item.volume = i.volume;
                if (i.flavor) item.flavor = i.flavor;
                if (i.group_name) item.group = i.group_name;
                return item;
            });
        }

        return category;
    });
}

/**
 * Сохраняет меню (весь массив категорий) для указанного филиала.
 * Используется админкой (admin.html) при добавлении/редактировании/удалении
 * категорий и товаров.
 */
async function saveMenu(branch, categories) {
    const targetBranch = resolveStorageBranch(branch);

    if (!USE_SUPABASE) {
        try {
            localStorage.setItem(ADMIN_MENU_PREFIX + targetBranch, JSON.stringify(categories));
            return { success: true };
        } catch (err) {
            console.error('Ошибка сохранения меню в localStorage:', err);
            return { success: false, error: err.message };
        }
    }

    // --- Реальное сохранение в Supabase -----------------------------------
    // Вызываем ОДНУ хранимую функцию replace_branch_menu (см. supabase/functions.sql),
    // которая делает удаление старых данных + вставку новых ВНУТРИ ОДНОЙ
    // транзакции на стороне базы. Это принципиально надёжнее, чем несколько
    // последовательных запросов из браузера: раньше, если что-то обрывалось
    // на середине (медленный интернет, "холодный старт" бесплатного проекта
    // Supabase после простоя, повторный клик), часть данных успевала
    // записаться, а часть нет — отсюда были дубли категорий и товары,
    // ссылающиеся на уже не существующую категорию. Транзакция в БД делает
    // такое в принципе невозможным: либо сохранится ВСЁ, либо ничего.
    try {
        const { error } = await supabaseClient.rpc('replace_branch_menu', {
            target_branch: targetBranch,
            payload: categories
        });
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
 * @param {Object} orderData — { items, totalFoodPrice, containersCost,
 *                                deliveryCost, finalTotal, orderType,
 *                                point, address, createdAt }
 */
async function placeOrder(orderData) {
    if (!USE_SUPABASE) {
        console.log('[placeOrder] Заглушка — заказ пока не отправляется в БД:', orderData);
        return { success: true, id: 'local-' + Date.now() };
    }

    // --- Реальная отправка заказа в Supabase -------------------------------
    try {
        const { data, error } = await supabaseClient
            .from('orders')
            .insert({
                branch: orderData.point || getCurrentBranch(),
                order_type: orderData.orderType,
                point: orderData.point,
                address: orderData.address,
                items: orderData.items,
                total_food_price: orderData.totalFoodPrice,
                containers_cost: orderData.containersCost,
                delivery_cost: orderData.deliveryCost,
                final_total: orderData.finalTotal
            })
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
