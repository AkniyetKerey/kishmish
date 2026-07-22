// ============================================================
// admin.js — админка меню: полный CRUD категорий и товаров,
// с переключением между филиалами (у каждого — своё меню).
// Все чтения/записи идут через api.getMenu() / api.saveMenu()
// (см. api.js) — сейчас это localStorage-заглушка, после
// подключения Supabase этот файл менять не придётся.
// ============================================================

let currentBranch = BRANCHES[0];
let categories = [];
let isSaving = false; // защита от повторного/параллельного сохранения (см. persistAndRender)

const root = document.getElementById('admin-root');

// Предупреждаем при попытке закрыть/обновить страницу во время сохранения —
// именно преждевременная перезагрузка страницы посреди долгого сохранения
// и порождала повторные/параллельные запуски миграции в прошлый раз.
window.addEventListener('beforeunload', (e) => {
    if (isSaving) {
        e.preventDefault();
        e.returnValue = '';
    }
});

/** Генерирует достаточно уникальный id для нового товара */
function generateId() {
    return Date.now() + Math.floor(Math.random() * 1000);
}

/**
 * Сохраняет текущее состояние categories для currentBranch и перерисовывает экран.
 *
 * Пока идёт сохранение — isSaving = true, и все действия (добавить/удалить/
 * заморозить и т.п.) блокируются с понятным сообщением. Раньше без этой
 * защиты нетерпеливый повторный клик по кнопке во время долгого сохранения
 * запускал ВТОРОЕ параллельное сохранение, и они начинали мешать друг другу
 * (одно удаляло то, что другое только что вставило) — отсюда были ошибки
 * 409 Conflict и задвоенные категории.
 */
async function persistAndRender() {
    if (isSaving) {
        alert('Сохранение уже идёт, подождите несколько секунд и попробуйте снова.');
        return;
    }

    isSaving = true;
    renderSavingOverlay();

    const result = await api.saveMenu(currentBranch, categories);

    isSaving = false;

    if (!result.success) {
        alert('Не удалось сохранить: ' + (result.error || 'неизвестная ошибка'));
    }
    render();
}

/** Показывает простой индикатор "идёт сохранение" поверх админки */
function renderSavingOverlay() {
    root.innerHTML = '<p class="admin-empty-hint">💾 Сохраняем изменения, не закрывайте страницу...</p>';
}

/** Переключение филиала в админке */
async function switchBranch(branch) {
    if (isSaving) {
        alert('Дождитесь окончания сохранения перед переключением филиала.');
        return;
    }
    currentBranch = branch;
    renderSavingOverlay();
    categories = await api.getMenu(branch);
    render();
}

// ---- Категории -----------------------------------------------------

function addCategory() {
    const name = prompt('Название новой категории:');
    if (!name || !name.trim()) return;

    categories.push({ category: name.trim(), items: [] });
    persistAndRender();
}

function renameCategory(catIndex) {
    const name = prompt('Новое название категории:', categories[catIndex].category);
    if (!name || !name.trim()) return;

    categories[catIndex].category = name.trim();
    persistAndRender();
}

function deleteCategory(catIndex) {
    const cat = categories[catIndex];
    if (!confirm(`Удалить категорию "${cat.category}" вместе со всеми товарами в ней?`)) return;

    categories.splice(catIndex, 1);
    persistAndRender();
}

// ---- Товары (для обычных категорий) --------------------------------

function addItem(catIndex) {
    const name = prompt('Название товара:');
    if (!name || !name.trim()) return;

    const priceRaw = prompt('Цена (тг):', '0');
    const price = parseInt(priceRaw, 10) || 0;

    const description = prompt('Описание (необязательно):', '') || '';

    categories[catIndex].items.push({
        id: generateId(),
        name: name.trim(),
        price,
        description
    });
    persistAndRender();
}

function editItem(catIndex, itemIndex) {
    const item = categories[catIndex].items[itemIndex];

    const name = prompt('Название товара:', item.name);
    if (!name || !name.trim()) return;

    const priceRaw = prompt('Цена (тг):', item.price);
    const price = parseInt(priceRaw, 10) || 0;

    const description = prompt('Описание:', item.description || '') || '';

    item.name = name.trim();
    item.price = price;
    item.description = description;
    persistAndRender();
}

function deleteItem(catIndex, itemIndex) {
    const item = categories[catIndex].items[itemIndex];
    if (!confirm(`Удалить товар "${item.name}" НАВСЕГДА? Если хотите временно скрыть — используйте заморозку (❄️) вместо удаления.`)) return;

    categories[catIndex].items.splice(itemIndex, 1);
    persistAndRender();
}

/**
 * Замораживает/размораживает товар. Замороженный товар не показывается
 * на сайте (см. фильтры в menu.js), но остаётся в базе как есть — со всеми
 * полями (название, цена, описание), чтобы не набирать всё заново при возврате.
 */
function toggleFreezeItem(catIndex, itemIndex) {
    const item = categories[catIndex].items[itemIndex];
    item.frozen = !item.frozen;
    persistAndRender();
}

// ---- Сложные категории (объём/вкус, индивидуальный размер) -----------
// У них нестандартная структура (volumes/groups/products), поэтому
// вместо форм — редактирование как JSON. Проще и надёжнее, чем плодить
// отдельный UI под каждый частный случай.

function editRawJson(catIndex) {
    const raw = JSON.stringify(categories[catIndex], null, 2);
    const textarea = document.getElementById(`raw-json-${catIndex}`);
    const edited = textarea.value;

    try {
        const parsed = JSON.parse(edited);
        categories[catIndex] = parsed;
        persistAndRender();
    } catch (e) {
        alert('Ошибка в JSON: ' + e.message + '\n\nПроверьте синтаксис (кавычки, запятые) и попробуйте снова.');
    }
}

/** Переносит текущее меню из data.js в БД (Supabase или localStorage) — разовое действие */
async function migrateFromDataJs() {
    if (isSaving) {
        alert('Сохранение уже идёт, подождите несколько секунд и попробуйте снова.');
        return;
    }
    if (typeof menuData === 'undefined' || menuData.length === 0) {
        alert('data.js не найден или пуст — переносить нечего.');
        return;
    }
    if (!confirm(`Перенести меню из data.js (${menuData.length} категорий) в базу для текущего филиала? Это ЗАМЕНИТ то, что сейчас там сохранено.`)) return;

    isSaving = true;
    renderSavingOverlay();

    const result = await api.saveMenu(currentBranch, menuData);

    isSaving = false;

    if (!result.success) {
        alert('Не удалось перенести: ' + (result.error || 'неизвестная ошибка'));
        render();
        return;
    }
    alert('Готово! Меню перенесено.');
    await switchBranch(currentBranch);
}

// ---- Рендер -----------------------------------------------------------

function renderBranchTabs() {
    return `
        <div class="admin-branch-tabs">
            ${BRANCHES.map(b => `
                <button class="admin-branch-tab ${b === currentBranch ? 'active' : ''}" data-branch="${b}">
                    📍 ${b}
                </button>
            `).join('')}
        </div>
    `;
}

function renderSimpleCategory(cat, catIndex) {
    const itemsHtml = cat.items.map((item, itemIndex) => `
        <div class="admin-item-row ${item.frozen ? 'admin-item-frozen' : ''}">
            <div class="admin-item-info">
                <span class="admin-item-name">${item.frozen ? '❄️ ' : ''}${item.name}</span>
                <span class="admin-item-price">${item.price} тг</span>
                ${item.description ? `<span class="admin-item-desc">${item.description}</span>` : ''}
                ${item.frozen ? '<span class="admin-item-frozen-label">Заморожено — скрыто с сайта</span>' : ''}
            </div>
            <div class="admin-item-actions">
                <button onclick="toggleFreezeItem(${catIndex}, ${itemIndex})" title="${item.frozen ? 'Разморозить' : 'Заморозить (скрыть с сайта, не удаляя)'}">
                    ${item.frozen ? '🔥' : '❄️'}
                </button>
                <button onclick="editItem(${catIndex}, ${itemIndex})" title="Редактировать">✏️</button>
                <button onclick="deleteItem(${catIndex}, ${itemIndex})" title="Удалить навсегда">🗑️</button>
            </div>
        </div>
    `).join('') || '<p class="admin-empty-hint">Пока нет товаров в этой категории</p>';

    return `
        <div class="admin-items-list">${itemsHtml}</div>
        <button class="admin-add-btn" onclick="addItem(${catIndex})">+ Добавить товар</button>
    `;
}

function renderComplexCategory(cat, catIndex) {
    const label = cat.hasVariants
        ? 'Категория с объёмом/вкусом (например Лимонады, Кофе)'
        : 'Категория с индивидуальным размером у каждого товара (например Холодные напитки)';

    return `
        <p class="admin-complex-hint">
            ⚠️ ${label} — редактируется как JSON (структура сложнее обычной).
        </p>
        <textarea class="admin-json-editor" id="raw-json-${catIndex}">${JSON.stringify(cat, null, 2)}</textarea>
        <button class="admin-add-btn" onclick="editRawJson(${catIndex})">💾 Сохранить JSON</button>
    `;
}

function renderCategories() {
    if (categories.length === 0) {
        return '<p class="admin-empty-hint">Меню для этой точки пока пустое. Добавьте первую категорию.</p>';
    }

    return categories.map((cat, catIndex) => `
        <div class="admin-category-card">
            <div class="admin-category-header">
                <h3>${cat.category}</h3>
                <div class="admin-category-actions">
                    <button onclick="renameCategory(${catIndex})">✏️ Название</button>
                    <button onclick="deleteCategory(${catIndex})">🗑️ Удалить категорию</button>
                </div>
            </div>
            ${cat.hasVariants || cat.hasSizePicker ? renderComplexCategory(cat, catIndex) : renderSimpleCategory(cat, catIndex)}
        </div>
    `).join('');
}

function render() {
    const sharedNotice = typeof SHARE_MENU_ACROSS_BRANCHES !== 'undefined' && SHARE_MENU_ACROSS_BRANCHES
        ? `<p class="admin-shared-notice">ℹ️ Сейчас меню общее для всех точек — изменения на любой вкладке применяются сразу ко всем филиалам.</p>`
        : '';

    root.innerHTML = `
        ${renderBranchTabs()}
        ${sharedNotice}
        <div class="admin-toolbar">
            <button class="admin-add-btn admin-add-category-btn" onclick="addCategory()">+ Добавить категорию</button>
            <button class="admin-add-btn" onclick="migrateFromDataJs()">⬆️ Загрузить меню из data.js</button>
        </div>
        <div class="admin-categories">
            ${renderCategories()}
        </div>
    `;

    root.querySelectorAll('.admin-branch-tab').forEach(btn => {
        btn.addEventListener('click', () => switchBranch(btn.getAttribute('data-branch')));
    });
}

// ---- Авторизация (только когда USE_SUPABASE = true) ----------------------
// В локальном режиме (заглушка на localStorage) настоящей защиты всё равно
// быть не может — данные и так лежат только в этом браузере. Реальная
// защита имеет смысл, только когда есть реальный сервер, который может
// сам проверить пароль — поэтому логин через Supabase Auth включается
// только при USE_SUPABASE = true.

const loginScreen = document.getElementById('admin-login-screen');
const loginError = document.getElementById('admin-login-error');

async function handleAdminLogin() {
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;
    loginError.textContent = '';

    if (!email || !password) {
        loginError.textContent = 'Введите email и пароль';
        return;
    }

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
        loginError.textContent = 'Неверный email или пароль';
        return;
    }

    showAdminPanel();
}

function showAdminPanel() {
    loginScreen.classList.add('hidden');
    root.classList.remove('hidden');
    const logoutLink = document.getElementById('admin-logout-link');
    if (logoutLink && USE_SUPABASE) logoutLink.classList.remove('hidden');
    initAdmin();
}

function showLoginScreen() {
    loginScreen.classList.remove('hidden');
    root.classList.add('hidden');
    const logoutLink = document.getElementById('admin-logout-link');
    if (logoutLink) logoutLink.classList.add('hidden');
}

async function handleAdminLogout() {
    if (USE_SUPABASE) {
        await supabaseClient.auth.signOut();
    }
    showLoginScreen();
}

// ---- Точка входа --------------------------------------------------

async function initAdmin() {
    categories = await api.getMenu(currentBranch);
    render();
}

async function bootAdmin() {
    if (!USE_SUPABASE) {
        // Локальный режим — реальной защиты нет и быть не может, пускаем сразу
        root.classList.remove('hidden');
        initAdmin();
        return;
    }

    // Проверяем, есть ли уже действующая сессия входа (не разлогинивает
    // при каждом обновлении страницы)
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        showAdminPanel();
    } else {
        showLoginScreen();
    }
}

bootAdmin();
