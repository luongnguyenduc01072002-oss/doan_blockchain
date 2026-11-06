import { ethers } from 'ethers';
import EscrowABI from '../EscrowABI.json';

// ---- Cấu hình lấy từ file .env của frontend ----
export const API_URL = (import.meta.env.VITE_API_URL || 'https://doan-blockchain-30uq.onrender.com').replace(/\/$/, '');
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
export const ADMIN_ADDRESS = import.meta.env.VITE_ADMIN_ADDRESS?.toLowerCase();
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 11155111); // Sepolia
export const CHAIN_NAME = import.meta.env.VITE_CHAIN_NAME || 'Sepolia';
export const EXPLORER = (import.meta.env.VITE_EXPLORER || 'https://sepolia.etherscan.io').replace(/\/$/, '');
const RPC_URL = import.meta.env.VITE_RPC_URL; // tùy chọn: để khách chưa có ví vẫn xem được đơn

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
let readProvider;
export const getReadProvider = () => {
  if (readProvider) return readProvider;
  if (RPC_URL) readProvider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
  else if (window.ethereum) readProvider = new ethers.BrowserProvider(window.ethereum);
  return readProvider;
};

export const getReadContract = () => {
  const provider = getReadProvider();
  if (!provider || !CONTRACT_ADDRESS) return null;
  return new ethers.Contract(CONTRACT_ADDRESS, EscrowABI, provider);
};

export const getSigner = async () => {
  if (!window.ethereum) throw new Error('NO_WALLET');
  const provider = new ethers.BrowserProvider(window.ethereum);
  return provider.getSigner();
};

export const getWriteContract = async () =>
  new ethers.Contract(CONTRACT_ADDRESS, EscrowABI, await getSigner());

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
  if (e?.message === 'NO_WALLET') return 'Chưa cài MetaMask. Hãy cài tiện ích MetaMask rồi tải lại trang.';
  if (e?.code === 'ACTION_REJECTED' || e?.code === 4001 || e?.info?.error?.code === 4001) return 'Bạn đã hủy thao tác trên ví.';
  if (e?.code === 'INSUFFICIENT_FUNDS' || /insufficient funds/i.test(e?.message)) return 'Số dư ví không đủ để trả tiền hàng và phí gas.';
  const reason = e?.reason || e?.revert?.args?.[0] || e?.info?.error?.data?.message;
  if (reason) return `Hợp đồng từ chối: ${reason}`;
  return e?.shortMessage || e?.message || 'Đã có lỗi xảy ra.';
};
