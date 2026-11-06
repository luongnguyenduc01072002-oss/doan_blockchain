import { useCallback, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { Wallet, AlertTriangle } from 'lucide-react';
import { API_URL, ADMIN_ADDRESS, CONTRACT_ADDRESS, CHAIN_NAME, getReadContract, friendlyError } from './utils/config';
import useWallet from './hooks/useWallet';
import useTx from './hooks/useTx';
import { useToast } from './components/Toast';
import Header from './components/Header';
import Hero from './components/Hero';
import ProductGrid from './components/ProductGrid';
import CheckoutModal from './components/CheckoutModal';
import OrderList from './components/OrderList';
import AdminPanel from './components/AdminPanel';
import './App.css';

export default function App() {
  const wallet = useWallet();
  const { account, wrongNetwork } = wallet;
  const isAdmin = !!account && account === ADMIN_ADDRESS;
  const { show } = useToast();

  const [tab, setTab] = useState('shop');
  const [products, setProducts] = useState([]);
  const [productState, setProductState] = useState({ loading: true, error: false });
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [stats, setStats] = useState({ locked: '0', orders: 0, completed: 0 });
  const [autoRelease, setAutoRelease] = useState(0);
  const [buying, setBuying] = useState(null);

  // ---------- Dữ liệu off-chain: sản phẩm từ API Node.js + TiDB ----------
  const fetchProducts = useCallback(async () => {
    setProductState((s) => ({ ...s, error: false }));
    try {
      const res = await fetch(`${API_URL}/api/products`);
      if (!res.ok) throw new Error();
      setProducts(await res.json());
      setProductState({ loading: false, error: false });
    } catch {
      setProductState({ loading: false, error: true });
    }
  }, []);

  // ---------- Dữ liệu on-chain: đọc trực tiếp trạng thái thật từ hợp đồng ----------
  const fetchChain = useCallback(async () => {
    const contract = getReadContract();
    if (!contract) { setOrdersLoading(false); return; }
    try {
      const [count, balance, period] = await Promise.all([
        contract.orderCount(), contract.runner.provider.getBalance(CONTRACT_ADDRESS), contract.autoReleasePeriod(),
      ]);
      const ids = Array.from({ length: Number(count) }, (_, i) => i + 1);
      const raw = await Promise.all(ids.map((id) => contract.getOrder(id)));
      const list = raw.map((o) => ({
        id: Number(o.id),
        productId: Number(o.productId),
        buyer: o.buyer,
        seller: o.seller,
        amountEth: ethers.formatEther(o.amount),
        status: Number(o.status),
        createdAt: Number(o.createdAt),
        shippedAt: Number(o.shippedAt),
      })).reverse();
      setOrders(list);
      setAutoRelease(Number(period));
      setStats({ locked: ethers.formatEther(balance), orders: list.length, completed: list.filter((o) => o.status === 4).length });
    } catch (e) {
      console.warn('Không đọc được hợp đồng (có thể ví đang ở sai mạng):', e);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => {
    fetchChain();
    const t = setInterval(() => document.visibilityState === 'visible' && fetchChain(), 15000);
    return () => clearInterval(t);
  }, [fetchChain, account, wallet.chainId]);
  useEffect(() => { if (!isAdmin && tab === 'admin') setTab('shop'); }, [isAdmin, tab]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [tab]);

  const { run, pendingKey } = useTx(fetchChain);

  const connect = async () => {
    try { await wallet.connect(); } catch (e) { show({ type: 'error', title: 'Không kết nối được ví', message: friendlyError(e) }); }
  };
  const switchNet = async () => {
    try { await wallet.switchNetwork(); } catch (e) { show({ type: 'error', title: 'Không đổi được mạng', message: friendlyError(e) }); }
  };

  const startBuy = async (p) => {
    if (!account) { await connect(); return; }
    if (wrongNetwork) { await switchNet(); return; }
    setBuying(p);
  };

  const confirmBuy = async () => {
    const p = buying;
    const ok = await run('buy', { title: `Đặt mua ${p.name}`, success: 'Đặt hàng thành công! Tiền đã được khóa an toàn.' },
      (c) => c.createOrder(p.id, p.seller_address, { value: ethers.parseEther(String(p.price)) }));
    if (ok) { setBuying(null); setTab('orders'); }
  };

  // ---------- Phân loại đơn theo vai trò ----------
  const mine = useMemo(() => orders.filter((o) => o.buyer.toLowerCase() === account || o.seller.toLowerCase() === account), [orders, account]);
  const disputes = orders.filter((o) => o.status === 3);
  const needAction = (o) => (o.buyer.toLowerCase() === account && o.status === 2) || (o.seller.toLowerCase() === account && o.status === 1);
  const orderProps = { products, account, isAdmin, autoRelease, run, pendingKey };

  return (
    <>
      <Header wallet={wallet} isAdmin={isAdmin} onConnect={connect} onSwitch={switchNet} tab={tab} setTab={setTab}
        counts={{ products: products.length, myOrders: mine.filter(needAction).length, disputes: disputes.length }} />

      {!CONTRACT_ADDRESS && (
        <div className="banner container"><AlertTriangle size={18} /> Chưa cấu hình VITE_CONTRACT_ADDRESS trong file .env của frontend.</div>
      )}
      {wrongNetwork && (
        <div className="banner container"><AlertTriangle size={18} /> Ví đang ở sai mạng. Hợp đồng nằm trên {CHAIN_NAME}.
          <button className="btn btn--warn btn--sm" onClick={switchNet}>Chuyển mạng</button></div>
      )}

      <main>
        {tab === 'shop' && (
          <>
            <Hero stats={stats} />
            <ProductGrid products={products} loading={productState.loading} error={productState.error}
              onRetry={fetchProducts} account={account} onBuy={startBuy} />
          </>
        )}

        {tab === 'orders' && (account ? (
          <OrderList {...orderProps} orders={mine} loading={ordersLoading}
            title="Đơn hàng của tôi" subtitle="Trạng thái được đọc trực tiếp từ blockchain, tự cập nhật mỗi 15 giây."
            emptyText="Bạn chưa có đơn nào. Hãy chọn một sản phẩm ở Gian hàng."
            filters={[
              { key: 'all', label: 'Tất cả', test: () => true },
              { key: 'todo', label: 'Cần xử lý', test: needAction },
              { key: 'buy', label: 'Tôi mua', test: (o) => o.buyer.toLowerCase() === account },
              { key: 'sell', label: 'Tôi bán', test: (o) => o.seller.toLowerCase() === account },
            ]} />
        ) : (
          <section className="container section">
            <div className="empty empty--cta">
              <Wallet size={32} />
              <h2>Kết nối ví để xem đơn hàng</h2>
              <p className="muted">Đơn hàng gắn với địa chỉ ví của bạn trên blockchain, không cần tạo tài khoản.</p>
              <button className="btn btn--primary" onClick={connect}><Wallet size={16} /> Kết nối MetaMask</button>
            </div>
          </section>
        ))}

        {tab === 'admin' && isAdmin && (
          <>
            <OrderList {...orderProps} orders={orders} loading={ordersLoading}
              title="Phân xử & giám sát đơn hàng" subtitle="Admin chỉ can thiệp được khi đơn đang tranh chấp."
              emptyText="Không có đơn nào trong mục này."
              filters={[
                { key: 'dispute', label: 'Tranh chấp', test: (o) => o.status === 3 },
                { key: 'active', label: 'Đang giữ tiền', test: (o) => [1, 2].includes(o.status) },
                { key: 'all', label: 'Tất cả', test: () => true },
              ]} />
            <AdminPanel products={products} fetchProducts={fetchProducts} />
          </>
        )}
      </main>

      <footer className="footer container">
        <span>EscrowMart · Đồ án DApp Escrow trên Ethereum ({CHAIN_NAME})</span>
        <span className="muted">Solidity · React · ethers.js · Node.js · TiDB Cloud</span>
      </footer>

      <CheckoutModal product={buying} busy={pendingKey === 'buy'} onClose={() => setBuying(null)} onConfirm={confirmBuy} />
    </>
  );
}
