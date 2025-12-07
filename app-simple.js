const API_BASE = 'https://gamma-api.polymarket.com';
const BATCH_SIZE = 10;

let state = {
    events: [],
    offset: 0,
    loading: false,
    hasMore: true,
    favorites: JSON.parse(localStorage.getItem('polymarket_favorites') || '[]'),
    deleted: JSON.parse(localStorage.getItem('polymarket_deleted') || '[]'),
    currentTab: 'discover'
};

const elements = {
    marketList: document.getElementById('market-list'),
    favoritesList: document.getElementById('favorites-list'),
    loading: document.getElementById('loading'),
    loadMore: document.getElementById('load-more'),
    loadMoreBtn: document.getElementById('load-more-btn'),
    discoverPanel: document.getElementById('discover-panel'),
    favoritesPanel: document.getElementById('favorites-panel'),
    noFavorites: document.getElementById('no-favorites'),
    toast: document.getElementById('toast'),
    categoryFilter: document.getElementById('category-filter'),
    sortFilter: document.getElementById('sort-filter')
};

function formatVolume(num) {
    if (!num) return '$0';
    if (num >= 1000000) return `$${(num/1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num/1000).toFixed(1)}K`;
    return `$${num.toFixed(0)}`;
}

function formatDate(dateStr) {
    if (!dateStr) return '未知';
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return '已结束';
    if (diffDays === 0) return '今天';
    if (diffDays < 7) return `${diffDays}天后`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function createMarketCard(event) {
    const market = event.markets?.[0];
    if (!market) return null;

    const volume = market.volumeNum || parseFloat(market.volume) || 0;
    const isFavorited = state.favorites.includes(event.id);
    
    const card = document.createElement('div');
    card.className = 'market-card value-medium';
    card.dataset.eventId = event.id;
    
    const tags = event.tags?.slice(0, 3).map(t => 
        `<span class="tag">${t.label}</span>`
    ).join('') || '';

    card.innerHTML = `
        <div class="card-header">
            <div class="card-tags">${tags}</div>
            <div class="card-actions">
                <button class="action-btn favorite-btn ${isFavorited ? 'favorited' : ''}" data-event-id="${event.id}">
                    <svg fill="${isFavorited ? '#f59e0b' : 'none'}" stroke="${isFavorited ? '#f59e0b' : '#8b8b9a'}" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
                    </svg>
                </button>
                <button class="action-btn delete-btn" data-event-id="${event.id}">
                    <svg fill="none" stroke="#8b8b9a" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>
        </div>
        <h3 class="card-title">${event.title || market.question}</h3>
        <p class="card-description">${(event.description || '').substring(0, 100)}...</p>
        <div class="card-stats">
            <div class="stat">
                <div class="stat-value">${formatVolume(volume)}</div>
                <div class="stat-label">交易量</div>
            </div>
            <div class="stat">
                <div class="stat-value">${event.commentCount || 0}</div>
                <div class="stat-label">评论</div>
            </div>
            <div class="stat">
                <div class="stat-value">${formatDate(market.endDate)}</div>
                <div class="stat-label">结束</div>
            </div>
        </div>
        <a href="https://polymarket.com/event/${event.slug}" target="_blank" class="card-link">查看详情</a>
    `;

    card.querySelector('.favorite-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(event, card);
    });

    card.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteEvent(event.id, card);
    });

    return card;
}

function toggleFavorite(event, card) {
    const idx = state.favorites.indexOf(event.id);
    if (idx > -1) {
        state.favorites.splice(idx, 1);
        showToast('已取消收藏');
    } else {
        state.favorites.push(event.id);
        const stored = JSON.parse(localStorage.getItem('polymarket_favorites_data') || '{}');
        stored[event.id] = event;
        localStorage.setItem('polymarket_favorites_data', JSON.stringify(stored));
        showToast('已收藏');
    }
    localStorage.setItem('polymarket_favorites', JSON.stringify(state.favorites));
    
    const btn = card.querySelector('.favorite-btn');
    const isFav = state.favorites.includes(event.id);
    btn.classList.toggle('favorited', isFav);
    btn.querySelector('svg').setAttribute('fill', isFav ? '#f59e0b' : 'none');
    btn.querySelector('svg').setAttribute('stroke', isFav ? '#f59e0b' : '#8b8b9a');
}

function deleteEvent(eventId, cardElement) {
    state.deleted.push(eventId);
    localStorage.setItem('polymarket_deleted', JSON.stringify(state.deleted));
    cardElement.style.transform = 'translateX(-100%)';
    cardElement.style.opacity = '0';
    setTimeout(() => cardElement.remove(), 300);
    showToast('已删除');
}

function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    setTimeout(() => elements.toast.classList.remove('show'), 2000);
}

async function fetchEvents() {
    if (state.loading || !state.hasMore) return;
    
    state.loading = true;
    elements.loading.classList.remove('hidden');
    elements.loadMore.style.display = 'none';

    const url = `${API_BASE}/events?order=id&ascending=false&closed=false&limit=${BATCH_SIZE}&offset=${state.offset}`;
    
    try {
        console.log('Fetching:', url);
        const response = await fetch(url);
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Got data:', data.length, 'events');
        
        if (!data || data.length === 0) {
            state.hasMore = false;
            elements.loading.classList.add('hidden');
            showToast('没有更多数据');
            return;
        }

        let addedCount = 0;
        data.forEach(event => {
            if (state.deleted.includes(event.id)) return;
            if (!event.markets || event.markets.length === 0) return;
            
            const card = createMarketCard(event);
            if (card) {
                elements.marketList.appendChild(card);
                state.events.push(event);
                addedCount++;
            }
        });
        
        console.log('Added cards:', addedCount);

        state.offset += BATCH_SIZE;
        state.hasMore = data.length === BATCH_SIZE;

    } catch (error) {
        console.error('Fetch error:', error);
        showToast('加载失败: ' + error.message);
    } finally {
        state.loading = false;
        elements.loading.classList.add('hidden');
        if (state.hasMore) {
            elements.loadMore.style.display = 'block';
        }
    }
}

function renderFavorites() {
    elements.favoritesList.innerHTML = '';
    const stored = JSON.parse(localStorage.getItem('polymarket_favorites_data') || '{}');
    
    const favEvents = state.favorites
        .map(id => stored[id] || state.events.find(e => e.id === id))
        .filter(Boolean);

    if (favEvents.length === 0) {
        elements.noFavorites.classList.remove('hidden');
        return;
    }

    elements.noFavorites.classList.add('hidden');
    favEvents.forEach(event => {
        const card = createMarketCard(event);
        if (card) elements.favoritesList.appendChild(card);
    });
}

function switchTab(tab) {
    state.currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    if (tab === 'discover') {
        elements.discoverPanel.classList.add('active');
        elements.favoritesPanel.classList.remove('active');
    } else {
        elements.discoverPanel.classList.remove('active');
        elements.favoritesPanel.classList.add('active');
        renderFavorites();
    }
}

function init() {
    console.log('App initializing...');
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    elements.loadMoreBtn.addEventListener('click', fetchEvents);
    
    // Start fetching
    fetchEvents();
}

document.addEventListener('DOMContentLoaded', init);
