# LkSGCompass (Full-stack SaaS Starter)

This repository is a deployable, multi-tenant SaaS starter for **LkSG** supplier risk management and **BAFA** annual reporting.

## What you get (working)
- Email/password auth (JWT)
- Multi-tenant companies (data scoped by company)
- Suppliers CRUD + CSV import endpoint
- Risk engine (country + industry + signals) + recalculation endpoint
- Complaints (whistleblower) CRUD (create + list)
- BAFA annual report PDF generator (structured sections) per company + year
- Next.js dashboard UI (login, suppliers, map, complaints, reports)
- Docker Compose: Postgres init + API + Web

## Quick start
1) Copy env file:
```bash
cp .env.example .env
```

2) Start:
```bash
docker compose up --build
```

3) Open:
- Web: http://localhost:3000
- API health: http://localhost:4000/health

## Demo flow
1) Register a company + admin user in UI
2) Login
3) Add suppliers, run risk recalculation
4) Generate BAFA report (PDF)
5) Submit a complaint for a supplier

## CSV import format
Header optional. Each row:
`name,country,industry`

Example:
```csv
name,country,industry
TechParts,China,electronics
Textile Group,Bangladesh,textile
```

## Notes
- This is a production-grade **starter**. For real customers you’ll add:
  - Billing (Stripe), RBAC, audit logs, file storage (S3), real risk datasets/APIs, email notifications.
