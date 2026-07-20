// ============================================================
// admin.js — админка меню: полный CRUD категорий и товаров,
// с переключением между филиалами (у каждого — своё меню).
// Все чтения/записи идут через api.getMenu() / api.saveMenu()
// (см. api.js) — сейчас это localStorage-заглушка, после
// подключения Supabase этот файл менять не придётся.
// ============================================================

let currentBranch = BRANCHES[0];
let categories = [];

const root = document.getElementById('admin-root');

/** Генерирует достаточно уникальный id для нового товара */
function generateId() {
    return Date.now() + Math.floor(Math.random() * 1000);
}

/** Сохраняет текущее состояние categories для currentBranch и перерисовывает экран */
async function persistAndRender() {
    const result = await api.saveMenu(currentBranch, categories);
    if (!result.success) {
        alert('Не удалось сохранить: ' + (result.error || 'неизвестная ошибка'));
    }
    render();
}

/** Переключение филиала в админке */
async function switchBranch(branch) {
    currentBranch = branch;
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
    if (typeof menuData === 'undefined' || menuData.length === 0) {
        alert('data.js не найден или пуст — переносить нечего.');
        return;
    }
    if (!confirm(`Перенести меню из data.js (${menuData.length} категорий) в базу для текущего филиала? Это ЗАМЕНИТ то, что сейчас там сохранено.`)) return;

    const result = await api.saveMenu(currentBranch, menuData);
    if (!result.success) {
        alert('Не удалось перенести: ' + (result.error || 'неизвестная ошибка'));
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

// ---- Точка входа --------------------------------------------------

async function initAdmin() {
    categories = await api.getMenu(currentBranch);
    render();
}

initAdmin();
