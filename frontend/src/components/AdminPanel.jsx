import { useState } from 'react';
import { ethers } from 'ethers';
import { PlusCircle, Trash2, Loader2, ShieldCheck } from 'lucide-react';
import { API_URL, adminHeaders, friendlyError, formatEth, shortAddr } from '../utils/config';
import { useToast } from './Toast';
import { ProductImage } from './ProductGrid';

const EMPTY = { name: '', description: '', price: '', image_url: '', seller_address: '' };

function validate(f) {
  const e = {};
  if (f.name.trim().length < 2) e.name = 'Tên tối thiểu 2 ký tự';
  if (!(Number(f.price) > 0)) e.price = 'Giá phải lớn hơn 0';
  if (!/^https?:\/\/.+/i.test(f.image_url.trim())) e.image_url = 'Cần link ảnh bắt đầu bằng http(s)://';
  if (!ethers.isAddress(f.seller_address.trim())) e.seller_address = 'Địa chỉ ví không hợp lệ (0x + 40 ký tự hex)';
  return e;
}

export default function AdminPanel({ products, fetchProducts }) {
  const { show } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const errors = validate(form);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const headers = await adminHeaders('them-san-pham'); // ký bằng ví Admin, không tốn gas
      const res = await fetch(`${API_URL}/api/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ ...form, seller_address: form.seller_address.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thêm được sản phẩm');
      show({ type: 'success', title: 'Đã đăng bán sản phẩm', message: form.name });
      setForm(EMPTY);
      setTouched(false);
      fetchProducts();
    } catch (err) {
      show({ type: 'error', title: 'Đăng sản phẩm thất bại', message: friendlyError(err) });
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

  return (
    <section className="container section">
      <div className="section__head">
        <div>
          <h2>Đăng sản phẩm mới</h2>
          <p className="muted">Mỗi thao tác cần ký xác nhận bằng ví Admin — máy chủ kiểm tra chữ ký, không ai giả mạo được.</p>
        </div>
      </div>

      <div className="admin-grid">
        <form className="panel" onSubmit={submit} noValidate>
          {field('name', 'Tên sản phẩm', { placeholder: 'VD: iPhone 15 Pro Max 256GB' })}
          {field('description', 'Mô tả ngắn', { as: 'textarea', placeholder: 'Tình trạng, bảo hành, cách giao hàng…' })}
          <div className="field-row">
            {field('price', 'Giá (ETH)', { type: 'number', step: 'any', min: '0', placeholder: '0.05' })}
            {field('image_url', 'Link ảnh', { placeholder: 'https://…' })}
          </div>
          {field('seller_address', 'Ví người bán nhận tiền', { placeholder: '0x…', className: 'mono' })}
          <button className="btn btn--primary btn--block" disabled={saving}>
            {saving ? <Loader2 size={17} className="spin" /> : <PlusCircle size={17} />} Đăng bán
          </button>
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
          <thead><tr><th>Sản phẩm</th><th>Giá</th><th>Người bán</th><th /></tr></thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td><div className="table__product"><ProductImage src={p.image_url} alt="" /> {p.name}</div></td>
                <td className="nowrap">{formatEth(p.price)} ETH</td>
                <td className="mono">{shortAddr(p.seller_address)}</td>
                <td className="right">
                  <button className="icon-btn icon-btn--danger" onClick={() => remove(p)} disabled={deleting === p.id} aria-label="Xóa">
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
