# Deployment Checklist

**Version 1.1** | Last Updated: February 2026

---

## Introduction

This checklist provides a comprehensive guide for deploying BenzoApp to production. It covers pre-deployment preparation, configuration validation, testing, and post-deployment verification.

**Target audience**: DevOps engineers, system administrators, or developers deploying to production.

---

## Pre-Deployment

### 1. Code and Dependencies

- [ ] Pull latest code from `main` branch
- [ ] Update `pyproject.toml` if dependencies changed
- [ ] Run `uv sync --all-extras` to install dependencies
- [ ] Verify `uv.lock` is committed (lock file should be current)

### 2. Run All Tests

```bash
uv run pytest -v --cov=src
```

**Minimum coverage**: 80%

- [ ] All unit tests pass
- [ ] Integration tests pass (may need to skip external API-dependent tests)
- [ ] No linting errors: `uv run ruff check .`
- [ ] Type checking passes: `uv run ty check .`
- [ ] No formatting issues: `uv run ruff format --check .`

### 3. Check Configuration

- [ ] Review `.env.example` or environment variable documentation
- [ ] Ensure required environment variables are set (see Configuration section below)
- [ ] Verify file paths exist and are writable by the application user

### 4. Build and Package (if containerizing)

- [ ] Docker image builds without errors
- [ ] Image size is optimized (multi-stage builds, no dev dependencies in final image)
- [ ] Scan image for vulnerabilities (e.g., `docker scan`)
- [ ] Tag image with version and `latest` (if appropriate)

---

## Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `USER_AGENT` | **Critical**: Must include app name and contact email/URL per Nominatim policy | `BenzoApp/1.0 (ops@example.com)` |
| `PREZZI_CACHE_PATH` | Path to writable cache file | `/var/lib/benzoapp/prezzi_cache.json` |
| `PREZZI_LOCAL_DATA_DIR` | Optional: directory for CSV storage | `/var/lib/benzoapp/csv` |

### Common Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_HOST` | `127.0.0.1` | Bind address (use `0.0.0.0` for container) |
| `SERVER_PORT` | `8000` | Port number |
| `CORS_ALLOWED_ORIGINS` | Localhost dev servers | Comma-separated allowed origins |
| `SEARCH_TIMEOUT_SECONDS` | `12` | Request timeout (increase if slow network) |
| `PREZZI_CACHE_HOURS` | `24` | Cache freshness threshold |

### Verifying Configuration

Create a test `.env` file and validate:

```bash
# Export critical variables
export USER_AGENT="BenzoApp/1.0 (admin@example.com)"
export PREZZI_CACHE_PATH="/tmp/benzoapp_cache.json"

# Test Settings load
uv run python -c "from src.models import Settings; s = Settings(); print('OK')"
```

**Expected**: No exceptions, prints "OK".

---

## Infrastructure Preparation

### File System

- [ ] Create cache directory if using `PREZZI_LOCAL_DATA_DIR`
- [ ] Ensure correct ownership: `chown -R benzoapp:benzoapp /var/lib/benzoapp`
- [ ] Set appropriate permissions: `chmod 755` directories, `chmod 644` files
- [ ] Test writability: application user must be able to write to cache path

### Network

- [ ] Open firewall for `SERVER_PORT` (default 8000) if direct access needed
- [ ] If behind reverse proxy (nginx, Apache), configure proxy pass to `http://127.0.0.1:8000`
- [ ] Configure TLS termination (HTTPS) at proxy layer (recommended)
- [ ] Set up domain name DNS A/AAAA record pointing to server

### Reverse Proxy (nginx) Example

```nginx
server {
    listen 80;
    server_name benzoapp.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name benzoapp.example.com;

    ssl_certificate /etc/ssl/certs/benzoapp.crt;
    ssl_certificate_key /etc/ssl/private/benzoapp.key;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /static {
        alias /path/to/benzoapp/src/static;
        expires 1h;
        add_header Cache-Control "public, max-age=3600";
    }
}
```

### Process Manager

BenzoApp can be run with `uvicorn` directly or via a process manager.

**Option A: Systemd Service**

Create `/etc/systemd/system/benzoapp.service`:

```ini
[Unit]
Description=BenzoApp Gas Station Finder
After=network.target

[Service]
Type=simple
User=benzoapp
WorkingDirectory=/opt/benzoapp
Environment="PATH=/opt/benzoapp/.venv/bin"
EnvironmentFile=/opt/benzoapp/.env
ExecStart=/opt/benzoapp/.venv/bin/uvicorn src.main:app --host 127.0.0.1 --port 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable benzoapp
sudo systemctl start benzoapp
sudo systemctl status benzoapp
```

**Option B: Docker Compose**

```yaml
version: '3.8'
services:
  benzoapp:
    build: .
    ports:
      - "8000:8000"
    environment:
      - USER_AGENT=BenzoApp/1.0 (ops@example.com)
      - PREZZI_CACHE_PATH=/data/prezzi_cache.json
    volumes:
      - ./data:/data
    restart: unless-stopped
```

---

## Deployment Steps

### 1. Prepare Application Directory

```bash
# On production server
sudo mkdir -p /opt/benzoapp
sudo chown -R $USER /opt/benzoapp
cd /opt/benzoapp

# Clone or pull code
git clone <repository> .
git checkout main
git pull origin main

# Install dependencies
uv sync --all-extras
```

### 2. Configure Application

```bash
# Create .env file (or set systemd EnvironmentFile)
cat > .env << EOF
USER_AGENT=BenzoApp/1.0 (admin@example.com)
PREZZI_CACHE_PATH=/var/lib/benzoapp/prezzi_cache.json
SERVER_HOST=127.0.0.1
SERVER_PORT=8000
# Optional: customize other settings
EOF

# Create cache directory
sudo mkdir -p /var/lib/benzoapp
sudo chown benzoapp:benzoapp /var/lib/benzoapp
```

### 3. Pre-warm Cache (Optional but recommended)

Trigger CSV download before opening to users:

```bash
# Option A: Use the reload API
curl -X POST https://yourdomain.com/api/reload-csv

# Option B: Run directly
uv run python -c "
from src.services.prezzi_csv import preload_local_csv_cache
from src.models import Settings
import asyncio
asyncio.run(preload_local_csv_cache(Settings()))
)"
```

### 4. Start Application

```bash
# Option A: systemd (recommended)
sudo systemctl start benzoapp
sudo systemctl enable benzoapp

# Option B: uvicorn directly (for testing)
uv run uvicorn src.main:app --host 127.0.0.1 --port 8000 --reload
```

### 5. Verify Service

```bash
# Health check
curl http://127.0.0.1:8000/health
# Expected: {"status":"ok"}

# Main page
curl http://127.0.0.1:8000/ | head -20
# Expected: HTML content with "<!doctype html>" or "<html"

# Test search (requires external APIs)
curl -X POST http://127.0.0.1:8000/search \
  -H "Content-Type: application/json" \
  -d '{"city":"Roma","radius":10,"fuel":"benzina","results":2}'
```

---

## Post-Deployment

### Monitoring

- [ ] Set up uptime monitoring (e.g., Pingdom, UptimeRobot) for `/health` endpoint
- [ ] Configure log aggregation (e.g., journald, ELK, Loki)
- [ ] Monitor error rates and response times (consider Prometheus metrics if scaling)
- [ ] Set alerts for:
  - 5xx error rate > 1%
  - Response time > 5 seconds (p95)
  - Disk space < 20% on cache partition

### CSV Data Freshness

- [ ] Verify CSV auto-refresh is working: check `/api/csv-status` endpoint
- [ ] Set up daily manual check or Cron job if auto-refresh fails:
  ```bash
  # Refresh CSV daily at 3am
  0 3 * * * /opt/benzoapp/.venv/bin/curl -X POST http://localhost:8000/api/reload-csv
  ```

### Rate Limiting

The default `slowapi` limiter is 10 requests/minute per IP. Adjust in `src/main.py` if needed:

```python
@limiter.limit("30/minute")  # Increase as needed
@app.post("/search")
```

For production with reverse proxy, consider:
- Limiting at proxy layer (nginx `limit_req`)
- Using distributed rate limiter (Redis) if multiple workers

---

## Rollback Plan

If deployment fails:

1. **Stop new code**: `sudo systemctl stop benzoapp`
2. **Check logs**: `sudo journalctl -u benzoapp -n 50`
3. **Rollback**:
   - Git checkout previous commit: `git checkout <previous-hash>`
   - Reinstall: `uv sync --all-extras`
   - Restart: `sudo systemctl start benzoapp`
4. **Verify**: Run health check and smoke tests
5. **If rollback fails**: Restore from backup or redeploy known-good version

### Database/State

BenzoApp has no database, only file cache. Rollback is straightforward:
- Code rollback is sufficient
- Cache files are compatible across versions (JSON schema stable)

If cache corruption suspected, delete cache file:

```bash
sudo rm /var/lib/benzoapp/prezzi_cache.json
# App will re-download on next request
```

---

## Security Checklist

- [ ] **User-Agent**: Set to app-specific value with contact info (not default)
- [ ] **CORS origins**: Restrict to actual frontend domains (remove localhost if not needed)
- [ ] **Rate limiting**: Enabled and tuned for expected load
- [ ] **HTTPS**: TLS termination in place (do not expose plain HTTP to internet)
- [ ] **Firewall**: Only necessary ports open (80/443 for public, 8000 local only)
- [ ] **File permissions**: App user has minimal required permissions
- [ ] **Secrets**: No API keys or passwords needed (all external APIs are public)
- [ ] **Logging**: No sensitive data in logs (coordinates and prices are public)
- [ ] **Update dependencies**: `uv sync --upgrade-package` to get security patches

---

## Production Considerations

### Performance

- **Concurrent requests**: uvicorn default single worker may limit throughput. Use `--workers N` or gunicorn with `uvicorn workers` for multi-CPU usage:
  ```bash
  gunicorn src.main:app -w 4 -k uvicorn.workers.UvicornWorker -b 127.0.0.1:8000
  ```
- **Cache hit rate**: Geocoding cache improves performance for repeated cities. Monitor via Prometheus if implemented.

### Reliability

- **CSV download failures**: The app continues serving stale cache while retrying in background. Check `/api/csv-status` for `is_stale`.
- **External API downtime**: If Nominatim is down, cities with cached coordinates still work; new cities fail with 503.
- **Disk space**: Monitor `/var/lib/benzoapp` usage; CSVs are ~10MB each, retained per `PREZZI_KEEP_VERSIONS`.

### Logging

Logs go to stdout by default (loguru). With systemd, view via:

```bash
sudo journalctl -u benzoapp -f  # follow
sudo journalctl -u benzoapp --since "1 hour ago"
```

Log level is `INFO` by default. Increase to `DEBUG` for troubleshooting:

```bash
# In .env or systemd service file
LOG_LEVEL=DEBUG
```

(Add environment variable handling if needed.)

---

## Validation After Deployment

### Functional Tests

1. Open the frontend URL in browser
2. Search for a major Italian city (e.g., Roma, Milano, Napoli)
3. Verify:
   - Map loads with station markers
   - Results panel shows stations with prices
   - Clicking a marker shows popup
   - "Best Price" badge appears on cheapest station
   - CSV status indicator shows "fresh" or "stale" (acceptable)

### API Tests

```bash
# Health check
curl -f https://yourdomain.com/health

# Search
curl -X POST https://yourdomain.com/search \
  -H "Content-Type: application/json" \
  -d '{"city":"Firenze","radius":10,"fuel":"gasolio","results":5}' | jq .

# CSV status
curl https://yourdomain.com/api/csv-status | jq .
```

### Error Scenario Tests

1. Temporarily set invalid `USER_AGENT` (without contact), restart → app should fail validation on startup (pydantic error)
2. Make cache directory read-only → verify error logged but app continues (writes to alternate location)
3. Simulate Nominatim outage → cities with cache work; new cities return 503 with friendly message

---

## Maintenance

### Daily

- Monitor `/api/csv-status` for stale data (expected: fresh after auto-refresh)
- Check error logs for rate limit warnings from Nominatim

### Weekly

- Review rate limits: if seeing frequent 429/509, consider increasing cache TTL or reducing search volume
- Check disk usage on cache partition

### Monthly

- Update dependencies: `uv sync --upgrade`
- Run security scans: `uv run pip-audit` or similar
- Review access logs for unusual patterns

### As Needed

- Re-deploy new versions using this checklist
- Adjust rate limits based on usage patterns
- Increase caching TTL if Nominatim rate limits are restrictive

---

## Troubleshooting

### App starts but returns 500 on `/search`

Check logs:
```bash
sudo journalctl -u benzoapp -n 100
```
Common causes:
- Cache path not writable → fix permissions or change `PREZZI_CACHE_PATH`
- Invalid `USER_AGENT` → ensure includes email or URL

### High rate of 503 errors from Nominatim

Expected if hitting bandwidth limits. Mitigations:
1. Wait for rate limit window (check `Retry-After` header in logs)
2. Ensure `cities.json` fallback exists with popular city coordinates
3. Consider reducing search request volume (rate limit at proxy)
4. Increase geocoding cache size in `src/services/geocoding.py` (maxsize)

### CSV never refreshes

Check:
- Network connectivity to MIMIT URLs
- Disk space on cache partition
- Write permissions to `PREZZI_CACHE_PATH` directory
- Logs for download errors

Manually trigger refresh:
```bash
curl -X POST https://yourdomain.com/api/reload-csv
```

---

## Additional Resources

- [FastAPI Deployment Documentation](https://fastapi.tiangolo.com/deployment/)
- [Uvicorn Settings](https://www.starlette.io/wsgi/#uvicorn)
- [Nominatim Usage Policy](https://nominatim.org/release-docs/develop/api/Settings/)
- [MIMIT Data Source](https://www.mimit.gov.it/images/exportCSV/)

---

**End of Deployment Checklist**
