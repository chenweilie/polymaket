# polymaket

AI-powered system that connects prediction market data, LLM analysis workflows, and real-time price APIs to solve a real operational problem in market intelligence.

This project demonstrates how AI can be integrated into practical trading research systems rather than used as isolated model demos.

## Problem

Many prediction market traders still rely on manual monitoring and repetitive data review.

Example scenario:
- Traders need to monitor hundreds of Polymarket events in real time
- Manual filtering and evaluation of market odds is slow and error-prone
- No automated AI analysis or decision support pipeline exists

The goal of this project is to demonstrate how AI can automate prediction market research end-to-end.

## Solution Overview

This system connects Polymarket's live API with AI analysis logic, smart filtering, and automated alert execution.

High-level workflow:
```
Polymarket API Feed
       ↓
AI Filtering & Scoring
       ↓
LLM Analysis Card Generation
       ↓
User Decision Support
       ↓
Alert / Trade Action
```

The architecture demonstrates how an AI component can be embedded into a larger market intelligence system.

## Architecture

**Input Layer**
- Polymarket Gamma API (live event feed)
- Real-time odds and liquidity data

**AI Processing Layer**
- Value scoring algorithm (volume + liquidity signals)
- Smart filtering (removes random/noise markets)
- LLM analysis card generation (formatted for AI prompt input)
- Auto-translation via MyMemory API

**Automation Layer**
- Real-time price monitoring with alerts
- Portfolio P&L tracking with auto-refresh
- Price threshold trigger system

**Execution Layer**
- Push notifications for price targets
- CSV data export
- JSON backup / restore

**Architecture Diagram:**
```
Polymarket API
      ↓
 Filter + Score
      ↓
 LLM Analysis Card
      ↓
 Alert Trigger
      ↓
 Action / Notification
```

## Tech Stack

**AI / ML**
- LLM APIs (via copyable analysis cards)
- Value scoring model
- Translation API (MyMemory)

**Frontend**
- Vanilla JavaScript / HTML / CSS
- PWA (Progressive Web App)
- LocalStorage for persistence

**Backend / Infrastructure**
- Docker + Nginx (API proxy + basic auth)
- Polymarket Gamma API
- Mobile-first responsive design

## Example Use Cases

This architecture can support:
- Prediction market arbitrage research
- Real-time event monitoring dashboards
- AI-assisted financial decision workflows
- Mobile-first market intelligence tools
- Automated portfolio tracking systems

## Results

Example performance metrics:
- Market data to AI analysis card: < 1 second
- Auto-price refresh cycle: every 5 minutes
- Filters 100+ markets to high-value opportunities automatically
- Replaces hours of manual market scanning per session

This project demonstrates how AI can drive practical operational efficiency in market research.

## Demo

Example workflow:
1. System fetches live Polymarket event feed
2. AI scoring layer filters and ranks events by value
3. User selects event — one click generates LLM analysis card
4. LLM processes card and returns arbitrage recommendation
5. User sets price alert — system triggers notification when target reached

*Add screenshots, GIFs, or demo videos here.*

## Repository Structure

```
polymaket/
├── index.html          # Main UI (search, 3 tabs, settings)
├── styles.css          # Dark/light theme, animations
├── app.js             # Core logic (~1000 lines)
├── manifest.json       # PWA config
├── Dockerfile
├── docker-compose.yml
├── nginx.conf          # API proxy + auth
└── README.md
```

## Quick Start

Clone the repository
```bash
git clone https://github.com/chenweilie/polymaket
```

Start with Docker
```bash
cd polymaket
docker-compose up -d --build
```

Access at: http://localhost:8080

Default credentials: `admin` / `polymarket123`

## Future Improvements

Possible extensions:
- Multi-market automated arbitrage detection
- Direct LLM API integration (no manual copy-paste)
- Real-time WebSocket price feeds
- Advanced portfolio analytics dashboard
- Mobile push notification support

## Author

William Chen  
Applied AI Engineer | AI Integration | Automation Systems

**LinkedIn:** https://linkedin.com/in/william-chen-98264938  
**GitHub:** https://github.com/chenweilie
