import { ShieldCheck, Wallet, AlertTriangle } from 'lucide-react';
import { CHAIN_NAME } from '../utils/config';
import AccountMenu from './AccountMenu';

export default function Header({ wallet, isAdmin, onConnect, onSwitch, onSwitchAccount, onDisconnect, busy, tab, setTab, counts }) {
  const { account, wrongNetwork } = wallet;
  const tabs = [
    { key: 'shop', label: 'Gian hàng', count: counts.products },
    { key: 'orders', label: 'Đơn hàng của tôi', count: counts.myOrders },
    ...(isAdmin ? [{ key: 'admin', label: 'Quản trị', count: counts.disputes, alert: counts.disputes > 0 }] : []),
  ];

  return (
    <header className="header">
      <div className="header__bar container">
        <a className="brand" href="#" onClick={(e) => { e.preventDefault(); setTab('shop'); }}>
          <span className="brand__mark"><ShieldCheck size={20} strokeWidth={2.4} /></span>
          <span>
            <span className="brand__name">EscrowMart</span>
            <span className="brand__sub">Chợ điện tử Web3</span>
          </span>
        </a>

        <div className="header__right">
          {account && !wrongNetwork && <span className="net-pill"><i /> {CHAIN_NAME}</span>}
          {wrongNetwork && (
            <button className="btn btn--warn btn--sm" onClick={onSwitch}>
              <AlertTriangle size={16} /> Chuyển sang {CHAIN_NAME}
            </button>
          )}
          {account ? (
            <AccountMenu account={account} isAdmin={isAdmin} busy={busy}
              onSwitchAccount={onSwitchAccount} onDisconnect={onDisconnect} />
          ) : (
            <button className="btn btn--primary btn--sm" onClick={onConnect}>
              <Wallet size={16} /> Kết nối ví
            </button>
          )}
        </div>
      </div>

      <nav className="tabs container" aria-label="Điều hướng">
        {tabs.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'is-active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
            {t.count > 0 && <span className={`tab__count ${t.alert ? 'is-alert' : ''}`}>{t.count}</span>}
          </button>
        ))}
      </nav>
    </header>
  );
}
