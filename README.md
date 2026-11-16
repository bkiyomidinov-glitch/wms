# WMS Core — Корпоративная система складского и товарного учета

Система складского и товарного учета (часовой пояс `Asia/Dushanbe`, UTC+5).

## Архитектура и стек
- **Database:** PostgreSQL 16 (строгие реляционные таблицы + `JSONB` с `GIN`-индексами для динамического конструктора).
- **Backend:** Python 3.12+, FastAPI, SQLAlchemy 2.0 Async, Pydantic v2, Alembic, JWT (`Access` + `Refresh`), `bcrypt`, блокировка строк `SELECT ... FOR UPDATE` при изменении остатков.
- **Frontend:** React 18+, TypeScript, Vite, Tailwind CSS, Shadcn/UI (Radix), TanStack Query, React Hook Form + Zod.
- **Дизайн:** Швейцарский индустриальный минимализм (`#F8FAFC`/`#FFFFFF`, `#0F172A`, `#0284C7`, семантические цвета `#16A34A` Принять / `#D97706` Отправить, `tabular-nums`, автофокус штрихкода, горячие клавиши `Enter`/`Esc`).

## Быстрый запуск через Docker Compose

```bash
cp .env.example .env
docker compose up --build -d
```

- Frontend (Nginx + SPA): `http://localhost`
- Backend API (Swagger OpenAPI): `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

При первом запуске автоматически выполняются миграции Alembic (`alembic upgrade head`) и идемпотентный Seed:
- Товар: **`Вода Хаёт 0.5 литров`** (штрихкод `4870001001`, остаток `110 штук / 55 литров`).
- Тестовые учетные записи (RBAC):
  - `admin` / `Admin123!` (`SUPER_ADMIN`)
  - `director` / `Director123!` (`DIRECTOR`)
  - `manager` / `Manager123!` (`MANAGER`)
  - `operator` / `Operator123!` (`OPERATOR`)

## Локальная разработка и тесты

### Backend
```bash
cd backend
uv venv --python 3.12 .venv
uv pip install -e ".[dev]" --python .venv/Scripts/python.exe
.venv/Scripts/pytest.exe -v
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```
