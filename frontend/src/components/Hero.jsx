import { User, Lock, Store, ArrowRight } from 'lucide-react';
import { formatEth, CONTRACT_ADDRESS, addrLink, shortAddr } from '../utils/config';

/** Phần giới thiệu: giải thích cơ chế escrow bằng sơ đồ 3 bên + số liệu trực tiếp từ hợp đồng. */
export default function Hero({ stats }) {
  return (
    <section className="hero">
      <div className="container hero__grid">
        <div>
          <span className="eyebrow">Hợp đồng thông minh giữ tiền trung gian</span>
          <h1>Mua bán online mà không sợ <em>“bùng hàng, bùng tiền”</em></h1>
          <p className="hero__lead">
            Tiền của người mua được khóa trong hợp đồng thông minh trên Ethereum. Người bán chỉ nhận được
            khi người mua xác nhận đã nhận hàng — không ai, kể cả chúng tôi, có thể tự ý lấy số tiền đó.
          </p>
          <dl className="hero__stats">
            <div><dt>Đang được giữ an toàn</dt><dd>{formatEth(stats.locked)} <small>ETH</small></dd></div>
            <div><dt>Tổng số đơn</dt><dd>{stats.orders}</dd></div>
            <div><dt>Đã giải ngân</dt><dd>{stats.completed}</dd></div>
          </dl>
          {CONTRACT_ADDRESS && (
            <a className="hero__contract mono" href={addrLink(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer">
              Hợp đồng: {shortAddr(CONTRACT_ADDRESS)} · xem mã nguồn công khai ↗
            </a>
          )}
        </div>

        <ol className="flow" aria-label="Quy trình escrow">
          <li className="flow__node">
            <span className="flow__icon"><User size={22} /></span>
            <strong>Người mua</strong>
            <span>Khóa ETH khi đặt hàng</span>
          </li>
          <li className="flow__arrow"><ArrowRight size={18} /></li>
          <li className="flow__node flow__node--vault">
            <span className="flow__icon"><Lock size={24} /></span>
            <strong>Két hợp đồng</strong>
            <span>Giữ tiền đến khi giao xong</span>
          </li>
          <li className="flow__arrow"><ArrowRight size={18} /></li>
          <li className="flow__node">
            <span className="flow__icon"><Store size={22} /></span>
            <strong>Người bán</strong>
            <span>Nhận tiền khi người mua xác nhận</span>
          </li>
          <li className="flow__note">Có tranh chấp? Admin phân xử, tiền vẫn nằm trong két cho tới khi có kết quả.</li>
        </ol>
      </div>
    </section>
  );
}
