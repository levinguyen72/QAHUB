/** Đọc biến môi trường lười (lazy) để test có thể đặt env sau khi import. */
const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const env = {
  get databaseUrl() { return process.env.DATABASE_URL!; },
  get jwtSecret() { return process.env.JWT_SECRET ?? 'dev-access-secret'; },
  get jwtRefreshSecret() { return process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret'; },
  get s3Endpoint() { return process.env.S3_ENDPOINT ?? 'http://localhost:9000'; },
  get s3PublicEndpoint() { return process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT ?? 'http://localhost:9000'; },
  get s3AccessKey() { return process.env.S3_ACCESS_KEY ?? 'minioadmin'; },
  get s3SecretKey() { return process.env.S3_SECRET_KEY ?? 'minioadmin'; },
  get s3Bucket() { return process.env.S3_BUCKET_ATTACHMENTS ?? 'attachments'; },
  get webOrigin() { return process.env.WEB_ORIGIN ?? 'http://localhost:5173'; },
  get ingestMaxResults() { return num(process.env.INGEST_MAX_RESULTS_PER_RUN, 5000); },
  get port() { return num(process.env.PORT, 3000); },
  get seedAdminPassword() { return process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345'; },
  get runRetentionDays() { return num(process.env.RUN_RETENTION_DAYS, 90); },
  get nodeEnv() { return process.env.NODE_ENV ?? 'development'; },
  // Kho lưu trữ file đính kèm: 'local' (lưu đĩa, mặc định) hoặc 's3' (MinIO/S3).
  get storageDriver() { return (process.env.STORAGE_DRIVER ?? 'local').toLowerCase(); },
  // Thư mục gốc chứa file khi dùng driver 'local' (trên VPS trỏ tới ổ/volume cố định, vd /var/lib/ospm/storage).
  get storageDir() { return process.env.STORAGE_DIR ?? `${process.cwd()}/var/storage`; },
  // Base URL công khai để tạo link upload/download đã ký. Local: http://localhost:3000; VPS: https://<domain> (nginx định tuyến /api).
  get storagePublicUrl() { return (process.env.STORAGE_PUBLIC_URL ?? `http://localhost:${this.port}`).replace(/\/+$/, ''); },
  // Khóa HMAC ký link; mặc định dùng JWT_SECRET để khỏi phải khai báo thêm.
  get storageSecret() { return process.env.STORAGE_SECRET ?? process.env.JWT_SECRET ?? 'dev-storage-secret'; },
};

export const ACCESS_TOKEN_TTL = '15m';
export const REFRESH_TOKEN_TTL_DAYS = 14;
export const REFRESH_COOKIE = 'refresh_token';
