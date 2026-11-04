import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, ADMIN_ADDRESS, getEscrowContract } from './utils/web3Config';
import AdminForm from './components/AdminForm';
import ProductGrid from './components/ProductGrid';
import EscrowDashboard from './components/EscrowDashboard';
import './App.css';

function App() {
  const [account, setAccount] = useState('');
  const [products, setProducts] = useState([]);
  const [sellerAddress, setSellerAddress] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [status, setStatus] = useState('Đang kết nối mạng lưới...');
  const [balance, setBalance] = useState('0');

  // GỌI API Node.js ĐỂ LẤY DANH SÁCH SẢN PHẨM TỪ TiDB CLOUD
  const fetchProducts = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/products');
      const data = await res.json();
      setProducts(data);
    } catch (error) {
      console.error("Lỗi khi tải sản phẩm từ API:", error);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

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
    if (account) fetchContractData();
  }, [account]);

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        setAccount(accounts[0].toLowerCase());
      } catch (error) {
        console.error("Lỗi kết nối ví:", error);
        alert("Bạn đã từ chối kết nối ví!");
      }
    } else {
      alert("Vui lòng cài đặt tiện ích MetaMask trên trình duyệt!");
    }
  }

  const handleSelectProduct = (product) => {
    setSellerAddress(product.seller_address);
    setDepositAmount(product.price.toString());
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  const handleDeposit = async () => {
    if (!account) return alert("Vui lòng kết nối ví trước!");
    if (!depositAmount) return alert("Vui lòng nhập số ETH cần khóa!");

    try {
      const escrowContract = await getEscrowContract();
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

  const handleConfirmDelivery = async () => {
    if (!account) return alert("Vui lòng kết nối ví trước!");
    try {
      const escrowContract = await getEscrowContract();
      const tx = await escrowContract.confirmDelivery();
      alert("Đang xử lý lệnh giải ngân... Vui lòng chờ!");
      await tx.wait();
      alert("Giải ngân thành công! Tiền đã được chuyển vào ví người bán.");
      fetchContractData();
    } catch (error) {
      console.error("Lỗi khi xác nhận:", error);
      alert("Giao dịch thất bại! (Bạn có chắc mình là người mua không?)");
    }
  }

  const handleRefund = async () => {
    if (!account) return alert("Vui lòng kết nối ví trước!");
    try {
      const escrowContract = await getEscrowContract();
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
      
      {account === ADMIN_ADDRESS && (
        <AdminForm fetchProducts={fetchProducts} />
      )}

      <ProductGrid products={products} onSelectProduct={handleSelectProduct} />

      <EscrowDashboard 
        account={account}
        connectWallet={connectWallet}
        status={status}
        balance={balance}
        sellerAddress={sellerAddress}
        setSellerAddress={setSellerAddress}
        depositAmount={depositAmount}
        setDepositAmount={setDepositAmount}
        handleDeposit={handleDeposit}
        handleConfirmDelivery={handleConfirmDelivery}
        handleRefund={handleRefund}
      />
    </div>
  )
}

export default App;