/**
 * Kiểm thử API trao đổi đơn hàng (chat.js) với chuỗi ganache + hợp đồng thật + MySQL thật.
 *
 * Cần: (1) cd ../smart_contracts && npm install   (lấy ganache + solc)
 *      (2) một MySQL/MariaDB cục bộ có database trống, ví dụ:
 *          CREATE DATABASE escrow_test; CREATE USER 'app'@'localhost' IDENTIFIED BY 'app'; GRANT ALL ON escrow_test.* TO 'app'@'localhost';
 * Chạy:   TEST_DB_USER=app TEST_DB_PASSWORD=app TEST_DB_NAME=escrow_test npm run test:chat
 */
const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { ethers } = require('ethers');
const SC = path.join(__dirname, '..', '..', 'smart_contracts');
const ganache = require(path.join(SC, 'node_modules', 'ganache'));
const solc = require(path.join(SC, 'node_modules', 'solc'));

const CHAIN_PORT = 8599, API_PORT = 5099;
const API = `http://127.0.0.1:${API_PORT}`;
const MN = 'test test test test test test test test test test test junk';
const ABI = [
  'function createOrder(uint256,address) payable returns (uint256)',
  'function markShipped(uint256)', 'function openDispute(uint256)', 'function confirmDelivery(uint256)',
  'function resolveDispute(uint256,bool)', 'function orderCount() view returns (uint256)',
];
let n = 0;
const t = async (name, fn) => { await fn(); console.log(`✔ ${++n}. ${name}`); };

async function call(p, { method = 'GET', token, body } = {}) {
  const res = await fetch(API + p, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
async function login(signer) {
  const addr = await signer.getAddress();
  const { data } = await call(`/api/auth/nonce?address=${addr}`);
  const signature = await signer.signMessage(data.message);
  const r = await call('/api/auth/login', { method: 'POST', body: { address: addr, signature } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return { token: r.data.token, signature, message: data.message, addr };
}

(async () => {
  // 1. Chuỗi ganache trong tiến trình + deploy hợp đồng
  const chain = ganache.server({ logging: { quiet: true }, wallet: { mnemonic: MN, totalAccounts: 4 }, chain: { chainId: 1337 } });
  await chain.listen(CHAIN_PORT);
  const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${CHAIN_PORT}`);
  const [admin, buyer, seller, stranger] = [0, 1, 2, 3].map((i) => ethers.HDNodeWallet.fromPhrase(MN, undefined, `m/44'/60'/0'/0/${i}`).connect(provider));
  const out = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity', sources: { 'E.sol': { content: fs.readFileSync(path.join(SC, 'EscrowMarketplace.sol'), 'utf8') } },
    settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
  })));
  const art = out.contracts['E.sol'].EscrowMarketplace;
  const escrow = await new ethers.ContractFactory(art.abi, art.evm.bytecode.object, admin).deploy(admin.address, 300);
  await escrow.waitForDeployment();
  const CONTRACT = await escrow.getAddress();

  // 2. Bật server.js trỏ vào chuỗi + CSDL thử (bắt buộc tên CSDL có chữ "test" để không xóa nhầm dữ liệu thật)
  const DB_NAME = process.env.TEST_DB_NAME || 'escrow_test';
  if (!/test/i.test(DB_NAME)) { console.error('TEST_DB_NAME phải chứa chữ "test"'); process.exit(1); }
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env, PORT: String(API_PORT), DOTENV_CONFIG_PATH: '/nonexistent', FRONTEND_ORIGIN: '',
      DB_HOST: process.env.TEST_DB_HOST || '127.0.0.1', DB_PORT: process.env.TEST_DB_PORT || '3306', DB_SSL: 'false',
      DB_USER: process.env.TEST_DB_USER || 'root', DB_PASSWORD: process.env.TEST_DB_PASSWORD || '', DB_NAME,
      ADMIN_ADDRESS: admin.address, CONTRACT_ADDRESS: CONTRACT, RPC_URL: `http://127.0.0.1:${CHAIN_PORT}`, SESSION_SECRET: 'test-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  const stop = async (code) => { server.kill(); await chain.close(); process.exit(code); };
  for (let i = 0; !/sẵn sàng/.test(log); i++) {
    if (i > 50 || /Lỗi CSDL/.test(log)) { console.error(log); await stop(1); }
    await new Promise((r) => setTimeout(r, 200));
  }

  try {
    // Chuỗi ganache mới đánh số đơn lại từ 1 -> xóa tin nhắn của lần chạy trước
    const mysql = require('mysql2/promise');
    const db = await mysql.createConnection({ host: process.env.TEST_DB_HOST || '127.0.0.1', port: Number(process.env.TEST_DB_PORT || 3306),
      user: process.env.TEST_DB_USER || 'root', password: process.env.TEST_DB_PASSWORD || '', database: DB_NAME });
    for (const tbl of ['order_messages', 'order_threads', 'thread_reads']) await db.query(`DELETE FROM ${tbl}`);
    await db.end();

    const c = (s) => new ethers.Contract(CONTRACT, ABI, s);
    const ONE = ethers.parseEther('0.1');
    await (await c(buyer).createOrder(1, seller.address, { value: ONE })).wait();
    const id = Number(await c(buyer).orderCount());

    let B, S, A, X;
    await t('Đăng nhập bằng chữ ký cho 4 ví', async () => {
      [B, S, A, X] = await Promise.all([buyer, seller, admin, stranger].map(login));
    });
    await t('Chữ ký đăng nhập không dùng lại được (nonce 1 lần)', async () => {
      const r = await call('/api/auth/login', { method: 'POST', body: { address: B.addr, signature: B.signature } });
      assert.equal(r.status, 401);
    });
    await t('Ký bằng ví khác thì không đăng nhập thay được', async () => {
      const { data } = await call(`/api/auth/nonce?address=${B.addr}`);
      const sig = await stranger.signMessage(data.message);
      const r = await call('/api/auth/login', { method: 'POST', body: { address: B.addr, signature: sig } });
      assert.equal(r.status, 401);
    });
    await t('Không có / sai token -> 401', async () => {
      assert.equal((await call(`/api/orders/${id}/messages`)).status, 401);
      assert.equal((await call(`/api/orders/${id}/messages`, { token: B.token.slice(0, -2) + 'xx' })).status, 401);
    });
    await t('Người mua gửi địa chỉ nhận hàng, người bán gửi mã vận đơn', async () => {
      let r = await call(`/api/orders/${id}/messages`, { method: 'POST', token: B.token, body: { kind: 'shipping', body: 'Nguyễn Văn A - 0901234567 - Tân Quới, Vĩnh Long' } });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      r = await call(`/api/orders/${id}/messages`, { method: 'POST', token: S.token, body: { kind: 'tracking', body: 'GHN - mã GHN123456' } });
      assert.equal(r.status, 201);
    });
    await t('Sai vai trò: người bán không gửi được "địa chỉ nhận hàng"', async () => {
      const r = await call(`/api/orders/${id}/messages`, { method: 'POST', token: S.token, body: { kind: 'shipping', body: 'x' } });
      assert.equal(r.status, 403);
    });
    await t('Người lạ không đọc / gửi được', async () => {
      assert.equal((await call(`/api/orders/${id}/messages`, { token: X.token })).status, 403);
      assert.equal((await call(`/api/orders/${id}/messages`, { method: 'POST', token: X.token, body: { body: 'hi' } })).status, 403);
    });
    await t('Admin KHÔNG đọc được tin riêng khi đơn chưa tranh chấp', async () => {
      assert.equal((await call(`/api/orders/${id}/messages`, { token: A.token })).status, 403);
    });
    await t('Đếm tin chưa đọc đúng cho người bán, đọc xong về 0', async () => {
      let r = await call('/api/threads', { token: S.token });
      assert.equal(r.data.find((x) => x.orderId === id).unread, 1);
      r = await call(`/api/orders/${id}/messages`, { token: S.token });
      assert.equal(r.data.messages.length, 2);
      assert.equal(r.data.role, 'seller');
      r = await call('/api/threads', { token: S.token });
      assert.equal(r.data.find((x) => x.orderId === id).unread, 0);
    });
    await t('Gửi lý do khiếu nại khi hợp đồng chưa ghi nhận -> 409', async () => {
      const r = await call(`/api/orders/${id}/messages`, { method: 'POST', token: B.token, body: { kind: 'dispute', body: 'Hàng lỗi' } });
      assert.equal(r.status, 409);
    });
    await t('Khiếu nại on-chain -> gửi lý do -> Admin thấy và nhắn được', async () => {
      await (await c(seller).markShipped(id)).wait();
      await (await c(buyer).openDispute(id)).wait();
      let r = await call(`/api/orders/${id}/messages`, { method: 'POST', token: B.token, body: { kind: 'dispute', body: 'Hàng bị vỡ khi nhận', attachment_url: 'https://example.com/anh-hang-vo.jpg' } });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      r = await call('/api/threads', { token: A.token });
      assert.ok(r.data.find((x) => x.orderId === id && x.disputed && x.unread === 3), JSON.stringify(r.data));
      r = await call(`/api/orders/${id}/messages`, { token: A.token });
      assert.equal(r.status, 200);
      assert.equal(r.data.messages.length, 3);
      r = await call(`/api/orders/${id}/messages`, { method: 'POST', token: A.token, body: { body: 'Người bán vui lòng gửi ảnh lúc đóng gói' } });
      assert.equal(r.status, 201);
      assert.equal(r.data.message.role, 'admin');
    });
    await t('Link đính kèm phải là http(s)', async () => {
      const r = await call(`/api/orders/${id}/messages`, { method: 'POST', token: B.token, body: { body: 'x', attachment_url: 'javascript:alert(1)' } });
      assert.equal(r.status, 400);
    });
    await t('Phân xử xong: đơn khóa trò chuyện, Admin vẫn xem lại được', async () => {
      await (await c(admin).resolveDispute(id, false)).wait();
      await new Promise((r) => setTimeout(r, 5200)); // hết cache 5 giây
      assert.equal((await call(`/api/orders/${id}/messages`, { method: 'POST', token: B.token, body: { body: 'cảm ơn' } })).status, 403);
      assert.equal((await call(`/api/orders/${id}/messages`, { method: 'POST', token: A.token, body: { body: 'x' } })).status, 403);
      assert.equal((await call(`/api/orders/${id}/messages`, { token: A.token })).status, 200);
    });
    await t('Đơn không tồn tại -> 404', async () => {
      assert.equal((await call('/api/orders/9999/messages', { token: B.token })).status, 404);
    });
    console.log(`\nTất cả ${n} kịch bản API trao đổi đều đạt.`);
    await stop(0);
  } catch (e) {
    console.error('✘', e, '\n--- log server ---\n' + log);
    await stop(1);
  }
})();
