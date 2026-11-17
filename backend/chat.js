/**
 * Kênh trao đổi theo từng đơn hàng (off-chain).
 *
 * - Đăng nhập bằng ví: server phát mã nonce, người dùng KÝ thông điệp (không tốn gas),
 *   server khôi phục địa chỉ từ chữ ký rồi cấp phiên (token HMAC) dùng trong 24 giờ.
 * - Quyền xem / gửi tin KHÔNG tin vào frontend: server đọc trực tiếp hợp đồng trên blockchain
 *   (getOrder) để biết ai là người mua, người bán và đơn đang ở trạng thái nào.
 *     · Người mua, người bán của đơn: luôn xem được; gửi được khi đơn chưa kết thúc.
 *     · Admin: chỉ xem được khi đơn ĐANG tranh chấp hoặc ĐÃ TỪNG tranh chấp (để phân xử),
 *       chỉ gửi được khi đơn đang tranh chấp. Đơn bình thường Admin không đọc được tin riêng.
 * - Tin nhắn lưu ngoài chuỗi vì chứa địa chỉ, số điện thoại: ghi lên blockchain là công khai vĩnh viễn.
 */
const crypto = require('crypto');
const { ethers } = require('ethers');

const ESCROW_ABI = [
    'function orderCount() view returns (uint256)',
    'function getOrder(uint256) view returns (tuple(uint256 id, uint256 productId, address buyer, address seller, uint256 amount, uint8 status, uint64 createdAt, uint64 shippedAt))',
];
const STATUS = { FUNDED: 1, SHIPPED: 2, DISPUTED: 3, COMPLETED: 4, REFUNDED: 5 };
const ACTIVE = [STATUS.FUNDED, STATUS.SHIPPED, STATUS.DISPUTED];

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const NONCE_TTL_MS = 5 * 60 * 1000;
const MAX_BODY = 1000;
const RATE = { windowMs: 60 * 1000, max: 20 };

// Loại tin: ai được gửi loại nào
const KINDS = {
    text: ['buyer', 'seller', 'admin'],
    shipping: ['buyer'],          // địa chỉ / SĐT nhận hàng
    tracking: ['seller'],         // đơn vị vận chuyển + mã vận đơn
    dispute: ['buyer', 'seller'], // lý do khiếu nại (chỉ khi đơn đang tranh chấp trên chuỗi)
};

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function registerChat(app, db, { adminAddress, contractAddress, rpcUrl, sessionSecret }) {
    const ADMIN = (adminAddress || '').toLowerCase();
    const secret = sessionSecret || crypto.randomBytes(32).toString('hex');
    if (!sessionSecret) console.warn('⚠️  Chưa đặt SESSION_SECRET: phiên đăng nhập sẽ mất mỗi khi server khởi động lại.');
    if (!contractAddress) console.warn('⚠️  Chưa đặt CONTRACT_ADDRESS: tính năng trao đổi đơn hàng sẽ không hoạt động.');

    const provider = rpcUrl ? new ethers.JsonRpcProvider(rpcUrl) : null;
    const escrow = contractAddress && provider ? new ethers.Contract(contractAddress, ESCROW_ABI, provider) : null;

    // ------------------------------------------------------------ đọc đơn on-chain
    const cache = new Map(); // orderId -> { at, order }
    async function readOrder(orderId, { fresh = false } = {}) {
        if (!escrow) { const e = new Error('Server chưa cấu hình CONTRACT_ADDRESS / RPC_URL'); e.status = 503; throw e; }
        const hit = cache.get(orderId);
        if (!fresh && hit && Date.now() - hit.at < 5000) return hit.order;
        const count = Number(await escrow.orderCount());
        if (orderId > count) { const e = new Error('Đơn hàng không tồn tại'); e.status = 404; throw e; }
        const o = await escrow.getOrder(orderId);
        const order = { id: orderId, buyer: o.buyer.toLowerCase(), seller: o.seller.toLowerCase(), status: Number(o.status) };
        cache.set(orderId, { at: Date.now(), order });
        return order;
    }

    // ------------------------------------------------------------ phiên đăng nhập
    const sign = (payload) => crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    const issueToken = (address) => {
        const payload = b64url(JSON.stringify({ a: address, exp: Date.now() + SESSION_TTL_MS }));
        return `${payload}.${sign(payload)}`;
    };
    const readToken = (token) => {
        const [payload, mac] = String(token || '').split('.');
        if (!payload || !mac) return null;
        const expected = sign(payload);
        if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
        try {
            const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
            return data.exp > Date.now() && ethers.isAddress(data.a) ? data : null;
        } catch { return null; }
    };

    const nonces = new Map(); // address -> { message, exp }
    const loginMessage = (address, nonce, exp) =>
        `EscrowMart - dang nhap bang vi de trao doi don hang\nDia chi: ${address}\nMa dang nhap: ${nonce}\nHet han: ${new Date(exp).toISOString()}\n\nKy thong diep nay KHONG ton phi gas va KHONG chuyen tien.`;

    app.get('/api/auth/nonce', (req, res) => {
        const address = String(req.query.address || '');
        if (!ethers.isAddress(address)) return res.status(400).json({ error: 'Địa chỉ ví không hợp lệ' });
        const exp = Date.now() + NONCE_TTL_MS;
        const message = loginMessage(ethers.getAddress(address), crypto.randomBytes(16).toString('hex'), exp);
        nonces.set(address.toLowerCase(), { message, exp });
        res.json({ message });
    });

    app.post('/api/auth/login', (req, res) => {
        const { address, signature } = req.body || {};
        if (!ethers.isAddress(address || '') || typeof signature !== 'string') return res.status(400).json({ error: 'Thiếu địa chỉ hoặc chữ ký' });
        const key = address.toLowerCase();
        const pending = nonces.get(key);
        nonces.delete(key); // mỗi mã chỉ dùng 1 lần -> chữ ký cũ không dùng lại được
        if (!pending || pending.exp < Date.now()) return res.status(401).json({ error: 'Mã đăng nhập đã hết hạn, vui lòng thử lại' });
        let signer;
        try { signer = ethers.verifyMessage(pending.message, signature).toLowerCase(); } catch { signer = ''; }
        if (signer !== key) return res.status(401).json({ error: 'Chữ ký không khớp với địa chỉ ví' });
        res.json({ token: issueToken(key), address: key, isAdmin: key === ADMIN, expiresIn: SESSION_TTL_MS });
    });

    const requireSession = (req, res, next) => {
        const data = readToken((req.get('authorization') || '').replace(/^Bearer\s+/i, ''));
        if (!data) return res.status(401).json({ error: 'Phiên đăng nhập hết hạn, hãy ký lại để mở hộp thư', code: 'SESSION' });
        req.address = data.a.toLowerCase();
        next();
    };

    // ------------------------------------------------------------ phân quyền
    async function getThread(orderId) {
        const [rows] = await db.execute('SELECT * FROM order_threads WHERE order_id = ?', [orderId]);
        return rows[0] || null;
    }
    function accessOf(order, thread, address) {
        const role = address === order.buyer ? 'buyer' : address === order.seller ? 'seller' : address === ADMIN ? 'admin' : null;
        if (!role) return { role: null, canRead: false, canPost: false };
        if (role === 'admin') {
            const disputed = order.status === STATUS.DISPUTED || !!thread?.disputed;
            return { role, canRead: disputed, canPost: order.status === STATUS.DISPUTED };
        }
        return { role, canRead: true, canPost: ACTIVE.includes(order.status) };
    }
    const parseId = (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'Mã đơn không hợp lệ' }); return null; }
        return id;
    };

    const hits = new Map(); // address -> [timestamps]
    const rateLimited = (address) => {
        const now = Date.now();
        const list = (hits.get(address) || []).filter((t) => now - t < RATE.windowMs);
        list.push(now);
        hits.set(address, list);
        return list.length > RATE.max;
    };

    // ------------------------------------------------------------ API
    /** Đọc tin của một đơn (after = id tin cuối đã có, để chỉ tải tin mới). Đồng thời đánh dấu đã đọc. */
    app.get('/api/orders/:id/messages', requireSession, async (req, res) => {
        const id = parseId(req, res); if (!id) return;
        const order = await readOrder(id);
        const thread = await getThread(id);
        const access = accessOf(order, thread, req.address);
        if (!access.canRead) {
            return res.status(403).json({ error: access.role === 'admin'
                ? 'Admin chỉ xem được trao đổi của đơn đang hoặc đã từng tranh chấp'
                : 'Bạn không phải người mua / người bán của đơn này' });
        }
        const after = Math.max(0, Number(req.query.after) || 0);
        const [messages] = await db.execute(
            'SELECT id, sender, role, kind, body, attachment_url, created_at FROM order_messages WHERE order_id = ? AND id > ? ORDER BY id LIMIT 200',
            [id, after]
        );
        if (messages.length) {
            const last = messages[messages.length - 1].id;
            await db.execute(
                `INSERT INTO thread_reads (order_id, address, last_read_id) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE last_read_id = GREATEST(last_read_id, VALUES(last_read_id))`,
                [id, req.address, last]
            );
        }
        res.set('Cache-Control', 'no-store');
        res.json({ role: access.role, canPost: access.canPost, status: order.status, messages });
    });

    /** Gửi tin. Loại tin `dispute` chỉ nhận khi hợp đồng xác nhận đơn đang tranh chấp. */
    app.post('/api/orders/:id/messages', requireSession, async (req, res) => {
        const id = parseId(req, res); if (!id) return;
        const { body, kind = 'text', attachment_url } = req.body || {};
        const text = typeof body === 'string' ? body.trim() : '';
        if (text.length < 1 || text.length > MAX_BODY) return res.status(400).json({ error: `Nội dung từ 1–${MAX_BODY} ký tự` });
        if (!KINDS[kind]) return res.status(400).json({ error: 'Loại tin không hợp lệ' });
        let link = null;
        if (attachment_url) {
            try {
                const u = new URL(String(attachment_url).trim());
                if (!['http:', 'https:'].includes(u.protocol) || u.href.length > 2048) throw new Error();
                link = u.href;
            } catch { return res.status(400).json({ error: 'Link đính kèm phải là URL http(s) hợp lệ' }); }
        }
        if (rateLimited(req.address)) return res.status(429).json({ error: 'Bạn gửi quá nhanh, chờ một chút rồi thử lại' });

        // Lý do khiếu nại cần trạng thái mới nhất (vừa gửi giao dịch openDispute xong)
        const order = await readOrder(id, { fresh: kind === 'dispute' });
        const thread = await getThread(id);
        const access = accessOf(order, thread, req.address);
        if (!access.role) return res.status(403).json({ error: 'Bạn không phải người mua / người bán của đơn này' });
        if (!access.canPost) {
            return res.status(403).json({ error: access.role === 'admin'
                ? 'Admin chỉ nhắn được khi đơn đang tranh chấp'
                : 'Đơn đã kết thúc, cuộc trò chuyện chỉ còn để xem lại' });
        }
        if (!KINDS[kind].includes(access.role)) return res.status(403).json({ error: 'Vai trò của bạn không gửi được loại tin này' });
        if (kind === 'dispute' && order.status !== STATUS.DISPUTED) {
            return res.status(409).json({ error: 'Hợp đồng chưa ghi nhận khiếu nại của đơn này', code: 'NOT_DISPUTED' });
        }

        await db.execute('INSERT IGNORE INTO order_threads (order_id, buyer, seller) VALUES (?, ?, ?)', [id, order.buyer, order.seller]);
        if (kind === 'dispute') await db.execute('UPDATE order_threads SET disputed = 1 WHERE order_id = ?', [id]);
        const [r] = await db.execute(
            'INSERT INTO order_messages (order_id, sender, role, kind, body, attachment_url) VALUES (?, ?, ?, ?, ?, ?)',
            [id, req.address, access.role, kind, text, link]
        );
        // Không đánh dấu "đã đọc" khi gửi: tin của chính mình vốn không tính là chưa đọc,
        // còn tin người kia gửi trước đó vẫn phải hiện là chưa đọc cho tới khi mở hộp thư.
        const [[message]] = await db.execute('SELECT id, sender, role, kind, body, attachment_url, created_at FROM order_messages WHERE id = ?', [r.insertId]);
        res.status(201).json({ message });
    });

    /** Số tin chưa đọc theo từng đơn của người đang đăng nhập (Admin: các đơn đã có khiếu nại). */
    app.get('/api/threads', requireSession, async (req, res) => {
        const me = req.address;
        const isAdmin = me === ADMIN;
        const [rows] = await db.execute(
            `SELECT t.order_id, t.disputed,
                    COUNT(m.id) AS total,
                    SUM(CASE WHEN m.sender <> ? AND m.id > COALESCE(r.last_read_id, 0) THEN 1 ELSE 0 END) AS unread,
                    MAX(m.id) AS last_id
             FROM order_threads t
             JOIN order_messages m ON m.order_id = t.order_id
             LEFT JOIN thread_reads r ON r.order_id = t.order_id AND r.address = ?
             WHERE t.buyer = ? OR t.seller = ? ${isAdmin ? 'OR t.disputed = 1' : ''}
             GROUP BY t.order_id, t.disputed`,
            [me, me, me, me]
        );
        res.set('Cache-Control', 'no-store');
        res.json(rows.map((r) => ({ orderId: Number(r.order_id), disputed: !!r.disputed, total: Number(r.total), unread: Number(r.unread) })));
    });
}

async function ensureChatSchema(db) {
    await db.query(`CREATE TABLE IF NOT EXISTS order_threads (
        order_id BIGINT PRIMARY KEY,
        buyer CHAR(42) NOT NULL,
        seller CHAR(42) NOT NULL,
        disputed TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_buyer (buyer),
        INDEX idx_seller (seller)
    ) DEFAULT CHARSET = utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS order_messages (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        order_id BIGINT NOT NULL,
        sender CHAR(42) NOT NULL,
        role VARCHAR(10) NOT NULL,
        kind VARCHAR(12) NOT NULL DEFAULT 'text',
        body VARCHAR(1000) NOT NULL,
        attachment_url VARCHAR(2048) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_order (order_id, id)
    ) DEFAULT CHARSET = utf8mb4`);
    await db.query(`CREATE TABLE IF NOT EXISTS thread_reads (
        order_id BIGINT NOT NULL,
        address CHAR(42) NOT NULL,
        last_read_id BIGINT NOT NULL DEFAULT 0,
        PRIMARY KEY (order_id, address)
    ) DEFAULT CHARSET = utf8mb4`);
}

module.exports = { registerChat, ensureChatSchema };
