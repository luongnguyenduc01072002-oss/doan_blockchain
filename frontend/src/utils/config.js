import { ethers } from 'ethers';
import EscrowABI from '../EscrowABI.json';

// ---- Cấu hình lấy từ file .env của frontend ----
export const API_URL = (import.meta.env.VITE_API_URL || 'https://doan-blockchain-30uq.onrender.com').replace(/\/$/, '');
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
export const ADMIN_ADDRESS = import.meta.env.VITE_ADMIN_ADDRESS?.toLowerCase();
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 11155111); // Sepolia
export const CHAIN_NAME = import.meta.env.VITE_CHAIN_NAME || 'Sepolia';
export const EXPLORER = (import.meta.env.VITE_EXPLORER || 'https://sepolia.etherscan.io').replace(/\/$/, '');
// RPC công khai để ĐỌC dữ liệu hợp đồng, không phụ thuộc ví đang ở mạng nào (và khách chưa có ví vẫn xem được)
const RPC_URL = import.meta.env.VITE_RPC_URL || (CHAIN_ID === 11155111 ? 'https://ethereum-sepolia-rpc.publicnode.com' : '');
const CHAIN_HEX = '0x' + CHAIN_ID.toString(16);

// ---- Trạng thái đơn trong hợp đồng (khớp enum Status) ----
export const STATUS = {
  0: { key: 'NONE', label: 'Không xác định', tone: 'muted' },
  1: { key: 'FUNDED', label: 'Đã khóa tiền', tone: 'info' },
  2: { key: 'SHIPPED', label: 'Đang giao hàng', tone: 'warn' },
  3: { key: 'DISPUTED', label: 'Đang tranh chấp', tone: 'dispute' },
  4: { key: 'COMPLETED', label: 'Đã giải ngân', tone: 'ok' },
  5: { key: 'REFUNDED', label: 'Đã hoàn tiền', tone: 'danger' },
};

// ---- Hợp đồng ----
let rpcProvider;
/**
 * Danh sách hợp đồng chỉ-đọc theo thứ tự ưu tiên: RPC công khai trước, ví MetaMask sau.
 * KHÔNG lưu lại BrowserProvider: ethers v6 báo lỗi "network changed" mãi mãi
 * sau khi người dùng đổi mạng trên ví, làm danh sách đơn đứng yên không cập nhật.
 */
export const getReadContracts = async () => {
  if (!CONTRACT_ADDRESS) return [];
  const list = [];
  if (RPC_URL) {
    rpcProvider ??= new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true });
    list.push(new ethers.Contract(CONTRACT_ADDRESS, EscrowABI, rpcProvider));
  }
  if (window.ethereum) {
    try {
      const chain = Number(await window.ethereum.request({ method: 'eth_chainId' }));
      if (chain === CHAIN_ID) list.push(new ethers.Contract(CONTRACT_ADDRESS, EscrowABI, new ethers.BrowserProvider(window.ethereum)));
    } catch { /* ví bị khóa / lỗi: bỏ qua */ }
  }
  return list;
};

/** Số dư ETH (đọc qua RPC công khai, không phụ thuộc mạng của ví). */
export const getEthBalance = async (address) => {
  const provider = RPC_URL
    ? (rpcProvider ??= new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true }))
    : new ethers.BrowserProvider(window.ethereum);
  return ethers.formatEther(await provider.getBalance(address));
};

/** Bắt buộc ví ở đúng mạng trước khi ký giao dịch; tự đề nghị chuyển mạng nếu sai. */
export const ensureNetwork = async () => {
  if (!window.ethereum) throw new Error('NO_WALLET');
  const current = Number(await window.ethereum.request({ method: 'eth_chainId' }));
  if (current === CHAIN_ID) return;
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] });
  } catch (e) {
    if (e?.code === 4001) throw e; // người dùng bấm từ chối
    throw new Error('WRONG_NETWORK');
  }
  if (Number(await window.ethereum.request({ method: 'eth_chainId' })) !== CHAIN_ID) throw new Error('WRONG_NETWORK');
};

export const getSigner = async () => {
  if (!window.ethereum) throw new Error('NO_WALLET');
  return new ethers.BrowserProvider(window.ethereum).getSigner();
};

/**
 * Hợp đồng để GHI (gửi giao dịch). Luôn kiểm tra mạng trước:
 * nếu ví đang ở Ethereum mainnet, giao dịch sẽ gửi ETH THẬT tới cùng địa chỉ trên mainnet
 * (nơi không có hợp đồng nào) và mất trắng.
 */
export const getWriteContract = async () => {
  if (!CONTRACT_ADDRESS) throw new Error('NO_CONTRACT');
  await ensureNetwork();
  return new ethers.Contract(CONTRACT_ADDRESS, EscrowABI, await getSigner());
};

// ---- Xác thực Admin với backend (khớp server.js) ----
export const buildAdminMessage = (action, timestamp) =>
  `Cho Web3 Escrow - xac nhan quyen Admin\nHanh dong: ${action}\nThoi diem: ${timestamp}`;

export const adminHeaders = async (action) => {
  const signer = await getSigner();
  const timestamp = Date.now();
  const signature = await signer.signMessage(buildAdminMessage(action, timestamp));
  return { 'x-admin-signature': signature, 'x-admin-timestamp': String(timestamp) };
};

// ---- Tiện ích hiển thị ----
export const shortAddr = (a = '') => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
export const formatEth = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 6 });
};
export const txLink = (hash) => `${EXPLORER}/tx/${hash}`;
export const addrLink = (addr) => `${EXPLORER}/address/${addr}`;

/** Dịch lỗi ví / hợp đồng sang câu dễ hiểu cho người dùng. */
export const friendlyError = (e) => {
  if (e instanceof TypeError && /fetch/i.test(e.message)) return 'Không gọi được máy chủ API. Máy chủ Render có thể đang khởi động (chờ ~30 giây) hoặc biến FRONTEND_ORIGIN trên Render chưa đúng domain frontend.';
  if (e?.message === 'WRONG_NETWORK') return `Ví đang ở sai mạng. Hãy chuyển MetaMask sang ${CHAIN_NAME} rồi thử lại — giao dịch đã được chặn để bạn không mất ETH thật.`;
  if (e?.message === 'NO_CONTRACT') return 'Chưa cấu hình VITE_CONTRACT_ADDRESS cho frontend.';
  if (e?.message === 'NO_WALLET') return 'Chưa cài MetaMask. Hãy cài tiện ích MetaMask rồi tải lại trang.';
  if (e?.code === 'ACTION_REJECTED' || e?.code === 4001 || e?.info?.error?.code === 4001) return 'Bạn đã hủy thao tác trên ví.';
  if (e?.code === 'INSUFFICIENT_FUNDS' || /insufficient funds/i.test(e?.message)) return 'Số dư ví không đủ để trả tiền hàng và phí gas.';
  const reason = e?.reason || e?.revert?.args?.[0] || e?.info?.error?.data?.message;
  if (reason) return `Hợp đồng từ chối: ${reason}`;
  return e?.shortMessage || e?.message || 'Đã có lỗi xảy ra.';
};
