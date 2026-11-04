import React from 'react';

function ProductGrid({ products, onSelectProduct }) {
  return (
    <div className="card" style={{ backgroundColor: '#fff', border: '1px solid #e0e6ed' }}>
      <h2>🛒 Gian Hàng Sản Phẩm</h2>
      {products.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#888' }}>Chưa có sản phẩm nào được đăng bán.</p>
      ) : (
        <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '20px' }}>
          {products.map((product) => (
            <div key={product.id} style={{ border: '1px solid #e0e6ed', borderRadius: '10px', padding: '15px', width: '220px', textAlign: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
              <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '8px', marginBottom: '10px' }} />
              <h3 style={{ fontSize: '16px', color: '#333', marginBottom: '5px' }}>{product.name}</h3>
              <p style={{ color: '#2196f3', fontWeight: 'bold', fontSize: '18px', marginBottom: '15px' }}>{product.price} ETH</p>
              <button 
                onClick={() => onSelectProduct(product)}
                style={{ backgroundColor: '#ff9800', color: 'white', padding: '8px 15px', fontSize: '14px', border: 'none', borderRadius: '5px', width: '100%' }}>
                🛒 Mua Ngay
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProductGrid;