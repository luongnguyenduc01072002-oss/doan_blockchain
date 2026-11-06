import { useCallback, useEffect, useRef, useState } from 'react';
import { CHAIN_ID, CHAIN_NAME } from '../utils/config';

// Ghi nhớ "người dùng đã bấm Đăng xuất" để tải lại trang không tự đăng nhập lại
const LOGOUT_KEY = 'escrowmart:logged-out';
const readLoggedOut = () => { try { return localStorage.getItem(LOGOUT_KEY) === '1'; } catch { return false; } };
const writeLoggedOut = (v) => { try { v ? localStorage.setItem(LOGOUT_KEY, '1') : localStorage.removeItem(LOGOUT_KEY); } catch { /* chế độ ẩn danh */ } };

/**
 * Quản lý kết nối MetaMask: đăng nhập, đổi tài khoản, đăng xuất, theo dõi mạng.
 *
 * Lưu ý: trang web không thể "tắt" MetaMask. Đăng xuất ở đây gồm 2 việc:
 *  1. Thu hồi quyền truy cập ví của trang (wallet_revokePermissions, MetaMask hỗ trợ từ 2024)
 *  2. Xóa tài khoản khỏi giao diện và ghi nhớ trạng thái đã đăng xuất
 */
export default function useWallet() {
  const [account, setAccount] = useState('');
  const [chainId, setChainId] = useState(null);
  const loggedOut = useRef(readLoggedOut());
  const hasWallet = typeof window !== 'undefined' && !!window.ethereum;

  useEffect(() => {
    if (!hasWallet) return;
    const eth = window.ethereum;
    // Tự kết nối lại nếu trang đã được cấp quyền trước đó — trừ khi người dùng đã chủ động đăng xuất
    if (!loggedOut.current) {
      eth.request({ method: 'eth_accounts' }).then((a) => setAccount(a[0]?.toLowerCase() || '')).catch(() => {});
    }
    eth.request({ method: 'eth_chainId' }).then((c) => setChainId(Number(c))).catch(() => {});

    const onAccounts = (a) => { if (!loggedOut.current) setAccount(a[0]?.toLowerCase() || ''); };
    const onChain = (c) => setChainId(Number(c));
    eth.on?.('accountsChanged', onAccounts);
    eth.on?.('chainChanged', onChain);
    return () => {
      eth.removeListener?.('accountsChanged', onAccounts);
      eth.removeListener?.('chainChanged', onChain);
    };
  }, [hasWallet]);

  const connect = useCallback(async () => {
    if (!hasWallet) {
      // Trình duyệt điện thoại không có MetaMask: mở trang này trong trình duyệt của app MetaMask
      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        window.location.href = `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`;
        return;
      }
      throw new Error('NO_WALLET');
    }
    const a = await window.ethereum.request({ method: 'eth_requestAccounts' });
    loggedOut.current = false;
    writeLoggedOut(false);
    setAccount(a[0]?.toLowerCase() || '');
  }, [hasWallet]);

  /** Mở bảng chọn tài khoản của MetaMask (tiện khi demo bằng 3 ví Admin / Người mua / Người bán). */
  const switchAccount = useCallback(async () => {
    if (!hasWallet) throw new Error('NO_WALLET');
    await window.ethereum.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
    const a = await window.ethereum.request({ method: 'eth_accounts' });
    loggedOut.current = false;
    writeLoggedOut(false);
    setAccount(a[0]?.toLowerCase() || '');
  }, [hasWallet]);

  const disconnect = useCallback(async () => {
    loggedOut.current = true;
    writeLoggedOut(true);
    setAccount('');
    try {
      // Thu hồi quyền để lần đăng nhập sau MetaMask hỏi lại và cho chọn tài khoản
      await window.ethereum?.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] });
    } catch {
      // Ví cũ không hỗ trợ: giao diện vẫn đăng xuất; muốn ngắt hẳn thì vào MetaMask > Trang web đã kết nối
    }
  }, []);

  const switchNetwork = useCallback(async () => {
    const hex = '0x' + CHAIN_ID.toString(16);
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
    } catch (e) {
      if (e.code === 4902) throw new Error(`Ví chưa có mạng ${CHAIN_NAME}. Hãy thêm mạng này trong MetaMask.`);
      throw e;
    }
  }, []);

  return {
    account, chainId, hasWallet,
    wrongNetwork: !!account && chainId !== null && chainId !== CHAIN_ID,
    connect, switchAccount, disconnect, switchNetwork,
  };
}
