import { useCallback, useState } from 'react';
import { useToast } from '../components/Toast';
import { friendlyError, getWriteContract } from '../utils/config';

/**
 * Gửi 1 giao dịch tới hợp đồng và hiển thị tiến trình:
 * chờ ký trên ví -> chờ đào khối (kèm link Etherscan) -> thành công / thất bại.
 */
export default function useTx(onDone) {
  const { show } = useToast();
  const [pendingKey, setPendingKey] = useState(null);

  const run = useCallback(async (key, { title, success }, call) => {
    const id = crypto.randomUUID();
    setPendingKey(key);
    try {
      show({ type: 'loading', title, message: 'Vui lòng xác nhận trên ví MetaMask…' }, id);
      const contract = await getWriteContract();
      const tx = await call(contract);
      show({ type: 'loading', title, message: 'Đã gửi lên mạng, đang chờ khối xác nhận…', hash: tx.hash }, id);
      await tx.wait();
      show({ type: 'success', title: success, hash: tx.hash }, id);
      await onDone?.();
      return true;
    } catch (e) {
      console.error(e);
      show({ type: 'error', title: 'Giao dịch không thành công', message: friendlyError(e) }, id);
      return false;
    } finally {
      setPendingKey(null);
    }
  }, [show, onDone]);

  return { run, pendingKey };
}
