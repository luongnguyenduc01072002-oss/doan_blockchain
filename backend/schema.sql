-- Bảng sản phẩm (chạy trên TiDB Cloud / MySQL)
CREATE TABLE IF NOT EXISTS products (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(120)   NOT NULL,
  description    VARCHAR(500)   NOT NULL DEFAULT '',
  price          DECIMAL(36,18) NOT NULL,          -- giá ETH, giữ đủ 18 chữ số thập phân
  image_url      VARCHAR(1000)  NOT NULL,
  seller_address CHAR(42)       NOT NULL,
  created_at     TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_seller (seller_address)
) DEFAULT CHARSET = utf8mb4;

-- Nếu bảng cũ đã có, chỉ cần thêm cột mô tả:
-- ALTER TABLE products ADD COLUMN description VARCHAR(500) NOT NULL DEFAULT '' AFTER name;
