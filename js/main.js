// ============================================================
// main.js — инициализация страницы, обработчики событий,
// сохранение/восстановление состояния (тема, корзина, точка, адрес).
// Зависит от: cart.js, menu.js, config.js
// ============================================================

// ---- Меню с фото --------------------------------------------

function openPhotoMenu() {
    window.open(PHOTO_MENU_LINK, '_blank');
}

/** Обновляет сохранённое состояние перед восстановлением корзины. */
function normalizeStoredState() {
    try {
        const savedBranch = localStorage.getItem('kishMishBranch');
        const raw = localStorage.getItem(STORAGE_KEYS.state);
        if (raw) {
            const state = JSON.parse(raw);
            if ((savedBranch && savedBranch !== BRANCH) || (state.point && state.point !== BRANCH)) {
                state.cart = {};
            }
            state.point = BRANCH;
            delete state.branchChosen;
            localStorage.setItem(STORAGE_KEYS.state, JSON.stringify(state));
        }
        localStorage.removeItem('kishMishBranch');
        // Удаляем локальные копии меню, которые не относятся к текущей точке.
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key.startsWith(ADMIN_MENU_PREFIX) && key !== ADMIN_MENU_PREFIX + BRANCH) {
                localStorage.removeItem(key);
            }
        }
    } catch (e) {
        console.error('Не удалось обновить сохранённое состояние:', e);
    }
}

normalizeStoredState();

// ---- Сохранение/восстановление состояния --------------------

function saveState() {
    const state = {
        theme: document.documentElement.getAttribute('data-theme'),
        cart: cart,
        orderType: currentOrderType,
        point: BRANCH,
        address: document.getElementById('address-input').value
    };
    localStorage.setItem(STORAGE_KEYS.state, JSON.stringify(state));
}

/**
 * Восстанавливает только тему — вызывается СРАЗУ при загрузке страницы,
 * ещё до запроса меню. Раньше тема восстанавливалась внутри loadState(),
 * которая вызывалась ПОСЛЕ загрузки меню — если меню грузилось долго
 * (например, медленное соединение или временная задержка Supabase),
 * страница на секунду-другую показывала светлую тему по умолчанию, что
 * выглядело как "тема сбрасывается". Теперь это происходит мгновенно.
 */
function restoreTheme() {
    try {
        const saved = localStorage.getItem(STORAGE_KEYS.state);
        if (!saved) return;
        const state = JSON.parse(saved);
        if (state.theme) {
            document.documentElement.setAttribute('data-theme', state.theme);
            const themeToggle = document.getElementById('theme-toggle');
            if (themeToggle) themeToggle.textContent = state.theme === 'light' ? '🌙' : '☀️';
        }
    } catch (e) {
        console.error('Ошибка восстановления темы:', e);
    }
}

function loadState() {
    const saved = localStorage.getItem(STORAGE_KEYS.state);
    if (!saved) return;

    try {
        const state = JSON.parse(saved);

        if (state.cart) cart = state.cart;
        if (state.orderType) currentOrderType = state.orderType;
        if (state.address) document.getElementById('address-input').value = state.address;

        // Табы доставки/самовывоза
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        const activeTab = document.querySelector(`.tab[data-type="${currentOrderType}"]`);
        if (activeTab) activeTab.classList.add('active');

        const addressInput = document.getElementById('address-input');
        addressInput.style.display = currentOrderType === 'pickup' ? 'none' : 'block';

        // Счётчики товаров (актуально для карточек, уже отрисованных к этому моменту)
        for (const id in cart) {
            const countEl = document.getElementById(`count-${id}`);
            if (countEl) countEl.textContent = cart[id];
        }

        calculateTotal();
    } catch (e) {
        console.error('Ошибка загрузки состояния:', e);
    }
}

// ---- Тема (светлая/тёмная) -----------------------------------

function initThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    const html = document.documentElement;

    themeToggle.addEventListener('click', () => {
        const newTheme = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        html.setAttribute('data-theme', newTheme);
        themeToggle.textContent = newTheme === 'light' ? '🌙' : '☀️';

        themeToggle.style.transform = 'rotate(360deg)';
        setTimeout(() => themeToggle.style.transform = 'none', 300);
        saveState();
    });
}

// ---- Табы Доставка / Самовывоз --------------------------------

function initDeliveryTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');

            currentOrderType = e.target.getAttribute('data-type');

            const addressInput = document.getElementById('address-input');
            addressInput.style.display = currentOrderType === 'pickup' ? 'none' : 'block';

            calculateTotal();
            saveState();
        });
    });
}

// ---- Оформление заказа в WhatsApp ------------------------------

function buildOrderText(summary, deliveryCost, containersCost) {
    let text = 'Привет! Хочу сделать заказ:\n';

    summary.lines.forEach(({ item, qty, sum }) => {
        text += `• ${item.name} (${qty} шт.) — ${sum} тг\n`;
    });

    text += `• Пластиковый контейнер (${summary.totalFoodItems} шт.) — ${containersCost} тг\n\n`;

    const point = BRANCH;

    if (currentOrderType === 'delivery') {
        const address = document.getElementById('address-input').value.trim();
        text += `Тип заказа: Доставка (Точка: ${point})\n`;
        text += `Адрес: ${address}\n`;
        text += `Стоимость доставки: ${deliveryCost} тг\n\n`;
    } else {
        text += `Тип заказа: Самовывоз (Точка: ${point})\n\n`;
    }

    const finalTotal = summary.totalFoodPrice + containersCost + deliveryCost;
    text += `💵 Итого к оплате: ${finalTotal} тг`;

    return text;
}

function initOrderButton() {
    document.getElementById('order-btn').addEventListener('click', async () => {
        const summary = getCartSummary();
        if (summary.totalFoodItems === 0) return;

        // Апсейл: если заказ 3500–4999 и это доставка
        if (
            currentOrderType === 'delivery' &&
            summary.totalFoodPrice >= UPSELL_RANGE.min &&
            summary.totalFoodPrice < UPSELL_RANGE.max
        ) {
            const deficit = UPSELL_RANGE.max - summary.totalFoodPrice;
            const proceed = window.confirm(
                `💡 Небольшая подсказка!\n\nДо бесплатной доставки... шутка, до сниженной цены на доставку вам не хватает всего ${deficit} тг.\n\nДобавьте ещё немного и вы сэкономите 300 тг на доставке!\n\nПродолжить заказ без скидки?`
            );
            if (!proceed) return;
        }

        const point = BRANCH;
        const address = document.getElementById('address-input').value.trim();

        if (currentOrderType === 'delivery' && !address) {
            alert('Пожалуйста, укажите адрес доставки!');
            document.getElementById('address-input').focus();
            return;
        }

        const containersCost = summary.totalFoodItems * CONTAINER_PRICE;
        const deliveryCost = getDeliveryCost(summary.totalFoodPrice);
        const finalTotal = summary.totalFoodPrice + containersCost + deliveryCost;
        const text = buildOrderText(summary, deliveryCost, containersCost);

        // Сохраняем заказ через сервисный слой.
        await api.placeOrder({
            items: summary.lines.map(({ item, qty, sum }) => ({
                id: item.id, name: item.name, price: item.price, qty, sum
            })),
            totalFoodPrice: summary.totalFoodPrice,
            containersCost,
            deliveryCost,
            finalTotal,
            orderType: currentOrderType,
            point,
            address: currentOrderType === 'delivery' ? address : null,
            createdAt: new Date().toISOString()
        });

        const encodedText = encodeURIComponent(text);

        // Оставляем только тему при переходе в WhatsApp
        const currentTheme = document.documentElement.getAttribute('data-theme');
        localStorage.setItem(STORAGE_KEYS.state, JSON.stringify({ theme: currentTheme }));

        const phone = WHATSAPP_PHONE;
        window.location.href = `https://wa.me/${phone}?text=${encodedText}`;
    });
}

// ---- Прочая мелкая инициализация --------------------------------

function initSelectionGuards() {
    // Разрешаем выделение текста только внутри полей ввода
    document.addEventListener('selectstart', e => {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') e.preventDefault();
    });
    document.addEventListener('dragstart', e => e.preventDefault());
}

function initClearCartButton() {
    document.getElementById('clear-cart-btn').addEventListener('click', clearCart);
}

// ---- Точка входа --------------------------------------------------

async function init() {
    initSelectionGuards();
    initThemeToggle();
    restoreTheme(); // мгновенно, до загрузки меню — чтобы тема не "мигала" светлой на время загрузки

    // Всё, что не зависит от данных меню, настраиваем сразу — кнопки корзины,
    // табы доставки/самовывоза, оформление заказа, восстановление состояния.
    // Раньше это стояло ПОСЛЕ await api.getMenu(), и если Supabase отвечал
    // медленно (например, "холодный старт" бесплатного проекта после
    // простоя), вся корзина и кнопки не работали, пока меню не подгрузится.
    initDeliveryTabs();
    initClearCartButton();
    initOrderButton();

    document.getElementById('address-input').addEventListener('input', saveState);

    loadState();

    // Меню грузится отдельно и не блокирует всё остальное. Оборачиваем
    // в try/catch: даже если рендер меню упадёт из-за кривых данных, это
    // не должно мешать уже настроенным теме/корзине/кнопкам.
    try {
        const menu = await api.getMenu();
        initMenu(menu);
        calculateTotal(); // пересчитываем итог теперь, когда menuItems заполнены (для товаров, оставшихся в корзине с прошлого визита)
    } catch (e) {
        console.error('Не удалось загрузить/отрисовать меню:', e);
    }
}

init();
