import { useEffect, useState } from 'react';
import { Store, Truck, CheckCircle2, Undo2, Gavel, Clock, Loader2, Wallet, Lock } from 'lucide-react';
import { STATUS, formatEth, shortAddr, addrLink } from '../utils/config';
import { ProductImage } from './ProductGrid';

const fmtDate = (s) => (s ? new Date(Number(s) * 1000).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '');

const fmtLeft = (sec) => {
  const s = Number(sec);
  if (s <= 0) return 'đã hết hạn';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d} ngày ${h} giờ` : h ? `${h} giờ ${m} phút` : `${m} phút`;
};

function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30000); return () => clearInterval(t); }, []);
  return now;
}

/** Thanh tiến trình đơn: Khóa tiền → Đã gửi → Kết thúc (giải ngân / hoàn tiền) */
function Timeline({ order }) {
  const s = order.status;
  const shippedAtNum = Number(order.shippedAt || 0);
  const createdAtNum = Number(order.createdAt || 0);
  
  const end = s === 5 ? { label: 'Đã hoàn tiền', icon: Undo2, tone: 'danger' }
    : s === 3 ? { label: 'Chờ phân xử', icon: Gavel, tone: 'dispute' }
    : { label: 'Đã giải ngân', icon: CheckCircle2, tone: 'ok' };
    
  const steps = [
    { label: 'Đã khóa tiền', icon: Lock, done: true, time: fmtDate(createdAtNum) },
    { label: 'Đã gửi hàng', icon: Truck, done: shippedAtNum > 0, time: fmtDate(shippedAtNum) },
    { label: end.label, icon: end.icon, done: s >= 3, tone: end.tone },
  ];
  
  return (
    <ol className="timeline">
      {steps.map((st, i) => (
        <li key={i} className={`timeline__step ${st.done ? 'is-done' : ''} ${st.done && i > 0 && !steps[i - 1].done ? 'is-skip' : ''} ${st.tone ? `tone-${st.tone}` : ''}`}>
          <span className="timeline__dot"><st.icon size={14} /></span>
          <span className="timeline__label">{st.label}</span>
          {st.time && st.done && <span className="timeline__time">{st.time}</span>}
        </li>
      ))}
    </ol>
  );
}

function OrderCard({ order, product, account, isAdmin, autoRelease, run, pendingKey }) {
  const now = useNow();
  const st = STATUS[order.status];
  const isBuyer = account === order.buyer.toLowerCase();
  const isSeller = account === order.seller.toLowerCase();
  const role = isBuyer ? 'Bạn là người mua' : isSeller ? 'Bạn là người bán' : 'Admin xem';
  
  const shippedAtNum = Number(order.shippedAt || 0);
  const releaseAt = shippedAtNum > 0 ? shippedAtNum + Number(autoRelease) : 0;
  const canClaim = order.status === 2 && now >= releaseAt;
  const id = Number(order.id);

  const act = (key, labels, fn) => (
    <button key={key} className={`btn btn--sm ${labels.cls}`} disabled={!!pendingKey}
      onClick={() => run(`${key}-${id}`, labels, fn)}>
      {pendingKey === `${key}-${id}` ? <Loader2 size={15} className="spin" /> : labels.icon}
      {labels.text}
    </button>
  );

  const actions = [];
  // Người mua chỉ xác nhận được khi người bán ĐÃ gửi hàng (khớp require trong hợp đồng)
  if (isBuyer && order.status === 2) {
    actions.push(act('confirm', { cls: 'btn--success', icon: <CheckCircle2 size={15} />, text: 'Đã nhận hàng', title: `Giải ngân đơn #${id}`, success: 'Đã chuyển tiền cho người bán' }, (c) => c.confirmDelivery(id)));
  }
  if (isBuyer && order.status === 1) {
    actions.push(act('cancel', { cls: 'btn--ghost', icon: <Undo2 size={15} />, text: 'Hủy đơn & lấy lại tiền', title: `Hủy đơn #${id}`, success: 'Đã hủy đơn, tiền đã về ví của bạn' }, (c) => c.cancelByBuyer(id)));
  }
  if (isSeller && order.status === 1) {
    actions.push(act('ship', { cls: 'btn--primary', icon: <Truck size={15} />, text: 'Báo đã gửi hàng', title: `Cập nhật đơn #${id}`, success: 'Đã đánh dấu gửi hàng' }, (c) => c.markShipped(id)));
  }
  if (isSeller && canClaim) {
    actions.push(act('claim', { cls: 'btn--success', icon: <Wallet size={15} />, text: 'Rút tiền (quá hạn)', title: `Rút tiền đơn #${id}`, success: 'Đã nhận tiền về ví' }, (c) => c.claimAfterTimeout(id)));
  }
  if (isSeller && [1, 2, 3].includes(order.status)) {
    actions.push(act('refund', { cls: 'btn--ghost', icon: <Undo2 size={15} />, text: 'Hủy & hoàn tiền', title: `Hoàn tiền đơn #${id}`, success: 'Đã hoàn tiền cho người mua' }, (c) => c.refundBySeller(id)));
  }
  if ((isBuyer || isSeller) && (order.status === 1 || order.status === 2)) {
    actions.push(act('dispute', { cls: 'btn--danger-ghost', icon: <Gavel size={15} />, text: 'Khiếu nại', title: `Mở tranh chấp đơn #${id}`, success: 'Đã gửi khiếu nại tới Admin' }, (c) => c.openDispute(id)));
  }
  if (isAdmin && order.status === 3) {
    actions.push(act('toSeller', { cls: 'btn--success', icon: <Store size={15} />, text: 'Xử cho người bán', title: `Phân xử đơn #${id}`, success: 'Đã giải ngân cho người bán' }, (c) => c.resolveDispute(id, true)));
    actions.push(act('toBuyer', { cls: 'btn--danger', icon: <Undo2 size={15} />, text: 'Hoàn cho người mua', title: `Phân xử đơn #${id}`, success: 'Đã hoàn tiền cho người mua' }, (c) => c.resolveDispute(id, false)));
  }

  return (
    <article className={`order tone-${st.tone}`}>
      <div className="order__top">
        <div className="order__product">
          <ProductImage src={product?.image_url} alt={product?.name || ''} />
          <div>
            <span className="order__id">Đơn #{id} · {role}</span>
            <h3>{product?.name || `Sản phẩm #${Number(order.productId)}`}</h3>
            <span className={`status status--${st.tone}`}>{st.label}</span>
          </div>
        </div>
        <span className="price">{formatEth(order.amountEth)} <small>ETH</small></span>
      </div>

      <Timeline order={order} />

      <dl className="order__meta">
        <div><dt>Người mua</dt><dd><a className="mono" href={addrLink(order.buyer)} target="_blank" rel="noreferrer">{shortAddr(order.buyer)}</a></dd></div>
        <div><dt>Người bán</dt><dd><a className="mono" href={addrLink(order.seller)} target="_blank" rel="noreferrer">{shortAddr(order.seller)}</a></dd></div>
        {order.status === 2 && (
          <div><dt><Clock size={13} /> Tự giải ngân sau</dt><dd>{fmtLeft(releaseAt - now)}</dd></div>
        )}
      </dl>

      {order.status === 1 && isBuyer && (
        <p className="note note--info"><Truck size={15} /> Đang chờ người bán gửi hàng. Nút “Đã nhận hàng” sẽ hiện khi người bán báo đã gửi; trước đó bạn có thể hủy đơn để lấy lại tiền.</p>
      )}
      {order.status === 1 && isSeller && (
        <p className="note note--info"><Truck size={15} /> Người mua đã khóa tiền. Hãy gửi hàng rồi bấm “Báo đã gửi hàng” để người mua xác nhận và bạn nhận tiền.</p>
      )}
      {order.status === 2 && isBuyer && (
        <p className="note note--warn"><Clock size={15} /> Nếu bạn không xác nhận hoặc khiếu nại trong {fmtLeft(releaseAt - now)}, người bán được quyền rút tiền.</p>
      )}

      {actions.length > 0 && <div className="order__actions">{actions}</div>}
    </article>
  );
}

export default function OrderList({ title, subtitle, orders, products, account, isAdmin, autoRelease, run, pendingKey, filters, emptyText, loading }) {
  const [filter, setFilter] = useState(filters?.[0]?.key);
  const active = filters?.find((f) => f.key === filter);
  const list = active ? orders.filter(active.test) : orders;

  return (
    <section className="container section">
      <div className="section__head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {filters && (
          <div className="segmented">
            {filters.map((f) => (
              <button key={f.key} className={filter === f.key ? 'is-active' : ''} onClick={() => setFilter(f.key)}>
                {f.label} <span>{orders.filter(f.test).length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="orders">{[0, 1].map((i) => <div key={i} className="order skeleton" style={{ height: 220 }} />)}</div>
      ) : list.length === 0 ? (
        <div className="empty"><p>{emptyText}</p></div>
      ) : (
        <div className="orders">
          {list.map((o) => (
            <OrderCard key={o.id.toString()} order={o} product={products.find((p) => Number(p.id) === Number(o.productId))}
              account={account} isAdmin={isAdmin} autoRelease={autoRelease} run={run} pendingKey={pendingKey} />
          ))}
        </div>
      )}
    </section>
  );
}