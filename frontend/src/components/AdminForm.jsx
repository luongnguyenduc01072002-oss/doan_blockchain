import React, { useState } from 'react';

function AdminForm({ fetchProducts }) {
  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdImage, setNewProdImage] = useState('');
  const [newProdSeller, setNewProdSeller] = useState('');

  const handleAddProduct = async () => {
    if (!newProdName || !newProdPrice || !newProdImage || !newProdSeller) {
      return alert("Vui lòng nhập đầy đủ thông tin sản phẩm!");
    }
    
    try {
      // GỌI TRỰC TIẾP VÀO API BACKEND VỪA DỰNG
      const response = await fetch('https://doan-blockchain-30uq.onrender.com/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProdName,
          price: newProdPrice,
          image_url: newProdImage,
          seller_address: newProdSeller
        })
      });

      if (response.ok) {
        alert("Đã thêm sản phẩm lên CSDL Đám mây thành công!");
        setNewProdName('');
        setNewProdPrice('');
        setNewProdImage('');
        setNewProdSeller('');
        fetchProducts(); // Tự động làm mới danh sách hàng
      } else {
        alert("Lỗi khi thêm sản phẩm vào hệ thống");
      }
    } catch (error) {
      console.error(error);
      alert("Không thể kết nối đến Backend API");
    }
  }

  return (
    <div className="card" style={{ backgroundColor: '#fff3e0', border: '2px solid #ff9800' }}>
      <h2 style={{ color: '#e65100' }}>👑 Khu Vực Quản Trị (Admin) - Thêm Sản Phẩm</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
        <input type="text" placeholder="Tên sản phẩm (VD: iPhone 15 Pro Max)" value={newProdName} onChange={(e) => setNewProdName(e.target.value)} />
        <input type="text" placeholder="Link ảnh chụp sản phẩm (URL)" value={newProdImage} onChange={(e) => setNewProdImage(e.target.value)} />
        <input type="number" placeholder="Giá bán (ETH)" value={newProdPrice} onChange={(e) => setNewProdPrice(e.target.value)} />
        <input type="text" placeholder="Địa chỉ ví Người Bán (0x...)" value={newProdSeller} onChange={(e) => setNewProdSeller(e.target.value)} />
        <button onClick={handleAddProduct} style={{ backgroundColor: '#e65100', color: 'white', padding: '12px 20px', width: '100%', fontSize: '16px', border: 'none' }}>
          ➕ Đăng Bán Sản Phẩm
        </button>
      </div>
    </div>
  );
}

export default AdminForm;