import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

// Đường dẫn trong openapi.json đã gồm tiền tố /api/v1 nên baseURL để trống.
export const http = axios.create({
  baseURL: '',
  withCredentials: true,
  // API nhận mảng dạng csv: ?statusIds=1,2 (không dùng statusIds[]=1)
  paramsSerializer: {
    serialize: (params: Record<string, unknown>) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(params ?? {})) {
        if (v === undefined || v === null || v === '') continue;
        sp.append(k, Array.isArray(v) ? v.join(',') : String(v));
      }
      return sp.toString();
    },
  },
});

let accessToken: string | null = null;
export const getAccessToken = () => accessToken;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
};

/** Sự kiện để router đưa người dùng về /login khi phiên hết hạn hẳn. */
export const AUTH_EXPIRED_EVENT = 'ospm:auth-expired';

http.interceptors.request.use((config) => {
  if (accessToken) config.headers.set('Authorization', `Bearer ${accessToken}`);
  return config;
});

let refreshing: Promise<string | null> | null = null;

/** Đổi refresh token (cookie httpOnly) lấy access token mới. Dùng chung một lần gọi cho nhiều request 401 đồng thời. */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = axios
      .post('/api/v1/auth/refresh', null, { withCredentials: true })
      .then((r) => {
        setAccessToken(r.data.accessToken);
        return r.data.accessToken as string;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

http.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthCall = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh');
    if (error.response?.status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true;
      const token = await refreshAccessToken();
      if (token) return http(original);
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  },
);

/** Mutator cho Orval. */
export const customInstance = <T>(config: AxiosRequestConfig, options?: AxiosRequestConfig): Promise<T> =>
  http({ ...config, ...options }).then(({ data }) => data as T);

export type ErrorType<E = ApiError> = AxiosError<E>;
export type BodyType<D> = D;

export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

/** Lấy thông điệp lỗi chuẩn từ response của API. */
export function errorMessage(e: unknown, fallback = 'Có lỗi xảy ra'): string {
  const err = e as AxiosError<ApiError>;
  return err?.response?.data?.message ?? err?.message ?? fallback;
}
export const errorCode = (e: unknown): string | undefined => (e as AxiosError<ApiError>)?.response?.data?.code;
