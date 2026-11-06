import { useRef, useState } from 'react';
import { ethers } from 'ethers';
import { PlusCircle, Trash2, Loader2, ShieldCheck, Pencil, Save, X, Info } from 'lucide-react';
import { API_URL, ADMIN_ADDRESS, adminHeaders, friendlyError, formatEth, shortAddr } from '../utils/config';
import { useToast } from './Toast';
import { ProductImage } from './ProductGrid';

const EMPTY = { name: '', description: '', price: '', image_url: '', seller_address: '' };

// CSDL trả giá dạng "0.020000000000000000" -> hiển thị gọn "0.02" trong ô nhập
const trimPrice = (v) => { const s = String(v ?? ''); return s.includes('.') ? s.replace(/\.?0+$/, '') : s; };

function validate(f) {
  const e = {};
  if (f.name.trim().length < 2) e.name = 'Tên tối thiểu 2 ký tự';
  if (!(Number(f.price) > 0)) e.price = 'Giá phải lớn hơn 0';
  if (!/^https?:\/\/.+/i.test(f.image_url.trim())) e.image_url = 'Cần link ảnh bắt đầu bằng http(s)://';
  if (!ethers.isAddress(f.seller_address.trim())) e.seller_address = 'Địa chỉ ví không hợp lệ (0x + 40 ký tự hex)';
  else if (f.seller_address.trim().toLowerCase() === ADMIN_ADDRESS) e.seller_address = 'Không dùng ví Admin làm người bán: Admin là người phân xử, phải trung lập';
  return e;
}

export default function AdminPanel({ products, fetchProducts }) {
  const { show } = useToast();
  const formRef = useRef(null);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null); // sản phẩm đang sửa, null = đang thêm mới
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const errors = validate(form);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const resetForm = () => { setForm(EMPTY); setEditing(null); setTouched(false); };

  const startEdit = (p) => {
    setEditing(p);
    setTouched(false);
    setForm({
      name: p.name || '',
      description: p.description || '',
      price: trimPrice(p.price),
      image_url: p.image_url || '',
      seller_address: p.seller_address || '',
    });
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const isEdit = !!editing;
      // Ký bằng ví Admin (không tốn gas). Mỗi hành động có thông điệp riêng để chữ ký không dùng lại được.
      const headers = await adminHeaders(isEdit ? 'sua-san-pham' : 'them-san-pham');
      const res = await fetch(`${API_URL}/api/products${isEdit ? `/${editing.id}` : ''}`, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ ...form, seller_address: form.seller_address.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || (isEdit ? 'Không cập nhật được sản phẩm' : 'Không thêm được sản phẩm'));
      show({ type: 'success', title: isEdit ? 'Đã cập nhật sản phẩm' : 'Đã đăng bán sản phẩm', message: form.name });
      resetForm();
      fetchProducts();
    } catch (err) {
      show({ type: 'error', title: editing ? 'Cập nhật thất bại' : 'Đăng sản phẩm thất bại', message: friendlyError(err) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p) => {
    if (!window.confirm(`Xóa "${p.name}" khỏi gian hàng? Các đơn đã tạo trên blockchain không bị ảnh hưởng.`)) return;
    setDeleting(p.id);
    try {
      const headers = await adminHeaders('xoa-san-pham');
      const res = await fetch(`${API_URL}/api/products/${p.id}`, { method: 'DELETE', headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không xóa được');
      show({ type: 'success', title: 'Đã xóa sản phẩm' });
      if (editing?.id === p.id) resetForm();
      fetchProducts();
    } catch (err) {
      show({ type: 'error', title: 'Xóa thất bại', message: friendlyError(err) });
    } finally {
      setDeleting(null);
    }
  };

  const field = (k, label, props = {}) => (
    <label className={`field ${touched && errors[k] ? 'has-error' : ''}`}>
      <span>{label}</span>
      {props.as === 'textarea'
        ? <textarea rows={3} value={form[k]} onChange={set(k)} placeholder={props.placeholder} />
        : <input value={form[k]} onChange={set(k)} {...props} />}
      {touched && errors[k] && <small>{errors[k]}</small>}
    </label>
  );

  const sellerChanged = editing && form.seller_address.trim().toLowerCase() !== editing.seller_address.toLowerCase();
  const priceChanged = editing && Number(form.price) !== Number(editing.price);

  return (
    <section className="container section">
      <div className="section__head" ref={formRef} style={{ scrollMarginTop: 130 }}>
        <div>
          <h2>{editing ? <>Sửa sản phẩm <span className="muted">#{editing.id}</span></> : 'Đăng sản phẩm mới'}</h2>
          <p className="muted">Mỗi thao tác cần ký xác nhận bằng ví Admin — máy chủ kiểm tra chữ ký, không ai giả mạo được.</p>
        </div>
      </div>

      <div className="admin-grid">
        <form className={`panel ${editing ? 'panel--editing' : ''}`} onSubmit={submit} noValidate>
          {field('name', 'Tên sản phẩm', { placeholder: 'VD: iPhone 15 Pro Max 256GB' })}
          {field('description', 'Mô tả ngắn', { as: 'textarea', placeholder: 'Tình trạng, bảo hành, cách giao hàng…' })}
          <div className="field-row">
            {field('price', 'Giá (ETH)', { type: 'number', step: 'any', min: '0', placeholder: '0.05' })}
            {field('image_url', 'Link ảnh', { placeholder: 'https://…' })}
          </div>
          {field('seller_address', 'Ví người bán nhận tiền', { placeholder: '0x…', className: 'mono' })}

          {(sellerChanged || priceChanged) && (
            <p className="note note--info">
              <Info size={15} />
              <span>Giá và ví người bán của các đơn <b>đã đặt</b> được ghi cố định trong hợp đồng, nên không đổi theo. Thay đổi chỉ áp dụng cho các đơn mua mới.</span>
            </p>
          )}

          <div className="form-actions">
            {editing && (
              <button type="button" className="btn btn--ghost" onClick={resetForm} disabled={saving}>
                <X size={17} /> Hủy sửa
              </button>
            )}
            <button className="btn btn--primary" disabled={saving}>
              {saving ? <Loader2 size={17} className="spin" /> : editing ? <Save size={17} /> : <PlusCircle size={17} />}
              {editing ? 'Lưu thay đổi' : 'Đăng bán'}
            </button>
          </div>
        </form>

        <div className="preview">
          <span className="eyebrow eyebrow--dark">Xem trước</span>
          <article className="product">
            <div className="product__media">
              <ProductImage key={form.image_url} src={form.image_url} alt="" />
              <span className="badge badge--glass"><ShieldCheck size={13} /> Escrow</span>
            </div>
            <div className="product__body">
              <h3>{form.name || 'Tên sản phẩm'}</h3>
              {form.description && <p className="product__desc">{form.description}</p>}
              <p className="product__seller">Người bán <span className="mono">{shortAddr(form.seller_address) || '0x…'}</span></p>
              <div className="product__foot">
                <span className="price">{formatEth(form.price || 0)} <small>ETH</small></span>
                <button type="button" className="btn btn--primary btn--sm" disabled>Mua ngay</button>
              </div>
            </div>
          </article>
        </div>
      </div>

      <div className="section__head" style={{ marginTop: 40 }}>
        <div><h2>Sản phẩm đang bán</h2><p className="muted">{products.length} sản phẩm</p></div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Sản phẩm</th><th>Giá</th><th>Người bán</th><th className="right">Thao tác</th></tr></thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className={editing?.id === p.id ? 'is-editing' : ''}>
                <td><div className="table__product"><ProductImage src={p.image_url} alt="" /> {p.name}</div></td>
                <td className="nowrap">{formatEth(p.price)} ETH</td>
                <td className="mono">{shortAddr(p.seller_address)}</td>
                <td className="right nowrap">
                  <button className="icon-btn" onClick={() => startEdit(p)} disabled={saving} aria-label={`Sửa ${p.name}`} title="Sửa">
                    <Pencil size={16} />
                  </button>
                  <button className="icon-btn icon-btn--danger" onClick={() => remove(p)} disabled={deleting === p.id} aria-label={`Xóa ${p.name}`} title="Xóa">
                    {deleting === p.id ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
