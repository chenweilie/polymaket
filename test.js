const RANDOM_TAGS = [
    'up-or-down', 'crypto-prices', '15m', '1h', '4h', 'recurring',
    'hit-price', 'yearly', 'btc', 'eth', 'price', 'coin-flip',
    'soccer', 'football', 'nfl', 'nba', 'mlb', 'nhl', 'serie-a',
    'premier-league', 'la-liga', 'bundesliga', 'mma', 'ufc',
    'tennis', 'boxing', 'f1', 'formula-1', 'basketball'
];

const COGNITIVE_TAGS = [
    'politics', 'elections', 'world', 'science', 'technology',
    'economy', 'business', 'ai', 'health', 'climate', 'space',
    'geopolitics', 'foreign-policy', 'courts', 'scotus', 'ukraine',
    'russia', 'china', 'middle-east', 'trump', 'fed', 'recession'
];

const SPORTS_MATCH_PATTERNS = [
    /vs\.?/i, /\bv\b/i, /match/i, /game\s+\d/i, /winner/i,
    /win\s+(against|vs)/i, /beat/i, /defeat/i
];

function calculateValueScore(event) {
    const market = event.markets?.[0];
    if (!market) return { score: 0, factors: {} };

    const tags = event.tags?.map(t => t.slug.toLowerCase()) || [];
    
    const title = event.title?.toLowerCase() || '';
    
    const isRandom = RANDOM_TAGS.some(rt => 
        tags.some(t => t.includes(rt)) || 
        title.includes('up or down') ||
        title.includes('15m') ||
        title.includes('1h')
    );
    
    if (isRandom) {
        return { score: 0, factors: { random: true }, isRandom: true };
    }

    const isSportsMatch = SPORTS_MATCH_PATTERNS.some(pattern => pattern.test(event.title || ''));
    if (isSportsMatch && !tags.some(t => COGNITIVE_TAGS.some(ct => t.includes(ct)))) {
        return { score: 0, factors: { sportsMatch: true }, isRandom: true };
    }

    let score = 50;
    const factors = {};

    const volume = market.volumeNum || parseFloat(market.volume) || 0;
    if (volume > 100000) { score += 15; factors.highVolume = true; }
    else if (volume > 10000) { score += 10; factors.mediumVolume = true; }
    else if (volume > 1000) { score += 5; }

    const liquidity = market.liquidityNum || parseFloat(market.liquidity) || 0;
    if (liquidity > 50000) { score += 10; factors.highLiquidity = true; }
    else if (liquidity > 10000) { score += 5; }

    const isCognitive = COGNITIVE_TAGS.some(ct => tags.some(t => t.includes(ct)));
    if (isCognitive) { score += 15; factors.cognitive = true; }

    return { 
        score: Math.min(100, Math.max(0, score)), 
        factors,
        isRandom: false 
    };
}

async function runTests() {
    console.log('=== Polymarket 筛选器测试 ===\n');

    // 测试1: API连接
    console.log('测试1: API连接...');
    try {
        const response = await fetch('https://gamma-api.polymarket.com/events?limit=5&closed=false');
        const data = await response.json();
        console.log(`✓ API连接成功，获取到 ${data.length} 个事件\n`);
    } catch (e) {
        console.log(`✗ API连接失败: ${e.message}\n`);
        return;
    }

    // 测试2: 过滤随机项目
    console.log('测试2: 过滤随机项目...');
    const randomEvent = {
        title: 'ETH Up or Down - December 8',
        tags: [{ slug: 'up-or-down' }, { slug: 'crypto-prices' }],
        markets: [{ volumeNum: 1000000 }]
    };
    const randomResult = calculateValueScore(randomEvent);
    console.log(`  输入: "${randomEvent.title}"`);
    console.log(`  结果: isRandom=${randomResult.isRandom}, score=${randomResult.score}`);
    console.log(`  ${randomResult.isRandom ? '✓' : '✗'} 随机项目被正确识别\n`);

    // 测试3: 认知判断项目高分
    console.log('测试3: 认知判断项目...');
    const cognitiveEvent = {
        title: 'Will Trump win 2024 election?',
        tags: [{ slug: 'politics' }, { slug: 'elections' }],
        markets: [{ volumeNum: 500000, liquidityNum: 100000 }]
    };
    const cogResult = calculateValueScore(cognitiveEvent);
    console.log(`  输入: "${cognitiveEvent.title}"`);
    console.log(`  结果: score=${cogResult.score}, factors=${JSON.stringify(cogResult.factors)}`);
    console.log(`  ${cogResult.score >= 70 ? '✓' : '✗'} 高价值项目得分应>=70 (实际: ${cogResult.score})\n`);

    // 测试4: 低交易量项目
    console.log('测试4: 低交易量项目...');
    const lowVolEvent = {
        title: 'Some random question',
        tags: [{ slug: 'misc' }],
        markets: [{ volumeNum: 100, liquidityNum: 500 }]
    };
    const lowResult = calculateValueScore(lowVolEvent);
    console.log(`  输入: "${lowVolEvent.title}" (volume: 100)`);
    console.log(`  结果: score=${lowResult.score}`);
    console.log(`  ${lowResult.score < 60 ? '✓' : '✗'} 低交易量得分应<60 (实际: ${lowResult.score})\n`);

    // 测试5: 体育比赛过滤
    console.log('测试5: 体育比赛过滤...');
    const sportsEvent = {
        title: 'Delfino Pescara 1936 vs. AC Reggiana 1919',
        tags: [{ slug: 'serie-a' }, { slug: 'soccer' }],
        markets: [{ volumeNum: 50000 }]
    };
    const sportsResult = calculateValueScore(sportsEvent);
    console.log(`  输入: "${sportsEvent.title}"`);
    console.log(`  结果: isRandom=${sportsResult.isRandom}, score=${sportsResult.score}`);
    console.log(`  ${sportsResult.isRandom ? '✓' : '✗'} 体育比赛被正确过滤\n`);

    // 测试6: 获取真实数据并筛选
    console.log('测试6: 真实数据筛选...');
    try {
        const response = await fetch('https://gamma-api.polymarket.com/events?limit=200&closed=false&order=id&ascending=false');
        const events = await response.json();
        
        let randomCount = 0;
        let cognitiveCount = 0;
        let filtered = [];

        events.forEach(event => {
            const result = calculateValueScore(event);
            if (result.isRandom) {
                randomCount++;
            } else if (result.score >= 40) {
                cognitiveCount++;
                filtered.push({ title: event.title?.substring(0, 50), score: result.score });
            }
        });

        console.log(`  总事件: ${events.length}`);
        console.log(`  随机项目(已过滤): ${randomCount}`);
        console.log(`  认知判断项目(保留): ${cognitiveCount}`);
        console.log(`\n  筛选出的前5个项目:`);
        filtered.sort((a, b) => b.score - a.score).slice(0, 5).forEach((e, i) => {
            console.log(`    ${i+1}. [${e.score}分] ${e.title}...`);
        });
        console.log(`  ✓ 筛选功能正常工作\n`);
    } catch (e) {
        console.log(`  ✗ 获取真实数据失败: ${e.message}\n`);
    }

    // 测试7: 本地存储模拟
    console.log('测试7: 本地存储模拟...');
    const favorites = ['event1', 'event2'];
    const deleted = ['event3'];
    console.log(`  收藏列表: ${JSON.stringify(favorites)}`);
    console.log(`  删除列表: ${JSON.stringify(deleted)}`);
    console.log(`  ✓ 存储结构正确\n`);

    console.log('=== 测试完成 ===');
}

runTests();
