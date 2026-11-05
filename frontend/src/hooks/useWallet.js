import { useCallback, useEffect, useState } from 'react';
import { CHAIN_ID, CHAIN_NAME } from '../utils/config';

/** Quản lý kết nối MetaMask: tài khoản, mạng, tự cập nhật khi người dùng đổi ví / đổi mạng. */
export default function useWallet() {
  const [account, setAccount] = useState('');
  const [chainId, setChainId] = useState(null);
  const hasWallet = typeof window !== 'undefined' && !!window.ethereum;

  useEffect(() => {
    if (!hasWallet) return;
    const eth = window.ethereum;
    // Tự kết nối lại nếu trang web đã được cấp quyền trước đó (không bật popup)
    eth.request({ method: 'eth_accounts' }).then((a) => setAccount(a[0]?.toLowerCase() || '')).catch(() => {});
    eth.request({ method: 'eth_chainId' }).then((c) => setChainId(Number(c))).catch(() => {});

    const onAccounts = (a) => setAccount(a[0]?.toLowerCase() || '');
    const onChain = (c) => setChainId(Number(c));
    eth.on?.('accountsChanged', onAccounts);
    eth.on?.('chainChanged', onChain);
    return () => {
      eth.removeListener?.('accountsChanged', onAccounts);
      eth.removeListener?.('chainChanged', onChain);
    };
  }, [hasWallet]);

  const connect = useCallback(async () => {
    if (!hasWallet) throw new Error('NO_WALLET');
    const a = await window.ethereum.request({ method: 'eth_requestAccounts' });
    setAccount(a[0]?.toLowerCase() || '');
  }, [hasWallet]);

  const switchNetwork = useCallback(async () => {
    const hex = '0x' + CHAIN_ID.toString(16);
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
    } catch (e) {
      if (e.code === 4902) throw new Error(`Ví chưa có mạng ${CHAIN_NAME}. Hãy thêm mạng này trong MetaMask.`);
      throw e;
    }
  }, []);

  return { account, chainId, hasWallet, wrongNetwork: !!account && chainId !== null && chainId !== CHAIN_ID, connect, switchNetwork };
}
