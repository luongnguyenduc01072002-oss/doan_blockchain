const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const { ethers } = require('ethers');
require('dotenv').config();

const app = express();

// Chỉ cho phép frontend của mình gọi API (VD: https://cho-web3.vercel.app,http://localhost:5173)
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : {}));
app.use(express.json({ limit: '20kb' }));

const ADMIN_ADDRESS = (process.env.ADMIN_ADDRESS || '').toLowerCase();
const SIGNATURE_TTL_MS = 5 * 60 * 1000;

const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 4000,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: true },
    waitForConnections: true,
    connectionLimit: 10,
});

db.getConnection()
    .then(conn => { console.log('✅ Đã kết nối CSDL TiDB Cloud'); conn.release(); })
    .catch(err => console.error('❌ Lỗi kết nối CSDL:', err.message));

/**
 * Xác thực Admin bằng chữ ký ví (không cần mật khẩu).
 * Frontend ký thông điệp `buildAdminMessage(action, timestamp)` bằng MetaMask,
 * server khôi phục địa chỉ từ chữ ký và so với ADMIN_ADDRESS.
 */
const buildAdminMessage = (action, timestamp) =>
    `Cho Web3 Escrow - xac nhan quyen Admin\nHanh dong: ${action}\nThoi diem: ${timestamp}`;

const requireAdmin = (action) => (req, res, next) => {
    const signature = req.get('x-admin-signature');
    const timestamp = Number(req.get('x-admin-timestamp'));
    if (!ADMIN_ADDRESS) return res.status(500).json({ error: 'Server chưa cấu hình ADMIN_ADDRESS' });
    if (!signature || !timestamp) return res.status(401).json({ error: 'Thiếu chữ ký Admin' });
    if (Math.abs(Date.now() - timestamp) > SIGNATURE_TTL_MS) return res.status(401).json({ error: 'Chữ ký đã hết hạn, vui lòng ký lại' });
    try {
        const signer = ethers.verifyMessage(buildAdminMessage(action, timestamp), signature).toLowerCase();
        if (signer !== ADMIN_ADDRESS) return res.status(403).json({ error: 'Ví này không có quyền Admin' });
        next();
    } catch {
        return res.status(401).json({ error: 'Chữ ký không hợp lệ' });
    }
};

const validateProduct = ({ name, price, image_url, seller_address, description }) => {
    if (typeof name !== 'string' || name.trim().length < 2 || name.length > 120) return 'Tên sản phẩm phải từ 2–120 ký tự';
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0 || p > 1000) return 'Giá phải là số ETH lớn hơn 0';
    if (!/^\d+(\.\d{1,18})?$/.test(String(price))) return 'Giá tối đa 18 chữ số thập phân';
    try {
        const u = new URL(image_url);
        if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
    } catch { return 'Link ảnh phải là URL http(s) hợp lệ'; }
    if (!ethers.isAddress(seller_address)) return 'Địa chỉ ví người bán không hợp lệ';
    if (description && String(description).length > 500) return 'Mô tả tối đa 500 ký tự';
    return null;
};

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/products', async (req, res) => {
    const [rows] = await db.query(
        'SELECT id, name, description, price, image_url, seller_address, created_at FROM products ORDER BY created_at DESC'
    );
    res.json(rows);
});

app.post('/api/products', requireAdmin('them-san-pham'), async (req, res) => {
    const error = validateProduct(req.body);
    if (error) return res.status(400).json({ error });

    const { name, price, image_url, seller_address, description = '' } = req.body;
    const [result] = await db.execute(
        'INSERT INTO products (name, description, price, image_url, seller_address) VALUES (?, ?, ?, ?, ?)',
        [name.trim(), String(description).trim(), String(price), image_url.trim(), ethers.getAddress(seller_address)]
    );
    res.status(201).json({ message: 'Thêm sản phẩm thành công', productId: result.insertId });
});

app.delete('/api/products/:id', requireAdmin('xoa-san-pham'), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID không hợp lệ' });
    const [result] = await db.execute('DELETE FROM products WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    res.json({ message: 'Đã xóa sản phẩm' });
});

// Bắt mọi lỗi chưa xử lý (Express 5 tự chuyển lỗi của hàm async vào đây)
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Lỗi máy chủ, vui lòng thử lại sau' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 API Server chạy tại cổng ${PORT}`));
