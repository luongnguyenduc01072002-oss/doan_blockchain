import { useEffect, useState } from 'react';
import { X, Gavel, Loader2, Paperclip, Check } from 'lucide-react';

const REASONS = ['Chưa nhận được hàng', 'Hàng lỗi / hư hỏng', 'Hàng không đúng mô tả', 'Người mua không phản hồi', 'Lý do khác'];

/**
 * Khiếu nại = 3 bước: (1) ký mở hộp thư nếu chưa có phiên, (2) giao dịch openDispute trên hợp đồng,
 * (3) gửi lý do + bằng chứng vào khung trao đổi để Admin đọc khi phân xử.
 */
export default function DisputeModal({ order, role, step, onClose, onSubmit }) {
  const [reason, setReason] = useState(REASONS[0]);
  const [detail, setDetail] = useState('');
  const [link, setLink] = useState('');
  const busy = !!step;

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  if (!order) return null;
  const reasons = REASONS.filter((r) => (role === 'seller' ? r !== 'Chưa nhận được hàng' : r !== 'Người mua không phản hồi'));
  const tooShort = detail.trim().length < 10;
  const badLink = link.trim() && !/^https?:\/\/\S+$/i.test(link.trim());

  const steps = [
    { key: 'sign', label: 'Ký mở hộp thư (không tốn gas)' },
    { key: 'tx', label: 'Ghi khiếu nại lên hợp đồng, đóng băng tiền' },
    { key: 'post', label: 'Gửi lý do & bằng chứng cho Admin' },
  ];
  const at = steps.findIndex((s) => s.key === step);

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="dispute-title" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (!tooShort && !badLink) onSubmit({ body: `[${reason}] ${detail.trim()}`, attachment_url: link.trim() || undefined }); }}>
        <button type="button" className="icon-btn modal__close" onClick={onClose} disabled={busy} aria-label="Đóng"><X size={18} /></button>
        <h2 id="dispute-title">Khiếu nại đơn #{order.id}</h2>
        <p className="muted modal__lead">Tiền sẽ bị đóng băng trong hợp đồng cho tới khi Admin phân xử. Admin đọc toàn bộ trao đổi của đơn này, nên hãy ghi rõ sự việc và gửi kèm bằng chứng.</p>

        <div className="field">
          Lý do
          <div className="chips">
            {reasons.map((r) => (
              <button type="button" key={r} className={`chip ${reason === r ? 'is-active' : ''}`} onClick={() => setReason(r)} disabled={busy}>{r}</button>
            ))}
          </div>
        </div>
        <label className={`field ${detail && tooShort ? 'has-error' : ''}`}>
          Mô tả sự việc
          <textarea rows={4} value={detail} maxLength={900} disabled={busy} onChange={(e) => setDetail(e.target.value)}
            placeholder="VD: Ngày 15/11 nhận hàng, hộp bị móp, màn hình vỡ góc trái. Đã nhắn người bán nhưng chưa được phản hồi." />
          {detail && tooShort && <small>Mô tả ít nhất 10 ký tự</small>}
        </label>
        <label className={`field ${badLink ? 'has-error' : ''}`}>
          <span><Paperclip size={13} /> Link ảnh / video bằng chứng <span className="muted">(không bắt buộc)</span></span>
          <input type="url" value={link} disabled={busy} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/…" />
          {badLink && <small>Link phải bắt đầu bằng http:// hoặc https://</small>}
        </label>

        {busy && (
          <ol className="progress-steps">
            {steps.map((s, i) => (
              <li key={s.key} className={i < at ? 'is-done' : i === at ? 'is-active' : ''}>
                {i < at ? <Check size={14} /> : i === at ? <Loader2 size={14} className="spin" /> : <span>{i + 1}</span>} {s.label}
              </li>
            ))}
          </ol>
        )}

        <button className="btn btn--danger btn--block btn--lg" disabled={busy || tooShort || badLink}>
          {busy ? <><Loader2 size={18} className="spin" /> Đang gửi khiếu nại…</> : <><Gavel size={18} /> Gửi khiếu nại</>}
        </button>
      </form>
    </div>
  );
}
