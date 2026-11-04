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

  // Danh sách sản phẩm mẫu (Mô phỏng gian hàng)
  const products = [
    {
      id: 1,
      name: "Laptop Gaming MSI",
      price: "0.01",
      image: "https://images.unsplash.com/photo-1593640408182-31c70c8268f5?w=400&q=80",
      seller: "0x77f73541b69F69386401AadB88B248aA2" // Ví dụ địa chỉ người bán 1
    },
    {
      id: 2,
      name: "Điện thoại iPhone 15",
      price: "0.005",
      image: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&q=80",
      seller: "0x1234567890abcdef1234567890abcdef12345678" // Ví dụ địa chỉ người bán 2
    },
    {
      id: 3,
      name: "Đồng hồ thông minh",
      price: "0.002",
      image: "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=400&q=80",
      seller: "0x9876543210fedcba9876543210fedcba98765432" // Ví dụ địa chỉ người bán 3
    }
  ];

  // Hàm tự động điền thông tin khi khách chọn mua hàng
  const handleSelectProduct = (product) => {
    setSellerAddress(product.seller);
    setDepositAmount(product.price);
    // Cuộn trang xuống khu vực thanh toán
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

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

  // Nạp tiền vào Két sắt
  const handleDeposit = async () => {
    if (!window.ethereum) return alert("Vui lòng cài đặt MetaMask!");
    if (!account) return alert("Vui lòng kết nối ví trước!");
    if (!depositAmount) return alert("Vui lòng nhập số ETH cần khóa!");

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const escrowContract = new ethers.Contract(CONTRACT_ADDRESS, EscrowABI, signer);
      const amountInWei = ethers.parseEther(depositAmount);

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

  // Hoàn tiền 
  const handleRefund = async () => {
    if (!window.ethereum) return alert("Vui lòng cài đặt MetaMask!");
    if (!account) return alert("Vui lòng kết nối ví trước!");

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const escrowContract = new ethers.Contract(CONTRACT_ADDRESS, EscrowABI, signer);

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
      <h1>Chợ Điện Tử Web3 (Escrow)</h1>
      
      {/* KHU VỰC MỚI: GIAN HÀNG SẢN PHẨM */}
      <div className="card" style={{ backgroundColor: '#fff', border: '1px solid #e0e6ed' }}>
        <h2>🛒 Gian Hàng Sản Phẩm</h2>
        <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '20px' }}>
          {products.map((product) => (
            <div key={product.id} style={{ border: '1px solid #e0e6ed', borderRadius: '10px', padding: '15px', width: '220px', textAlign: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
              <img src={product.image} alt={product.name} style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '8px', marginBottom: '10px' }} />
              <h3 style={{ fontSize: '16px', color: '#333', marginBottom: '5px' }}>{product.name}</h3>
              <p style={{ color: '#2196f3', fontWeight: 'bold', fontSize: '18px', marginBottom: '15px' }}>{product.price} ETH</p>
              <button 
                onClick={() => handleSelectProduct(product)}
                style={{ backgroundColor: '#ff9800', color: 'white', padding: '8px 15px', fontSize: '14px', border: 'none', borderRadius: '5px', width: '100%' }}>
                🛒 Mua Ngay
              </button>
            </div>
          ))}
        </div>
      </div>

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
        <h2>3. Bảng Điều Khiển Thanh Toán</h2>
        
        <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
          <h3>Dành cho Người Mua (Tạo Giao Dịch)</h3>
          
          <input 
            type="text" 
            placeholder="Địa chỉ ví người bán (Chọn sản phẩm ở trên để tự điền)" 
            value={sellerAddress}
            onChange={(e) => setSellerAddress(e.target.value)}
          />

          <input 
            type="number" 
            placeholder="Số ETH cần khóa (Chọn sản phẩm ở trên để tự điền)" 
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