import { useState } from 'react';
import { ImageOff, ShieldCheck, Search, RefreshCw } from 'lucide-react';
import { formatEth, shortAddr, ADMIN_ADDRESS } from '../utils/config';

export function ProductImage({ src, alt }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <div className="product__img product__img--empty"><ImageOff size={28} /></div>;
  return <img className="product__img" src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />;
}

export default function ProductGrid({ products, loading, error, onRetry, account, onBuy }) {
  const [q, setQ] = useState('');
  const list = products.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <section className="container section">
      <div className="section__head">
        <div>
          <h2>Gian hàng</h2>
          <p className="muted">Mọi đơn mua đều được bảo vệ bởi hợp đồng escrow.</p>
        </div>
        <label className="search">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm sản phẩm…" />
        </label>
      </div>

      {loading ? (
        <div className="grid">{[...Array(4)].map((_, i) => <div key={i} className="product skeleton" />)}</div>
      ) : error ? (
        <div className="empty">
          <p>Không tải được danh sách sản phẩm. Máy chủ miễn phí có thể đang “ngủ”, hãy thử lại sau vài giây.</p>
          <button className="btn btn--ghost" onClick={onRetry}><RefreshCw size={16} /> Thử lại</button>
        </div>
      ) : list.length === 0 ? (
        <div className="empty"><p>{q ? 'Không có sản phẩm phù hợp.' : 'Chưa có sản phẩm nào được đăng bán.'}</p></div>
      ) : (
        <div className="grid">
          {list.map((p) => {
            const isMine = account && p.seller_address.toLowerCase() === account;
            const badSeller = p.seller_address.toLowerCase() === ADMIN_ADDRESS; // hợp đồng sẽ từ chối
            return (
              <article key={p.id} className="product">
                <div className="product__media">
                  <ProductImage src={p.image_url} alt={p.name} />
                  <span className="badge badge--glass"><ShieldCheck size={13} /> Escrow</span>
                </div>
                <div className="product__body">
                  <h3 title={p.name}>{p.name}</h3>
                  {p.description && <p className="product__desc">{p.description}</p>}
                  <p className="product__seller">Người bán <span className="mono">{shortAddr(p.seller_address)}</span></p>
                  <div className="product__foot">
                    <span className="price">{formatEth(p.price)} <small>ETH</small></span>
                    <button className="btn btn--primary btn--sm" disabled={isMine || badSeller} onClick={() => onBuy(p)}
                      title={badSeller ? 'Ví người bán trùng ví Admin, Admin cần sửa lại' : undefined}>
                      {isMine ? 'Hàng của bạn' : badSeller ? 'Tạm ngưng' : 'Mua ngay'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
