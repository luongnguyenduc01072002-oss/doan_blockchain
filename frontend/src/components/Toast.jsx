import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, XCircle, Info, Loader2, ExternalLink, X } from 'lucide-react';
import { txLink } from '../utils/config';

const ToastContext = createContext(null);
const ICONS = { success: CheckCircle2, error: XCircle, info: Info, loading: Loader2 };

/** Thông báo dạng thẻ góc màn hình — thay cho alert() chặn trang. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback((toast, id = crypto.randomUUID()) => {
    setToasts((t) => [...t.filter((x) => x.id !== id), { ...toast, id }]);
    if (toast.type !== 'loading') setTimeout(() => dismiss(id), toast.type === 'error' ? 7000 : 4500);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div key={t.id} className={`toast toast--${t.type}`}>
              <Icon size={20} className={t.type === 'loading' ? 'spin' : ''} />
              <div className="toast__body">
                <strong>{t.title}</strong>
                {t.message && <p>{t.message}</p>}
                {t.hash && (
                  <a href={txLink(t.hash)} target="_blank" rel="noreferrer">
                    Xem giao dịch trên Etherscan <ExternalLink size={12} />
                  </a>
                )}
              </div>
              <button className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Đóng"><X size={16} /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
