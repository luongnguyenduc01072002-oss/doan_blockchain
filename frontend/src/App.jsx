import { useState } from 'react'
import { ethers } from 'ethers'
import './App.css'
const CONTRACT_ADDRESS = "0xa131AD247055FD2e2aA8b156A11bdEc81b9eAD95"
function App() {
  const [account, setAccount] = useState('')

  // Hàm mô phỏng kết nối ví (Thành viên 3 sẽ thay bằng code kết nối MetaMask thật sau)
  
  // Hàm kết nối ví MetaMask thật (Thành viên 3 code)
  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        // Yêu cầu MetaMask mở popup đăng nhập
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        setAccount(accounts[0]); // Lưu địa chỉ ví vào State
      } catch (error) {
        console.error("Lỗi kết nối ví:", error);
        alert("Bạn đã từ chối kết nối ví!");
      }
    } else {
      alert("Vui lòng cài đặt tiện ích MetaMask trên trình duyệt!");
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
        <p>Trạng thái hiện tại: <strong>Đang chờ nạp tiền (AWAITING_PAYMENT)</strong></p>
        <p>Số dư đang khóa: <strong>0 ETH</strong></p>
      </div>

      {/* Khu vực 3: Bảng điều khiển mua bán */}
      <div className="card" style={{ backgroundColor: '#e8f5e9', padding: '20px', borderRadius: '10px' }}>
        <h2>3. Bảng Điều Khiển</h2>
        
        <div style={{ marginBottom: '20px' }}>
          <h3>Dành cho Người Mua</h3>
          <input 
            type="number" 
            placeholder="Nhập số ETH..." 
            style={{ padding: '10px', fontSize: '16px', marginRight: '10px', width: '150px' }}
          />
          <button style={{ backgroundColor: '#2196f3', color: 'white', padding: '10px 20px', fontSize: '16px', cursor: 'pointer', border: 'none', borderRadius: '5px' }}>
            Nạp tiền & Khóa vào Két
          </button>
        </div>

        <div>
          <button style={{ backgroundColor: '#4caf50', color: 'white', padding: '10px 20px', fontSize: '16px', cursor: 'pointer', border: 'none', borderRadius: '5px' }}>
            📦 Xác nhận đã nhận hàng (Giải ngân)
          </button>
        </div>
      </div>
      
    </div>
  )
}

export default App