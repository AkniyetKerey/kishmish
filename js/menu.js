// ============================================================
// menu.js — рендер категорий, карточек блюд и субвыборов
// (объём/вкус для лимонадов и кофе, индивидуальный размер для
// холодных напитков), плюс блок "🔥 В тренде".
//
// Данные меню сюда приходят СНАРУЖИ через initMenu(data) — этот файл
// больше не читает data.js / menuData напрямую. Данные для initMenu
// получает main.js через api.getMenu() (см. api.js).
// Зависит от: cart (cart.js), TRENDING_KEYWORDS (config.js)
// ============================================================

const menuContainer = document.getElementById('menu');
const categoriesNav = document.getElementById('categories-nav');

let menuCategories = []; // категории меню, переданные извне через initMenu(data)
let menuItems = [];
let trendingItems = [];

/**
 * Разворачивает переданные категории в плоский список товаров (для корзины/заказа).
 * Замороженные товары (item.frozen === true) сюда не попадают — они временно
 * скрыты с сайта, но не удалены (см. "заморозка" в админке).
 */
function buildMenuItemsIndex() {
    menuItems = [];
    menuCategories.forEach(cat => {
        menuItems = menuItems.concat(cat.items.filter(item => !item.frozen));
    });
}

/** Собирает список товаров для блока "🔥 В тренде" по ключевым словам (без замороженных) */
function buildTrendingItems() {
    trendingItems = [];
    menuCategories.forEach(cat => {
        cat.items.filter(item => !item.frozen).forEach(item => {
            const isTrending = TRENDING_KEYWORDS.some(kw => item.name.toLowerCase().includes(kw));
            if (isTrending && !trendingItems.find(i => i.id === item.id)) {
                trendingItems.push(item);
            }
        });
    });
}

/** Общая разметка карточки товара — переиспользуется всеми видами рендера */
function cardContentHtml(item, displayName) {
    const name = displayName || item.name;
    const description = item.description
        ? `<div style="font-size: 13px; opacity: 0.7; margin-bottom: 8px; line-height: 1.2;">${item.description}</div>`
        : '';

    // Замороженный товар: показываем карточку, но без цены и без возможности
    // добавить в корзину — вместо этого понятное сообщение для клиента.
    if (item.frozen) {
        return `
            <div class="card-content">
                <div>
                    <div class="card-title">${name}</div>
                    ${description}
                    <div class="card-unavailable">Временно недоступно</div>
                </div>
            </div>
        `;
    }

    return `
        <div class="card-content">
            <div>
                <div class="card-title">${name}</div>
                ${description}
                <div class="card-price">${item.price} тг</div>
            </div>
            <div class="controls">
                <button onclick="updateCart(${item.id}, -1)">-</button>
                <span class="count" id="count-${item.id}">${cart[item.id] || 0}</span>
                <button onclick="updateCart(${item.id}, 1)">+</button>
            </div>
        </div>
    `;
}

/** Обычная сетка карточек (используется для большинства категорий и "В тренде") */
function renderGrid(items, title) {
    menuContainer.innerHTML = `<h2 class="section-title">${title}</h2><div class="menu-grid-container"><div class="menu-grid"></div></div>`;
    const grid = menuContainer.querySelector('.menu-grid');

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card' + (item.frozen ? ' card-frozen' : '');
        card.innerHTML = cardContentHtml(item);
        grid.appendChild(card);
    });
}

/**
 * Категория с субвыбором объёма (Лимонады, Кофе, Молочные коктейли и Смузи):
 * сначала вкладки объёма, затем карточки вкусов для выбранного объёма.
 * Если у товаров есть поле group ("Коктейли"/"Смузи"), рисуются подзаголовки.
 */
function renderVariantCategory(cat) {
    let selectedVolume = cat.volumes[0];

    function renderVolume() {
        const itemsForVolume = cat.items.filter(i => i.volume === selectedVolume);

        menuContainer.innerHTML = `
            <h2 class="section-title">${cat.category}</h2>
            <div class="volume-tabs" id="volume-tabs"></div>
            <div class="menu-grid-container"><div class="menu-grid" id="variant-grid"></div></div>
        `;

        const volumeTabsEl = menuContainer.querySelector('#volume-tabs');
        cat.volumes.forEach(vol => {
            const tabBtn = document.createElement('button');
            tabBtn.className = 'volume-tab' + (vol === selectedVolume ? ' active' : '');
            tabBtn.textContent = vol;
            tabBtn.onclick = () => {
                selectedVolume = vol;
                renderVolume();
            };
            volumeTabsEl.appendChild(tabBtn);
        });

        const grid = menuContainer.querySelector('#variant-grid');
        const groups = [...new Set(itemsForVolume.map(i => i.group).filter(Boolean))];

        function makeVariantCard(item) {
            const card = document.createElement('div');
            card.className = 'card' + (item.frozen ? ' card-frozen' : '');
            card.innerHTML = cardContentHtml(item, item.flavor || item.name);
            return card;
        }

        if (groups.length > 0) {
            groups.forEach(groupName => {
                const groupHeader = document.createElement('div');
                groupHeader.style.cssText = 'grid-column: 1 / -1; font-weight: 700; font-size: 15px; opacity: 0.75; margin: 6px 0 2px;';
                groupHeader.textContent = groupName;
                grid.appendChild(groupHeader);

                itemsForVolume.filter(i => i.group === groupName).forEach(item => {
                    grid.appendChild(makeVariantCard(item));
                });
            });
        } else {
            itemsForVolume.forEach(item => grid.appendChild(makeVariantCard(item)));
        }
    }

    renderVolume();
}

/**
 * Категория с индивидуальным выбором размера для каждого товара
 * (Холодные напитки — у каждого товара свой набор объёмов).
 */
function renderSizePickerCategory(cat) {
    menuContainer.innerHTML = `<h2 class="section-title">${cat.category}</h2><div class="menu-grid-container"><div class="menu-grid" id="size-picker-grid"></div></div>`;
    const grid = menuContainer.querySelector('#size-picker-grid');

    function renderProductCard(card, product) {
        card.className = 'card' + (product.frozen ? ' card-frozen' : '');

        // Замороженный продукт целиком: без выбора размера и без корзины
        if (product.frozen) {
            card.innerHTML = `
                <div class="card-content">
                    <div>
                        <div class="card-title">${product.name}</div>
                        <div class="card-unavailable">Временно недоступно</div>
                    </div>
                </div>
            `;
            return;
        }

        if (card._selectedSizeIdx === undefined) card._selectedSizeIdx = 0;
        const selectedIdx = card._selectedSizeIdx;
        const size = product.sizes[selectedIdx];

        const sizeButtonsHtml = product.sizes.map((s, i) => `
            <button class="volume-tab${i === selectedIdx ? ' active' : ''}" style="padding:6px 10px; font-size:12px; flex:none;" data-size-idx="${i}">${s.volume}</button>
        `).join('');

        card.innerHTML = `
            <div class="card-content">
                <div>
                    <div class="card-title">${product.name}</div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">${sizeButtonsHtml}</div>
                    <div class="card-price">${size.price} тг</div>
                </div>
                <div class="controls">
                    <button data-action="dec">-</button>
                    <span class="count" id="count-${size.id}">${cart[size.id] || 0}</span>
                    <button data-action="inc">+</button>
                </div>
            </div>
        `;

        card.querySelectorAll('[data-size-idx]').forEach(btn => {
            btn.addEventListener('click', () => {
                card._selectedSizeIdx = parseInt(btn.getAttribute('data-size-idx'));
                renderProductCard(card, product);
            });
        });

        card.querySelector('[data-action="dec"]').addEventListener('click', () => updateCart(size.id, -1));
        card.querySelector('[data-action="inc"]').addEventListener('click', () => updateCart(size.id, 1));
    }

    cat.products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'card';
        grid.appendChild(card);
        renderProductCard(card, product);
    });
}

/** Строит навигацию по категориям (пилюли) и вешает на них клики */
function renderCategoriesNav() {
    categoriesNav.innerHTML = '';

    const trendBtn = document.createElement('button');
    trendBtn.className = 'category-pill active';
    trendBtn.textContent = '🔥 В тренде';
    trendBtn.onclick = () => {
        document.querySelectorAll('.category-pill').forEach(b => b.classList.remove('active'));
        trendBtn.classList.add('active');
        renderGrid(trendingItems, '🔥 В тренде');
    };
    categoriesNav.appendChild(trendBtn);

    menuCategories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'category-pill';
        btn.textContent = cat.category;
        btn.onclick = () => {
            document.querySelectorAll('.category-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (cat.hasVariants) {
                renderVariantCategory(cat);
            } else if (cat.hasSizePicker) {
                renderSizePickerCategory(cat);
            } else {
                renderGrid(cat.items, cat.category);
            }
        };
        categoriesNav.appendChild(btn);
    });
}

/**
 * Точка входа: принимает данные меню (от api.getMenu(), см. main.js)
 * и отрисовывает всё с нуля.
 * @param {Array} data — массив категорий в формате data.js
 */
function initMenu(data) {
    menuCategories = Array.isArray(data) ? data : [];
    buildMenuItemsIndex();
    buildTrendingItems();
    if (menuCategories.length > 0) {
        renderCategoriesNav();
        renderGrid(trendingItems, '🔥 В тренде');
    }
}
