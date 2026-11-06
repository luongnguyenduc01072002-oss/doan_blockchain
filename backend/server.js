const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const { ethers } = require('ethers');
require('dotenv').config();

const app = express();

// Chỉ cho phép frontend của mình gọi API (VD: https://cho-web3.vercel.app,http://localhost:5173)
// Bỏ dấu "/" cuối: trình duyệt gửi Origin dạng https://abc.vercel.app (không có "/"), ghi thừa "/" là bị chặn
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
app.use(cors(allowedOrigins.length ? {
    origin(origin, cb) {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        console.warn(`⛔ CORS chặn origin ${origin}. Thêm nó vào FRONTEND_ORIGIN nếu đây là frontend của bạn.`);
        cb(null, false);
    },
} : {}));
app.use(express.json({ limit: '20kb' }));

const ADMIN_ADDRESS = (process.env.ADMIN_ADDRESS || '').toLowerCase();
const SIGNATURE_TTL_MS = 5 * 60 * 1000;

const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 4000,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: true }, // TiDB Cloud bắt buộc SSL
    waitForConnections: true,
    connectionLimit: 10,
});

/**
 * Tự tạo / nâng cấp bảng products khi server khởi động.
 * Bảng cũ (bản trước) thiếu cột description, image_url có thể chỉ 255 ký tự (link ảnh Google thường dài hơn)
 * -> INSERT lỗi và sản phẩm không hiện. Chỉ THÊM cột / NỚI RỘNG cột, không xóa dữ liệu.
 */
async function ensureSchema() {
    await db.query(`CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        description VARCHAR(500) NOT NULL DEFAULT '',
        price DECIMAL(36,18) NOT NULL,
        image_url VARCHAR(2048) NOT NULL,
        seller_address CHAR(42) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const [cols] = await db.query(
        `SELECT COLUMN_NAME AS name, DATA_TYPE AS type, CHARACTER_MAXIMUM_LENGTH AS len, NUMERIC_SCALE AS scale
         FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'`
    );
    const col = Object.fromEntries(cols.map(c => [c.name.toLowerCase(), c]));
    const changes = [];
    if (!col.description) changes.push(`ADD COLUMN description VARCHAR(500) NOT NULL DEFAULT '' AFTER name`);
    if (!col.created_at) changes.push(`ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`);
    if (col.image_url && /char/i.test(col.image_url.type) && Number(col.image_url.len) < 2048) changes.push(`MODIFY image_url VARCHAR(2048) NOT NULL`);
    if (col.price && (!/decimal/i.test(col.price.type) || Number(col.price.scale) < 18)) changes.push(`MODIFY price DECIMAL(36,18) NOT NULL`);
    for (const c of changes) {
        await db.query(`ALTER TABLE products ${c}`);
        console.log(`🛠  Đã nâng cấp bảng products: ${c}`);
    }
}

db.getConnection()
    .then(async conn => {
        conn.release();
        console.log('✅ Đã kết nối CSDL TiDB Cloud');
        await ensureSchema();
        console.log('✅ Bảng products sẵn sàng');
    })
    .catch(err => console.error('❌ Lỗi CSDL khi khởi động:', err.code || '', err.message));
if (!ADMIN_ADDRESS) console.warn('⚠️  Chưa đặt ADMIN_ADDRESS: sẽ không đăng được sản phẩm.');
console.log('CORS cho phép:', allowedOrigins.length ? allowedOrigins.join(', ') : 'mọi origin');

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
    const [rows] = await db.query('SELECT * FROM products ORDER BY id DESC');
    res.set('Cache-Control', 'no-store'); // luôn lấy danh sách mới nhất sau khi đăng
    res.json(rows.map(r => ({ ...r, description: r.description || '' })));
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
const DB_ERRORS = {
    ER_DATA_TOO_LONG: 'Dữ liệu quá dài so với cột trong CSDL (thường là link ảnh). Hãy khởi động lại server để tự nâng cấp bảng.',
    ER_BAD_FIELD_ERROR: 'Bảng products thiếu cột. Hãy khởi động lại server để tự nâng cấp bảng.',
    ER_NO_SUCH_TABLE: 'Chưa có bảng products. Hãy khởi động lại server để tự tạo bảng.',
    ECONNREFUSED: 'Không kết nối được CSDL. Kiểm tra DB_HOST / DB_PORT.',
    ER_ACCESS_DENIED_ERROR: 'Sai tài khoản hoặc mật khẩu CSDL (DB_USER / DB_PASSWORD).',
};
app.use((err, req, res, next) => {
    console.error(`❌ ${req.method} ${req.path}:`, err.code || '', err.message);
    res.status(500).json({ error: DB_ERRORS[err.code] || `Lỗi máy chủ${err.code ? ` (${err.code})` : ''}`, code: err.code });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 API Server chạy tại cổng ${PORT}`));
