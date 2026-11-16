import { API_URL, getSigner } from './config';

/**
 * Gọi API trao đổi đơn hàng (backend/chat.js).
 * Đăng nhập = ký 1 thông điệp chứa mã nonce do server phát (không tốn gas), nhận về token dùng 24 giờ.
 */
const KEY = (address) => `escrowmart:session:${address}`;

export const loadSession = (address) => {
  if (!address) return null;
  try {
    const s = JSON.parse(localStorage.getItem(KEY(address)) || 'null');
    return s && s.exp > Date.now() + 60_000 ? s.token : null;
  } catch { return null; }
};
const saveSession = (address, token, ttl) => {
  try { localStorage.setItem(KEY(address), JSON.stringify({ token, exp: Date.now() + ttl })); } catch { /* ẩn danh: chỉ giữ trong bộ nhớ */ }
};
export const clearSession = (address) => { try { localStorage.removeItem(KEY(address)); } catch { /* bỏ qua */ } };

export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

export async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Lỗi máy chủ (${res.status})`, res.status, data.code);
  return data;
}

export async function login(address) {
  const { message } = await api(`/api/auth/nonce?address=${address}`);
  const signer = await getSigner();
  if ((await signer.getAddress()).toLowerCase() !== address) throw new Error('Tài khoản MetaMask đã đổi, hãy tải lại trang');
  const signature = await signer.signMessage(message);
  const { token, expiresIn } = await api('/api/auth/login', { method: 'POST', body: { address, signature } });
  saveSession(address, token, expiresIn);
  return token;
}
