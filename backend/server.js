const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors()); 
app.use(express.json()); 

// Cấu hình kết nối MySQL Cloud
const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: true // Bắt buộc để kết nối Cloud
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Kiểm tra kết nối CSDL
db.getConnection((err, conn) => {
    if (err) {
        console.error('Lỗi kết nối MySQL Cloud:', err);
    } else {
        console.log('✅ Đã kết nối thành công Cơ sở dữ liệu Cloud MySQL');
        conn.release();
    }
});

// API: Lấy danh sách toàn bộ sản phẩm
app.get('/api/products', (req, res) => {
    const sql = 'SELECT * FROM products ORDER BY created_at DESC';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Lỗi truy vấn:', err);
            return res.status(500).json({ error: 'Lỗi khi truy vấn CSDL' });
        }
        res.json(results);
    });
});

// API: Thêm sản phẩm mới
app.post('/api/products', (req, res) => {
    const { name, price, image_url, seller_address } = req.body;

    if (!name || !price || !image_url || !seller_address) {
        return res.status(400).json({ error: 'Vui lòng cung cấp đủ thông tin sản phẩm' });
    }

    const sql = 'INSERT INTO products (name, price, image_url, seller_address) VALUES (?, ?, ?, ?)';
    db.query(sql, [name, price, image_url, seller_address], (err, result) => {
        if (err) {
            console.error('Lỗi lưu CSDL:', err);
            return res.status(500).json({ error: 'Lỗi khi lưu sản phẩm vào CSDL' });
        }
        res.status(201).json({ 
            message: 'Thêm sản phẩm thành công',
            productId: result.insertId 
        });
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 API Server đang chạy tại: http://localhost:${PORT}`);
});