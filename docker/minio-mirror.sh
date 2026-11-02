#!/bin/sh
# `mc mirror` bucket đính kèm sang /backups/minio hằng đêm (03:00).
set -eu
until mc alias set local http://minio:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null 2>&1; do sleep 2; done
while true; do
  mc mirror --overwrite local/"$S3_BUCKET_ATTACHMENTS" /backups/minio && echo "mirror ok"
  sleep 86400
done
