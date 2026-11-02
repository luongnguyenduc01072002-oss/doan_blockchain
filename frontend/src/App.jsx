import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import EscrowABI from './EscrowABI.json'
import './App.css'

const CONTRACT_ADDRESS = "0xa131AD247055FD2e2aA8b156A11bdEc81b9eAD95"

function App() {
  const [account, setAccount] = useState('')
  const [sellerAddress, setSellerAddress] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [status, setStatus] = useState('Đang kết nối mạng lưới...')
  const [balance, setBalance] = useState('0')

  // Hàm tự động đọc số dư thật từ Smart Contract trên Blockchain
  const fetchContractData = async () => {
    if (window.ethereum) {
      try {
        // Chỉ cần Provider để đọc dữ liệu (Read-only), không cần Signer
        const provider = new ethers.BrowserProvider(window.ethereum);
        
        // Truy vấn số dư ETH thực tế đang bị khóa trong địa chỉ Hợp đồng
        const contractBalance = await provider.getBalance(CONTRACT_ADDRESS);
        const balanceInEther = ethers.formatEther(contractBalance);
        setBalance(balanceInEther);

        // Cập nhật trạng thái hiển thị dựa trên số dư
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

  // Tự động gọi hàm đọc dữ liệu mỗi khi tài khoản thay đổi hoặc vừa kết nối ví
  useEffect(() => {
    if (account) {
      fetchContractData();
    }
  }, [account]);

  // Hàm kết nối ví MetaMask
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

  // Hàm nạp tiền vào Smart Contract
  const handleDeposit = async () => {
    if (!window.ethereum) return alert("Vui lòng cài đặt MetaMask!");
    if (!account) return alert("Vui lòng kết nối ví trước!");
    if (!sellerAddress || !depositAmount) return alert("Vui lòng nhập đủ địa chỉ người bán và số ETH!");

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const escrowContract = new ethers.Contract(CONTRACT_ADDRESS, EscrowABI, signer);

      const amountInWei = ethers.parseEther(depositAmount);

      // Gọi hàm nạp tiền (deposit)
      const tx = await escrowContract.deposit(sellerAddress, { value: amountInWei });
      
      alert("Giao dịch đang được đẩy lên Blockchain... Vui lòng chờ xác nhận!");
      
      // Chờ mạng lưới Blockchain xác nhận
      await tx.wait();
      
      alert("Nạp tiền và Khóa Két thành công!");
      
      // Gọi lại hàm cập nhật để web tải lại số dư mới nhất lập tức
      fetchContractData(); 

    } catch (error) {
      console.error("Lỗi khi nạp tiền:", error);
      alert("Giao dịch thất bại! Vui lòng kiểm tra lại console log.");
    }
  }

  // Hàm xác nhận nhận hàng và giải ngân cho người bán
  const handleConfirmDelivery = async () => {
    if (!window.ethereum) return alert("Vui lòng cài đặt MetaMask!");
    if (!account) return alert("Vui lòng kết nối ví trước!");

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const escrowContract = new ethers.Contract(CONTRACT_ADDRESS, EscrowABI, signer);

      // Gọi hàm giải ngân (confirmDelivery)
      const tx = await escrowContract.confirmDelivery();
      
      alert("Đang xử lý lệnh giải ngân... Vui lòng chờ!");
      await tx.wait();
      
      alert("Giải ngân thành công! Tiền đã được chuyển vào ví người bán.");
      
      // Cập nhật lại số dư két sắt (sẽ về 0)
      fetchContractData();

    } catch (error) {
      console.error("Lỗi khi xác nhận:", error);
      alert("Giao dịch thất bại! (Bạn có chắc mình là người mua của giao dịch này không?)");
    }
  }

  return (
    <div className="App">
      <h1>Hệ Thống Giao Dịch Đảm Bảo (Escrow)</h1>
      
      {/* Khu vực 1: Kết nối ví */}
      <div className="card" style={{ backgroundColor: '#f0f4f8', padding: '20px', borderRadius: '10px', marginBottom: '20px' }}>
        <h2>1. Trạng Thái Kết Nối</h2>
        {!account ? (
          <button onClick={connectWallet} style={{ backgroundColor: '#ff9800', color: 'white', padding: '10px 20px', fontSize: '16px', cursor: 'pointer', border: 'none', borderRadius: '5px' }}>
            🦊 Kết nối ví MetaMask
          </button>
        ) : (
          <p style={{ color: 'green', fontSize: '18px' }}>
            ✅ Đã kết nối ví: <strong>{account}</strong>
          </p>
        )}
      </div>

      {/* Khu vực 2: Thông tin Két sắt */}
      <div className="card" style={{ backgroundColor: '#e3f2fd', padding: '20px', borderRadius: '10px', marginBottom: '20px' }}>
        <h2>2. Thông Tin Két Sắt (Smart Contract)</h2>
        <p>Trạng thái hiện tại: <strong>{status}</strong></p>
        <p>Số dư đang khóa: <strong>{balance} ETH</strong></p>
      </div>

      {/* Khu vực 3: Bảng điều khiển mua bán */}
      <div className="card" style={{ backgroundColor: '#e8f5e9', padding: '20px', borderRadius: '10px' }}>
        <h2>3. Bảng Điều Khiển</h2>
        
        <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
          <h3>Dành cho Người Mua (Tạo Giao Dịch)</h3>
          
          <input 
            type="text" 
            placeholder="Nhập địa chỉ ví người bán (0x...)" 
            value={sellerAddress}
            onChange={(e) => setSellerAddress(e.target.value)}
            style={{ padding: '10px', fontSize: '16px', width: '350px', borderRadius: '5px', border: '1px solid #ccc' }}
          />

          <input 
            type="number" 
            placeholder="Nhập số ETH cần khóa..." 
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            style={{ padding: '10px', fontSize: '16px', width: '350px', borderRadius: '5px', border: '1px solid #ccc' }}
          />

          <button 
            onClick={handleDeposit}
            style={{ backgroundColor: '#2196f3', color: 'white', padding: '12px 20px', fontSize: '16px', cursor: 'pointer', border: 'none', borderRadius: '5px', width: '370px', fontWeight: 'bold' }}>
            💰 Nạp tiền & Khóa vào Két
          </button>
        </div>

        <div style={{ borderTop: '2px dashed #4caf50', paddingTop: '20px', marginTop: '20px' }}>
          <h3>Dành cho Người Mua (Sau Khi Nhận Hàng)</h3>
          <button 
            onClick={handleConfirmDelivery}
            style={{ backgroundColor: '#4caf50', color: 'white', padding: '12px 20px', fontSize: '16px', cursor: 'pointer', border: 'none', borderRadius: '5px', fontWeight: 'bold' }}>
            📦 Xác nhận đã nhận hàng (Giải ngân cho người bán)
          </button>
        </div>
      </div>
      
    </div>
  )
}

export default App