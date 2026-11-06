import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Copy, Check, ExternalLink, RefreshCw, LogOut, Crown } from 'lucide-react';
import { shortAddr, addrLink, formatEth, getEthBalance, CHAIN_NAME } from '../utils/config';

/** Nút tài khoản trên thanh đầu trang + menu: sao chép địa chỉ, số dư, đổi tài khoản, đăng xuất. */
export default function AccountMenu({ account, isAdmin, onSwitchAccount, onDisconnect, busy }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [balance, setBalance] = useState(null);
  const ref = useRef(null);

  // Đóng menu khi bấm ra ngoài hoặc nhấn Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // Mỗi lần mở menu thì đọc lại số dư
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setBalance(null);
    getEthBalance(account).then((b) => alive && setBalance(b)).catch(() => alive && setBalance('?'));
    return () => { alive = false; };
  }, [open, account]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(account); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* trình duyệt chặn */ }
  };

  return (
    <div className="account" ref={ref}>
      <button className={`account-chip ${open ? 'is-open' : ''}`} onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu" aria-expanded={open} title={account}>
        {isAdmin && <Crown size={14} className="account-chip__crown" />}
        <span className="avatar" style={{ '--h': parseInt(account.slice(2, 6), 16) % 360 }} />
        <span className="mono">{shortAddr(account)}</span>
        <ChevronDown size={15} className="account-chip__caret" />
      </button>

      {open && (
        <div className="menu" role="menu">
          <div className="menu__head">
            <span className="avatar avatar--lg" style={{ '--h': parseInt(account.slice(2, 6), 16) % 360 }} />
            <div className="menu__who">
              <span className={`role ${isAdmin ? 'role--admin' : ''}`}>{isAdmin ? <><Crown size={12} /> Admin (người phân xử)</> : 'Người dùng'}</span>
              <span className="mono">{shortAddr(account)}</span>
            </div>
            <button className="icon-btn" onClick={copy} title="Sao chép địa chỉ" aria-label="Sao chép địa chỉ ví">
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>

          <div className="menu__balance">
            <span className="muted">Số dư ({CHAIN_NAME})</span>
            <strong>{balance === null ? '…' : balance === '?' ? 'Không đọc được' : `${formatEth(balance)} ETH`}</strong>
          </div>

          <a className="menu__item" role="menuitem" href={addrLink(account)} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
            <ExternalLink size={16} /> Xem ví trên Etherscan
          </a>
          <button className="menu__item" role="menuitem" disabled={busy} onClick={() => { setOpen(false); onSwitchAccount(); }}>
            <RefreshCw size={16} /> Đổi tài khoản
          </button>
          <button className="menu__item menu__item--danger" role="menuitem" disabled={busy}
            title={busy ? 'Đang có giao dịch chờ xác nhận' : undefined}
            onClick={() => { setOpen(false); onDisconnect(); }}>
            <LogOut size={16} /> Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}
