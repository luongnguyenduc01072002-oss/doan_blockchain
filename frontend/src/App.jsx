import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import EscrowABI from './EscrowABI.json'
import './App.css'

// Địa chỉ Contract mới do T1 cập nhật
const CONTRACT_ADDRESS = "0xa131AD247055FD2e2aA8b156A11bdEc81b9eAD95" 

function App() {
  const [account, setAccount] = useState('')
  const [sellerAddress, setSellerAddress] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [status, setStatus] = useState('Đang kết nối mạng lưới...')
  const [balance, setBalance] = useState('0')

  // Đọc dữ liệu từ Blockchain
  const fetchContractData = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const contractBalance = await provider.getBalance(CONTRACT_ADDRESS);
        const balanceInEther = ethers.formatEther(contractBalance);
        setBalance(balanceInEther);

        if (parseFloat(balanceInEther) > 0) {
          setStatus('Đã nạp tiền, đang chờ giao hàng (AWAITING_DELIVERY)');
        } else {
          setStatus('Đang chờ nạp tiền (AWAITING_PAYMENT)');
        }
      } catch (error) {
        console.error("Lỗi khi đọc dữ liệu Blockchain:", error);
        setStatus('Lỗi đồng bộ dữ liệu mạng lưới');
      }
    }
  }

  useEffect(() => {
    if (account) {
      fetchContractData();
    }
  }, [account]);

  // Kết nối MetaMask
  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        setAccount(accounts[0]);
      } catch (error) {
        console.error("Lỗi kết nối ví:", error);
        alert("Bạn đã từ chối kết nối ví!");
      }
    } else {
      alert("Vui lòng cài đặt tiện ích MetaMask trên trình duyệt!");
    }
  }

  // Nạp tiền vào Két sắt (Đã sửa lại gọi đúng hàm depositPayment và bỏ tham số)
  const handleDeposit = async () => {
    if (!window.ethereum) return alert("Vui lòng cài đặt MetaMask!");
    if (!account) return alert("Vui lòng kết nối ví trước!");
    if (!depositAmount) return alert("Vui lòng nhập số ETH cần khóa!");

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const escrowContract = new ethers.Contract(CONTRACT_ADDRESS, EscrowABI, signer);
      const amountInWei = ethers.parseEther(depositAmount);

      // Gọi chuẩn xác hàm depositPayment() trong Solidity
      const tx = await escrowContract.depositPayment({ value: amountInWei });
      alert("Giao dịch đang được đẩy lên Blockchain... Vui lòng chờ xác nhận!");
      await tx.wait();
      
      alert("Nạp tiền và Khóa Két thành công!");
      fetchContractData(); 

    } catch (error) {
      console.error("Lỗi khi nạp tiền:", error);
      alert("Giao dịch thất bại! Vui lòng kiểm tra lại console log.");
    }
  }

  // Giải ngân cho người bán
  const handleConfirmDelivery = async () => {
    if (!window.ethereum) return alert("Vui lòng cài đặt MetaMask!");
    if (!account) return alert("Vui lòng kết nối ví trước!");

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const escrowContract = new ethers.Contract(CONTRACT_ADDRESS, EscrowABI, signer);

      const tx = await escrowContract.confirmDelivery();
      alert("Đang xử lý lệnh giải ngân... Vui lòng chờ!");
      await tx.wait();
      
      alert("Giải ngân thành công! Tiền đã được chuyển vào ví người bán.");
      fetchContractData();

    } catch (error) {
      console.error("Lỗi khi xác nhận:", error);
      alert("Giao dịch thất bại! (Bạn có chắc mình là người mua của giao dịch này không?)");
    }
  }

  // Hoàn tiền (Đã sửa lại gọi đúng hàm refundBuyer)
  const handleRefund = async () => {
    if (!window.ethereum) return alert("Vui lòng cài đặt MetaMask!");
    if (!account) return alert("Vui lòng kết nối ví trước!");

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const escrowContract = new ethers.Contract(CONTRACT_ADDRESS, EscrowABI, signer);

      // Gọi chuẩn xác hàm refundBuyer() trong Solidity
      const tx = await escrowContract.refundBuyer();
      alert("Đang xử lý lệnh hoàn tiền... Vui lòng chờ!");
      await tx.wait();
      
      alert("Hoàn tiền thành công! ETH đã được trả lại ví của bạn.");
      fetchContractData(); 

    } catch (error) {
      console.error("Lỗi khi hoàn tiền:", error);
      alert("Giao dịch thất bại! (Lưu ý: Chỉ Admin hoặc Người bán mới có quyền ấn nút này).");
    }
  }

  return (
    <div className="App">
      <h1>Hệ Thống Giao Dịch Đảm Bảo (Escrow)</h1>
      
      <div className="card" style={{ backgroundColor: '#f0f4f8' }}>
        <h2>1. Trạng Thái Kết Nối</h2>
        {!account ? (
          <button onClick={connectWallet} style={{ backgroundColor: '#ff9800', color: 'white', padding: '10px 20px', fontSize: '16px', border: 'none' }}>
            🦊 Kết nối ví MetaMask
          </button>
        ) : (
          <p style={{ color: 'green', fontSize: '18px' }}>✅ Đã kết nối ví: <strong>{account}</strong></p>
        )}
      </div>

      <div className="card" style={{ backgroundColor: '#e3f2fd' }}>
        <h2>2. Thông Tin Két Sắt (Smart Contract)</h2>
        <p>Trạng thái hiện tại: <strong>{status}</strong></p>
        <p>Số dư đang khóa: <strong>{balance} ETH</strong></p>
      </div>

      <div className="card" style={{ backgroundColor: '#e8f5e9' }}>
        <h2>3. Bảng Điều Khiển</h2>
        
        <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
          <h3>Dành cho Người Mua (Tạo Giao Dịch)</h3>
          
          <input 
            type="text" 
            placeholder="Nhập địa chỉ ví người bán (chỉ để hiển thị UI)" 
            value={sellerAddress}
            onChange={(e) => setSellerAddress(e.target.value)}
          />

          <input 
            type="number" 
            placeholder="Nhập số ETH cần khóa..." 
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
          />

          <button onClick={handleDeposit} style={{ backgroundColor: '#2196f3', color: 'white', padding: '12px 20px', width: '100%', fontSize: '16px', border: 'none' }}>
            💰 Nạp tiền & Khóa vào Két
          </button>
        </div>

        <div style={{ borderTop: '2px dashed #4caf50', paddingTop: '20px', marginTop: '20px', display: 'flex', gap: '15px' }}>
          <button onClick={handleConfirmDelivery} style={{ backgroundColor: '#4caf50', color: 'white', padding: '12px 20px', fontSize: '16px', border: 'none', flex: 1 }}>
            📦 Đã nhận hàng (Giải ngân)
          </button>

          <button onClick={handleRefund} style={{ backgroundColor: '#f44336', color: 'white', padding: '12px 20px', fontSize: '16px', border: 'none', flex: 1 }}>
            ❌ Hủy & Hoàn tiền
          </button>
        </div>
      </div>
      
    </div>
  )
}

export default App