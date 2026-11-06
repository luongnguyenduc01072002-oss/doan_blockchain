import { useEffect } from 'react';
import { X, Lock, Loader2, ShieldCheck } from 'lucide-react';
import { ProductImage } from './ProductGrid';
import { formatEth } from '../utils/config';

/** Hộp thoại xác nhận mua: cho người mua thấy rõ tiền sẽ đi đâu trước khi ký. */
export default function CheckoutModal({ product, onClose, onConfirm, busy }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  if (!product) return null;

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn modal__close" onClick={onClose} disabled={busy} aria-label="Đóng"><X size={18} /></button>
        <h2 id="checkout-title">Xác nhận đặt hàng</h2>

        <div className="checkout__item">
          <ProductImage src={product.image_url} alt={product.name} />
          <div>
            <strong>{product.name}</strong>
            <span className="price">{formatEth(product.price)} <small>ETH</small></span>
          </div>
        </div>

        <dl className="kv">
          <div><dt>Người bán nhận</dt><dd className="mono break">{product.seller_address}</dd></div>
          <div><dt>Số tiền khóa vào két</dt><dd>{formatEth(product.price)} ETH</dd></div>
          <div><dt>Phí trung gian</dt><dd>0 ETH <span className="muted">(chỉ trả phí gas mạng)</span></dd></div>
        </dl>

        <ol className="mini-steps">
          <li><b>1</b> Tiền được khóa trong hợp đồng, người bán chưa nhận được.</li>
          <li><b>2</b> Người bán gửi hàng và báo “đã gửi”.</li>
          <li><b>3</b> Bạn bấm “Đã nhận hàng” → tiền tự động chuyển cho người bán.</li>
        </ol>
        <p className="note"><ShieldCheck size={16} /> Người bán chưa gửi hàng thì bạn hủy được ngay và lấy lại tiền. Đã gửi mà hàng có vấn đề thì mở khiếu nại để Admin phân xử.</p>

        <button className="btn btn--primary btn--block btn--lg" onClick={onConfirm} disabled={busy}>
          {busy ? <><Loader2 size={18} className="spin" /> Đang xử lý…</> : <><Lock size={18} /> Khóa {formatEth(product.price)} ETH &amp; đặt hàng</>}
        </button>
      </div>
    </div>
  );
}
