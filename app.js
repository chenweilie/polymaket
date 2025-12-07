const API_BASE = '/api';
const BATCH_SIZE = 100;
const DISPLAY_SIZE = 10;
const TRANSLATE_API = 'https://api.mymemory.translated.net/get';
const PRICE_REFRESH_INTERVAL = 5 * 60 * 1000;

const RANDOM_KEYWORDS = ['up or down', 'up/down', '15m', '1h', '4h', 'coin flip', 'coinflip'];
const RANDOM_TAGS = ['up-or-down', 'crypto-prices', 'recurring', '15m', '1h', '4h'];

const CATEGORY_COLORS = {
    politics: 'tag-politics',
    crypto: 'tag-crypto',
    sports: 'tag-sports',
    entertainment: 'tag-entertainment',
    science: 'tag-science',
    business: 'tag-business'
};

let state = {
    events: [],
    allEvents: [],
    offset: 0,
    loading: false,
    hasMore: true,
    favorites: JSON.parse(localStorage.getItem('pm_favorites') || '[]'),
    deleted: JSON.parse(localStorage.getItem('pm_deleted') || '[]'),
    orders: JSON.parse(localStorage.getItem('pm_orders') || '{}'),
    translations: JSON.parse(localStorage.getItem('pm_trans') || '{}'),
    priceAlerts: JSON.parse(localStorage.getItem('pm_alerts') || '{}'),
    settings: JSON.parse(localStorage.getItem('pm_settings') || '{"theme":"dark","fontSize":14}'),
    currentTab: 'discover',
    currentCategory: 'all',
    currentSort: 'volume',
    searchQuery: '',
    priceCache: {},
    priceRefreshTimer: null,
    selectMode: false,
    selectedIds: new Set(),
    pullStartY: 0,
    isPulling: false
};

const $ = id => document.getElementById(id);

// 应用设置
function applySettings() {
    document.documentElement.setAttribute('data-theme', state.settings.theme);
    document.documentElement.style.setProperty('--font-size', state.settings.fontSize + 'px');
}

// 震动反馈
function vibrate(pattern = 10) {
    if (navigator.vibrate) navigator.vibrate(pattern);
}

// 判断随机性项目
function isRandomEvent(event) {
    const title = (event.title || '').toLowerCase();
    const tags = (event.tags || []).map(t => t.slug?.toLowerCase() || '');
    if (RANDOM_KEYWORDS.some(kw => title.includes(kw))) return true;
    if (tags.some(tag => RANDOM_TAGS.some(rt => tag.includes(rt)))) return true;
    const m = event.markets?.[0];
    if (m) {
        const vol = m.volumeNum || parseFloat(m.volume) || 0;
        try {
            const p = JSON.parse(m.outcomePrices || '[]');
            if (vol === 0 && p[0] === '0.5' && p[1] === '0.5') return true;
        } catch(e) {}
    }
    return false;
}

// 获取事件分类
function getEventCategory(event) {
    const tags = (event.tags || []).map(t => t.slug?.toLowerCase() || '');
    const title = (event.title || '').toLowerCase();
    if (tags.some(t => t.includes('politic') || t.includes('election')) || title.includes('trump') || title.includes('biden')) return 'politics';
    if (tags.some(t => t.includes('crypto') || t.includes('bitcoin') || t.includes('ethereum'))) return 'crypto';
    if (tags.some(t => t.includes('sport') || t.includes('nba') || t.includes('nfl') || t.includes('soccer'))) return 'sports';
    if (tags.some(t => t.includes('entertainment') || t.includes('movie') || t.includes('music'))) return 'entertainment';
    if (tags.some(t => t.includes('tech') || t.includes('ai') || t.includes('science'))) return 'science';
    if (tags.some(t => t.includes('business') || t.includes('economy') || t.includes('stock'))) return 'business';
    return 'other';
}

// 异步翻译
function translateLater(text, key, element, showOriginal = true) {
    if (!text || text.length < 3) return;
    if (state.translations[key]) {
        if (showOriginal) {
            element.innerHTML = state.translations[key] + `<small class="orig">${text}</small>`;
        } else {
            element.textContent = state.translations[key];
        }
        return;
    }
    fetch(`${TRANSLATE_API}?q=${encodeURIComponent(text.substring(0, 500))}&langpair=en|zh`)
        .then(r => r.json())
        .then(data => {
            if (data.responseStatus === 200 && data.responseData?.translatedText) {
                state.translations[key] = data.responseData.translatedText;
                localStorage.setItem('pm_trans', JSON.stringify(state.translations));
                if (showOriginal) {
                    element.innerHTML = state.translations[key] + `<small class="orig">${text}</small>`;
                } else {
                    element.textContent = state.translations[key];
                }
            }
        }).catch(() => {});
}

function formatNum(n) {
    if (!n) return '$0';
    if (n >= 1e6) return '$' + (n/1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n/1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
}

function formatDate(d) {
    if (!d) return '-';
    const diff = Math.ceil((new Date(d) - new Date()) / 864e5);
    if (diff < 0) return '已结束';
    if (diff === 0) return '今天';
    if (diff === 1) return '明天';
    if (diff < 7) return diff + '天';
    if (diff < 30) return Math.floor(diff/7) + '周';
    return new Date(d).toLocaleDateString('zh-CN', {month:'short', day:'numeric'});
}

// 精确倒计时
function formatCountdown(d) {
    if (!d) return null;
    const diff = new Date(d) - new Date();
    if (diff < 0) return { text: '已结束', urgent: false };
    const hours = Math.floor(diff / 36e5);
    const mins = Math.floor((diff % 36e5) / 6e4);
    if (hours < 24) {
        return { text: `${hours}时${mins}分`, urgent: hours < 6 };
    }
    if (hours < 72) {
        return { text: `${Math.floor(hours/24)}天${hours%24}时`, urgent: false };
    }
    return null;
}

function getPrices(m) {
    try {
        const p = JSON.parse(m.outcomePrices || '[]');
        if (p.length >= 2) return { yes: parseFloat(p[0]) || 0, no: parseFloat(p[1]) || 0 };
    } catch(e) {}
    return { yes: parseFloat(m.lastTradePrice) || 0.5, no: 1 - (parseFloat(m.lastTradePrice) || 0.5) };
}

function calcValue(vol, liq) {
    const v = vol || 0, l = liq || 0;
    if (v > 500000 || l > 100000) return { score: 90, cls: 'high' };
    if (v > 100000 || l > 50000) return { score: 75, cls: 'high' };
    if (v > 50000 || l > 20000) return { score: 60, cls: 'medium' };
    if (v > 10000 || l > 5000) return { score: 45, cls: 'medium' };
    return { score: 30, cls: 'low' };
}

// 计算热度 (0-100)
function calcHeat(event) {
    const m = event.markets?.[0];
    if (!m) return 0;
    const vol = m.volumeNum || 0;
    const liq = m.liquidityNum || 0;
    const heat = Math.min(100, (vol / 100000 + liq / 20000) * 10);
    return Math.round(heat);
}

function calcProfitLoss(order, currentPrice) {
    if (!order || !currentPrice) return null;
    const buyPrice = order.price / 100;
    const amount = order.amount;
    const shares = amount / buyPrice;
    const currentValue = shares * currentPrice;
    const profit = currentValue - amount;
    const profitPercent = ((currentValue / amount) - 1) * 100;
    return { profit, percent: profitPercent, currentValue, shares };
}

function generateAICard(event) {
    const m = event.markets?.[0];
    if (!m) return '';
    const prices = getPrices(m);
    const vol = m.volumeNum || parseFloat(m.volume) || 0;
    const liq = m.liquidityNum || parseFloat(m.liquidity) || 0;
    const titleZh = state.translations['t_' + event.id] || '';
    const tags = (event.tags || []).slice(0, 5).map(t => t.label).join(', ');
    
    return `【Polymarket 预测市场分析请求】

📌 标题: ${event.title}
${titleZh ? `📌 中文: ${titleZh}` : ''}
🏷️ 标签: ${tags}

📊 当前赔率:
- Yes: ${(prices.yes * 100).toFixed(1)}¢ (概率 ${(prices.yes * 100).toFixed(1)}%)
- No: ${(prices.no * 100).toFixed(1)}¢ (概率 ${(prices.no * 100).toFixed(1)}%)

💰 市场数据:
- 交易量: ${formatNum(vol)}
- 流动性: ${formatNum(liq)}
- 结束时间: ${formatDate(m.endDate)}

📝 描述: ${(event.description || '').substring(0, 200)}...

🔗 链接: https://polymarket.com/event/${event.slug}

---
请分析:
1. 这个预测市场的背景和关键因素
2. 当前赔率是否合理
3. 是否存在套利机会
4. 建议买入方向 (Yes/No) 和理由`;
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        vibrate();
        toast('已复制到剪贴板', 'success');
    } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast('已复制到剪贴板', 'success');
    }
}

// 下单弹窗
function showOrderModal(event, card) {
    const m = event.markets?.[0];
    const prices = getPrices(m);
    const existingOrder = state.orders[event.id];
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal">
            <h3>记录下单</h3>
            <p class="modal-title">${event.title}</p>
            <div class="modal-prices">
                <span class="yes">Yes: ${(prices.yes * 100).toFixed(0)}¢</span>
                <span class="no">No: ${(prices.no * 100).toFixed(0)}¢</span>
            </div>
            <div class="modal-form">
                <div class="form-row">
                    <label>方向:</label>
                    <select id="order-side">
                        <option value="yes" ${existingOrder?.side === 'yes' ? 'selected' : ''}>买 Yes</option>
                        <option value="no" ${existingOrder?.side === 'no' ? 'selected' : ''}>买 No</option>
                    </select>
                </div>
                <div class="form-row">
                    <label>价格 (¢):</label>
                    <input type="number" id="order-price" value="${existingOrder?.price || (prices.yes * 100).toFixed(0)}" min="1" max="99">
                </div>
                <div class="form-row">
                    <label>金额 ($):</label>
                    <input type="number" id="order-amount" value="${existingOrder?.amount || 100}" min="1">
                </div>
                <div class="form-row">
                    <label>备注:</label>
                    <input type="text" id="order-note" value="${existingOrder?.note || ''}" placeholder="可选">
                </div>
            </div>
            <div class="modal-actions">
                ${existingOrder ? '<button class="btn-danger" id="btn-remove-order">删除</button>' : ''}
                <button class="btn-cancel" id="btn-cancel">取消</button>
                <button class="btn-confirm" id="btn-confirm">确认</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    vibrate();
    
    modal.querySelector('#btn-cancel').onclick = () => modal.remove();
    modal.querySelector('#btn-confirm').onclick = () => {
        const order = {
            side: modal.querySelector('#order-side').value,
            price: parseFloat(modal.querySelector('#order-price').value),
            amount: parseFloat(modal.querySelector('#order-amount').value),
            note: modal.querySelector('#order-note').value,
            date: new Date().toISOString(),
            eventTitle: event.title,
            eventSlug: event.slug,
            endDate: m.endDate,
            marketId: m.id
        };
        state.orders[event.id] = order;
        localStorage.setItem('pm_orders', JSON.stringify(state.orders));
        const stored = JSON.parse(localStorage.getItem('pm_fav_data') || '{}');
        stored[event.id] = event;
        localStorage.setItem('pm_fav_data', JSON.stringify(stored));
        if (card) updateCardOrderStatus(card, event.id);
        vibrate([10, 50, 10]);
        toast('订单已记录', 'success');
        modal.remove();
        if (state.currentTab === 'orders') loadOrders();
    };
    
    const removeBtn = modal.querySelector('#btn-remove-order');
    if (removeBtn) {
        removeBtn.onclick = () => {
            delete state.orders[event.id];
            localStorage.setItem('pm_orders', JSON.stringify(state.orders));
            if (card) updateCardOrderStatus(card, event.id);
            toast('订单已删除');
            modal.remove();
            if (state.currentTab === 'orders') loadOrders();
        };
    }
    
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
}

// 价格提醒弹窗
function showAlertModal(event) {
    const m = event.markets?.[0];
    const prices = getPrices(m);
    const existingAlert = state.priceAlerts[event.id];
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal">
            <h3>价格提醒</h3>
            <p class="modal-title">${event.title}</p>
            <div class="modal-prices">
                <span class="yes">Yes: ${(prices.yes * 100).toFixed(0)}¢</span>
                <span class="no">No: ${(prices.no * 100).toFixed(0)}¢</span>
            </div>
            <div class="modal-form">
                <div class="form-row">
                    <label>监控:</label>
                    <select id="alert-side">
                        <option value="yes" ${existingAlert?.side === 'yes' ? 'selected' : ''}>Yes 价格</option>
                        <option value="no" ${existingAlert?.side === 'no' ? 'selected' : ''}>No 价格</option>
                    </select>
                </div>
                <div class="form-row">
                    <label>高于 (¢):</label>
                    <input type="number" id="alert-above" value="${existingAlert?.above || ''}" min="1" max="99" placeholder="可选">
                </div>
                <div class="form-row">
                    <label>低于 (¢):</label>
                    <input type="number" id="alert-below" value="${existingAlert?.below || ''}" min="1" max="99" placeholder="可选">
                </div>
            </div>
            <div class="modal-actions">
                ${existingAlert ? '<button class="btn-danger" id="btn-remove-alert">删除</button>' : ''}
                <button class="btn-cancel" id="btn-cancel">取消</button>
                <button class="btn-confirm" id="btn-confirm">设置</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('#btn-cancel').onclick = () => modal.remove();
    modal.querySelector('#btn-confirm').onclick = () => {
        const above = modal.querySelector('#alert-above').value;
        const below = modal.querySelector('#alert-below').value;
        if (!above && !below) {
            toast('请设置至少一个价格条件');
            return;
        }
        state.priceAlerts[event.id] = {
            side: modal.querySelector('#alert-side').value,
            above: above ? parseFloat(above) : null,
            below: below ? parseFloat(below) : null,
            eventTitle: event.title,
            eventSlug: event.slug
        };
        localStorage.setItem('pm_alerts', JSON.stringify(state.priceAlerts));
        toast('提醒已设置', 'success');
        modal.remove();
    };
    
    const removeBtn = modal.querySelector('#btn-remove-alert');
    if (removeBtn) {
        removeBtn.onclick = () => {
            delete state.priceAlerts[event.id];
            localStorage.setItem('pm_alerts', JSON.stringify(state.priceAlerts));
            toast('提醒已删除');
            modal.remove();
        };
    }
    
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
}

// 设置弹窗
function showSettingsModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal">
            <h3>设置</h3>
            <div class="settings-section">
                <h4>外观</h4>
                <div class="settings-row">
                    <span>深色模式</span>
                    <div class="toggle ${state.settings.theme === 'dark' ? 'active' : ''}" id="theme-toggle"></div>
                </div>
                <div class="settings-row">
                    <span>字体大小</span>
                    <div class="font-slider">
                        <span>小</span>
                        <input type="range" id="font-size" min="12" max="18" value="${state.settings.fontSize}">
                        <span>大</span>
                    </div>
                </div>
            </div>
            <div class="settings-section">
                <h4>数据管理</h4>
                <div class="settings-row">
                    <span>备份数据</span>
                    <button class="action-bar-btn" id="backup-btn">导出</button>
                </div>
                <div class="settings-row">
                    <span>恢复数据</span>
                    <button class="action-bar-btn" id="restore-btn">导入</button>
                    <input type="file" id="restore-file" accept=".json" style="display:none">
                </div>
                <div class="settings-row">
                    <span>清除缓存</span>
                    <button class="action-bar-btn danger" id="clear-cache-btn">清除</button>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-confirm" id="btn-close">完成</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // 主题切换
    modal.querySelector('#theme-toggle').onclick = function() {
        this.classList.toggle('active');
        state.settings.theme = this.classList.contains('active') ? 'dark' : 'light';
        localStorage.setItem('pm_settings', JSON.stringify(state.settings));
        applySettings();
        vibrate();
    };
    
    // 字体大小
    modal.querySelector('#font-size').oninput = function() {
        state.settings.fontSize = parseInt(this.value);
        localStorage.setItem('pm_settings', JSON.stringify(state.settings));
        applySettings();
    };
    
    // 备份
    modal.querySelector('#backup-btn').onclick = () => {
        const data = {
            favorites: state.favorites,
            orders: state.orders,
            priceAlerts: state.priceAlerts,
            deleted: state.deleted,
            translations: state.translations,
            fav_data: JSON.parse(localStorage.getItem('pm_fav_data') || '{}'),
            settings: state.settings,
            exportDate: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `polymarket-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast('备份成功', 'success');
    };
    
    // 恢复
    const fileInput = modal.querySelector('#restore-file');
    modal.querySelector('#restore-btn').onclick = () => fileInput.click();
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (data.favorites) {
                state.favorites = data.favorites;
                localStorage.setItem('pm_favorites', JSON.stringify(data.favorites));
            }
            if (data.orders) {
                state.orders = data.orders;
                localStorage.setItem('pm_orders', JSON.stringify(data.orders));
            }
            if (data.priceAlerts) {
                state.priceAlerts = data.priceAlerts;
                localStorage.setItem('pm_alerts', JSON.stringify(data.priceAlerts));
            }
            if (data.fav_data) {
                localStorage.setItem('pm_fav_data', JSON.stringify(data.fav_data));
            }
            if (data.settings) {
                state.settings = data.settings;
                localStorage.setItem('pm_settings', JSON.stringify(data.settings));
                applySettings();
            }
            toast('恢复成功，刷新页面生效', 'success');
        } catch (err) {
            toast('恢复失败: 文件格式错误', 'error');
        }
    };
    
    // 清除缓存
    modal.querySelector('#clear-cache-btn').onclick = () => {
        if (confirm('确定清除翻译缓存和已删除列表？')) {
            state.translations = {};
            state.deleted = [];
            localStorage.setItem('pm_trans', '{}');
            localStorage.setItem('pm_deleted', '[]');
            toast('缓存已清除');
        }
    };
    
    modal.querySelector('#btn-close').onclick = () => modal.remove();
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
}

function updateCardOrderStatus(card, eventId) {
    const order = state.orders[eventId];
    const badge = card.querySelector('.order-badge');
    
    if (order) {
        if (badge) {
            badge.textContent = order.side === 'yes' ? '已买Yes' : '已买No';
            badge.className = 'order-badge ' + order.side;
        } else {
            const newBadge = document.createElement('span');
            newBadge.className = 'order-badge ' + order.side;
            newBadge.textContent = order.side === 'yes' ? '已买Yes' : '已买No';
            card.querySelector('.card-header')?.appendChild(newBadge);
        }
    } else if (badge) {
        badge.remove();
    }
}

// 骨架屏
function createSkeletonCard() {
    const card = document.createElement('div');
    card.className = 'skeleton-card';
    card.innerHTML = `
        <div class="skeleton-line skeleton-title"></div>
        <div class="skeleton-line skeleton-text"></div>
        <div class="skeleton-prices">
            <div class="skeleton-line skeleton-price"></div>
            <div class="skeleton-line skeleton-price"></div>
        </div>
        <div class="skeleton-line skeleton-text" style="width:80%"></div>
    `;
    return card;
}

function createCard(event, showOrderActions = true, showProfitLoss = false) {
    const m = event.markets?.[0];
    if (!m) return null;

    const vol = m.volumeNum || parseFloat(m.volume) || 0;
    const liq = m.liquidityNum || parseFloat(m.liquidity) || 0;
    const prices = state.priceCache[event.id] || getPrices(m);
    const value = calcValue(vol, liq);
    const heat = calcHeat(event);
    const isFav = state.favorites.includes(event.id);
    const order = state.orders[event.id];
    const category = getEventCategory(event);
    const countdown = formatCountdown(m.endDate);
    
    const title = event.title || m.question || '';
    const desc = event.description || '';
    const shortDesc = desc.substring(0, 120);
    const isExpandable = desc.length > 120;

    const card = document.createElement('div');
    card.className = `market-card value-${value.cls}${isExpandable ? ' expandable' : ''}`;
    card.dataset.id = event.id;
    
    // 分类彩色标签
    const tags = (event.tags || []).slice(0, 3).map(t => {
        const tagCat = getEventCategory({ tags: [t] });
        const colorClass = CATEGORY_COLORS[tagCat] || 'tag-default';
        return `<span class="tag ${colorClass}">${t.label}</span>`;
    }).join('');

    const orderBadge = order ? `<span class="order-badge ${order.side}">${order.side === 'yes' ? '已买Yes' : '已买No'}</span>` : '';

    // 盈亏
    let profitHtml = '';
    if (showProfitLoss && order) {
        const currentPrice = order.side === 'yes' ? prices.yes : prices.no;
        const pl = calcProfitLoss(order, currentPrice);
        if (pl) {
            const plClass = pl.profit >= 0 ? 'profit-positive' : 'profit-negative';
            const plSign = pl.profit >= 0 ? '+' : '';
            profitHtml = `
                <div class="profit-info ${plClass}">
                    <span class="profit-label">盈亏:</span>
                    <span class="profit-value">${plSign}$${pl.profit.toFixed(2)} (${plSign}${pl.percent.toFixed(1)}%)</span>
                    <span class="profit-current">当前价值: $${pl.currentValue.toFixed(2)}</span>
                </div>
            `;
        }
    }

    // 倒计时
    let countdownHtml = '';
    if (countdown) {
        countdownHtml = `<span class="countdown ${countdown.urgent ? 'urgent' : ''}">${countdown.text}</span>`;
    }

    // 热度
    const heatHtml = `
        <div class="heat-indicator">
            <div class="heat-bar"><div class="heat-fill" style="width:${heat}%"></div></div>
            <span>${heat}%</span>
        </div>
    `;

    card.innerHTML = `
        <div class="select-checkbox"></div>
        <div class="card-header">
            <div class="card-tags">${tags}</div>
            ${orderBadge}
            <div class="card-actions">
                <button class="action-btn copy-btn" title="复制AI分析">
                    <svg fill="none" stroke="#888" viewBox="0 0 24 24" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                </button>
                ${showOrderActions ? `
                <button class="action-btn alert-btn" title="价格提醒">
                    <svg fill="none" stroke="#888" viewBox="0 0 24 24" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                </button>
                <button class="action-btn order-btn" title="记录下单">
                    <svg fill="none" stroke="#888" viewBox="0 0 24 24" stroke-width="2">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                </button>
                ` : ''}
                <button class="action-btn fav-btn ${isFav ? 'favorited' : ''}" title="收藏">
                    <svg fill="${isFav ? '#f59e0b' : 'none'}" stroke="${isFav ? '#f59e0b' : '#888'}" viewBox="0 0 24 24">
                        <path stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
                    </svg>
                </button>
                <button class="action-btn del-btn" title="删除">
                    <svg fill="none" stroke="#888" viewBox="0 0 24 24">
                        <path stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>
        </div>
        <h3 class="card-title">${title}</h3>
        <p class="card-desc">${shortDesc}${isExpandable ? '...' : ''}</p>
        ${isExpandable ? '<span class="expand-btn">展开全文</span>' : ''}
        <div class="card-prices">
            <div class="price yes">
                <span class="label">Yes</span>
                <span class="value" data-price="yes">${(prices.yes * 100).toFixed(0)}¢</span>
            </div>
            <div class="price no">
                <span class="label">No</span>
                <span class="value" data-price="no">${(prices.no * 100).toFixed(0)}¢</span>
            </div>
        </div>
        ${profitHtml}
        <div class="card-stats">
            <div class="stat">
                <div class="stat-val">${formatNum(vol)}</div>
                <div class="stat-lbl">交易量</div>
            </div>
            <div class="stat">
                <div class="stat-val">${formatNum(liq)}</div>
                <div class="stat-lbl">流动性</div>
            </div>
            <div class="stat">
                <div class="stat-val">${countdownHtml || formatDate(m.endDate)}</div>
                <div class="stat-lbl">结束</div>
            </div>
        </div>
        <div class="card-footer">
            <div class="value-bar">
                <div class="bar-fill ${value.cls}" style="width:${value.score}%"></div>
            </div>
            <span class="value-score">${value.score}分</span>
            ${heatHtml}
        </div>
        <a href="https://polymarket.com/event/${event.slug}" target="_blank" class="card-link">查看详情 →</a>
    `;

    // 选择模式
    card.querySelector('.select-checkbox').onclick = (e) => {
        e.stopPropagation();
        if (!state.selectMode) return;
        toggleSelect(event.id, card);
    };

    // 展开描述
    const expandBtn = card.querySelector('.expand-btn');
    if (expandBtn) {
        expandBtn.onclick = (e) => {
            e.stopPropagation();
            card.classList.toggle('expanded');
            const descEl = card.querySelector('.card-desc');
            if (card.classList.contains('expanded')) {
                descEl.textContent = desc;
                expandBtn.textContent = '收起';
            } else {
                descEl.textContent = shortDesc + '...';
                expandBtn.textContent = '展开全文';
            }
        };
    }

    // 标题点击展开
    card.querySelector('.card-title').onclick = () => {
        if (state.selectMode) {
            toggleSelect(event.id, card);
            return;
        }
        if (expandBtn) expandBtn.click();
    };

    card.querySelector('.copy-btn').onclick = e => {
        e.stopPropagation();
        copyToClipboard(generateAICard(event));
    };

    const alertBtn = card.querySelector('.alert-btn');
    if (alertBtn) {
        alertBtn.onclick = e => {
            e.stopPropagation();
            showAlertModal(event);
        };
    }

    const orderBtn = card.querySelector('.order-btn');
    if (orderBtn) {
        orderBtn.onclick = e => {
            e.stopPropagation();
            showOrderModal(event, card);
        };
    }

    card.querySelector('.fav-btn').onclick = e => {
        e.stopPropagation();
        toggleFav(event, card);
    };

    card.querySelector('.del-btn').onclick = e => {
        e.stopPropagation();
        delCard(event.id, card);
    };

    translateLater(title, 't_' + event.id, card.querySelector('.card-title'), true);
    translateLater(shortDesc, 'd_' + event.id, card.querySelector('.card-desc'), false);

    return card;
}

function toggleSelect(id, card) {
    if (state.selectedIds.has(id)) {
        state.selectedIds.delete(id);
        card.classList.remove('selected');
        card.querySelector('.select-checkbox').classList.remove('checked');
    } else {
        state.selectedIds.add(id);
        card.classList.add('selected');
        card.querySelector('.select-checkbox').classList.add('checked');
    }
    vibrate(5);
    updateSelectModeUI();
}

function toggleFav(event, card) {
    const idx = state.favorites.indexOf(event.id);
    if (idx > -1) {
        state.favorites.splice(idx, 1);
        toast('已取消收藏');
    } else {
        state.favorites.push(event.id);
        const stored = JSON.parse(localStorage.getItem('pm_fav_data') || '{}');
        stored[event.id] = event;
        localStorage.setItem('pm_fav_data', JSON.stringify(stored));
        toast('已收藏', 'success');
    }
    localStorage.setItem('pm_favorites', JSON.stringify(state.favorites));
    vibrate();
    
    const btn = card.querySelector('.fav-btn');
    const svg = btn.querySelector('svg');
    const isFav = state.favorites.includes(event.id);
    btn.classList.toggle('favorited', isFav);
    svg.setAttribute('fill', isFav ? '#f59e0b' : 'none');
    svg.setAttribute('stroke', isFav ? '#f59e0b' : '#888');
}

function delCard(id, card) {
    state.deleted.push(id);
    localStorage.setItem('pm_deleted', JSON.stringify(state.deleted));
    card.style.transform = 'translateX(-100%)';
    card.style.opacity = '0';
    setTimeout(() => card.remove(), 300);
    vibrate();
    toast('已删除');
}

function toast(msg, type = '') {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (type ? ' ' + type : '');
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
}

// 筛选和排序
function filterAndSortEvents(events) {
    let filtered = events.filter(event => {
        if (state.deleted.includes(event.id)) return false;
        if (!event.markets?.length) return false;
        if (isRandomEvent(event)) return false;
        
        if (state.currentCategory !== 'all') {
            if (getEventCategory(event) !== state.currentCategory) return false;
        }
        
        // 搜索
        if (state.searchQuery) {
            const q = state.searchQuery.toLowerCase();
            const title = (event.title || '').toLowerCase();
            const desc = (event.description || '').toLowerCase();
            const transTitle = state.translations['t_' + event.id]?.toLowerCase() || '';
            if (!title.includes(q) && !desc.includes(q) && !transTitle.includes(q)) return false;
        }
        
        return true;
    });

    filtered.sort((a, b) => {
        const mA = a.markets?.[0];
        const mB = b.markets?.[0];
        
        switch (state.currentSort) {
            case 'volume':
                return (mB?.volumeNum || 0) - (mA?.volumeNum || 0);
            case 'liquidity':
                return (mB?.liquidityNum || 0) - (mA?.liquidityNum || 0);
            case 'ending':
                return new Date(mA?.endDate || '2099-12-31') - new Date(mB?.endDate || '2099-12-31');
            case 'newest':
                return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            default:
                return 0;
        }
    });

    return filtered;
}

// 显示骨架屏
function showSkeletons(container, count = 3) {
    for (let i = 0; i < count; i++) {
        container.appendChild(createSkeletonCard());
    }
}

async function loadEvents() {
    if (state.loading || !state.hasMore) return;
    
    state.loading = true;
    const loadingEl = $('loading');
    loadingEl.innerHTML = '';
    loadingEl.classList.remove('hidden');
    showSkeletons(loadingEl, 3);
    $('load-more').style.display = 'none';

    try {
        const res = await fetch(`${API_BASE}/events?closed=false&limit=${BATCH_SIZE}&offset=${state.offset}`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        
        const data = await res.json();
        if (!data?.length) {
            state.hasMore = false;
            toast('没有更多了');
            return;
        }

        state.allEvents = state.allEvents.concat(data);
        const filtered = filterAndSortEvents(data);

        let added = 0;
        for (const event of filtered) {
            if (added >= DISPLAY_SIZE) break;
            if (state.events.find(e => e.id === event.id)) continue;
            const card = createCard(event);
            if (card) {
                $('market-list').appendChild(card);
                state.events.push(event);
                added++;
            }
        }

        state.offset += BATCH_SIZE;
        state.hasMore = data.length === BATCH_SIZE && added > 0;

        if (added === 0 && state.hasMore) {
            loadEvents();
        }

    } catch (e) {
        console.error(e);
        toast('加载失败: ' + e.message, 'error');
    } finally {
        state.loading = false;
        $('loading').classList.add('hidden');
        $('loading').innerHTML = '';
        if (state.hasMore) $('load-more').style.display = 'block';
    }
}

function applyFilters() {
    const list = $('market-list');
    list.innerHTML = '';
    state.events = [];
    
    const filtered = filterAndSortEvents(state.allEvents);
    let added = 0;
    
    for (const event of filtered) {
        if (added >= DISPLAY_SIZE * 3) break;
        const card = createCard(event);
        if (card) {
            list.appendChild(card);
            state.events.push(event);
            added++;
        }
    }
    
    if (added === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <p>没有找到匹配的项目</p>
                <span>尝试调整筛选条件或搜索关键词</span>
            </div>
        `;
    }
}

function loadFavorites() {
    const list = $('favorites-list');
    list.innerHTML = '';
    
    const stored = JSON.parse(localStorage.getItem('pm_fav_data') || '{}');
    let favs = state.favorites.map(id => stored[id] || state.events.find(e => e.id === id)).filter(Boolean);

    // 搜索过滤
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        favs = favs.filter(e => {
            const title = (e.title || '').toLowerCase();
            const transTitle = state.translations['t_' + e.id]?.toLowerCase() || '';
            return title.includes(q) || transTitle.includes(q);
        });
    }

    if (!favs.length) {
        $('no-favorites').classList.remove('hidden');
        $('no-favorites').innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:60px;height:60px;margin-bottom:12px;opacity:0.5">
                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
            </svg>
            <p>暂无收藏</p>
            <span>点击卡片上的星标收藏感兴趣的项目</span>
        `;
        return;
    }
    $('no-favorites').classList.add('hidden');
    
    for (const event of favs) {
        const card = createCard(event);
        if (card) list.appendChild(card);
    }
}

async function refreshOrderPrices() {
    const orderIds = Object.keys(state.orders);
    if (!orderIds.length) return;
    
    const stored = JSON.parse(localStorage.getItem('pm_fav_data') || '{}');
    
    for (const id of orderIds) {
        const event = stored[id];
        if (!event?.slug) continue;
        
        try {
            const res = await fetch(`${API_BASE}/events?slug=${event.slug}`);
            if (!res.ok) continue;
            const data = await res.json();
            if (data?.[0]?.markets?.[0]) {
                const m = data[0].markets[0];
                const newPrices = getPrices(m);
                const oldPrices = state.priceCache[id];
                
                state.priceCache[id] = newPrices;
                stored[id] = data[0];
                localStorage.setItem('pm_fav_data', JSON.stringify(stored));
                
                // 检查价格提醒
                checkPriceAlert(id, newPrices);
                
                if (state.currentTab === 'orders') {
                    const card = document.querySelector(`[data-id="${id}"]`);
                    if (card) {
                        const yesEl = card.querySelector('[data-price="yes"]');
                        const noEl = card.querySelector('[data-price="no"]');
                        const yesPriceBox = card.querySelector('.price.yes');
                        const noPriceBox = card.querySelector('.price.no');
                        
                        if (yesEl && oldPrices) {
                            const diff = newPrices.yes - oldPrices.yes;
                            if (Math.abs(diff) > 0.001) {
                                yesPriceBox.classList.add(diff > 0 ? 'flash-up' : 'flash-down');
                                setTimeout(() => yesPriceBox.classList.remove('flash-up', 'flash-down'), 500);
                            }
                            const trend = diff > 0 ? '↑' : (diff < 0 ? '↓' : '');
                            yesEl.innerHTML = `${(newPrices.yes * 100).toFixed(0)}¢ <span class="trend ${diff > 0 ? 'up' : 'down'}">${trend}</span>`;
                        }
                        if (noEl && oldPrices) {
                            const diff = newPrices.no - oldPrices.no;
                            if (Math.abs(diff) > 0.001) {
                                noPriceBox.classList.add(diff > 0 ? 'flash-up' : 'flash-down');
                                setTimeout(() => noPriceBox.classList.remove('flash-up', 'flash-down'), 500);
                            }
                            const trend = diff > 0 ? '↑' : (diff < 0 ? '↓' : '');
                            noEl.innerHTML = `${(newPrices.no * 100).toFixed(0)}¢ <span class="trend ${diff > 0 ? 'up' : 'down'}">${trend}</span>`;
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Price refresh error:', e);
        }
    }
    
    if (state.currentTab === 'orders') {
        loadOrders();
    }
}

// 检查价格提醒
function checkPriceAlert(eventId, prices) {
    const alert = state.priceAlerts[eventId];
    if (!alert) return;
    
    const price = (alert.side === 'yes' ? prices.yes : prices.no) * 100;
    
    if (alert.above && price >= alert.above) {
        toast(`${alert.eventTitle.substring(0, 30)}... ${alert.side} 价格已达 ${price.toFixed(0)}¢`, 'success');
        vibrate([100, 50, 100]);
        delete state.priceAlerts[eventId];
        localStorage.setItem('pm_alerts', JSON.stringify(state.priceAlerts));
    }
    
    if (alert.below && price <= alert.below) {
        toast(`${alert.eventTitle.substring(0, 30)}... ${alert.side} 价格已达 ${price.toFixed(0)}¢`, 'success');
        vibrate([100, 50, 100]);
        delete state.priceAlerts[eventId];
        localStorage.setItem('pm_alerts', JSON.stringify(state.priceAlerts));
    }
}

function loadOrders() {
    const list = $('orders-list');
    const summary = $('orders-summary');
    list.innerHTML = '';
    
    const orderIds = Object.keys(state.orders);
    const stored = JSON.parse(localStorage.getItem('pm_fav_data') || '{}');
    
    if (!orderIds.length) {
        $('no-orders').classList.remove('hidden');
        $('no-orders').innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:60px;height:60px;margin-bottom:12px;opacity:0.5">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
            </svg>
            <p>暂无持仓</p>
            <span>点击卡片上的 $ 按钮记录下单</span>
        `;
        summary.classList.add('hidden');
        return;
    }
    $('no-orders').classList.add('hidden');
    summary.classList.remove('hidden');
    
    let totalAmount = 0;
    let totalProfit = 0;
    let activeCount = 0;
    let endedCount = 0;
    
    orderIds.forEach(id => {
        const order = state.orders[id];
        const event = stored[id];
        totalAmount += order.amount || 0;
        
        if (new Date(order.endDate) < new Date()) {
            endedCount++;
        } else {
            activeCount++;
            if (event?.markets?.[0]) {
                const prices = state.priceCache[id] || getPrices(event.markets[0]);
                const currentPrice = order.side === 'yes' ? prices.yes : prices.no;
                const pl = calcProfitLoss(order, currentPrice);
                if (pl) totalProfit += pl.profit;
            }
        }
    });
    
    const profitClass = totalProfit >= 0 ? 'profit-positive' : 'profit-negative';
    const profitSign = totalProfit >= 0 ? '+' : '';
    
    summary.innerHTML = `
        <div class="summary-item">
            <span class="summary-val">${orderIds.length}</span>
            <span class="summary-lbl">总订单</span>
        </div>
        <div class="summary-item">
            <span class="summary-val">${activeCount}</span>
            <span class="summary-lbl">进行中</span>
        </div>
        <div class="summary-item">
            <span class="summary-val ${profitClass}">${profitSign}$${totalProfit.toFixed(0)}</span>
            <span class="summary-lbl">总盈亏</span>
        </div>
        <div class="summary-item">
            <span class="summary-val">$${totalAmount.toLocaleString()}</span>
            <span class="summary-lbl">总投入</span>
        </div>
    `;
    
    for (const id of orderIds) {
        const order = state.orders[id];
        const event = stored[id] || state.events.find(e => e.id === id);
        
        if (event) {
            const card = createCard(event, false, true);
            if (card) {
                const orderInfo = document.createElement('div');
                orderInfo.className = 'order-info';
                const isEnded = new Date(order.endDate) < new Date();
                orderInfo.innerHTML = `
                    <div class="order-detail">
                        <span class="order-side ${order.side}">${order.side === 'yes' ? '买Yes' : '买No'} @ ${order.price}¢</span>
                        <span class="order-amount">$${order.amount}</span>
                        <span class="order-date">${new Date(order.date).toLocaleDateString('zh-CN')}</span>
                        ${isEnded ? '<span class="order-ended">已结束</span>' : ''}
                    </div>
                    ${order.note ? `<div class="order-note">${order.note}</div>` : ''}
                `;
                card.insertBefore(orderInfo, card.querySelector('.card-link'));
                list.appendChild(card);
            }
        } else {
            const card = document.createElement('div');
            card.className = 'market-card';
            card.innerHTML = `
                <h3 class="card-title">${order.eventTitle || '未知事件'}</h3>
                <div class="order-info">
                    <div class="order-detail">
                        <span class="order-side ${order.side}">${order.side === 'yes' ? '买Yes' : '买No'} @ ${order.price}¢</span>
                        <span class="order-amount">$${order.amount}</span>
                    </div>
                </div>
                <a href="https://polymarket.com/event/${order.eventSlug}" target="_blank" class="card-link">查看详情 →</a>
            `;
            list.appendChild(card);
        }
    }
}

function exportData(type) {
    let csv = '';
    let filename = '';
    
    if (type === 'orders') {
        csv = 'ID,标题,方向,买入价,金额,日期,结束日期,备注\n';
        Object.entries(state.orders).forEach(([id, order]) => {
            csv += `${id},"${(order.eventTitle || '').replace(/"/g, '""')}",${order.side},${order.price},${order.amount},${order.date},${order.endDate},"${(order.note || '').replace(/"/g, '""')}"\n`;
        });
        filename = 'polymarket-orders.csv';
    } else if (type === 'favorites') {
        const stored = JSON.parse(localStorage.getItem('pm_fav_data') || '{}');
        csv = 'ID,标题,链接\n';
        state.favorites.forEach(id => {
            const event = stored[id];
            if (event) {
                csv += `${id},"${(event.title || '').replace(/"/g, '""')}",https://polymarket.com/event/${event.slug}\n`;
            }
        });
        filename = 'polymarket-favorites.csv';
    }
    
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast('导出成功', 'success');
}

// 批量操作
function enterSelectMode() {
    state.selectMode = true;
    state.selectedIds.clear();
    document.body.classList.add('select-mode');
    updateSelectModeUI();
    toast('选择要操作的项目');
}

function exitSelectMode() {
    state.selectMode = false;
    state.selectedIds.clear();
    document.body.classList.remove('select-mode');
    document.querySelectorAll('.market-card.selected').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.select-checkbox.checked').forEach(c => c.classList.remove('checked'));
    updateSelectModeUI();
}

function updateSelectModeUI() {
    const selectBtn = $('select-mode-btn');
    const batchActions = $('batch-actions');
    
    if (state.selectMode) {
        if (selectBtn) selectBtn.textContent = `取消 (${state.selectedIds.size})`;
        if (batchActions) batchActions.classList.remove('hidden');
    } else {
        if (selectBtn) selectBtn.textContent = '批量';
        if (batchActions) batchActions.classList.add('hidden');
    }
}

function batchDelete() {
    if (!state.selectedIds.size) return;
    if (!confirm(`确定删除 ${state.selectedIds.size} 个项目？`)) return;
    
    state.selectedIds.forEach(id => {
        state.deleted.push(id);
        const card = document.querySelector(`[data-id="${id}"]`);
        if (card) card.remove();
    });
    localStorage.setItem('pm_deleted', JSON.stringify(state.deleted));
    toast(`已删除 ${state.selectedIds.size} 个项目`);
    exitSelectMode();
}

function batchFavorite() {
    if (!state.selectedIds.size) return;
    const stored = JSON.parse(localStorage.getItem('pm_fav_data') || '{}');
    let added = 0;
    
    state.selectedIds.forEach(id => {
        if (!state.favorites.includes(id)) {
            state.favorites.push(id);
            const event = state.events.find(e => e.id === id);
            if (event) stored[id] = event;
            added++;
        }
    });
    
    localStorage.setItem('pm_favorites', JSON.stringify(state.favorites));
    localStorage.setItem('pm_fav_data', JSON.stringify(stored));
    toast(`已收藏 ${added} 个项目`, 'success');
    exitSelectMode();
    
    // 更新UI
    document.querySelectorAll('.market-card').forEach(card => {
        const id = card.dataset.id;
        if (state.favorites.includes(id)) {
            const btn = card.querySelector('.fav-btn');
            const svg = btn?.querySelector('svg');
            if (btn) btn.classList.add('favorited');
            if (svg) {
                svg.setAttribute('fill', '#f59e0b');
                svg.setAttribute('stroke', '#f59e0b');
            }
        }
    });
}

function switchTab(tab) {
    state.currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    $('discover-panel').classList.toggle('active', tab === 'discover');
    $('favorites-panel').classList.toggle('active', tab === 'favorites');
    $('orders-panel').classList.toggle('active', tab === 'orders');
    
    exitSelectMode();
    
    if (tab === 'favorites') loadFavorites();
    if (tab === 'orders') {
        loadOrders();
        if (!state.priceRefreshTimer) {
            refreshOrderPrices();
            state.priceRefreshTimer = setInterval(refreshOrderPrices, PRICE_REFRESH_INTERVAL);
        }
    } else {
        if (state.priceRefreshTimer) {
            clearInterval(state.priceRefreshTimer);
            state.priceRefreshTimer = null;
        }
    }
}

// 下拉刷新
function initPullToRefresh() {
    const main = document.querySelector('.main-content');
    const indicator = $('pull-indicator');
    
    main.addEventListener('touchstart', e => {
        if (window.scrollY === 0) {
            state.pullStartY = e.touches[0].clientY;
            state.isPulling = true;
        }
    }, { passive: true });
    
    main.addEventListener('touchmove', e => {
        if (!state.isPulling) return;
        const pullDistance = e.touches[0].clientY - state.pullStartY;
        if (pullDistance > 60 && !state.loading) {
            indicator.classList.add('show');
            indicator.textContent = '释放刷新';
        } else if (pullDistance > 0) {
            indicator.classList.remove('show');
        }
    }, { passive: true });
    
    main.addEventListener('touchend', () => {
        if (indicator.classList.contains('show') && !state.loading) {
            indicator.textContent = '刷新中...';
            vibrate();
            
            // 重置并重新加载
            state.offset = 0;
            state.hasMore = true;
            state.allEvents = [];
            state.events = [];
            $('market-list').innerHTML = '';
            
            loadEvents().finally(() => {
                indicator.classList.remove('show');
            });
        }
        state.isPulling = false;
    });
}

// 搜索防抖
let searchTimeout;
function handleSearch(query) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        state.searchQuery = query;
        if (state.currentTab === 'discover') {
            applyFilters();
        } else if (state.currentTab === 'favorites') {
            loadFavorites();
        }
    }, 300);
}

document.addEventListener('DOMContentLoaded', () => {
    applySettings();
    
    // 标签切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            vibrate(5);
            switchTab(btn.dataset.tab);
        });
    });
    
    // 搜索
    const searchInput = $('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', e => handleSearch(e.target.value));
    }
    
    // 分类筛选
    const categorySelect = $('category-filter');
    if (categorySelect) {
        categorySelect.addEventListener('change', e => {
            state.currentCategory = e.target.value;
            applyFilters();
        });
    }
    
    // 排序
    const sortSelect = $('sort-filter');
    if (sortSelect) {
        sortSelect.addEventListener('change', e => {
            state.currentSort = e.target.value;
            applyFilters();
        });
    }
    
    // 批量操作
    const selectBtn = $('select-mode-btn');
    if (selectBtn) {
        selectBtn.addEventListener('click', () => {
            if (state.selectMode) {
                exitSelectMode();
            } else {
                enterSelectMode();
            }
        });
    }
    
    const batchDeleteBtn = $('batch-delete');
    if (batchDeleteBtn) {
        batchDeleteBtn.addEventListener('click', batchDelete);
    }
    
    const batchFavBtn = $('batch-favorite');
    if (batchFavBtn) {
        batchFavBtn.addEventListener('click', batchFavorite);
    }
    
    // 导出
    $('export-orders')?.addEventListener('click', () => exportData('orders'));
    $('export-favorites')?.addEventListener('click', () => exportData('favorites'));
    
    // 刷新价格
    $('refresh-prices')?.addEventListener('click', () => {
        toast('正在刷新价格...');
        refreshOrderPrices();
    });
    
    // 设置按钮
    $('settings-btn')?.addEventListener('click', () => {
        vibrate();
        showSettingsModal();
    });
    
    // 加载更多
    $('load-more-btn')?.addEventListener('click', loadEvents);
    
    // 下拉刷新
    initPullToRefresh();
    
    // 初始加载
    loadEvents();
});
