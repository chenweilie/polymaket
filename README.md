# Polymarket 套利筛选器

一个移动端友好的 Polymarket 项目筛选平台，用于发现有认知判断价值的预测市场项目，支持下单跟踪、AI分析和价格提醒。

![Version](https://img.shields.io/badge/version-2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## 功能特性

### 核心功能
- **智能筛选** - 自动过滤随机性项目（加密货币价格涨跌、硬币翻转等）
- **分类筛选** - 按政治/加密货币/体育/娱乐/科技/商业分类
- **多种排序** - 按交易量/流动性/即将结束/最新排序
- **关键词搜索** - 搜索标题、描述和中文翻译
- **赔率显示** - 实时显示 Yes/No 赔率和涨跌趋势
- **中文翻译** - 自动翻译标题和描述为中文（MyMemory API）
- **价值评分** - 根据交易量和流动性计算分数，颜色区分价值等级

### 交互功能
- **收藏管理** - 收藏感兴趣的项目，独立标签页查看
- **下单跟踪** - 记录买入方向(Yes/No)、价格、金额，跟踪到结束
- **实时价格** - 持仓页自动刷新价格，显示涨跌趋势(↑↓)
- **盈亏计算** - 显示持仓盈亏金额和百分比
- **价格提醒** - 设置目标价格，达到时通知
- **批量操作** - 多选收藏/删除
- **AI分析卡片** - 一键复制格式化卡片，粘贴给AI分析套利机会
- **数据导出** - 导出收藏和持仓为CSV文件
- **数据备份** - 导出/导入完整数据JSON

### 视觉和交互
- **深色/浅色主题** - 可切换
- **字体大小调节** - 12-18px可调
- **下拉刷新** - 手势下拉刷新数据
- **卡片展开** - 点击查看完整描述
- **分类彩色标签** - 不同分类不同颜色
- **骨架屏加载** - 优雅的加载状态
- **震动反馈** - 操作成功时震动(移动端)
- **精确倒计时** - <24小时显示"X时X分"
- **热度指标** - 显示市场活跃度
- **PWA支持** - 可添加到主屏幕

### 安全功能
- **HTTP Basic 认证** - 公网访问需要账号密码

## 技术架构

```
polymaket/
├── index.html          # 主页面 (搜索、3标签页、设置按钮)
├── styles.css          # 样式 (深色/浅色主题, 动画, 响应式)
├── app.js              # 主逻辑 (~1000行)
├── manifest.json       # PWA 配置
├── Dockerfile          # Docker 构建
├── docker-compose.yml  # Docker Compose
├── nginx.conf          # Nginx (API代理 + 认证)
├── .htpasswd           # 认证密码文件
├── README.md           # 开发文档
└── PRD.md              # 产品需求文档
```

## 快速开始

### 部署 (Docker/Orbstack)

```bash
git clone https://github.com/your-repo/polymaket.git
cd polymaket
docker-compose up -d --build
```

访问: http://localhost:8080

### 默认登录凭证

| 用户名 | 密码 |
|--------|------|
| `admin` | `polymarket123` |

### 手机访问

```bash
# 获取电脑IP
ifconfig | grep "inet " | grep -v 127.0.0.1
```

手机浏览器访问: `http://[电脑IP]:8080`

### 常用命令

```bash
# 查看日志
docker logs -f polymarket-filter

# 重新构建
docker-compose down && docker-compose up -d --build

# 进入容器
docker exec -it polymarket-filter sh
```

## 使用指南

### 发现页
1. 使用搜索框搜索关键词
2. 选择分类筛选（政治、加密货币等）
3. 选择排序方式（交易量、即将结束等）
4. 点击"批量"进入多选模式
5. 点击卡片标题展开完整描述

### 卡片操作
- 📋 **复制按钮** - 复制AI分析卡片
- 🔔 **铃铛按钮** - 设置价格提醒
- 💲 **美元按钮** - 记录下单
- ⭐ **星标按钮** - 收藏/取消收藏
- ✕ **关闭按钮** - 删除

### 持仓页
- 自动每5分钟刷新价格
- 点击"刷新价格"手动刷新
- 查看盈亏百分比和金额
- 导出CSV备份

### 设置（右下角齿轮按钮）
- 切换深色/浅色主题
- 调节字体大小
- 备份数据（导出JSON）
- 恢复数据（导入JSON）
- 清除缓存

## 安全配置

### 修改密码

```bash
# 生成新密码哈希
htpasswd -nb 新用户名 新密码

# 更新 .htpasswd 文件
echo 'admin:$apr1$xxxxx$xxxxx' > .htpasswd

# 重新构建
docker-compose up -d --build
```

### 关闭认证（仅限本地）

编辑 `nginx.conf`，注释以下两行：
```nginx
# auth_basic "Polymarket Filter";
# auth_basic_user_file /etc/nginx/.htpasswd;
```

### 生产环境建议

1. **使用强密码** - 至少12位，包含大小写字母、数字、特殊字符
2. **启用 HTTPS** - 配合 Let's Encrypt 或反向代理
3. **限制IP访问** - 在 nginx.conf 中添加 `allow/deny` 规则

## API 说明

### Polymarket Gamma API

通过 Nginx 代理访问（解决 CORS）：

| 前端请求 | 代理转发 |
|---------|---------|
| `/api/events?...` | `https://gamma-api.polymarket.com/events?...` |

**主要接口:**
```
GET /api/events?closed=false&limit=100&offset=0
```

### 翻译 API (MyMemory)

```
GET https://api.mymemory.translated.net/get?q={text}&langpair=en|zh
```

- **限制**: 每天 1000 次免费请求
- **缓存**: 翻译结果存储在 localStorage

## 筛选逻辑

### 过滤规则

```javascript
// 关键词过滤
const RANDOM_KEYWORDS = ['up or down', 'up/down', '15m', '1h', '4h', 'coin flip'];

// 标签过滤
const RANDOM_TAGS = ['up-or-down', 'crypto-prices', 'recurring'];

// 50-50未交易项目
if (volume === 0 && prices === ['0.5', '0.5']) filter;
```

### 分类颜色

| 分类 | 颜色 |
|------|------|
| 政治 | 🔴 红色 |
| 加密货币 | 🟡 黄色 |
| 体育 | 🟢 绿色 |
| 娱乐 | 🩷 粉色 |
| 科技 | 🩵 青色 |
| 商业 | 🔵 蓝色 |

### 价值评分

| 条件 | 分数 | 颜色 |
|------|------|------|
| Vol > $500K 或 Liq > $100K | 90 | 🟢 |
| Vol > $100K 或 Liq > $50K | 75 | 🟢 |
| Vol > $50K 或 Liq > $20K | 60 | 🟡 |
| Vol > $10K 或 Liq > $5K | 45 | 🟡 |
| 其他 | 30 | 🔴 |

## 本地存储

| Key | 说明 |
|-----|------|
| `pm_favorites` | 收藏ID列表 |
| `pm_fav_data` | 收藏事件数据 |
| `pm_deleted` | 已删除ID列表 |
| `pm_orders` | 下单记录 |
| `pm_alerts` | 价格提醒 |
| `pm_trans` | 翻译缓存 |
| `pm_settings` | 设置（主题、字体） |

## AI 分析卡片

点击复制按钮生成：

```
【Polymarket 预测市场分析请求】

📌 标题: Will X happen in 2025?
📌 中文: 2025年X会发生吗？
🏷️ 标签: Politics, World

📊 当前赔率:
- Yes: 65.0¢ (概率 65.0%)
- No: 35.0¢ (概率 35.0%)

💰 市场数据:
- 交易量: $1.2M
- 流动性: $50.5K
- 结束时间: 3周

📝 描述: ...

🔗 链接: https://polymarket.com/event/...

---
请分析:
1. 这个预测市场的背景和关键因素
2. 当前赔率是否合理
3. 是否存在套利机会
4. 建议买入方向 (Yes/No) 和理由
```

## 注意事项

1. **翻译限制** - MyMemory 每天 1000 次，超出显示英文
2. **数据延迟** - API 数据可能有几分钟延迟
3. **价格刷新** - 持仓页每5分钟自动刷新
4. **网络要求** - 需要能访问 polymarket.com
5. **浏览器缓存** - 更新后强制刷新 `Cmd+Shift+R`

## 版本历史

### v2.0 (当前)
- 🔍 关键词搜索
- 🔔 价格提醒
- 📦 批量操作
- 💾 数据备份/恢复
- 🌗 深色/浅色主题
- 🔤 字体大小调节
- 📱 PWA 支持
- ⬇️ 下拉刷新
- 🎨 分类彩色标签
- ⏱️ 精确倒计时
- 🔥 热度指标
- 💫 骨架屏加载
- 📳 震动反馈

### v1.2
- 实时价格更新
- 盈亏计算
- 分类筛选和排序
- 数据导出CSV
- HTTP Basic 认证

### v1.1
- AI分析卡片复制
- 下单跟踪
- 持仓管理
- 描述翻译

### v1.0
- 基础筛选和展示
- 收藏/删除功能
- 中文翻译
- 价值评分

## 技术栈

- **前端**: 原生 HTML/CSS/JavaScript
- **容器**: Docker + Nginx
- **API**: Polymarket Gamma API
- **翻译**: MyMemory API
- **存储**: localStorage

## License

MIT
