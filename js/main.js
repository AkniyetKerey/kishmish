// ============================================================
// main.js — инициализация страницы, обработчики событий,
// сохранение/восстановление состояния (тема, корзина, точка, адрес).
// Зависит от: cart.js, menu.js, config.js
// ============================================================

// ---- Выбор филиала -----------------------------------------
// Эта часть намеренно стоит в самом начале файла и ни от чего
// не зависит (кроме DOM и localStorage). Так кнопки выбора точки
// гарантированно работают, даже если ниже в файле что-то сломается.

function selectBranch(branch) {
    let previousBranch = null;
    try { previousBranch = localStorage.getItem(STORAGE_KEYS.branch); } catch (e) {}

    try { localStorage.setItem(STORAGE_KEYS.branch, branch); } catch (e) {}

    const overlay = document.getElementById('branch-overlay');
    if (overlay) overlay.classList.add('hidden');

    // Если точка реально сменилась (а не выбрана впервые) — чистим корзину,
    // чтобы оператор не путался из-за товаров с другой точки/меню
    if (previousBranch && previousBranch !== branch) {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.state);
            if (raw) {
                const state = JSON.parse(raw);
                state.cart = {};
                state.point = branch;
                localStorage.setItem(STORAGE_KEYS.state, JSON.stringify(state));
            }
        } catch (e) {}

        alert(`Точка изменена на ${branch}. Корзина была очищена, так как на другой точке меню может отличаться.`);
    }

    // Перезагружаем страницу в любом случае (даже при первом выборе) —
    // у каждой точки своё меню, и его нужно заново запросить через api.getMenu()
    // с уже сохранённым branch, а не полагаться на то, что успело отрисоваться
    // при самой первой загрузке страницы (тогда branch ещё не был известен).
    window.location.reload();
}

function openBranchOverlay() {
    const overlay = document.getElementById('branch-overlay');
    if (overlay) overlay.classList.remove('hidden');

    const cancelBtn = document.getElementById('branch-cancel');
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEYS.branch); } catch (e) {}
    if (cancelBtn) cancelBtn.style.display = saved ? 'inline-block' : 'none';
}

function closeBranchOverlay() {
    const overlay = document.getElementById('branch-overlay');
    if (overlay) overlay.classList.add('hidden');
}

/** Открывает графическое меню с фото (Canva) для текущей выбранной точки */
function openPhotoMenu() {
    let branch = null;
    try { branch = localStorage.getItem(STORAGE_KEYS.branch); } catch (e) {}

    const link = BRANCH_MENU_LINKS[branch];
    if (!link) {
        alert('Сначала выберите филиал — для него появится ссылка на меню с фото.');
        return;
    }
    window.open(link, '_blank');
}

function initBranchOverlay() {
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEYS.branch); } catch (e) {}

    // Если сохранённая точка больше не существует (например, точку убрали
    // с сайта, как 17-95) — считаем, что филиал не выбран, и просим выбрать заново
    if (saved && !BRANCHES.includes(saved)) {
        saved = null;
        try { localStorage.removeItem(STORAGE_KEYS.branch); } catch (e) {}
    }

    const overlay = document.getElementById('branch-overlay');
    const badge = document.getElementById('branch-badge');
    const pointSelect = document.getElementById('point-select');

    if (saved) {
        if (overlay) overlay.classList.add('hidden');
        if (badge) badge.textContent = `📍 ${saved}`;
        if (pointSelect) pointSelect.value = saved;
    } else {
        if (overlay) overlay.classList.remove('hidden');
    }
}

initBranchOverlay();

// ---- Сохранение/восстановление состояния --------------------

function saveState() {
    const state = {
        theme: document.documentElement.getAttribute('data-theme'),
        cart: cart,
        orderType: currentOrderType,
        point: document.getElementById('point-select').value,
        address: document.getElementById('address-input').value,
        branchChosen: true
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
        if (state.point) document.getElementById('point-select').value = state.point;
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

/** Подстраховка: если филиал уже выбран, но point-select ещё не был синхронизирован */
function syncPointSelectWithBranch() {
    let savedBranch = null;
    try { savedBranch = localStorage.getItem(STORAGE_KEYS.branch); } catch (e) {}
    const pointSelect = document.getElementById('point-select');
    if (savedBranch && pointSelect) {
        pointSelect.value = savedBranch;
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

    const point = document.getElementById('point-select').value;

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

        const point = document.getElementById('point-select').value;
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

        // Передаём заказ в сервисный слой — сейчас это просто лог в консоль,
        // после подключения Supabase здесь же появится реальная запись в БД
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

        // Номер WhatsApp свой для каждой точки — если для какой-то точки номер
        // не задан в config.js, подстраховываемся первым номером из списка,
        // чтобы заказ в любом случае куда-то дошёл, а не завис молча.
        const phone = BRANCH_PHONES[point] || Object.values(BRANCH_PHONES)[0];
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

    document.getElementById('point-select').addEventListener('change', saveState);
    document.getElementById('address-input').addEventListener('input', saveState);

    loadState();
    syncPointSelectWithBranch();

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
