#!/bin/sh
# Sao lưu hằng đêm (02:00): pg_dump giữ 14 bản. Chạy trong container `backup` của docker-compose.
set -eu
mkdir -p /backups/db
while true; do
  now=$(date +%s)
  next=$(date -d "02:00 tomorrow" +%s 2>/dev/null || echo $((now + 86400)))
  [ "$(date +%H)" -lt 2 ] && next=$(date -d "02:00" +%s 2>/dev/null || echo $((now + 3600)))
  sleep $((next - now))
  f="/backups/db/ospm-$(date +%Y%m%d).dump"
  pg_dump -h postgres -U "${POSTGRES_USER:-ospm}" -Fc "${POSTGRES_DB:-ospm}" > "$f" && echo "backup ok: $f"
  ls -1t /backups/db/ospm-*.dump | tail -n +15 | xargs -r rm -f
done
