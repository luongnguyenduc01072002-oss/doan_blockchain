import React from 'react';

function EscrowDashboard({ account, connectWallet, status, balance, sellerAddress, setSellerAddress, depositAmount, setDepositAmount, handleDeposit, handleConfirmDelivery, handleRefund }) {
  return (
    <>
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
          <input type="text" placeholder="Địa chỉ ví người bán (Chọn sản phẩm ở trên để tự điền)" value={sellerAddress} onChange={(e) => setSellerAddress(e.target.value)} />
          <input type="number" placeholder="Số ETH cần khóa (Chọn sản phẩm ở trên để tự điền)" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
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
    </>
  );
}

export default EscrowDashboard;