// Biên dịch EscrowMarketplace.sol và chạy kiểm thử trên chuỗi ganache trong bộ nhớ.
import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import ganache from 'ganache';
import { ethers } from 'ethers';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const source = fs.readFileSync(path.join(root, 'EscrowMarketplace.sol'), 'utf8');

const out = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity',
  sources: { 'EscrowMarketplace.sol': { content: source } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
})));
const errs = (out.errors || []).filter(e => e.severity === 'error');
(out.errors || []).forEach(e => console.log(e.formattedMessage));
if (errs.length) process.exit(1);
const c = out.contracts['EscrowMarketplace.sol'].EscrowMarketplace;
fs.writeFileSync(path.join(root, 'EscrowABI.json'), JSON.stringify(c.abi, null, 2));
console.log('✔ Biên dịch OK, đã ghi EscrowABI.json');

const provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 5 } }), undefined, { cacheTimeout: -1 });
const [admin, buyer, seller, stranger] = await Promise.all([0, 1, 2, 3].map(i => provider.getSigner(i)));
const DAY = 3 * 24 * 3600;
const factory = new ethers.ContractFactory(c.abi, c.evm.bytecode.object, admin);
const escrow = await factory.deploy(await admin.getAddress(), DAY);
await escrow.waitForDeployment();

const ONE = ethers.parseEther('1');
const S = { FUNDED: 1n, SHIPPED: 2n, DISPUTED: 3n, COMPLETED: 4n, REFUNDED: 5n };
const bal = a => provider.getBalance(a);
const as = s => escrow.connect(s);
const sellerAddr = await seller.getAddress();
const buyerAddr = await buyer.getAddress();
let n = 0;
const t = async (name, fn) => { await fn(); console.log(`✔ ${++n}. ${name}`); };
const reverts = async (p, msg) => { await assert.rejects(p, e => inspect(e, { depth: 8 }).includes(msg)); };

await t('Tạo đơn khóa tiền, số dư hợp đồng tăng', async () => {
  await (await as(buyer).createOrder(7, sellerAddr, { value: ONE })).wait();
  const o = await escrow.getOrder(1);
  assert.equal(o.status, S.FUNDED); assert.equal(o.amount, ONE); assert.equal(o.productId, 7n);
  assert.equal(await escrow.getBalance(), ONE);
});
await t('Người lạ / người bán không xác nhận thay người mua được', async () => {
  await reverts(as(stranger).confirmDelivery(1), 'Chi nguoi mua');
  await reverts(as(seller).confirmDelivery(1), 'Chi nguoi mua');
});
await t('Không tự mua hàng của mình, không nạp 0 ETH', async () => {
  await reverts(as(seller).createOrder(1, sellerAddr, { value: ONE }), 'Khong the tu mua');
  await reverts(as(buyer).createOrder(1, sellerAddr, { value: 0 }), 'So tien phai');
});
await t('Người bán CHƯA gửi hàng thì người mua không xác nhận nhận hàng được', async () => {
  await reverts(as(buyer).confirmDelivery(1), 'Nguoi ban chua gui hang');
});
await t('Gửi hàng -> người mua xác nhận -> người bán nhận đủ tiền', async () => {
  await (await as(seller).markShipped(1)).wait();
  const before = await bal(sellerAddr);
  await (await as(buyer).confirmDelivery(1)).wait();
  assert.equal(await bal(sellerAddr) - before, ONE);
  assert.equal((await escrow.getOrder(1)).status, S.COMPLETED);
  assert.equal(await escrow.getBalance(), 0n);
});
await t('Không giải ngân lần 2 cho đơn đã xong', async () => {
  await reverts(as(buyer).confirmDelivery(1), 'Nguoi ban chua gui hang');
});
await t('Người bán hủy đơn -> người mua được hoàn tiền', async () => {
  await (await as(buyer).createOrder(2, sellerAddr, { value: ONE })).wait();
  const before = await bal(buyerAddr);
  await (await as(seller).refundBySeller(2)).wait();
  assert.equal(await bal(buyerAddr) - before, ONE);
  assert.equal((await escrow.getOrder(2)).status, S.REFUNDED);
});
await t('Tranh chấp: Admin xử cho người mua thắng', async () => {
  await (await as(buyer).createOrder(3, sellerAddr, { value: ONE })).wait();
  await reverts(as(seller).openDispute(3), 'Chi khieu nai sau khi');   // người bán không được "đóng băng" tiền khi chưa gửi
  await (await as(seller).markShipped(3)).wait();
  await (await as(buyer).openDispute(3)).wait();
  await reverts(as(buyer).confirmDelivery(3), 'Nguoi ban chua gui hang');
  await reverts(as(seller).claimAfterTimeout(3), 'Don chua');
  await reverts(as(buyer).resolveDispute(3, false), 'Chi Admin');
  const before = await bal(buyerAddr);
  await (await as(admin).resolveDispute(3, false)).wait();
  assert.equal(await bal(buyerAddr) - before, ONE);
});
await t('Tranh chấp: Admin xử cho người bán thắng', async () => {
  await (await as(buyer).createOrder(4, sellerAddr, { value: ONE })).wait();
  await (await as(seller).markShipped(4)).wait();
  await (await as(seller).openDispute(4)).wait();
  const before = await bal(sellerAddr);
  await (await as(admin).resolveDispute(4, true)).wait();
  assert.equal((await escrow.getOrder(4)).status, S.COMPLETED);
  assert.ok(await bal(sellerAddr) > before);
});
await t('Người mua im lặng: người bán chỉ rút được sau khi hết hạn', async () => {
  await (await as(buyer).createOrder(5, sellerAddr, { value: ONE })).wait();
  await reverts(as(seller).claimAfterTimeout(5), 'Don chua');
  await (await as(seller).markShipped(5)).wait();
  await reverts(as(seller).claimAfterTimeout(5), 'Chua het thoi gian');
  await provider.send('evm_increaseTime', [DAY + 1]); await provider.send('evm_mine', []);
  await (await as(seller).claimAfterTimeout(5)).wait();
  assert.equal((await escrow.getOrder(5)).status, S.COMPLETED);
});
await t('Người mua tự hủy khi chưa gửi hàng; đã gửi rồi thì không tự hủy được', async () => {
  await (await as(buyer).createOrder(9, sellerAddr, { value: ONE })).wait();
  const id = await escrow.orderCount();
  await reverts(as(seller).cancelByBuyer(id), 'Chi nguoi mua');
  const vault = await escrow.getBalance();
  await (await as(buyer).cancelByBuyer(id)).wait();
  assert.equal((await escrow.getOrder(id)).status, S.REFUNDED);
  assert.equal(vault - await escrow.getBalance(), ONE);
  await (await as(buyer).createOrder(9, sellerAddr, { value: ONE })).wait();
  const id2 = await escrow.orderCount();
  await (await as(seller).markShipped(id2)).wait();
  await reverts(as(buyer).cancelByBuyer(id2), 'khong the tu huy');
  await (await as(buyer).confirmDelivery(id2)).wait();
});
await t('Admin không được làm người bán / người mua (tránh tự xử tranh chấp cho mình)', async () => {
  const adminAddr = await admin.getAddress();
  await reverts(as(buyer).createOrder(10, adminAddr, { value: ONE }), 'Admin khong duoc');
  await reverts(as(admin).createOrder(10, sellerAddr, { value: ONE }), 'Admin khong duoc');
});
await t('Nhiều đơn song song không lẫn tiền', async () => {
  await (await as(buyer).createOrder(6, sellerAddr, { value: ONE })).wait();
  await (await as(stranger).createOrder(6, sellerAddr, { value: ONE * 2n })).wait();
  assert.equal(await escrow.getBalance(), ONE * 3n); // 2 đơn hủy/giải ngân xong không còn tiền trong két
  assert.equal(await escrow.orderCount(), 9n);
});
console.log(`\nTất cả ${n} kịch bản đều đạt.`);
process.exit(0);
