// ============================================================
// cart.js — всё, что связано с корзиной: добавление/удаление
// позиций, подсчёт итога, очистка.
// Зависит от: menuItems (menu.js), CONTAINER_PRICE / DELIVERY_COST (config.js)
// ============================================================

// DOM-элементы корзины
const stickyBar = document.getElementById('sticky-bar');
const totalItemsEl = document.getElementById('total-items');
const orderBreakdownEl = document.getElementById('order-breakdown');
const totalPriceEl = document.getElementById('total-price');
const savingsBannerEl = document.getElementById('savings-banner');

// Состояние корзины
let cart = {};
let currentOrderType = 'delivery'; // 'delivery' или 'pickup'

/**
 * Добавляет/убирает 1 шт. товара с id в корзину и пересчитывает итог.
 * Вызывается из onclick-атрибутов карточек блюд (renderGrid и т.п.),
 * поэтому обязательно должна быть глобальной функцией.
 */
function updateCart(id, change) {
    if (!cart[id]) cart[id] = 0;
    cart[id] += change;
    if (cart[id] < 0) cart[id] = 0;

    const countEl = document.getElementById(`count-${id}`);
    if (countEl) {
        countEl.textContent = cart[id];
        countEl.style.transform = 'scale(1.3)';
        setTimeout(() => countEl.style.transform = 'none', 150);
    }

    calculateTotal();
    saveState();
}

/**
 * Считает количество позиций, сумму блюд и список строк по корзине.
 * Общая функция, переиспользуемая и калькулятором итога, и оформлением
 * заказа в WhatsApp (main.js) — чтобы не дублировать один и тот же цикл.
 */
function getCartSummary() {
    let totalFoodItems = 0;
    let totalFoodPrice = 0;
    const lines = [];

    for (const id in cart) {
        if (cart[id] > 0) {
            const item = menuItems.find(i => i.id == parseInt(id));
            if (item && !isNaN(parseInt(item.price))) {
                const sum = parseInt(item.price) * cart[id];
                totalFoodItems += cart[id];
                totalFoodPrice += sum;
                lines.push({ item, qty: cart[id], sum });
            }
        }
    }

    return { totalFoodItems, totalFoodPrice, lines };
}

/** Стоимость доставки по текущей сумме заказа (0, если самовывоз) */
function getDeliveryCost(totalFoodPrice) {
    if (currentOrderType !== 'delivery') return 0;
    return totalFoodPrice >= DELIVERY_COST.discountThreshold
        ? DELIVERY_COST.discounted
        : DELIVERY_COST.standard;
}

/** Пересчитывает и отображает итог корзины (позиции, разбивка, сумма) */
function calculateTotal() {
    const { totalFoodItems, totalFoodPrice } = getCartSummary();
    const containersCost = totalFoodItems * CONTAINER_PRICE;
    const deliveryCost = getDeliveryCost(totalFoodPrice);
    const finalTotal = totalFoodPrice + containersCost + deliveryCost;

    totalItemsEl.textContent = `Выбрано: ${totalFoodItems} позиций`;
    orderBreakdownEl.textContent = `Блюда: ${totalFoodPrice} ₸ | Упаковка: ${containersCost} ₸ | Доставка: ${deliveryCost} ₸`;
    totalPriceEl.textContent = `${finalTotal} тг`;

    stickyBar.classList.toggle('visible', totalFoodItems > 0);

    const showSavings = currentOrderType === 'delivery' && totalFoodPrice >= DELIVERY_COST.discountThreshold;
    savingsBannerEl.style.display = showSavings ? 'block' : 'none';
}

/** Полностью очищает корзину и обновляет экран */
function clearCart() {
    cart = {};
    document.querySelectorAll('.count').forEach(el => el.textContent = '0');
    calculateTotal();
    saveState();
}
