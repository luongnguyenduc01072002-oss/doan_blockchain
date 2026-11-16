import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clearSession, loadSession, login } from '../utils/chatApi';

/** Phiên đăng nhập hộp thư gắn với ví đang kết nối. Đổi ví -> đổi phiên. */
export default function useSession(account) {
  const [token, setToken] = useState(() => loadSession(account));
  const pending = useRef(null);

  useEffect(() => { setToken(loadSession(account)); pending.current = null; }, [account]);

  /** Trả về token; nếu chưa có thì mở MetaMask để ký (gộp các lần gọi trùng nhau). */
  const ensure = useCallback(async () => {
    if (!account) throw new Error('NO_ACCOUNT');
    const saved = loadSession(account);
    if (saved) { setToken(saved); return saved; }
    pending.current ??= login(account).finally(() => { pending.current = null; });
    const t = await pending.current;
    setToken(t);
    return t;
  }, [account]);

  const clear = useCallback(() => { clearSession(account); setToken(null); }, [account]);

  // Giữ nguyên object giữa các lần render để các useEffect phụ thuộc không chạy lại liên tục
  return useMemo(() => ({ token, ensure, clear }), [token, ensure, clear]);
}
