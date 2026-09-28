# Darkmap team setup

This package contains the complete Darkmap application source, UI assets, seed data, tests,
and deployment configuration. Live credentials and the local SQLite database are intentionally
not included.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
cp .env.example .env
```

Set the provider values in `.env` using credentials owned by your team:

```bash
BRIGHT_DATA_API_KEY=your_key
BRIGHT_DATA_SERP_ZONE=your_serp_zone
```

Then start the dashboard:

```bash
python -m darkmap.seed
uvicorn darkmap.api:app --reload --port 8000
```

Open `http://localhost:8000`. Run `python -m darkmap.worker` in a second terminal when using
queued jobs. Keep `.env` private; it is excluded by `.gitignore`.

## Deploy

Set the same environment variables in the deployment provider, including a durable
`DARKMAP_DATABASE_URL` for shared history and investigations, then deploy with the included
`vercel.json`. Do not put API keys in frontend files or commit them to source control.

Run the test suite with:

```bash
pytest -q
```
