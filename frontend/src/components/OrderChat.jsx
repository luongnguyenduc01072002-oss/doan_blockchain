import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Send, Loader2, MapPin, Truck, Gavel, MessageSquare, Paperclip, Lock, ShieldCheck, KeyRound, ExternalLink, ShieldAlert } from 'lucide-react';
import { STATUS, shortAddr, friendlyError } from '../utils/config';
import { api } from '../utils/chatApi';
import { ProductImage } from './ProductGrid';

const ROLE_LABEL = { buyer: 'Người mua', seller: 'Người bán', admin: 'Admin' };
const KIND = {
  text: { label: 'Tin nhắn', icon: MessageSquare },
  shipping: { label: 'Địa chỉ nhận hàng', icon: MapPin },
  tracking: { label: 'Mã vận đơn', icon: Truck },
  dispute: { label: 'Lý do khiếu nại', icon: Gavel },
};
const PLACEHOLDER = {
  text: 'Nhập tin nhắn…',
  shipping: 'Họ tên – Số điện thoại – Địa chỉ nhận hàng',
  tracking: 'Đơn vị vận chuyển – Mã vận đơn (VD: GHN – GHN123456)',
  dispute: 'Bổ sung lý do khiếu nại / bằng chứng cho Admin',
};
// Loại tin mỗi vai trò được gửi (khớp backend/chat.js)
const KINDS_FOR = { buyer: ['text', 'shipping'], seller: ['text', 'tracking'], admin: ['text'] };
const IMG = /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i;

const fmtTime = (s) => new Date(s).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

function Message({ m, mine }) {
  const kind = KIND[m.kind] || KIND.text;
  return (
    <li className={`msg ${mine ? 'msg--mine' : ''} msg--${m.role} ${m.kind !== 'text' ? `msg--kind-${m.kind}` : ''}`}>
      <span className="msg__who">
        {mine ? 'Bạn' : ROLE_LABEL[m.role]} <span className="mono">{shortAddr(m.sender)}</span> · {fmtTime(m.created_at)}
      </span>
      <div className="msg__bubble">
        {m.kind !== 'text' && <span className="msg__kind"><kind.icon size={13} /> {kind.label}</span>}
        <p>{m.body}</p>
        {m.attachment_url && (
          <a className="msg__link" href={m.attachment_url} target="_blank" rel="noreferrer noopener">
            {IMG.test(m.attachment_url) && <img src={m.attachment_url} alt="Ảnh đính kèm" loading="lazy" referrerPolicy="no-referrer"
              onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
            <span><Paperclip size={12} /> {new URL(m.attachment_url).hostname} <ExternalLink size={11} /></span>
          </a>
        )}
      </div>
    </li>
  );
}

/**
 * Khung trao đổi của MỘT đơn hàng. Tin nhắn lưu off-chain (backend), quyền xem do server kiểm tra
 * bằng cách đọc người mua / người bán / trạng thái thật trong hợp đồng.
 */
export default function OrderChat({ order, product, account, session, draft, onClose, onRead }) {
  const [messages, setMessages] = useState([]);
  const [meta, setMeta] = useState(null);            // { role, canPost, status }
  const [state, setState] = useState('idle');        // idle | loading | ready | error
  const [error, setError] = useState('');
  const [kind, setKind] = useState(draft?.kind || 'text');
  const [text, setText] = useState(draft?.body || '');
  const [link, setLink] = useState('');
  const [showLink, setShowLink] = useState(false);
  const [sending, setSending] = useState(false);
  const [signing, setSigning] = useState(false);
  const lastId = useRef(0);
  const listRef = useRef(null);
  const { token } = session;

  const load = useCallback(async (initial) => {
    if (!token) return;
    if (initial) { setState('loading'); lastId.current = 0; }
    try {
      const data = await api(`/api/orders/${order.id}/messages?after=${lastId.current}`, { token });
      setMeta({ role: data.role, canPost: data.canPost, status: data.status });
      if (data.messages.length) {
        lastId.current = data.messages[data.messages.length - 1].id;
        setMessages((prev) => (initial ? data.messages : [...prev, ...data.messages.filter((m) => !prev.some((p) => p.id === m.id))]));
        onRead?.();
      } else if (initial) setMessages([]);
      setState('ready');
      setError('');
    } catch (e) {
      if (e.code === 'SESSION') { session.clear(); return; }
      if (initial || e.status === 403) { setState('error'); setError(friendlyError(e)); }
    }
  }, [order.id, token, session, onRead]);

  useEffect(() => { load(true); }, [load]);
  useEffect(() => {
    if (!token || state === 'error') return;
    const t = setInterval(() => document.visibilityState === 'visible' && load(false), 5000);
    return () => clearInterval(t);
  }, [token, state, load]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [messages.length]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const signIn = async () => {
    setSigning(true); setError('');
    try { await session.ensure(); } catch (e) { setError(friendlyError(e)); } finally { setSigning(false); }
  };

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true); setError('');
    try {
      const { message } = await api(`/api/orders/${order.id}/messages`, {
        token, method: 'POST', body: { kind, body: text.trim(), attachment_url: showLink && link.trim() ? link.trim() : undefined },
      });
      lastId.current = Math.max(lastId.current, message.id);
      setMessages((prev) => [...prev, message]);
      setText(''); setLink(''); setShowLink(false); setKind('text');
    } catch (err) {
      if (err.code === 'SESSION') session.clear();
      setError(friendlyError(err));
    } finally { setSending(false); }
  };

  const role = meta?.role;
  const st = STATUS[order.status];
  const disputed = order.status === 3 || messages.some((m) => m.kind === 'dispute');
  // Đơn đang tranh chấp: hai bên gửi thêm được "lý do khiếu nại" (backend kiểm tra trạng thái on-chain)
  const kinds = [...(KINDS_FOR[role] || ['text']), ...(order.status === 3 && role !== 'admin' && role ? ['dispute'] : [])];

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="chat-title" onClick={(e) => e.stopPropagation()}>
        <header className="drawer__head">
          <div className="order__product">
            <ProductImage src={product?.image_url} alt={product?.name || ''} />
            <div>
              <span className="order__id">Đơn #{order.id}</span>
              <h2 id="chat-title">{product?.name || `Sản phẩm #${order.productId}`}</h2>
              <span className={`status status--${st.tone}`}>{st.label}</span>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </header>

        <div className="drawer__people">
          <span className={role === 'buyer' ? 'is-me' : ''}><b>Người mua</b> <span className="mono">{shortAddr(order.buyer)}</span></span>
          <span className={role === 'seller' ? 'is-me' : ''}><b>Người bán</b> <span className="mono">{shortAddr(order.seller)}</span></span>
          <span className={`${disputed ? 'is-on' : 'is-off'} ${role === 'admin' ? 'is-me' : ''}`}><b>Admin</b> {disputed ? 'đang xem' : 'chỉ vào khi khiếu nại'}</span>
        </div>

        {!token ? (
          <div className="drawer__gate">
            <KeyRound size={30} />
            <h3>Mở hộp thư của đơn này</h3>
            <p className="muted">Ký 1 thông điệp bằng MetaMask để chứng minh bạn là người mua / người bán. <b>Không tốn gas, không chuyển tiền.</b> Phiên dùng được 24 giờ.</p>
            <button className="btn btn--primary" onClick={signIn} disabled={signing}>
              {signing ? <Loader2 size={16} className="spin" /> : <KeyRound size={16} />} Ký để đăng nhập
            </button>
            {error && <p className="form-error">{error}</p>}
          </div>
        ) : state === 'loading' || state === 'idle' ? (
          <div className="drawer__gate"><Loader2 size={26} className="spin" /></div>
        ) : state === 'error' ? (
          <div className="drawer__gate"><ShieldAlert size={30} /><p>{error}</p></div>
        ) : (
          <>
            <ol className="msgs" ref={listRef}>
              {messages.length === 0 && (
                <li className="msgs__empty">
                  <MessageSquare size={26} />
                  <p>{role === 'buyer' ? 'Gửi địa chỉ nhận hàng cho người bán để họ giao hàng.'
                    : role === 'seller' ? 'Hỏi địa chỉ người mua, sau khi gửi hàng thì gửi mã vận đơn.'
                    : 'Chưa có trao đổi nào.'}</p>
                </li>
              )}
              {messages.map((m) => <Message key={m.id} m={m} mine={m.sender === account} />)}
            </ol>

            {meta?.canPost ? (
              <form className="composer" onSubmit={send}>
                {kinds.length > 1 && (
                  <div className="composer__kinds">
                    {kinds.map((k) => {
                      const K = KIND[k];
                      return (
                        <button type="button" key={k} className={`chip ${kind === k ? 'is-active' : ''}`} onClick={() => setKind(k)}>
                          <K.icon size={13} /> {K.label}
                        </button>
                      );
                    })}
                  </div>
                )}
                {showLink && (
                  <input className="composer__link" type="url" value={link} onChange={(e) => setLink(e.target.value)}
                    placeholder="Link ảnh / video bằng chứng (https://…)" />
                )}
                <div className="composer__row">
                  <button type="button" className={`icon-btn ${showLink ? 'is-active' : ''}`} onClick={() => setShowLink((v) => !v)} aria-label="Đính kèm link"><Paperclip size={18} /></button>
                  <textarea rows={1} value={text} maxLength={1000} placeholder={PLACEHOLDER[kind]}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); } }} />
                  <button className="btn btn--primary composer__send" disabled={!text.trim() || sending} aria-label="Gửi">
                    {sending ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                  </button>
                </div>
                {error && <p className="form-error">{error}</p>}
              </form>
            ) : (
              <p className="drawer__readonly"><Lock size={14} /> {role === 'admin' ? 'Đơn đã phân xử xong, Admin chỉ xem lại.' : 'Đơn đã kết thúc, cuộc trò chuyện chỉ còn để xem lại.'}</p>
            )}
          </>
        )}

        <p className="drawer__privacy"><ShieldCheck size={13} /> Tin nhắn lưu ngoài blockchain (không công khai). Chỉ người mua, người bán và Admin khi có khiếu nại đọc được.</p>
      </aside>
    </div>
  );
}
